export const HOME = "/home/kali";
const now = () => Math.floor(Date.now() / 1000);

export function norm(cwd, p) {
  if (p == null || p === "") return cwd;
  if (p === "~" || p.startsWith("~/")) p = HOME + p.slice(1);
  const stack = [];
  for (const s of (p.startsWith("/") ? p : `${cwd}/${p}`).split("/")) { if (!s || s === ".") continue; if (s === "..") stack.pop(); else stack.push(s); }
  return "/" + stack.join("/");
}
const parent = (p) => (p.lastIndexOf("/") <= 0 ? "/" : p.slice(0, p.lastIndexOf("/")));
const base = (p) => p.slice(p.lastIndexOf("/") + 1);
const err = (m) => { const e = new Error(m); e.fs = true; return e; };

export class VFS {
  constructor(nodes) { this.n = nodes || {}; if (!this.n["/"]) this.n["/"] = { t: "d", m: 0o755, o: "root", mt: now() }; }
  get(p) { return this.n[p]; }
  isDir(p) { return this.n[p]?.t === "d"; }
  isFile(p) { return this.n[p]?.t === "f"; }
  read(p) { const x = this.n[p]; if (!x) throw err(`${base(p) || p}: No such file or directory`); if (x.t === "d") throw err(`${base(p)}: Is a directory`); return x.c; }
  write(p, c, append = false) {
    if (!this.isDir(parent(p))) throw err(`${p}: No such file or directory`);
    const x = this.n[p];
    if (x?.t === "d") throw err(`${base(p)}: Is a directory`);
    this.n[p] = { t: "f", c: append && x ? x.c + c : c, m: x?.m ?? 0o644, o: x?.o || "kali", mt: now() };
  }
  mkdir(p, parents = false) {
    if (this.n[p]) { if (parents && this.isDir(p)) return; throw err(`cannot create directory '${p}': File exists`); }
    if (!this.isDir(parent(p))) { if (!parents) throw err(`cannot create directory '${p}': No such file or directory`); this.mkdir(parent(p), true); }
    this.n[p] = { t: "d", m: 0o755, o: "kali", mt: now() };
  }
  list(p) { const pre = p === "/" ? "/" : `${p}/`; return Object.keys(this.n).filter((k) => k !== p && k.startsWith(pre) && !k.slice(pre.length).includes("/")).map((k) => k.slice(pre.length)).sort(); }
  rm(p, rec = false) {
    if (!this.n[p]) throw err(`cannot remove '${p}': No such file or directory`);
    if (this.isDir(p) && !rec) throw err(`cannot remove '${base(p)}': Is a directory`);
    Object.keys(this.n).forEach((k) => { if (k === p || k.startsWith(`${p}/`)) delete this.n[k]; });
  }
  copy(a, b) { Object.keys(this.n).filter((k) => k === a || k.startsWith(`${a}/`)).forEach((k) => { this.n[b + k.slice(a.length)] = { ...this.n[k], mt: now() }; }); }
  walk(p) { return Object.keys(this.n).filter((k) => k === p || k.startsWith(p === "/" ? "/" : `${p}/`)).sort(); }
  size(p) { const x = this.n[p]; return x.t === "d" ? 4096 : x.c.length; }
  toJSON() { return this.n; }
}
export { parent, base };

const F = (c, m = 0o644, o = "kali") => ({ t: "f", c, m, o });
const D = (m = 0o755, o = "kali") => ({ t: "d", m, o });

const AUTH = (() => {
  const ips = [["203.0.113.45", 14], ["198.51.100.7", 9], ["192.0.2.88", 4], ["10.0.0.99", 2]];
  const out = [];
  let s = 0;
  ips.forEach(([ip, n]) => { for (let i = 0; i < n; i++) { s++; out.push(`Jun 12 03:${String(10 + (s % 50)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")} kali sshd[${4100 + s}]: Failed password for ${i % 3 ? "root" : "admin"} from ${ip} port ${50000 + s} ssh2`); } });
  out.splice(5, 0, "Jun 12 03:15:02 kali sshd[4200]: Accepted password for kali from 10.0.0.5 port 51234 ssh2");
  return out.join("\n") + "\n";
})();

