import { printf } from "./builtins";

const isNum = (v) => typeof v === "number" || /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(v);
const N = (v) => (typeof v === "number" ? v : parseFloat(v) || 0);
const S = (v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(+v.toFixed(6))) : v ?? "");

function lex(src) {
  const t = []; let i = 0;
  const regexOk = () => { const p = t[t.length - 1]; return !p || (p.k === "op" && !/^[)\]]$/.test(p.v)) || p.k === "nl"; };
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || (c === "\\" && src[i + 1] === "\n")) { i += c === "\\" ? 2 : 1; continue; }
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "\n") { t.push({ k: "nl" }); i++; continue; }
    if (c === '"') { let j = i + 1, s = ""; while (j < src.length && src[j] !== '"') { if (src[j] === "\\") { j++; s += { n: "\n", t: "\t", '"': '"', "\\": "\\", "/": "/" }[src[j]] ?? `\\${src[j]}`; } else s += src[j]; j++; } t.push({ k: "str", v: s }); i = j + 1; continue; }
    if (c === "/" && regexOk()) { let j = i + 1; while (j < src.length && src[j] !== "/") { if (src[j] === "\\") j++; j++; } t.push({ k: "re", v: src.slice(i + 1, j) }); i = j + 1; continue; }
    const m = src.slice(i).match(/^(\d+\.?\d*|[A-Za-z_]\w*|\+\+|--|[-+*/%]=|==|!=|<=|>=|&&|\|\||!~|[{}()[\];,<>=+\-*/%!~$?:])/);
    if (!m) throw new Error(`awk: syntax error at '${c}'`);
    t.push(/^\d/.test(m[1]) ? { k: "num", v: parseFloat(m[1]) } : /^[A-Za-z_]/.test(m[1]) ? { k: "id", v: m[1] } : { k: "op", v: m[1] }); i += m[1].length;
  }
  return t;
}

class Next {}

