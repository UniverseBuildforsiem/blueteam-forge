import { compileAwk } from "./awk";
import { HOME, base, parent } from "./fs";
import { ShErr, globRx } from "./interp";
import { MAN } from "./man";
import { msfconsole } from "./msf";

const say = (io, s) => { if (s !== "" && s != null) io.out(String(s).endsWith("\n") ? s : `${s}\n`); };
const L = (t) => { const l = t.split("\n"); if (l[l.length - 1] === "") l.pop(); return l; };
const J = (l) => (l.length ? l.join("\n") + "\n" : "");
function opts(a, withArg = "") {
  const f = new Set(), v = {}, rest = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (/^-\d+$/.test(x) && withArg.includes("n")) { v.n = x.slice(1); continue; }
    if (x.length > 1 && x[0] === "-" && x !== "--" && !/^-\d/.test(x)) {
      for (let k = 1; k < x.length; k++) { const c = x[k]; if (withArg.includes(c)) { v[c] = x.slice(k + 1) || a[++i]; break; } f.add(c); }
    } else rest.push(x);
  }
  return { f, v, rest };
}
const inp = (sh, files, io) => (files.length ? files.map((p) => sh.fs.read(sh.path(p))).join("") : io.stdin ? io.stdin.all() : "");
const modeStr = (n) => (n.t === "d" ? "d" : "-") + [6, 3, 0].map((s) => { const b = (n.m >> s) & 7; return `${b & 4 ? "r" : "-"}${b & 2 ? "w" : "-"}${b & 1 ? "x" : "-"}`; }).join("");
const LIVE = new Set([1, 5, 21, 22, 25]);
const PORTS = { "10.0.0.21": [[21, "ftp", "SOCP-FTPd 2.3.4 (training build)"], [22, "ssh", "OpenSSH 8.2p1"], [80, "http", "Apache httpd 2.4.41"]], "10.0.0.22": [[22, "ssh", "OpenSSH 8.9p1"], [5432, "postgresql", "PostgreSQL 14"]], "10.0.0.25": [[80, "http", "nginx 1.18.0"], [443, "https", "nginx 1.18.0"]] };
const labHost = (h) => ({ "web01.lab.local": "10.0.0.21", web01: "10.0.0.21", "db01.lab.local": "10.0.0.22" }[h] || h);
const onLab = (h) => /^10\.0\.0\.\d+$/.test(labHost(h || ""));
async function sha256(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }

function sedRun(script, text, quiet) {
  const cmds = script.split(/;\s*|\n/).filter(Boolean).map((c) => {
    const m = c.match(/^(?:(\d+|\$)(?:,(\d+|\$))?|\/((?:\\.|[^/])*)\/)?\s*(.)(.*)$/s);
    if (!m) throw new ShErr(`-e expression #1, char 1: unknown command: \`${c}'`);
    let s = null;
    if (m[4] === "s") { const d = m[5][0]; const parts = m[5].slice(1).split(new RegExp(`(?<!\\\\)\\${d}`)); if (parts.length < 3) throw new ShErr("-e expression #1: unterminated `s' command"); s = [new RegExp(parts[0], parts[2].includes("g") ? (parts[2].includes("i") ? "gi" : "g") : parts[2].includes("i") ? "i" : ""), parts[1].replace(/\\\//g, "/").replace(/&/g, "$&"), parts[2].includes("p")]; }
    return { a: m[1], b: m[2], re: m[3] != null ? new RegExp(m[3]) : null, op: m[4], s };
  });
  const lines = L(text), out = [];
  lines.forEach((ln, i) => {
    const no = i + 1, last = no === lines.length; let cur = ln, del = false;
    for (const c of cmds) {
      const at = (x) => (x === "$" ? last : no === +x);
      const hit = c.re ? c.re.test(cur) : !c.a ? true : c.b ? no >= (c.a === "$" ? lines.length : +c.a) && (c.b === "$" || no <= +c.b) : at(c.a);
      if (!hit) continue;
      if (c.op === "d") { del = true; break; }
      if (c.op === "p") out.push(cur);
      if (c.op === "s") { const nx = cur.replace(c.s[0], c.s[1]); if (c.s[2] && nx !== cur) out.push(nx); cur = nx; }
    }
    if (!del && !quiet) out.push(cur);
  });
  return J(out);
}

function diffLines(a, b) {
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  const rng = (x, y) => (x === y ? `${x}` : `${x},${y}`);
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; continue; }
    const i0 = i, j0 = j;
    while ((i < n || j < m) && !(i < n && j < m && a[i] === b[j])) { if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) i++; else j++; }
    const da = a.slice(i0, i), db = b.slice(j0, j);
    if (da.length && db.length) out.push(`${rng(i0 + 1, i)}c${rng(j0 + 1, j)}`, ...da.map((x) => `< ${x}`), "---", ...db.map((x) => `> ${x}`));
    else if (da.length) out.push(`${rng(i0 + 1, i)}d${j0}`, ...da.map((x) => `< ${x}`));
    else out.push(`${i0}a${rng(j0 + 1, j)}`, ...db.map((x) => `> ${x}`));
  }
  return out;
}

