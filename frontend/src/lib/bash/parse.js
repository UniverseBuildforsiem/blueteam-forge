export class Incomplete extends Error {}
export class BashSyntax extends Error {}
const syn = (t) => new BashSyntax(`syntax error near unexpected token \`${t}'`);

const OPS = ["2>&1", "2>>", "<<-", "<<", ">>", "&>", "2>", ">&", "&&", "||", ";;", "|", "&", ";", "<", ">", "(", ")"];
const META = " \t\n|&;<>()";

function skipNested(s, i, open, close) {
  let d = 1, q = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "\\" && q === '"') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"') q = c;
    else if (c === "\\") i++;
    else if (s.startsWith(open, i)) { d++; i += open.length - 1; }
    else if (s.startsWith(close, i)) { d--; if (!d) return i + close.length; i += close.length - 1; }
  }
  throw new Incomplete();
}

export function lex(s) {
  const toks = [], pend = [];
  let i = 0;
  const heredocs = () => {
    while (pend.length) {
      const h = pend.shift();
      const lines = [];
      for (;;) {
        if (i > s.length) throw new Incomplete();
        let e = s.indexOf("\n", i); if (e < 0) e = s.length;
        let line = s.slice(i, e); i = e + 1;
        if (h.tok.v === "<<-") line = line.replace(/^\t+/, "");
        if (line === h.delim) break;
        if (e >= s.length) throw new Incomplete();
        lines.push(line);
      }
      h.tok.body = lines.length ? lines.join("\n") + "\n" : "";
    }
  };
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "\n") { i += 2; continue; }
    if (c === " " || c === "\t") { i++; continue; }
    if (c === "\n") { toks.push({ t: "nl" }); i++; heredocs(); continue; }
    if (c === "#") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (s.startsWith("((", i)) { const e = skipNested(s, i + 2, "(", ")"); if (s[e] !== ")") throw new BashSyntax("syntax error: missing '))'"); toks.push({ t: "arith", v: s.slice(i + 2, e - 1) }); i = e + 1; continue; }
    const op = OPS.find((o) => s.startsWith(o, i) && (o[0] !== "2" || !/\w/.test(s[i - 1] || "")));
    if (op) {
      const tok = { t: "op", v: op }; toks.push(tok); i += op.length;
      if (op === "<<" || op === "<<-") {
        while (s[i] === " ") i++;
        let j = i; while (j < s.length && !META.includes(s[j])) j++;
        const raw = s.slice(i, j); i = j;
        if (!raw) throw new Incomplete();
        pend.push({ tok, delim: raw.replace(/['"\\]/g, "") }); tok.quoted = /['"\\]/.test(raw);
      }
      continue;
    }
    let j = i;
    while (j < s.length && !META.includes(s[j])) {
      const d = s[j];
      if (d === "\\") { if (j + 1 >= s.length) throw new Incomplete(); j += 2; }
      else if (d === "'") { const e = s.indexOf("'", j + 1); if (e < 0) throw new Incomplete(); j = e + 1; }
      else if (d === '"') { let k = j + 1; for (; k < s.length && s[k] !== '"'; k++) { if (s[k] === "\\") k++; else if (s.startsWith("$(", k)) k = skipNested(s, k + 2, "(", ")") - 1; } if (k >= s.length) throw new Incomplete(); j = k + 1; }
      else if (s.startsWith("$(", j)) j = skipNested(s, j + 2, "(", ")");
      else if (s.startsWith("${", j)) j = skipNested(s, j + 2, "{", "}");
      else if (d === "`") { const e = s.indexOf("`", j + 1); if (e < 0) throw new Incomplete(); j = e + 1; }
      else j++;
    }
    toks.push({ t: "w", v: s.slice(i, j) }); i = j;
  }
  if (pend.length) throw new Incomplete();
  return toks;
}

const RES = new Set(["then", "elif", "else", "fi", "do", "done", "esac", "}", "in"]);
const REDIR = new Set(["<", ">", ">>", "2>", "2>>", "&>", "2>&1", ">&", "<<", "<<-"]);

export function parse(src) {
  const T = lex(src);
  let p = 0;
  const peek = () => T[p];
  const isW = (v, t = peek()) => t && t.t === "w" && t.v === v;
  const isOp = (v, t = peek()) => t && t.t === "op" && t.v === v;
  const nl = () => { while (peek() && (peek().t === "nl" || isOp(";"))) p++; };
  const skipNL = () => { while (peek()?.t === "nl") p++; };
  const need = (v) => { skipNL(); if (!peek()) throw new Incomplete(); if (!isW(v)) throw syn(peek().v || "newline"); p++; };
  const word = () => { const t = peek(); if (!t) throw new Incomplete(); if (t.t !== "w") throw syn(t.v || "newline"); p++; return t.v; };

  function list(stops) {
    const items = [];
    for (;;) {
      nl();
      const t = peek();
      if (!t) { if (stops) throw new Incomplete(); break; }
      if (t.t === "w" && stops?.includes(t.v)) break;
      if (isOp(")") || isOp(";;")) { if (stops) break; throw syn(t.v); }
      if (t.t === "w" && RES.has(t.v)) throw syn(t.v);
      items.push(andor());
      if (isOp("&")) p++;
    }
    return { type: "list", items };
  }
  function andor() {
    const node = { type: "andor", first: pipeline(), rest: [] };
    while (isOp("&&") || isOp("||")) { const op = T[p++].v; skipNL(); if (!peek()) throw new Incomplete(); node.rest.push([op, pipeline()]); }
    return node;
  }
  function pipeline() {
    let neg = false;
    if (isW("!")) { neg = true; p++; }
    const cmds = [command()];
    while (isOp("|")) { p++; skipNL(); if (!peek()) throw new Incomplete(); cmds.push(command()); }
    return { type: "pipe", cmds, neg };
  }
  function redirs(node) {
    node.redirs = node.redirs || [];
    while (peek()?.t === "op" && REDIR.has(peek().v)) {
      const t = T[p++];
      if (t.v === "2>&1") node.redirs.push({ op: "2>&1" });
      else if (t.v === "<<" || t.v === "<<-") node.redirs.push({ op: "<<", body: t.body, quoted: t.quoted });
      else node.redirs.push({ op: t.v, target: word() });
    }
    return node;
  }
  const cond = (stop) => { const c = list([stop]); if (!c.items.length) throw syn(stop); return c; };
  function body(open, close) { need(open); const b = list([close]); need(close); return b; }
  function command() {
    const t = peek();
    if (!t) throw new Incomplete();
    if (t.t === "arith") { p++; return redirs({ type: "arith", expr: t.v }); }
    if (isOp("(")) { p++; const b = list([]); if (!peek()) throw new Incomplete(); if (!isOp(")")) throw syn(peek().v); p++; return redirs({ type: "group", body: b, sub: true }); }
    if (t.t === "op") throw syn(t.v);
    const v = t.v;
    if (v === "{") { p++; const b = list(["}"]); p++; return redirs({ type: "group", body: b }); }
    if (v === "if") {
      p++; const clauses = []; let els = null;
      clauses.push([cond("then"), (p++, list(["elif", "else", "fi"]))]);
      for (;;) {
        const k = peek().v; p++;
        if (k === "elif") clauses.push([cond("then"), (p++, list(["elif", "else", "fi"]))]);
        else if (k === "else") { els = list(["fi"]); p++; break; } else break;
      }
      return redirs({ type: "if", clauses, else: els });
    }
    if (v === "while" || v === "until") { p++; const cw = cond("do"); return redirs({ type: "while", until: v === "until", cond: cw, body: body("do", "done") }); }
    if (v === "for") {
      p++;
      if (peek()?.t === "arith") { const parts = T[p++].v.split(";"); if (parts.length !== 3) throw new BashSyntax("syntax error: bad for loop"); nl(); return redirs({ type: "cfor", init: parts[0], cond: parts[1], step: parts[2], body: body("do", "done") }); }
      const name = word(); let items = null;
      skipNL();
      if (isW("in")) { p++; items = []; while (peek() && peek().t === "w") items.push(T[p++].v); }
      nl();
      return redirs({ type: "for", var: name, items, body: body("do", "done") });
    }
    if (v === "case") {
      p++; const w = word(); need("in"); const arms = [];
      for (;;) {
        skipNL(); if (!peek()) throw new Incomplete();
        if (isW("esac")) { p++; break; }
        if (isOp("(")) p++;
        const pats = [word()]; while (isOp("|")) { p++; pats.push(word()); }
        if (!isOp(")")) throw syn(peek()?.v || "newline"); p++;
        const b = list(["esac"]);
        arms.push({ pats, body: b });
        if (isOp(";;")) p++; else if (!isW("esac")) throw new Incomplete();
      }
      return redirs({ type: "case", word: w, arms });
    }
    if (v === "[[") { p++; const words = []; for (;;) { const x = peek(); if (!x || x.t === "nl") throw new Incomplete(); p++; if (x.t === "w" && x.v === "]]") break; words.push(x.v); } return redirs({ type: "dtest", words }); }
    if (v === "function") { p++; const name = word(); if (isOp("(")) { p += 2; } skipNL(); return { type: "func", name, body: command() }; }
    if (RES.has(v)) throw syn(v);
    if (T[p + 1] && isOp("(", T[p + 1]) && T[p + 2] && isOp(")", T[p + 2]) && /^[\w.-]+$/.test(v)) { p += 3; skipNL(); return { type: "func", name: v, body: command() }; }
    const node = { type: "cmd", assigns: [], words: [], redirs: [] };
    for (;;) {
      const x = peek();
      if (!x) break;
      if (x.t === "w") { p++; if (!node.words.length && /^[A-Za-z_]\w*=/.test(x.v)) node.assigns.push(x.v); else node.words.push(x.v); }
      else if (x.t === "op" && REDIR.has(x.v)) redirs(node);
      else break;
    }
    return node;
  }
  const tree = list(null);
  if (p < T.length) throw syn(T[p].v || "newline");
  return tree;
}