export function compileAwk(src, vars = {}) {
  const T = lex(src); let p = 0;
  const pk = (v) => T[p] && T[p].v === v && T[p].k !== "str";
  const eat = (v) => { if (!pk(v)) throw new Error(`awk: syntax error near '${T[p]?.v ?? "end"}'`); p++; };
  const nls = () => { while (T[p] && (T[p].k === "nl" || pk(";"))) p++; };
  const G = { NR: 0, NF: 0, FS: " ", OFS: " ", ...vars }, A = {};
  let F = [];
  const getV = (n) => G[n] ?? "";
  const setF = (i, v) => { if (i === 0) { F = [S(v), ...splitF(S(v))]; G.NF = F.length - 1; } else { F[i] = S(v); for (let k = 1; k < i; k++) F[k] ??= ""; G.NF = Math.max(G.NF, i); F[0] = F.slice(1).join(G.OFS); } };
  const splitF = (l) => (G.FS === " " ? l.trim().split(/\s+/).filter(Boolean) : l.split(G.FS.length === 1 ? G.FS : new RegExp(G.FS)));
  const lval = () => {
    if (pk("$")) { p++; const e = primary(); return { get: () => F[N(e())] ?? "", set: (v) => setF(N(e()), v) }; }
    const n = T[p].v; p++;
    if (pk("[")) { p++; const k = expr(); eat("]"); const arr = () => (A[n] ||= {}); return { get: () => arr()[S(k())] ?? "", set: (v) => { arr()[S(k())] = v; } }; }
    return { get: () => getV(n), set: (v) => { G[n] = v; } };
  };
  const FN = { length: (a) => S(a[0] ?? F[0]).length, substr: (a) => S(a[0]).substr(N(a[1]) - 1, a[2] === undefined ? undefined : N(a[2])), toupper: (a) => S(a[0]).toUpperCase(), tolower: (a) => S(a[0]).toLowerCase(), int: (a) => Math.trunc(N(a[0])), index: (a) => S(a[0]).indexOf(S(a[1])) + 1, sprintf: (a) => printf(S(a[0]), a.slice(1).map(S)) };
  function primary() {
    const t = T[p];
    if (!t) throw new Error("awk: unexpected end of program");
    if (t.k === "num") { p++; return () => t.v; }
    if (t.k === "str") { p++; return () => t.v; }
    if (t.k === "re") { p++; const rx = new RegExp(t.v); return () => +rx.test(F[0]); }
    if (pk("(")) { p++; const e = expr(); eat(")"); return e; }
    if (pk("!")) { p++; const e = primary(); return () => +!truthy(e()); }
    if (pk("-")) { p++; const e = primary(); return () => -N(e()); }
    if (pk("++") || pk("--")) { const d = T[p++].v === "++" ? 1 : -1; const l = lval(); return () => { const v = N(l.get()) + d; l.set(v); return v; }; }
    if (t.k === "id" && FN[t.v] && T[p + 1]?.v === "(") { p += 2; const args = []; while (!pk(")")) { args.push(expr()); if (pk(",")) p++; } p++; return () => FN[t.v](args.map((a) => a())); }
    if (t.k === "id" && T[p + 1]?.v === "in" ) { /* (k in arr) handled by caller */ }
    if (pk("$") || t.k === "id") {
      const l = lval();
      if (pk("++") || pk("--")) { const d = T[p++].v === "++" ? 1 : -1; return () => { const v = N(l.get()); l.set(v + d); return v; }; }
      if (T[p]?.k === "op" && /^([-+*/%]?=)$/.test(T[p].v) && T[p + 1]?.v !== "=") { const op = T[p++].v; const r = expr(); return () => { const v = op === "=" ? r() : { "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b, "%": (a, b) => a % b }[op[0]](N(l.get()), N(r())); l.set(v); return v; }; }
      return l.get;
    }
    throw new Error(`awk: syntax error near '${t.v}'`);
  }
  const bin = (next, ops, f) => () => { let l = next(); while (T[p] && T[p].k === "op" && ops.includes(T[p].v)) { const op = T[p++].v, a = l, b = next(); l = () => f(op, a(), b()); } return l; };
  const mul = bin(primary, ["*", "/", "%"], (o, a, b) => (o === "*" ? N(a) * N(b) : o === "/" ? N(a) / N(b) : N(a) % N(b)));
  const add = bin(mul, ["+", "-"], (o, a, b) => (o === "+" ? N(a) + N(b) : N(a) - N(b)));
  const startsPrimary = () => T[p] && (["num", "str", "id"].includes(T[p].k) || pk("$") || pk("(")) && !(T[p].k === "id" && T[p].v === "in");
  const concat = () => { let l = add(); while (startsPrimary()) { const a = l, b = add(); l = () => S(a()) + S(b()); } return l; };
  const cmpV = (o, a, b) => { const num = isNum(a) && isNum(b), x = num ? N(a) : S(a), y = num ? N(b) : S(b); return +({ "<": x < y, "<=": x <= y, ">": x > y, ">=": x >= y, "==": x === y, "!=": x !== y }[o]); };
  const cmp = bin(concat, ["<", "<=", ">", ">=", "==", "!="], cmpV);
  const match = bin(cmp, ["~", "!~"], (o, a, b) => { const r = new RegExp(S(b)).test(S(a)); return +(o === "~" ? r : !r); });
  const truthy = (v) => (typeof v === "number" ? v !== 0 : isNum(v) ? N(v) !== 0 : v !== "");
  const and = bin(match, ["&&"], (o, a, b) => +(truthy(a) && truthy(b)));
  const or = bin(and, ["||"], (o, a, b) => +(truthy(a) || truthy(b)));
  function expr() { const c = or(); if (!pk("?")) return c; p++; const a = expr(); eat(":"); const b = expr(); return () => (truthy(c()) ? a() : b()); }
  function block() { eat("{"); const ss = []; nls(); while (!pk("}")) { ss.push(stmt()); nls(); } p++; return () => { for (const s of ss) s(); }; }
  function simpleOrBlock() { nls(); return pk("{") ? block() : stmt(); }
  let out = [];
  function stmt() {
    if (pk("{")) return block();
    const t = T[p];
    if (t.k === "id" && (t.v === "print" || t.v === "printf")) {
      p++; const args = [];
      const paren = pk("(") && t.v === "printf"; if (paren) p++;
      while (T[p] && !pk(";") && !pk("}") && T[p].k !== "nl" && !pk(")")) { args.push(expr()); if (pk(",")) p++; }
      if (paren) eat(")");
      return t.v === "print" ? () => out.push((args.length ? args.map((a) => S(a())).join(G.OFS) : F[0]) + "\n") : () => out.push(printf(S(args[0]()), args.slice(1).map((a) => S(a()))));
    }
    if (t.k === "id" && t.v === "next") { p++; return () => { throw new Next(); }; }
    if (t.k === "id" && t.v === "if") { p++; eat("("); const c = expr(); eat(")"); const a = simpleOrBlock(); let b = null; const save = p; nls(); if (T[p]?.v === "else") { p++; b = simpleOrBlock(); } else p = save; return () => (truthy(c()) ? a() : b && b()); }
    if (t.k === "id" && t.v === "while") { p++; eat("("); const c = expr(); eat(")"); const b = simpleOrBlock(); return () => { let g = 0; while (truthy(c())) { if (++g > 100000) throw new Error("awk: loop limit"); b(); } }; }
    if (t.k === "id" && t.v === "for") {
      p++; eat("(");
      if (T[p].k === "id" && T[p + 1]?.v === "in") { const k = T[p].v, arr = T[p + 2].v; p += 3; eat(")"); const b = simpleOrBlock(); return () => { Object.keys(A[arr] || {}).forEach((x) => { G[k] = x; b(); }); }; }
      const i = pk(";") ? () => 0 : expr(); eat(";"); const c = pk(";") ? () => 1 : expr(); eat(";"); const s = pk(")") ? () => 0 : expr(); eat(")"); const b = simpleOrBlock();
      return () => { let g = 0; for (i(); truthy(c()); s()) { if (++g > 100000) throw new Error("awk: loop limit"); b(); } };
    }
    const e = expr(); return () => { e(); };
  }
  const rules = { begin: [], end: [], main: [] };
  nls();
  while (p < T.length) {
    if (T[p].k === "id" && (T[p].v === "BEGIN" || T[p].v === "END")) { const w = T[p++].v; nls(); rules[w === "BEGIN" ? "begin" : "end"].push(block()); }
    else { const pat = pk("{") ? null : expr(); nls(); const act = pk("{") ? block() : null; rules.main.push([pat, act]); }
    nls();
  }
  return (input) => {
    out = [];
    rules.begin.forEach((b) => b());
    if (rules.main.length || rules.end.length) for (const line of input.split("\n").filter((l, i, arr) => l !== "" || i < arr.length - 1)) {
      G.NR++; F = [line, ...splitF(line)]; G.NF = F.length - 1;
      try { for (const [pat, act] of rules.main) if (!pat || truthy(pat())) (act || (() => out.push(F[0] + "\n")))(); } catch (e) { if (!(e instanceof Next)) throw e; }
    }
    rules.end.forEach((b) => b());
    return out.join("");
  };
}