export function createCmds(lab) {
  const net = lab?.kali?.net || { whois: {}, dns: {}, nmap: {}, curl: {} };
  const C = {
    help: (a, io) => say(io, "Available: " + Object.keys(C).sort().join("  ") + "\nShell: if/for/while/case, functions, pipes, redirects, $(...), $((...)). Try 'man <cmd>' or '<cmd> --help'."),
    man: (a, io) => { if (!a[0]) throw new ShErr("What manual page do you want?"); if (!MAN[a[0]]) throw new ShErr(`No manual entry for ${a[0]}`); say(io, `${a[0].toUpperCase()}(1)\n\n${MAN[a[0]]}`); },
    whoami: (a, io, sh) => say(io, sh.root ? "root" : "kali"),
    id: (a, io, sh) => say(io, sh.root ? "uid=0(root) gid=0(root) groups=0(root)" : "uid=1000(kali) gid=1000(kali) groups=1000(kali),27(sudo)"),
    uname: (a, io) => say(io, a.includes("-a") ? "Linux socpro-kali 6.6.0-kali-amd64 #1 SMP x86_64 GNU/Linux (simulated)" : a.includes("-r") ? "6.6.0-kali-amd64" : "Linux"),
    who: (a, io) => say(io, "kali     tty7         2026-06-12 08:58 (:0)\nkali     pts/0        2026-06-12 09:02 (10.0.0.5)"),
    w: (a, io) => say(io, " 09:15:01 up 16 min,  2 users,  load average: 0.08, 0.05, 0.01\nUSER     TTY      FROM             LOGIN@   IDLE WHAT\nkali     tty7     :0               08:58   16:00  xfce4-session\nkali     pts/0    10.0.0.5         09:02    0.00s bash"),
    last: (a, io) => say(io, "kali     pts/0        10.0.0.5         Fri Jun 12 09:02   still logged in\nkali     tty7         :0               Fri Jun 12 08:58   still logged in\nreboot   system boot  6.6.0-kali-amd64 Fri Jun 12 08:57   still running\n\nwtmp begins Mon Jun  1 10:00:00 2026"),
    date: (a, io) => say(io, a[0]?.startsWith("+") ? new Date().toISOString().slice(0, 10).replace(/^(\d+)-(\d+)-(\d+)$/, (_, y, m, d) => a[0].slice(1).replace("%Y", y).replace("%m", m).replace("%d", d).replace("%F", `${y}-${m}-${d}`).replace("%H", String(new Date().getUTCHours()).padStart(2, "0")).replace("%M", String(new Date().getUTCMinutes()).padStart(2, "0"))) : new Date().toUTCString()),
    cal: (a, io) => { const d = new Date(), y = d.getFullYear(), m = d.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(); const cells = [...Array(first).fill("  "), ...Array.from({ length: days }, (_, i) => String(i + 1).padStart(2))]; const rows = []; for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7).join(" ")); say(io, `${d.toLocaleString("en", { month: "long" })} ${y}`.padStart(14) + "\nSu Mo Tu We Th Fr Sa\n" + rows.join("\n")); },
    ls: (a, io, sh) => {
      const { f, rest } = opts(a);
      const show = (n) => f.has("a") || !n.startsWith(".");
      const fmt = (p, n) => { const x = sh.fs.get(p); return f.has("l") ? `${modeStr(x)} 1 ${x.o} ${x.o} ${String(sh.fs.size(p)).padStart(6)} Jun 12 09:00 ${n}` : x.t === "d" ? `${n}/` : n; };
      const list = (d, hdr) => { const items = sh.fs.list(d).filter(show); if (hdr) io.out(`${d}:\n`); const lines = items.map((n) => fmt(`${d === "/" ? "" : d}/${n}`, n)); say(io, f.has("l") ? `total ${items.length * 4}\n${lines.join("\n")}` : lines.join("  ")); if (f.has("R")) items.forEach((n) => { const c = `${d === "/" ? "" : d}/${n}`; if (sh.fs.isDir(c)) { io.out("\n"); list(c, true); } }); };
      const targets = rest.length ? rest : ["."]; let code = 0;
      targets.forEach((t) => { const p = sh.path(t); if (!sh.fs.get(p)) { io.err(`ls: cannot access '${t}': No such file or directory\n`); code = 2; } else if (sh.fs.isFile(p)) say(io, fmt(p, t)); else list(p, f.has("R") || targets.length > 1); });
      return code;
    },
    tree: (a, io, sh) => { const root = sh.path(a[0] || "."); let nd = 0, nf = 0; const out = [a[0] || "."]; const walk = (d, pre) => { const it = sh.fs.list(d); it.forEach((n, i) => { const p = `${d === "/" ? "" : d}/${n}`, lastI = i === it.length - 1; out.push(`${pre}${lastI ? "└── " : "├── "}${n}`); if (sh.fs.isDir(p)) { nd++; walk(p, pre + (lastI ? "    " : "│   ")); } else nf++; }); }; walk(root, ""); out.push("", `${nd} directories, ${nf} files`); say(io, out.join("\n")); },
    cat: (a, io, sh) => { const { f, rest } = opts(a); const t = inp(sh, rest, io); io.out(f.has("n") ? J(L(t).map((l, i) => `${String(i + 1).padStart(6)}\t${l}`)) : t); },
    touch: (a, io, sh) => a.forEach((p) => { const q = sh.path(p); if (sh.fs.get(q)) sh.fs.get(q).mt = Math.floor(Date.now() / 1000); else sh.fs.write(q, ""); }),
    mkdir: (a, io, sh) => { const { f, rest } = opts(a); rest.forEach((p) => sh.fs.mkdir(sh.path(p), f.has("p"))); },
    rm: (a, io, sh) => { const { f, rest } = opts(a); if (!rest.length) throw new ShErr("missing operand"); let c = 0; rest.forEach((p) => { try { sh.fs.rm(sh.path(p), f.has("r") || f.has("R")); } catch (e) { if (!f.has("f")) { io.err(`rm: ${e.message}\n`); c = 1; } } }); return c; },
    cp: (a, io, sh) => { const { f, rest } = opts(a); const dst = sh.path(rest.pop()); rest.forEach((s) => { const sp = sh.path(s); if (!sh.fs.get(sp)) throw new ShErr(`cannot stat '${s}': No such file or directory`); if (sh.fs.isDir(sp) && !f.has("r") && !f.has("R")) throw new ShErr(`-r not specified; omitting directory '${s}'`); sh.fs.copy(sp, sh.fs.isDir(dst) ? `${dst}/${base(sp)}` : dst); }); },
    mv: (a, io, sh) => { const dst = sh.path(a[a.length - 1]); a.slice(0, -1).forEach((s) => { const sp = sh.path(s); if (!sh.fs.get(sp)) throw new ShErr(`cannot stat '${s}': No such file or directory`); const to = sh.fs.isDir(dst) ? `${dst}/${base(sp)}` : dst; sh.fs.copy(sp, to); sh.fs.rm(sp, true); }); },
    chmod: (a, io, sh) => { const [m, ...ps] = a; if (!ps.length) throw new ShErr("missing operand"); ps.forEach((p) => { const n = sh.fs.get(sh.path(p)); if (!n) throw new ShErr(`cannot access '${p}': No such file or directory`); if (/^[0-7]{3,4}$/.test(m)) n.m = parseInt(m, 8); else { const mm = m.match(/^([ugoa]*)([-+=])([rwx]+)$/); if (!mm) throw new ShErr(`invalid mode: '${m}'`); const who = mm[1] || "a", bits = (mm[3].includes("r") ? 4 : 0) | (mm[3].includes("w") ? 2 : 0) | (mm[3].includes("x") ? 1 : 0); let mask = 0; if (/[ua]/.test(who)) mask |= bits << 6; if (/[ga]/.test(who)) mask |= bits << 3; if (/[oa]/.test(who)) mask |= bits; n.m = mm[2] === "+" ? n.m | mask : mm[2] === "-" ? n.m & ~mask : (n.m & ~(0o777 & (who === "a" ? 0o777 : mask))) | mask; } }); },
    chown: (a, io, sh) => { if (!sh.root) throw new ShErr(`changing ownership of '${a[1]}': Operation not permitted (try sudo)`); const n = sh.fs.get(sh.path(a[1] || "")); if (!n) throw new ShErr(`cannot access '${a[1]}': No such file or directory`); n.o = a[0].split(":")[0]; },
    find: (a, io, sh) => {
      const start = a[0] && !a[0].startsWith("-") ? a[0] : ".", root = sh.path(start), o = {};
      for (let i = 0; i < a.length; i++) if (a[i].startsWith("-")) o[a[i].slice(1)] = a[++i];
      if (!sh.fs.get(root)) throw new ShErr(`'${start}': No such file or directory`);
      const hits = sh.fs.walk(root).filter((p) => { const n = sh.fs.get(p), nm = base(p) || "/";
        if (o.name && !globRx(o.name).test(nm)) return false; if (o.iname && !globRx(o.iname.toLowerCase()).test(nm.toLowerCase())) return false;
        if (o.type && (o.type === "f") !== (n.t === "f")) return false;
        if (o.perm) { const want = parseInt(o.perm.replace(/^[-/]/, ""), 8); if (o.perm.startsWith("-") ? (n.m & want) !== want : o.perm.startsWith("/") ? !(n.m & want) : (n.m & 0o777) !== want) return false; }
        if (o.size) { const m = o.size.match(/^([+-]?)(\d+)([ckM]?)$/); const sz = sh.fs.size(p) / ({ c: 1, k: 1024, M: 1048576, "": 512 }[m[3]]); if (m[1] === "+" ? !(sz > +m[2]) : m[1] === "-" ? !(sz < +m[2]) : Math.ceil(sz) !== +m[2]) return false; }
        return true; });
      say(io, hits.map((p) => (start.startsWith("/") ? p : p === root ? start : `${start.replace(/\/$/, "")}${p.slice(root.length)}`)).join("\n"));
    },
    which: (a, io, sh) => { let c = 0; a.forEach((x) => (sh.cmds[x] ? say(io, `/usr/bin/${x}`) : (c = 1))); return c; },
    whereis: (a, io, sh) => a.forEach((x) => say(io, `${x}:${sh.cmds[x] ? ` /usr/bin/${x} /usr/share/man/man1/${x}.1.gz` : ""}`)),
    grep: (a, io, sh) => {
      const { f, v, rest } = opts(a, "e"); const pat = v.e ?? rest.shift();
      if (pat == null) throw new ShErr("usage: grep [-EivcnrHo] PATTERN [FILE...]", 2);
      let rx; try { rx = new RegExp(f.has("E") || true ? pat.replace(/\\\|/g, "|") : pat, f.has("i") ? "i" : ""); } catch { throw new ShErr(`Unmatched ( or \\(`, 2); }
      let files = rest;
      if (f.has("r")) files = (rest.length ? rest : ["."]).flatMap((r) => sh.fs.walk(sh.path(r)).filter((p) => sh.fs.isFile(p)));
      const srcs = files.length ? files.map((p) => [p, sh.fs.read(sh.path(p))]) : [[null, io.stdin ? io.stdin.all() : ""]];
      const multi = srcs.length > 1 || f.has("r"); let total = 0;
      srcs.forEach(([name, t]) => { const hits = L(t).map((l, i) => [l, i + 1]).filter(([l]) => rx.test(l) !== f.has("v")); total += hits.length;
        if (f.has("c")) say(io, multi ? `${name}:${hits.length}` : hits.length);
        else hits.forEach(([l, n]) => say(io, `${multi ? `${name}:` : ""}${f.has("n") ? `${n}:` : ""}${f.has("o") ? (l.match(rx) || [""])[0] : l}`)); });
      return total ? 0 : 1;
    },
    cut: (a, io, sh) => {
      const { v, f, rest } = opts(a, "dfc"); const d = v.d ?? "\t";
      const sel = (n) => (v.f || v.c).split(",").some((r) => { const [x, y] = r.split("-"); return r.includes("-") ? n >= (+x || 1) && (y === "" || n <= +y) : n === +x; });
      io.out(J(L(inp(sh, rest, io)).map((l) => (v.c ? [...l].filter((_, i) => sel(i + 1)).join("") : !l.includes(d) && !f.has("s") ? l : l.split(d).filter((_, i) => sel(i + 1)).join(d)))));
    },
    sed: (a, io, sh) => { const { f, v, rest } = opts(a, "e"); const script = v.e ?? rest.shift(); if (!script) throw new ShErr("usage: sed [-n] [-i] script [file]");
      if (f.has("i")) { rest.forEach((p) => sh.fs.write(sh.path(p), sedRun(script, sh.fs.read(sh.path(p)), f.has("n")))); return 0; } io.out(sedRun(script, inp(sh, rest, io), f.has("n"))); },
    tr: (a, io) => { const { f, rest } = opts(a); const ex = (s) => (s || "").replace(/\\n/g, "\n").replace(/\[:(\w+):\]/g, (_, c) => ({ upper: "A-Z", lower: "a-z", digit: "0-9", space: " \t\n" }[c] || "")).replace(/(.)-(.)/g, (_, x, y) => { let r = ""; for (let c = x.charCodeAt(0); c <= y.charCodeAt(0); c++) r += String.fromCharCode(c); return r; });
      const s1 = ex(rest[0]), s2 = ex(rest[1]), t = io.stdin ? io.stdin.all() : "";
      let out = f.has("d") ? [...t].filter((c) => !s1.includes(c)).join("") : [...t].map((c) => { const i = s1.indexOf(c); return i < 0 ? c : s2[Math.min(i, s2.length - 1)] ?? c; }).join("");
      if (f.has("s")) out = out.replace(new RegExp(`([${(s2 || s1).replace(/[\]\\^-]/g, "\\$&")}])\\1+`, "g"), "$1"); io.out(out); },
    paste: (a, io, sh) => { const { v, f, rest } = opts(a, "d"); const d = v.d ?? "\t"; const cols = rest.map((p) => L(p === "-" ? (io.stdin?.all() || "") : sh.fs.read(sh.path(p))));
      if (f.has("s")) return io.out(J(cols.map((c) => c.join(d)))); const n = Math.max(0, ...cols.map((c) => c.length)); io.out(J(Array.from({ length: n }, (_, i) => cols.map((c) => c[i] ?? "").join(d)))); },
    sort: (a, io, sh) => { const { f, v, rest } = opts(a, "kt"); let l = L(inp(sh, rest, io)); const key = (s) => (v.k ? (v.t ? s.split(v.t) : s.trim().split(/\s+/)).slice(+v.k.split(",")[0] - 1).join(" ") : s);
      l.sort((x, y) => (f.has("n") ? (parseFloat(key(x)) || 0) - (parseFloat(key(y)) || 0) : key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0)); if (f.has("r")) l.reverse(); if (f.has("u")) l = l.filter((x, i) => i === 0 || x !== l[i - 1]); io.out(J(l)); },
    uniq: (a, io, sh) => { const { f, rest } = opts(a); const out = []; L(inp(sh, rest, io)).forEach((x) => { const lst = out[out.length - 1]; if (lst && lst[1] === x) lst[0]++; else out.push([1, x]); });
      io.out(J(out.filter(([c]) => !f.has("d") || c > 1).map(([c, x]) => (f.has("c") ? `${String(c).padStart(7)} ${x}` : x)))); },
    wc: (a, io, sh) => { const { f, rest } = opts(a); const one = (t) => { const r = []; const all = !f.size; if (all || f.has("l")) r.push((t.match(/\n/g) || []).length || (t && !t.includes("\n") ? 1 : 0)); if (all || f.has("w")) r.push(t.split(/\s+/).filter(Boolean).length); if (all || f.has("c")) r.push(t.length); return r; };
      if (!rest.length) { const r = one(io.stdin ? io.stdin.all() : ""); return say(io, r.length === 1 ? String(r[0]) : r.map((x) => String(x).padStart(7)).join(" ")); }
      rest.forEach((p) => say(io, `${one(sh.fs.read(sh.path(p))).map((x) => String(x).padStart(7)).join(" ")} ${p}`)); },
    head: (a, io, sh) => { const { v, rest } = opts(a, "n"); io.out(J(L(inp(sh, rest, io)).slice(0, +(v.n ?? 10)))); },
    tail: (a, io, sh) => { const { v, rest } = opts(a, "n"); const n = v.n ?? "10"; const l = L(inp(sh, rest, io)); io.out(J(n.startsWith("+") ? l.slice(+n.slice(1) - 1) : l.slice(-Math.max(+n, 0) || l.length + 1).slice(+n === 0 ? l.length : 0))); },
    diff: (a, io, sh) => { const [x, y] = a.filter((s) => !s.startsWith("-")).map((p) => L(sh.fs.read(sh.path(p)))); const d = diffLines(x, y); say(io, d.join("\n")); return d.length ? 1 : 0; },
    cmp: (a, io, sh) => { const [p, q] = a; const x = sh.fs.read(sh.path(p)), y = sh.fs.read(sh.path(q)); for (let i = 0, line = 1; i < Math.max(x.length, y.length); i++) { if (x[i] !== y[i]) { if (i >= x.length || i >= y.length) say(io, `cmp: EOF on ${i >= x.length ? p : q} after byte ${i}`); else say(io, `${p} ${q} differ: byte ${i + 1}, line ${line}`); return 1; } if (x[i] === "\n") line++; } return 0; },
    tee: (a, io, sh) => { const { f, rest } = opts(a); const t = io.stdin ? io.stdin.all() : ""; rest.forEach((p) => sh.fs.write(sh.path(p), t, f.has("a"))); io.out(t); },
    xargs: async (a, io, sh) => { const { v, rest } = opts(a, "n"); const words = (io.stdin ? io.stdin.all() : "").split(/\s+/).filter(Boolean); const cmd = rest.length ? rest : ["echo"]; const n = v.n ? +v.n : words.length || 1; let s = 0; for (let i = 0; i < Math.max(words.length, 1); i += n) s = await sh.invoke([...cmd, ...words.slice(i, i + n)], { ...io, stdin: null }); return s; },
    awk: (a, io, sh) => { const { v, rest } = opts(a, "Fv"); const prog = rest.shift(); if (!prog) throw new ShErr("usage: awk [-F fs] 'program' [file ...]", 2); const vars = {}; if (v.F) vars.FS = v.F === "\\t" ? "\t" : v.F; if (v.v) { const [k, val] = v.v.split("="); vars[k] = val; }
      try { io.out(compileAwk(prog, vars)(inp(sh, rest, io))); } catch (e) { throw new ShErr(e.message.replace(/^awk: /, ""), 2); } },
    strings: (a, io, sh) => say(io, (inp(sh, a, io).match(/[\x20-\x7e]{4,}/g) || []).join("\n")),
    file: (a, io, sh) => say(io, a.map((p) => { const n = sh.fs.get(sh.path(p)); if (!n) return `${p}: cannot open '${p}' (No such file or directory)`; if (n.t === "d") return `${p}: directory`; const c = n.c; const t = c.startsWith("MZ") ? "PE32 executable (GUI) Intel 80386, for MS Windows" : c === "PCAP" ? "pcap capture file, microsecond ts (little-endian) - version 2.4" : c.startsWith("Return-Path") ? "SMTP mail, ASCII text" : c.startsWith("#!") ? "Bourne-Again shell script, ASCII text executable" : c ? "ASCII text" : "empty"; return `${p}: ${t}`; }).join("\n")),
    base64: (a, io, sh) => { const d = a.includes("-d") || a.includes("--decode"); const t = inp(sh, a.filter((x) => !x.startsWith("-")), io).trim(); try { say(io, d ? atob(t.replace(/[^A-Za-z0-9+/=]/g, "")) : btoa(t)); } catch { throw new ShErr("invalid input"); } },
    sha256sum: async (a, io, sh) => say(io, a.length ? (await Promise.all(a.map(async (p) => `${await sha256(sh.fs.read(sh.path(p)))}  ${p}`))).join("\n") : `${await sha256(io.stdin?.all() || "")}  -`),
    md5sum: async (a, io, sh) => say(io, a.length ? (await Promise.all(a.map(async (p) => `${(await sha256("md5" + sh.fs.read(sh.path(p)))).slice(0, 32)}  ${p}`))).join("\n") : `${(await sha256("md5" + (io.stdin?.all() || ""))).slice(0, 32)}  -`),
    whois: (a, io) => say(io, net.whois?.[a[0]] || `No whois data for ${a[0] || "?"} in this lab (simulated).`),
    nslookup: (a, io) => { const ip = net.dns?.[a[0]] || (onLab(a[0]) && labHost(a[0]) !== a[0] ? labHost(a[0]) : null); say(io, ip ? `Server:\t\t10.0.0.53\nAddress:\t10.0.0.53#53\n\nName:\t${a[0]}\nAddress: ${ip}` : `** server can't find ${a[0]}: NXDOMAIN`); },
    dig: (a, io) => { const d = a.find((x) => !x.startsWith("+") && !x.startsWith("-")); const ip = net.dns?.[d]; say(io, `; <<>> DiG 9.18 (simulated) <<>> ${d}\n;; ANSWER SECTION:\n${ip ? `${d}.\t300\tIN\tA\t${ip}` : ";; status: NXDOMAIN"}`); },
    ping: (a, io) => { const h = a.filter((x, i) => !x.startsWith("-") && !(a[i - 1] === "-c" || a[i - 1] === "-W"))[0] || "localhost"; const ip = labHost(h), m = ip.match(/^10\.0\.0\.(\d+)$/);
      if (m && !LIVE.has(+m[1])) { say(io, `PING ${h} 56(84) bytes of data.\nFrom 10.0.0.15 icmp_seq=1 Destination Host Unreachable\n--- ${h} ping statistics ---\n1 packets transmitted, 0 received, +1 errors, 100% packet loss`); return 1; }
      say(io, `PING ${h} 56(84) bytes of data.\n64 bytes from ${h}: icmp_seq=1 ttl=64 time=0.42 ms\n64 bytes from ${h}: icmp_seq=2 ttl=64 time=0.39 ms\n--- ${h} ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss (simulated, no real traffic)`); return 0; },
    nmap: (a, io) => { const h = a.filter((x) => !x.startsWith("-")).pop(); const ip = labHost(h || ""); const r = net.nmap?.[h] || (PORTS[ip] ? `PORT     STATE SERVICE${a.includes("-sV") ? "    VERSION" : ""}\n${PORTS[ip].map(([p, s, ver]) => `${`${p}/tcp`.padEnd(8)} open  ${s.padEnd(10)}${a.includes("-sV") ? ` ${ver}` : ""}`).join("\n")}` : null);
      say(io, `Starting Nmap 7.94 (simulated)\nNmap scan report for ${h}\n${r || "All 1000 scanned ports are filtered"}\n\nNmap done: 1 IP address scanned`); },
    curl: (a, io) => { const u = a.filter((x) => !x.startsWith("-")).pop() || ""; const host = u.replace(/^https?:\/\//, "").split("/")[0]; say(io, net.curl?.[host] || (onLab(host) ? `<html><head><title>web01 - It works!</title></head><body>Apache/2.4.41 (Ubuntu) Server at ${host} Port 80</body></html>` : `curl: (6) Could not resolve host: ${host} (sandbox has no internet access)`)); },
    tcpdump: (a, io, sh) => { const i = a.indexOf("-r"); if (i < 0) return say(io, "tcpdump: live capture disabled in sandbox. Use -r <file>"); sh.fs.read(sh.path(a[i + 1])); say(io, `reading from file ${a[i + 1]}, link-type EN10MB\n` + (lab?.kali?.pcap || "")); },
    tshark: (a, io, sh) => { const i = a.indexOf("-r"); if (i < 0) return say(io, "tshark: live capture disabled in sandbox. Use -r <file>"); sh.fs.read(sh.path(a[i + 1])); say(io, lab?.kali?.pcap || "No packets."); },
    john: (a, io, sh) => { const t = sh.fs.read(sh.path(a.filter((x) => !x.startsWith("-")).pop() || "")); const cracked = lab?.kali?.cracked || {}; const res = L(t).filter(Boolean).map((l) => { const [u, h] = l.split(":"); return cracked[h] ? `${cracked[h]}\t\t(${u})` : null; }).filter(Boolean);
      say(io, `Using default input encoding: UTF-8\nLoaded ${L(t).filter(Boolean).length} password hash (Raw-MD5)\nProceeding with wordlist: rockyou.txt\n${res.join("\n")}\n${res.length}g 0:00:00:01 DONE (simulated)`); },
    sudo: async (a, io, sh) => { if (!a.length) throw new ShErr("usage: sudo command"); const was = sh.root; sh.root = true; try { return await sh.invoke(a, io); } finally { sh.root = was; } },
    useradd: (a, io, sh) => { if (!sh.root) throw new ShErr("Permission denied.\nuseradd: cannot lock /etc/passwd; try again later. (use sudo)"); const { f, rest } = opts(a); const u = rest[0]; if (!u) throw new ShErr("usage: useradd [-m] LOGIN", 2); if (sh.fs.read("/etc/passwd").includes(`\n${u}:`)) throw new ShErr(`user '${u}' already exists`, 9);
      const uid = 1001 + (sh.fs.read("/etc/passwd").match(/:10\d\d:/g) || []).length; sh.fs.write("/etc/passwd", `${u}:x:${uid}:${uid}::/home/${u}:/bin/sh\n`, true); sh.fs.write("/etc/group", `${u}:x:${uid}:\n`, true); if (f.has("m")) sh.fs.mkdir(`/home/${u}`, true); },
    userdel: (a, io, sh) => { if (!sh.root) throw new ShErr("Permission denied. (use sudo)"); const { f, rest } = opts(a); const u = rest[0]; const pw = sh.fs.read("/etc/passwd"); if (!pw.includes(`\n${u}:`)) throw new ShErr(`user '${u}' does not exist`, 6); sh.fs.write("/etc/passwd", J(L(pw).filter((l) => !l.startsWith(`${u}:`)))); if (f.has("r") && sh.fs.get(`/home/${u}`)) sh.fs.rm(`/home/${u}`, true); },
    passwd: (a, io, sh) => { const u = a[0] || "kali"; if (u !== "kali" && !sh.root) throw new ShErr(`You may not view or modify password information for ${u}.`); say(io, `New password: \nRetype new password: \npasswd: password updated successfully (simulated for ${u})`); },
    groups: (a, io, sh) => { const u = a[0] || "kali"; say(io, L(sh.fs.read("/etc/group")).filter((l) => l.split(":")[0] === u || (l.split(":")[3] || "").split(",").includes(u)).map((l) => l.split(":")[0]).join(" ")); },
    systemctl: (a, io, sh) => { const [act, svc0] = a; const svc = (svc0 || "").replace(/\.service$/, ""); if (!(svc in sh.svc)) throw new ShErr(`Unit ${svc0 || "?"}.service could not be found.`, 5);
      if (act === "status") { say(io, `● ${svc}.service\n     Loaded: loaded (/lib/systemd/system/${svc}.service; disabled)\n     Active: ${sh.svc[svc] ? "active (running) since Fri 2026-06-12 09:10:00 UTC" : "inactive (dead)"}`); return sh.svc[svc] ? 0 : 3; }
      if (!sh.root) throw new ShErr("Failed to " + act + " " + svc + ".service: Interactive authentication required. (use sudo)", 1);
      if (act === "start" || act === "restart") sh.svc[svc] = true; else if (act === "stop") sh.svc[svc] = false; else if (act !== "enable" && act !== "disable") throw new ShErr(`Unknown command verb ${act}.`); },
    service: (a, io, sh) => C.systemctl([a[1], a[0]], io, sh),
    ps: (a, io, sh) => { const rows = [["1", "root", "/sbin/init"], ["612", "root", "/usr/sbin/cron -f"], ...(sh.svc.ssh ? [["901", "root", "sshd: /usr/sbin/sshd -D"]] : []), ...(sh.svc.apache2 ? [["1022", "www-data", "/usr/sbin/apache2 -k start"]] : []), ...(sh.svc.postgresql ? [["1101", "postgres", "/usr/lib/postgresql/16/bin/postgres"]] : []), ["2001", "kali", "bash"], ["2077", "kali", "ps " + a.join(" ")]];
      say(io, a.join("").includes("u") ? `USER       PID %CPU %MEM COMMAND\n${rows.map(([p, u, c]) => `${u.padEnd(10)}${p.padStart(5)}  0.0  0.1 ${c}`).join("\n")}` : `    PID TTY          TIME CMD\n${rows.filter((r) => r[1] === "kali").map(([p, , c]) => `${p.padStart(7)} pts/0    00:00:00 ${c.split(" ")[0]}`).join("\n")}`); },
    kill: (a, io) => { const pid = a.filter((x) => !x.startsWith("-"))[0]; if (!pid) throw new ShErr("usage: kill [-s sigspec | -signum] pid", 2); if (pid === "1") throw new ShErr("(1) - Operation not permitted"); say(io, `[simulated] signal sent to process ${pid}`); },
    netstat: (a, io, sh) => { const r = [[22, "sshd", sh.svc.ssh], [80, "apache2", sh.svc.apache2], [5432, "postgres", sh.svc.postgresql]].filter((x) => x[2]); say(io, `Active Internet connections (only servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name\ntcp        0      0 127.0.0.1:631           0.0.0.0:*               LISTEN      700/cupsd\n${r.map(([p, n]) => `tcp        0      0 0.0.0.0:${String(p).padEnd(16)}0.0.0.0:*               LISTEN      ${900 + p}/${n}`).join("\n")}`); },
    ifconfig: (a, io) => say(io, "eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 10.0.0.15  netmask 255.255.255.0  broadcast 10.0.0.255\n        ether 08:00:27:4e:66:a1  txqueuelen 1000  (Ethernet)\n\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0"),
    ip: (a, io) => { if (!/^a/.test(a[0] || "")) throw new ShErr("usage: ip a"); say(io, "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN\n    inet 127.0.0.1/8 scope host lo\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n    link/ether 08:00:27:4e:66:a1 brd ff:ff:ff:ff:ff:ff\n    inet 10.0.0.15/24 brd 10.0.0.255 scope global eth0"); },
    nikto: (a, io) => { const h = a[a.indexOf("-h") + 1]; if (!onLab(h)) throw new ShErr("lab mode: only hosts on 10.0.0.0/24 can be scanned"); say(io, `- Nikto v2.5.0 (simulated)\n+ Target IP: ${labHost(h)}\n+ Target Port: 80\n+ Server: Apache/2.4.41 (Ubuntu)\n+ /: The X-Frame-Options header is not present.\n+ /admin/: Directory indexing found.\n+ /phpinfo.php: Output from phpinfo() found.\n+ 7 requests: 0 error(s) and 3 item(s) reported`); },
    gobuster: (a, io) => { const u = a[a.indexOf("-u") + 1] || ""; if (!onLab(u.replace(/^https?:\/\//, "").split("/")[0])) throw new ShErr("lab mode: only http://10.0.0.x targets are allowed"); say(io, `===============================================================\nGobuster v3.6 (simulated)\n===============================================================\n/admin                (Status: 301) [Size: 312]\n/backup               (Status: 200) [Size: 1024]\n/index.html           (Status: 200) [Size: 10918]\n/server-status        (Status: 403) [Size: 277]\n===============================================================\nFinished`); },
    hydra: (a, io) => { const tgt = a.find((x) => /^(ssh|ftp):\/\//.test(x)) || a[a.length - 2] || ""; const h = tgt.replace(/^\w+:\/\//, ""); if (!onLab(h)) throw new ShErr("lab mode: only 10.0.0.x targets are allowed"); say(io, `Hydra v9.5 (simulated) starting\n[DATA] attacking ${tgt}\n[22][ssh] host: ${labHost(h)}   login: admin   password: Summer2026!\n1 of 1 target successfully completed, 1 valid password found`); },
    sqlmap: (a, io) => { const u = a[a.indexOf("-u") + 1] || ""; if (!onLab(u.replace(/^https?:\/\//, "").split("/")[0])) throw new ShErr("lab mode: only http://10.0.0.x targets are allowed"); say(io, `sqlmap/1.8 (simulated)\n[INFO] testing connection to the target URL\n[INFO] GET parameter 'id' appears to be 'AND boolean-based blind' injectable\n[INFO] the back-end DBMS is PostgreSQL\nsqlmap identified the following injection point(s):\nParameter: id (GET)\n    Type: boolean-based blind\n[INFO] fetched data logged to /home/kali/.local/share/sqlmap/output/10.0.0.21`); },
    nc: (a, io) => { const r = a.filter((x) => !x.startsWith("-")); const ip = labHost(r[0] || ""), port = +r[1]; if (!a.some((x) => x.includes("z"))) throw new ShErr("lab mode: use port check only, e.g. nc -zv 10.0.0.21 22"); const open = (PORTS[ip] || []).some(([p]) => p === port);
      io.err(open ? `Connection to ${ip} ${port} port [tcp/*] succeeded!\n` : `nc: connect to ${ip} port ${port} (tcp) failed: Connection refused\n`); return open ? 0 : 1; },
    msfconsole: async (a, io, sh) => msfconsole(io, sh),
  };
  C.egrep = (a, io, sh) => C.grep(["-E", ...a], io, sh);
  C.netcat = C.nc; C.ss = C.netstat; C.hashcat = (a, io, sh) => C.john(a.filter((x) => !/^-m|^\d+$/.test(x)), io, sh);
  const ed = (kind) => async (a, io, sh) => { if (!sh.hooks.edit) throw new ShErr("editor unavailable here"); const p = sh.path(a[0] || "untitled.txt"); if (sh.fs.isDir(p)) throw new ShErr(`${a[0]} is a directory`); const txt = await sh.hooks.edit(p, sh.fs.get(p)?.c ?? null, kind); if (txt != null && sh.fs.isDir(parent(p))) sh.fs.write(p, txt); return 0; };
  C.vi = C.vim = ed("vi"); C.nano = ed("nano");
  Object.keys(C).forEach((k) => { const fn = C[k]; C[k] = (a, io, sh) => (a[0] === "--help" && MAN[k] ? (say(io, `Usage: ${MAN[k]}`), 0) : fn(a, io, sh)); });
  return C;
}
export { HOME };