export function seed(labFs = {}) {
  const n = {
    "/": D(0o755, "root"), "/home": D(0o755, "root"), [HOME]: D(), [`${HOME}/evidence`]: D(), [`${HOME}/scripts`]: D(), [`${HOME}/data`]: D(), "/tmp": D(0o777, "root"),
    "/etc": D(0o755, "root"), "/etc/ssh": D(0o755, "root"), "/var": D(0o755, "root"), "/var/log": D(0o755, "root"), "/usr": D(0o755, "root"), "/usr/bin": D(0o755, "root"), "/root": D(0o700, "root"), "/dev": D(0o755, "root"),
    "/etc/passwd": F("root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\npostgres:x:119:126:PostgreSQL administrator:/var/lib/postgresql:/bin/bash\nsshd:x:121:65534::/run/sshd:/usr/sbin/nologin\nkali:x:1000:1000:Kali,,,:/home/kali:/usr/bin/zsh\n", 0o644, "root"),
    "/etc/group": F("root:x:0:\nsudo:x:27:kali\nwww-data:x:33:\nkali:x:1000:\n", 0o644, "root"),
    "/etc/shadow": F("root:*:19800:0:99999:7:::\nkali:$y$j9T$...:19800:0:99999:7:::\n", 0o640, "root"),
    "/etc/hosts": F("127.0.0.1\tlocalhost\n127.0.1.1\tkali\n10.0.0.21\tweb01.lab.local web01\n10.0.0.22\tdb01.lab.local db01\n10.0.0.5\tadmin-ws.lab.local\n", 0o644, "root"),
    "/etc/ssh/sshd_config": F("Port 22\nPermitRootLogin yes\nPasswordAuthentication yes\nMaxAuthTries 6\nX11Forwarding yes\nUsePAM yes\n", 0o644, "root"),
    "/var/log/auth.log": F(AUTH, 0o640, "root"),
    "/var/log/syslog": F("Jun 12 03:00:01 kali CRON[3001]: (root) CMD (run-parts /etc/cron.hourly)\nJun 12 03:05:11 kali systemd[1]: Started ssh.service - OpenBSD Secure Shell server.\nJun 12 03:20:44 kali kernel: [UFW BLOCK] IN=eth0 SRC=203.0.113.45 DST=10.0.0.15 PROTO=TCP DPT=23\nJun 12 03:30:00 kali systemd[1]: apache2.service: Deactivated successfully.\n", 0o640, "root"),
    "/dev/null": F("", 0o666, "root"),
    [`${HOME}/data/targets.txt`]: F("10.0.0.21\n10.0.0.22\n10.0.0.25\n"),
    [`${HOME}/data/users.csv`]: F("id,name,dept,role\n1,alice,soc,analyst\n2,bob,it,admin\n3,carol,soc,lead\n4,dave,hr,user\n5,erin,soc,analyst\n"),
    [`${HOME}/data/a.txt`]: F("alpha\nbravo\ncharlie\n"), [`${HOME}/data/b.txt`]: F("alpha\nbravo\ndelta\n"),
    [`${HOME}/scripts/hello.sh`]: F("#!/bin/bash\n# starter script\necho \"Hello, $USER\"\n"),
  };
  ["nmap", "nikto", "gobuster", "hydra", "sqlmap", "nc", "msfconsole", "grep", "awk", "sed", "bash", "ls", "cat", "find", "python3", "vi", "nano"].forEach((t) => { n[`/usr/bin/${t}`] = F(`#!/bin/sh\n# ${t} (simulated tool stub)\n`, 0o755, "root"); });
  Object.entries(labFs).forEach(([p, c]) => {
    const q = p.replace(/^\/home\/analyst/, HOME);
    q.split("/").slice(1, -1).reduce((acc, s) => { const d = `${acc}/${s}`; if (!n[d]) n[d] = D(); return d; }, "");
    n[q] = F(c);
  });
  const t = now();
  Object.values(n).forEach((x) => { x.mt = t; });
  return n;
}
