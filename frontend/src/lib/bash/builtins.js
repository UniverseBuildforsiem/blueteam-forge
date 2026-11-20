import { Exit, Ret, Brk, Cont, ShErr } from "./interp";
import { BashSyntax } from "./parse";

const esc = (s) => s.replace(/\\(n|t|\\|e|a|r|0)/g, (_, c) => ({ n: "\n", t: "\t", "\\": "\\", e: "\x1b", a: "", r: "\r", 0: "" }[c]));

export function printf(fmt, args) {
  let out = "", k = 0;
  const one = () => esc(fmt).replace(/%([-+ 0]*)(\d*)(?:\.(\d+))?([sdifxXc%])/g, (_, fl, w, pr, t) => {
    if (t === "%") return "%";
    const a = args[k++] ?? "";
    let v;
    if (t === "s") v = pr ? a.slice(0, +pr) : a;
    else if (t === "c") v = a[0] || "";
    else if (t === "f") v = (parseFloat(a) || 0).toFixed(pr ? +pr : 6);
    else if (t === "x" || t === "X") v = (parseInt(a, 10) || 0).toString(16)[t === "X" ? "toUpperCase" : "toLowerCase"]();
    else v = String(parseInt(a, 10) || 0);
    if (w && v.length < +w) v = fl.includes("-") ? v.padEnd(+w) : v.padStart(+w, fl.includes("0") && t !== "s" ? "0" : " ");
    return v;
  });
  do { out += one(); } while (k && k < args.length);
  return out;
}

export const BUILTINS = {
  echo(a, io) {
    let n = false, e = false;
    while (/^-[neE]+$/.test(a[0] || "")) { const f = a.shift(); n ||= f.includes("n"); e ||= f.includes("e"); }
    const s = a.join(" ");
    io.out((e ? esc(s) : s) + (n ? "" : "\n")); return 0;
  },
  printf(a, io) { if (!a.length) throw new ShErr("printf: usage: printf format [arguments]", 2); io.out(printf(a[0], a.slice(1))); return 0; },
  async read(a, io) {
    let prompt = "", names = [];
    for (let i = 0; i < a.length; i++) { if (a[i] === "-p") prompt = a[++i] || ""; else if (a[i] === "-r" || a[i] === "-s") continue; else names.push(a[i]); }
    if (!names.length) names = ["REPLY"];
    let line;
    if (io.stdin) line = io.stdin.line(); else { if (prompt) io.out(prompt); line = this.readLine ? await this.readLine(prompt) : null; }
    if (line == null) return 1;
    const parts = line.trim().split(/[ \t]+/);
    names.forEach((n, i) => this.set(n, i === names.length - 1 ? parts.slice(i).join(" ") : parts[i] || ""));
    return 0;
  },
  cd(a) { const t = this.path(a[0] || this.get("HOME")); if (!this.fs.isDir(t)) throw new ShErr(`cd: ${a[0]}: ${this.fs.get(t) ? "Not a directory" : "No such file or directory"}`); this.set("OLDPWD", this.cwd); this.set("PWD", t); this.cwd = t; return 0; },
  pwd(a, io) { io.out(this.cwd + "\n"); return 0; },
  export(a, io) {
    if (!a.length || a[0] === "-p") { [...this.exported].sort().forEach((k) => io.out(`declare -x ${k}="${this.vars.get(k) ?? ""}"\n`)); return 0; }
    a.forEach((x) => { const i = x.indexOf("="); const k = i < 0 ? x : x.slice(0, i); if (i >= 0) this.set(k, x.slice(i + 1)); this.exported.add(k); }); return 0;
  },
  unset(a) { a.filter((x) => x !== "-v" && x !== "-f").forEach((k) => { this.vars.delete(k); this.exported.delete(k); delete this.funcs[k]; this.locals.forEach((m) => m.delete(k)); }); return 0; },
  env(a, io) { [...this.exported].sort().forEach((k) => this.vars.has(k) && io.out(`${k}=${this.vars.get(k)}\n`)); return 0; },
  local(a) {
    if (!this.locals.length) throw new ShErr("local: can only be used in a function");
    a.forEach((x) => { const i = x.indexOf("="); this.locals[this.locals.length - 1].set(i < 0 ? x : x.slice(0, i), i < 0 ? "" : x.slice(i + 1)); }); return 0;
  },
  declare(a) { a.filter((x) => !x.startsWith("-")).forEach((x) => { const i = x.indexOf("="); (this.locals.length ? BUILTINS.local : (y) => y.forEach((z) => this.set(z.split("=")[0], z.slice(z.indexOf("=") + 1)))).call(this, [i < 0 ? `${x}=` : x]); }); return 0; },
  return(a) { throw new Ret(a.length ? parseInt(a[0], 10) & 255 : this.status); },
  exit(a) { throw new Exit(a.length ? parseInt(a[0], 10) & 255 : this.status); },
  break(a) { throw new Brk(parseInt(a[0] || "1", 10)); },
  continue(a) { throw new Cont(parseInt(a[0] || "1", 10)); },
  shift(a) { const n = parseInt(a[0] || "1", 10); if (n > this.pos.length - 1) return 1; this.pos.splice(1, n); return 0; },
  test(a) { return this.test(a, false); },
  "["(a) { if (a[a.length - 1] !== "]") throw new ShErr("[: missing `]'", 2); return this.test(a.slice(0, -1), false); },
  true: () => 0, false: () => 1, ":": () => 0, trap: () => 0, wait: () => 0, sleep: () => 0,
  let(a) { let v = 0; a.forEach((x) => { v = this.arith(x); }); return v ? 0 : 1; },
  async eval(a, io) { return this.run(a.join(" "), io); },
  async source(a, io) {
    if (!a.length) throw new ShErr("source: filename argument required", 2);
    const pos = this.pos; if (a.length > 1) this.pos = [pos[0], ...a.slice(1)];
    try { return await this.run(this.fs.read(this.path(a[0])), io); } catch (e) { if (e instanceof Ret) return e.code; if (e.fs) throw new ShErr(`${a[0]}: No such file or directory`); throw e; } finally { this.pos = pos; }
  },
  async bash(a, io) {
    if (a[0] === "-c") { const sh = this.clone(); sh.pos = [a[2] || "bash", ...a.slice(3)]; try { return await sh.run(a[1] || "", io); } catch (e) { if (e instanceof Exit) return e.code; if (e instanceof BashSyntax) { io.err(`bash: -c: ${e.message}\n`); return 2; } throw e; } }
    if (!a.length) { io.out("(nested interactive shells are not supported; run: bash script.sh)\n"); return 0; }
    return this.runScript(a[0], a.slice(1), io, false);
  },
  history(a, io) { this.history.forEach((h, i) => io.out(`${String(i + 1).padStart(5)}  ${h}\n`)); return 0; },
  clear(a, io) { io.out("\x1bCLEAR"); return 0; },
  type(a, io) { a.forEach((x) => io.out(this.funcs[x] ? `${x} is a function\n` : BUILTINS[x] ? `${x} is a shell builtin\n` : this.cmds[x] ? `${x} is /usr/bin/${x}\n` : `bash: type: ${x}: not found\n`)); return 0; },
};
BUILTINS["."] = BUILTINS.source;
BUILTINS.sh = BUILTINS.bash;
