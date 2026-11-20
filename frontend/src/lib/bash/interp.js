import { parse, BashSyntax } from "./parse";
import { norm, HOME } from "./fs";
import { BUILTINS } from "./builtins";

export class Exit { constructor(c) { this.code = c; } }
export class Ret { constructor(c) { this.code = c; } }
export class Brk { constructor(n) { this.n = n; } }
export class Cont { constructor(n) { this.n = n; } }
export class LimitError extends Error {}
export class Interrupt extends Error {}
export class ShErr extends Error { constructor(m, code = 1) { super(m); this.code = code; } }

export class Reader {
  constructor(s) { this.s = s || ""; this.i = 0; }
  line() { if (this.i >= this.s.length) return null; let e = this.s.indexOf("\n", this.i); if (e < 0) e = this.s.length; const l = this.s.slice(this.i, e); this.i = e + 1; return l; }
  all() { const r = this.s.slice(this.i); this.i = this.s.length; return r; }
}

const matchParen = (s, i) => { let d = 1, q = null; for (; i < s.length; i++) { const c = s[i]; if (q) { if (c === q) q = null; continue; } if (c === "'" || c === '"') q = c; else if (c === "(") d++; else if (c === ")" && !--d) return i; } throw new ShErr("bad substitution"); };
const matchBrace = (s, i) => { let d = 1; for (; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}" && !--d) return i; } throw new ShErr("bad substitution"); };
export const globRx = (pat) => new RegExp("^" + pat.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".").replace(/\[!/g, "[^") + "$");

export class Shell {
  constructor(o) {
    Object.assign(this, { fs: o.fs, cmds: o.cmds, readLine: o.readLine, hooks: o.hooks || {}, cwd: o.cwd || HOME });
    this.vars = new Map(Object.entries({ HOME, USER: "kali", LOGNAME: "kali", SHELL: "/bin/bash", PATH: "/usr/local/bin:/usr/bin:/bin", PWD: this.cwd, HOSTNAME: "kali", IFS: " \t\n" }));
    this.exported = new Set(["HOME", "USER", "LOGNAME", "SHELL", "PATH", "PWD", "HOSTNAME"]);
    this.funcs = {}; this.locals = []; this.pos = ["bash"]; this.status = 0; this.depth = 0;
    this.lim = { steps: 0, out: 0, abort: false }; this.history = []; this.svc = o.svc || { ssh: false, apache2: false, postgresql: false }; this.users = o.users || {};
  }
  clone() {
    const s = Object.create(Shell.prototype);
    Object.assign(s, this, { vars: new Map(this.vars), exported: new Set(this.exported), funcs: { ...this.funcs }, locals: this.locals.map((m) => new Map(m)), pos: [...this.pos] });
    return s;
  }
  get(k) { for (let i = this.locals.length - 1; i >= 0; i--) if (this.locals[i].has(k)) return this.locals[i].get(k); return this.vars.get(k); }
  set(k, v) { for (let i = this.locals.length - 1; i >= 0; i--) if (this.locals[i].has(k)) return void this.locals[i].set(k, v); this.vars.set(k, v); if (k === "PWD") this.cwd = v; }
  path(p) { return norm(this.cwd, p); }
  async tick() {
    if (this.lim.abort) throw new Interrupt("^C");
    if (++this.lim.steps > 5000) throw new LimitError("script exceeded limit: more than 5000 commands, aborted");
    if (this.lim.steps % 250 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  async run(src, io) { return this.exec(parse(src), io); }

  async exec(n, io) {
    if (n.redirs?.length && n.type !== "cmd") return this.withRedirs(n.redirs, io, (io2) => this.exec({ ...n, redirs: null }, io2));
    switch (n.type) {
      case "list": { let s = this.status; for (const it of n.items) s = await this.exec(it, io); return s; }
      case "andor": { let s = await this.exec(n.first, io); for (const [op, x] of n.rest) if ((op === "&&") === (s === 0)) s = await this.exec(x, io); return s; }
      case "pipe": {
        let s;
        if (n.cmds.length === 1) s = await this.exec(n.cmds[0], io);
        else { let inp = io.stdin; for (let k = 0; k < n.cmds.length; k++) { const buf = [], last = k === n.cmds.length - 1; s = await this.exec(n.cmds[k], { ...io, stdin: inp, out: last ? io.out : (t) => buf.push(t) }); inp = new Reader(buf.join("")); } }
        if (n.neg) s = s ? 0 : 1;
        this.status = s; return s;
      }
      case "cmd": { const s = await this.simple(n, io); this.status = s; return s; }
      case "if": { for (const [c, b] of n.clauses) if ((await this.exec(c, io)) === 0) return this.exec(b, io); return n.else ? this.exec(n.else, io) : 0; }
      case "while": { let s = 0; for (;;) { await this.tick(); if (((await this.exec(n.cond, io)) === 0) === n.until) break; const r = await this.loopBody(n.body, io); if (r === "break") break; s = this.status; } return s; }
      case "for": {
        const items = n.items ? await this.expandWords(n.items) : this.pos.slice(1);
        for (const v of items) { await this.tick(); this.set(n.var, v); if ((await this.loopBody(n.body, io)) === "break") break; }
        return this.status;
      }
      case "cfor": { if (n.init.trim()) this.arith(n.init); for (;;) { await this.tick(); if (n.cond.trim() && !this.arith(n.cond)) break; if ((await this.loopBody(n.body, io)) === "break") break; if (n.step.trim()) this.arith(n.step); } return this.status; }
      case "case": {
        const w = await this.expandStr(n.word);
        for (const a of n.arms) for (const p of a.pats) if (globRx(await this.expandStr(p)).test(w)) return this.exec(a.body, io);
        return 0;
      }
      case "group": return n.sub ? this.clone().exec(n.body, io) : this.exec(n.body, io);
      case "arith": { const s = this.arith(await this.expandStr(n.expr, true)) ? 0 : 1; this.status = s; return s; }
      case "dtest": { const ws = []; for (const w of n.words) ws.push(/^(&&|\|\||!|\(|\)|<|>)$/.test(w) ? w : await this.expandStr(w)); const s = this.test(ws, true); this.status = s; return s; }
      case "func": this.funcs[n.name] = n.body; return 0;
      default: throw new ShErr(`unknown node ${n.type}`);
    }
  }
  async loopBody(body, io) {
    try { await this.exec(body, io); } catch (e) {
      if (e instanceof Brk) { if (e.n > 1) throw new Brk(e.n - 1); return "break"; }
      if (e instanceof Cont) { if (e.n > 1) throw new Cont(e.n - 1); return "cont"; }
      throw e;
    }
    return "";
  }

  async simple(n, io) {
    await this.tick();
    const words = await this.expandWords(n.words);
    const as = [];
    for (const a of n.assigns) { const i = a.indexOf("="); as.push([a.slice(0, i), await this.expandStr(a.slice(i + 1))]); }
    if (!words.length) { as.forEach(([k, v]) => this.set(k, v)); return this.withRedirs(n.redirs, io, async () => (n.words.length ? this.status : 0)); }
    const saved = as.map(([k]) => [k, this.vars.get(k)]);
    as.forEach(([k, v]) => this.vars.set(k, v));
    try { return await this.withRedirs(n.redirs, io, (io2) => this.invoke(words, io2)); } finally { saved.forEach(([k, v]) => (v === undefined ? this.vars.delete(k) : this.vars.set(k, v))); }
  }

  async withRedirs(rs, io, fn) {
    if (!rs?.length) return fn(io);
    const io2 = { ...io }, files = [];
    try {
      for (const r of rs) {
        if (r.op === "2>&1") { io2.err = io2.out; continue; }
        if (r.op === "<<") { io2.stdin = new Reader(r.quoted ? r.body : await this.expandStr(r.body, true)); continue; }
        const p = this.path(await this.expandStr(r.target));
        if (r.op === "<") { io2.stdin = new Reader(this.fs.read(p)); continue; }
        const append = r.op.endsWith(">>"), buf = { p, a: [], append };
        if (p !== "/dev/null") { this.fs.write(p, "", true); if (!append) this.fs.write(p, ""); }
        files.push(buf);
        const sink = (t) => buf.a.push(t);
        if (r.op === "2>" || r.op === "2>>") io2.err = sink; else if (r.op === "&>") { io2.out = sink; io2.err = sink; } else io2.out = sink;
      }
    } catch (e) { io.err(`bash: ${e.message}\n`); return 1; }
    try { return await fn(io2); } finally { files.forEach((b) => b.p !== "/dev/null" && this.fs.write(b.p, b.a.join(""), true)); }
  }

  async invoke(words, io) {
    const [name, ...args] = words;
    if (this.funcs[name]) return this.callFunc(name, args, io);
    if (BUILTINS[name]) {
      try { return await BUILTINS[name].call(this, args, io); } catch (e) { if (e instanceof ShErr) { io.err(`bash: ${e.message}\n`); return e.code; } throw e; }
    }
    if (name.includes("/")) return this.runScript(name, args, io, true);
    const c = this.cmds[name];
    if (!c) { io.err(`${name}: command not found\n`); return 127; }
    try { return (await c(args, io, this)) ?? 0; } catch (e) {
      if (e instanceof ShErr || e.fs) { io.err(`${name}: ${e.message}\n`); return e.code || 1; }
      throw e;
    }
  }
  async callFunc(name, args, io) {
    if (this.depth > 100) throw new LimitError("maximum function nesting level exceeded (100)");
    const pos = this.pos; this.pos = [pos[0], ...args]; this.locals.push(new Map()); this.depth++;
    try { return await this.exec(this.funcs[name], io); } catch (e) { if (e instanceof Ret) return e.code; throw e; } finally { this.pos = pos; this.locals.pop(); this.depth--; }
  }
  async runScript(p, args, io, needExec) {
    const full = this.path(p), f = this.fs.get(full);
    if (!f) { io.err(`bash: ${p}: No such file or directory\n`); return 127; }
    if (f.t === "d") { io.err(`bash: ${p}: Is a directory\n`); return 126; }
    if (needExec && !(f.m & 0o111)) { io.err(`bash: ${p}: Permission denied\n`); return 126; }
    const sh = this.clone(); sh.pos = [p, ...args]; sh.locals = [];
    try { return await sh.run(f.c, io); } catch (e) {
      if (e instanceof Exit) return e.code;
      if (e instanceof BashSyntax) { io.err(`${p}: ${e.message}\n`); return 2; }
      throw e;
    }
  }

  async subst(src) { const buf = []; const sh = this.clone(); try { await sh.run(src, { stdin: null, out: (t) => buf.push(t), err: (t) => buf.push(t) }); } catch (e) { if (!(e instanceof Exit)) throw e; } this.status = sh.status; return buf.join("").replace(/\n+$/, ""); }

  async param(expr) {
    if (expr.startsWith("#")) return String((this.get(expr.slice(1)) ?? "").length);
    const m = expr.match(/^([A-Za-z_]\w*|\d+|[?#@*])(?:(:?[-=+?])(.*)|(##?|%%?)(.*))?$/s);
    if (!m) throw new ShErr(`\${${expr}}: bad substitution`);
    const v = this.special(m[1]);
    if (m[2]) {
      const empty = m[2].startsWith(":") ? !v : v === undefined, w = await this.expandStr(m[3]);
      const op = m[2].slice(-1);
      if (op === "-") return empty ? w : v;
      if (op === "=") { if (empty) this.set(m[1], w); return empty ? w : v; }
      if (op === "+") return empty ? "" : w;
      if (op === "?" && empty) throw new ShErr(`${m[1]}: ${w || "parameter null or not set"}`);
      return v;
    }
    if (m[4]) {
      const pat = await this.expandStr(m[5]), s = v || "", src = pat.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\?/g, ".");
      const rx = m[4][0] === "#" ? new RegExp(`^${src.replace(/\*/g, m[4] === "##" ? ".*" : ".*?")}`) : new RegExp(`${src.replace(/\*/g, m[4] === "%%" ? ".*" : ".*?")}$`);
      if (m[4] === "%") { for (let i = s.length; i >= 0; i--) if (new RegExp(`^${src.replace(/\*/g, ".*")}$`).test(s.slice(i))) return s.slice(0, i); return s; }
      return s.replace(rx, "");
    }
    return v;
  }
  special(k) {
    if (k === "?") return String(this.status);
    if (k === "#") return String(this.pos.length - 1);
    if (k === "@" || k === "*") return this.pos.slice(1).join(" ");
    if (k === "$") return "4242";
    if (/^\d+$/.test(k)) return this.pos[+k];
    return this.get(k);
  }

  async dollar(s, i) {
    if (s.startsWith("$((", i)) { const e = matchParen(s, i + 2); return [String(this.arith(await this.expandStr(s.slice(i + 3, e - 1), true))), e + 1]; }
    if (s.startsWith("$(", i)) { const e = matchParen(s, i + 2); return [await this.subst(s.slice(i + 2, e)), e + 1]; }
    if (s[i + 1] === "{") { const e = matchBrace(s, i + 2); return [(await this.param(s.slice(i + 2, e))) ?? "", e + 1]; }
    const m = s.slice(i + 1).match(/^([A-Za-z_]\w*|[?#@*$!]|\d)/);
    if (!m) return ["$", i + 1];
    return [this.special(m[1]) ?? "", i + 1 + m[1].length];
  }

  async segs(raw, inHeredoc = false) {
    const out = [];
    let i = 0;
    const lit = (s, q) => out.push({ s, q, lit: true });
    while (i < raw.length) {
      const c = raw[i];
      if (inHeredoc) {
        if (c === "\\" && "$`\\".includes(raw[i + 1])) { lit(raw[i + 1], true); i += 2; } else if (c === "$") { const [v, e] = await this.dollar(raw, i); out.push({ s: v, q: true }); i = e; } else { lit(c, true); i++; }
        continue;
      }
      if (c === "'") { const e = raw.indexOf("'", i + 1); lit(raw.slice(i + 1, e), true); i = e + 1; }
      else if (c === '"') {
        i++;
        while (i < raw.length && raw[i] !== '"') {
          if (raw[i] === "\\" && '$`"\\\n'.includes(raw[i + 1])) { lit(raw[i + 1], true); i += 2; }
          else if (raw.startsWith("$@", i)) { out.push({ at: true }); i += 2; }
          else if (raw[i] === "$") { const [v, e] = await this.dollar(raw, i); out.push({ s: v, q: true }); i = e; }
          else if (raw[i] === "`") { const e = raw.indexOf("`", i + 1); out.push({ s: await this.subst(raw.slice(i + 1, e)), q: true }); i = e + 1; }
          else { lit(raw[i], true); i++; }
        }
        i++; if (!out.length || out[out.length - 1].q !== true) lit("", true);
      }
      else if (c === "\\") { lit(raw[i + 1] ?? "", true); i += 2; }
      else if (c === "$") { const [v, e] = await this.dollar(raw, i); out.push({ s: v, q: false }); i = e; }
      else if (c === "`") { const e = raw.indexOf("`", i + 1); out.push({ s: await this.subst(raw.slice(i + 1, e)), q: false }); i = e + 1; }
      else if (c === "~" && i === 0 && (raw.length === 1 || raw[1] === "/")) { lit(HOME, true); i++; }
      else { lit(c, false); i++; }
    }
    return out;
  }
  async expandStr(raw, heredoc = false) { return (await this.segs(raw, heredoc)).map((x) => (x.at ? this.pos.slice(1).join(" ") : x.s)).join(""); }
  async expandWords(raws) {
    const res = [];
    for (const raw of raws) {
      const fields = []; let cur = "", has = false, glob = false;
      for (const g of await this.segs(raw)) {
        if (g.at) { this.pos.slice(1).forEach((p, k) => { if (k) { fields.push([cur, glob]); cur = ""; glob = false; } cur += p; has = true; }); continue; }
        if (g.q || g.lit) { cur += g.s; has = true; if (g.lit && !g.q && /[*?]/.test(g.s)) glob = true; continue; }
        g.s.split(/[ \t\n]+/).forEach((x, k) => { if (k && has) { fields.push([cur, glob]); cur = ""; has = false; glob = false; } if (x) { cur += x; has = true; } });
      }
      if (has) fields.push([cur, glob]);
      for (const [f, gl] of fields.map(([x, gg]) => [x, gg || (/\[[^\]]+\]/.test(x) && !/^\[+$/.test(x) && raw === x)])) res.push(...(gl ? this.glob(f) : [f]));
    }
    return res;
  }
  glob(pat) {
    const slash = pat.lastIndexOf("/"), dirPart = slash >= 0 ? pat.slice(0, slash + 1) : "", rx = globRx(pat.slice(slash + 1));
    const dir = this.path(dirPart || ".");
    if (!this.fs.isDir(dir)) return [pat];
    const hits = this.fs.list(dir).filter((n) => rx.test(n) && (!n.startsWith(".") || pat.slice(slash + 1).startsWith("."))).map((n) => dirPart + n);
    return hits.length ? hits : [pat];
  }

  arith(src) {
    const T = (src.match(/\d+|[A-Za-z_]\w*|\*\*|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||[-+*/%]=|[-+*/%<>=!?:()&|^~,]/g) || []);
    let p = 0;
    const num = (k) => { const v = parseInt(this.get(k) ?? "0", 10); return Number.isNaN(v) ? 0 : v; };
    const bin = { "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, ">": 7, "<=": 7, ">=": 7, "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10, "**": 11 };
    const ap = (op, a, b) => { switch (op) { case "+": return a + b; case "-": return a - b; case "*": return a * b; case "/": case "%": if (!b) throw new ShErr("division by 0 (error token is \"" + b + "\")"); return op === "/" ? Math.trunc(a / b) : a % b; case "**": return a ** b;
      case "<": return +(a < b); case ">": return +(a > b); case "<=": return +(a <= b); case ">=": return +(a >= b); case "==": return +(a === b); case "!=": return +(a !== b); case "&&": return +(!!a && !!b); case "||": return +(!!a || !!b); case "&": return a & b; case "|": return a | b; case "^": return a ^ b; case "<<": return a << b; case ">>": return a >> b; default: throw new ShErr(`syntax error in expression (error token is "${op}")`); } };
    const unary = () => {
      const t = T[p];
      if (t === "!") { p++; return +!unary(); } if (t === "-") { p++; return -unary(); } if (t === "+") { p++; return unary(); } if (t === "~") { p++; return ~unary(); }
      if ((t === "++" || t === "--") && /^[A-Za-z_]/.test(T[p + 1])) { p++; const k = T[p++], v = num(k) + (t === "++" ? 1 : -1); this.set(k, String(v)); return v; }
      if (t === "(") { p++; const v = assign(); if (T[p++] !== ")") throw new ShErr("missing `)'"); return v; }
      if (t === undefined) throw new ShErr("syntax error: operand expected");
      p++;
      if (/^\d+$/.test(t)) return parseInt(t, 10);
      if (/^[A-Za-z_]/.test(t)) { if (T[p] === "++" || T[p] === "--") { const v = num(t); this.set(t, String(v + (T[p++] === "++" ? 1 : -1))); return v; } return num(t); }
      throw new ShErr(`syntax error: operand expected (error token is "${t}")`);
    };
    const climb = (min) => { let l = unary(); for (;;) { const op = T[p], pr = bin[op]; if (!pr || pr < min) return l; p++; const r = climb(op === "**" ? pr : pr + 1); l = ap(op, l, r); } };
    const tern = () => { const c = climb(1); if (T[p] !== "?") return c; p++; const a = assign(); if (T[p++] !== ":") throw new ShErr("expected `:'"); const b = assign(); return c ? a : b; };
    const assign = () => {
      if (/^[A-Za-z_]/.test(T[p] || "") && /^([-+*/%]?=)$/.test(T[p + 1] || "")) { const k = T[p], op = T[p + 1]; p += 2; const r = assign(); const v = op === "=" ? r : ap(op[0], num(k), r); this.set(k, String(v)); return v; }
      return tern();
    };
    let v = 0;
    while (p < T.length) { v = assign(); if (T[p] === ",") p++; else if (p < T.length) throw new ShErr(`syntax error in expression (error token is "${T.slice(p).join(" ")}")`); }
    return v;
  }

  test(a, dbl) {
    const U = ["-z", "-n", "-f", "-d", "-e", "-r", "-w", "-x", "-s", "-L"], B = ["=", "==", "!=", "-eq", "-ne", "-lt", "-gt", "-le", "-ge", "=~", "<", ">"];
    if (!dbl && a.length === 2 && a[0] !== "!" && !U.includes(a[0])) throw new ShErr(`[: ${a[0]}: unary operator expected`, 2);
    let p = 0;
    const int = (x) => { if (!/^-?\d+$/.test(x?.trim?.() ?? "")) throw new ShErr(`${dbl ? "" : "[: "}${x}: integer expression expected`, 2); return parseInt(x, 10); };
    const prim = () => {
      if (U.includes(a[p]) && p + 1 < a.length && !B.includes(a[p + 1])) {
        const op = a[p++], x = a[p++], f = this.fs.get(this.path(x));
        switch (op) { case "-z": return x === ""; case "-n": return x !== ""; case "-f": return f?.t === "f"; case "-d": return f?.t === "d"; case "-e": case "-r": case "-L": return !!f; case "-w": return !!f && f.o === "kali"; case "-x": return !!f && !!(f.m & 0o111); case "-s": return f?.t === "f" && f.c.length > 0; default: return false; }
      }
      const x = a[p++];
      if (x === undefined) throw new ShErr(dbl ? "unexpected argument to conditional" : "[: argument expected", 2);
      if (B.includes(a[p])) {
        const op = a[p++], y = a[p++];
        if (y === undefined) throw new ShErr(`[: ${x}: unary operator expected`, 2);
        switch (op) { case "=": case "==": return dbl ? globRx(y).test(x) : x === y; case "!=": return dbl ? !globRx(y).test(x) : x !== y; case "=~": return new RegExp(y).test(x); case "<": return x < y; case ">": return x > y;
          case "-eq": return int(x) === int(y); case "-ne": return int(x) !== int(y); case "-lt": return int(x) < int(y); case "-gt": return int(x) > int(y); case "-le": return int(x) <= int(y); default: return int(x) >= int(y); }
      }
      return x !== "";
    };
    const not = () => { if (a[p] === "!") { p++; return !not(); } if (a[p] === "(") { p++; const v = or(); if (a[p++] !== ")") throw new ShErr("[: `)' expected", 2); return v; } return prim(); };
    const and = () => { let v = not(); while (a[p] === (dbl ? "&&" : "-a")) { p++; const r = not(); v = v && r; } return v; };
    const or = () => { let v = and(); while (a[p] === (dbl ? "||" : "-o")) { p++; const r = and(); v = v || r; } return v; };
    if (!a.length) return 1;
    const v = or();
    if (p < a.length) throw new ShErr(`${dbl ? "syntax error in conditional expression" : "[: too many arguments"}`, 2);
    return v ? 0 : 1;
  }
}
