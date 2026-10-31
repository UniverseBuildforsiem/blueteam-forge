const HOME = "/home/analyst";

function tokenize(s) {
  const out = [];
  let cur = "", q = null;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === "'" || ch === '"') q = ch;
    else if (ch === " ") { if (cur) { out.push(cur); cur = ""; } }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function splitPipes(line) {
  const parts = [];
  let cur = "", q = null;
  for (const ch of line) {
    if (q) { if (ch === q) q = null; cur += ch; }
    else if (ch === "'" || ch === '"') { q = ch; cur += ch; }
    else if (ch === "|") { parts.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  parts.push(cur.trim());
  return parts.filter(Boolean);
}

async function sha256(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const TOOLS = [
  ["ls / cd / pwd", "ls -la evidence"], ["cat", "cat evidence/email.eml"], ["grep", "grep -i POST evidence/proxy.log"], ["awk", "cat evidence/proxy.log | awk '{print $5}'"],
  ["head / tail", "head -n 2 evidence/proxy.log"], ["strings", "strings evidence/stage2.bin"], ["file", "file evidence/stage2.bin"], ["base64", "echo aGVsbG8= | base64 -d"],
  ["sha256sum", "sha256sum evidence/stage2.bin"], ["md5sum", "md5sum evidence/macro.txt"], ["whois", "whois cdn-update.top"], ["nslookup / dig", "dig cdn-update.top"],
  ["ping", "ping -c 2 10.0.0.21"], ["nmap", "nmap 10.0.0.21"], ["curl", "curl http://cdn-update.top"], ["tshark", "tshark -r evidence/capture.pcap"],
  ["john", "john evidence/hashes.txt"], ["sort / uniq / wc", "grep Failed auth.log | awk '{print $11}' | sort | uniq -c"],
];

export function createShell(lab) {
  const fs = { ...(lab?.kali?.fs || {}) };
  const net = lab?.kali?.net || { whois: {}, dns: {}, nmap: {}, curl: {} };
  const st = { cwd: HOME, history: [] };

  const resolve = (p) => {
    if (!p) return st.cwd;
    if (p.startsWith("~")) p = HOME + p.slice(1);
    const parts = (p.startsWith("/") ? p : `${st.cwd}/${p}`).split("/");
    const stack = [];
    for (const s of parts) { if (!s || s === ".") continue; if (s === "..") stack.pop(); else stack.push(s); }
    return "/" + stack.join("/");
  };
  const isDir = (p) => p === "/" || Object.keys(fs).some((k) => k.startsWith(p + "/"));
  const read = (p) => { const r = resolve(p); if (fs[r] == null) throw new Error(`${p}: No such file or directory`); return fs[r]; };
  const listDir = (p) => {
    const set = new Set();
    Object.keys(fs).forEach((k) => { if (k.startsWith(p === "/" ? "/" : p + "/")) set.add(k.slice(p === "/" ? 1 : p.length + 1).split("/")[0]); });
    return [...set].sort();
  };
  const input = (args, stdin) => (args.length ? args.map(read).join("\n") : stdin || "");
  const flagN = (args, def = 10) => { const i = args.indexOf("-n"); if (i >= 0) { const n = +args[i + 1]; args.splice(i, 2); return n; } return def; };

  const C = {
    help: () => "Available: " + ["ls", "cd", "pwd", "cat", "grep", "awk", "cut", "head", "tail", "wc", "sort", "uniq", "strings", "file", "echo", "whois", "nslookup", "dig", "ping", "nmap", "curl", "base64", "sha256sum", "md5sum", "tcpdump", "tshark", "john", "hashcat", "whoami", "id", "uname", "date", "history", "clear"].join("  "),
    pwd: () => st.cwd, whoami: () => "analyst", id: () => "uid=1000(analyst) gid=1000(analyst) groups=1000(analyst),27(sudo)",
    uname: (a) => (a.includes("-a") ? "Linux socforge-kali 6.6.0-kali-amd64 #1 SMP x86_64 GNU/Linux (simulated)" : "Linux"),
    date: () => new Date().toUTCString(), history: () => st.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join("\n"),
    echo: (a) => a.join(" "),
    ls: (a) => {
      const long = a.some((x) => x.startsWith("-") && x.includes("l"));
      const target = resolve(a.find((x) => !x.startsWith("-")));
      if (fs[target] != null) return target.split("/").pop();
      if (!isDir(target)) throw new Error(`ls: cannot access '${target}': No such file or directory`);
      const items = listDir(target);
      if (!long) return items.map((n) => (isDir(`${target}/${n}`.replace("//", "/")) ? `\x1b${n}/` : n)).join("  ");
      return items.map((n) => { const full = `${target}/${n}`.replace("//", "/"); const d = isDir(full);
        return `${d ? "drwxr-xr-x" : "-rw-r--r--"} 1 analyst analyst ${String(d ? 4096 : (fs[full] || "").length).padStart(6)} Jun 12 09:00 ${n}`; }).join("\n");
    },
    cd: (a) => { const t = resolve(a[0] || HOME); if (!isDir(t)) throw new Error(`cd: ${a[0]}: No such file or directory`); st.cwd = t; return ""; },
    cat: (a, s) => input(a, s),
    head: (a, s) => { const n = flagN(a); return input(a, s).split("\n").slice(0, n).join("\n"); },
    tail: (a, s) => { const n = flagN(a); return input(a, s).split("\n").filter(Boolean).slice(-n).join("\n"); },
    wc: (a, s) => { const t = input(a.filter((x) => !x.startsWith("-")), s); return String(t.split("\n").filter(Boolean).length); },
    sort: (a, s) => { const l = input(a.filter((x) => !x.startsWith("-")), s).split("\n").filter(Boolean).sort(); return (a.includes("-r") ? l.reverse() : l).join("\n"); },
    uniq: (a, s) => {
      const l = input(a.filter((x) => !x.startsWith("-")), s).split("\n").filter(Boolean);
      const out = []; l.forEach((x) => { const last = out[out.length - 1]; if (last && last[1] === x) last[0]++; else out.push([1, x]); });
      return a.includes("-c") ? out.map(([c, x]) => `${String(c).padStart(7)} ${x}`).join("\n") : out.map((o) => o[1]).join("\n");
    },
    grep: (a, s) => {
      const flags = a.filter((x) => x.startsWith("-")).join("");
      const rest = a.filter((x) => !x.startsWith("-"));
      const pat = rest.shift();
      if (!pat) throw new Error("usage: grep [-icv] PATTERN [FILE]");
      const rx = new RegExp(pat, flags.includes("i") ? "i" : "");
      const lines = input(rest, s).split("\n").filter((l) => (flags.includes("v") ? !rx.test(l) : rx.test(l)));
      return flags.includes("c") ? String(lines.length) : lines.join("\n");
    },
    awk: (a, s) => {
      const prog = a.find((x) => x.includes("print")) || "";
      const fsI = a.indexOf("-F"); const sep = fsI >= 0 ? a[fsI + 1] : null;
      const files = a.filter((x, i) => x !== prog && x !== "-F" && (fsI < 0 || i !== fsI + 1));
      const cols = [...prog.matchAll(/\$(\d+|NF)/g)].map((m) => m[1]);
      return input(files, s).split("\n").filter(Boolean).map((l) => { const f = sep ? l.split(sep) : l.trim().split(/\s+/);
        return cols.map((c) => (c === "NF" ? f[f.length - 1] : c === "0" ? l : f[+c - 1] || "")).join(" "); }).join("\n");
    },
    cut: (a, s) => {
      const d = (a.find((x) => x.startsWith("-d")) || "-d\t").slice(2) || a[a.indexOf("-d") + 1];
      const f = +((a.find((x) => x.startsWith("-f")) || "-f1").slice(2) || a[a.indexOf("-f") + 1]);
      const files = a.filter((x) => !x.startsWith("-") && x !== d && x !== String(f));
      return input(files, s).split("\n").map((l) => l.split(d)[f - 1] || "").join("\n");
    },
    strings: (a, s) => (input(a, s).match(/[\x20-\x7e]{4,}/g) || []).join("\n"),
    file: (a) => a.map((p) => { const c = read(p); const t = c.startsWith("MZ") ? "PE32 executable (GUI) Intel 80386, for MS Windows" : c === "PCAP" ? "pcap capture file, microsecond ts (little-endian) - version 2.4" : c.startsWith("Return-Path") ? "SMTP mail, ASCII text" : "ASCII text"; return `${p}: ${t}`; }).join("\n"),
    base64: (a, s) => { const d = a.includes("-d") || a.includes("--decode"); const t = input(a.filter((x) => !x.startsWith("-")), s).trim();
      try { return d ? atob(t.replace(/[^A-Za-z0-9+/=]/g, "")) : btoa(t); } catch { throw new Error("base64: invalid input"); } },
    sha256sum: async (a, s) => (a.length ? (await Promise.all(a.map(async (p) => `${await sha256(read(p))}  ${p}`))).join("\n") : `${await sha256(s || "")}  -`),
    md5sum: async (a, s) => (a.length ? (await Promise.all(a.map(async (p) => `${(await sha256("md5" + read(p))).slice(0, 32)}  ${p}`))).join("\n") : `${(await sha256("md5" + (s || ""))).slice(0, 32)}  -`),
    whois: (a) => net.whois?.[a[0]] || `No whois data for ${a[0] || "?"} in this lab (simulated).`,
    nslookup: (a) => { const ip = net.dns?.[a[0]]; return ip ? `Server:\t\t10.0.0.53\nAddress:\t10.0.0.53#53\n\nName:\t${a[0]}\nAddress: ${ip}` : `** server can't find ${a[0]}: NXDOMAIN`; },
    dig: (a) => { const d = a.find((x) => !x.startsWith("+") && !x.startsWith("-")); const ip = net.dns?.[d];
      return `; <<>> DiG 9.18 (simulated) <<>> ${d}\n;; ANSWER SECTION:\n${ip ? `${d}.\t300\tIN\tA\t${ip}` : ";; status: NXDOMAIN"}`; },
    ping: (a) => { const h = a.filter((x) => !x.startsWith("-") && isNaN(+x))[0] || "localhost";
      return `PING ${h} 56(84) bytes of data.\n64 bytes from ${h}: icmp_seq=1 ttl=64 time=0.42 ms\n64 bytes from ${h}: icmp_seq=2 ttl=64 time=0.39 ms\n--- ${h} ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss (simulated, no real traffic)`; },
    nmap: (a) => { const h = a.filter((x) => !x.startsWith("-")).pop(); const r = net.nmap?.[h];
      return `Starting Nmap 7.94 (simulated)\nNmap scan report for ${h}\n${r || "All 1000 scanned ports are filtered"}\n\nNmap done: 1 IP address scanned`; },
    curl: (a) => { const u = a.filter((x) => !x.startsWith("-")).pop() || ""; const host = u.replace(/^https?:\/\//, "").split("/")[0];
      return net.curl?.[host] || `curl: (6) Could not resolve host: ${host} (sandbox has no internet access)`; },
    tcpdump: (a) => { const f = a[a.indexOf("-r") + 1]; if (a.indexOf("-r") < 0) return "tcpdump: live capture disabled in sandbox. Use -r <file>"; read(f); return `reading from file ${f}, link-type EN10MB\n` + (lab?.kali?.pcap || ""); },
    tshark: (a) => { const f = a[a.indexOf("-r") + 1]; if (a.indexOf("-r") < 0) return "tshark: live capture disabled in sandbox. Use -r <file>"; read(f); return lab?.kali?.pcap || "No packets."; },
    john: (a) => { const t = read(a.filter((x) => !x.startsWith("-")).pop()); const cracked = lab?.kali?.cracked || {};
      const res = t.split("\n").filter(Boolean).map((l) => { const [u, h] = l.split(":"); return cracked[h] ? `${cracked[h]}\t\t(${u})` : null; }).filter(Boolean);
      return `Using default input encoding: UTF-8\nLoaded ${t.split("\n").filter(Boolean).length} password hash (Raw-MD5)\nProceeding with wordlist: rockyou.txt\n${res.join("\n")}\n${res.length}g 0:00:00:01 DONE (simulated)`; },
  };
  C.hashcat = (a) => C.john(a.filter((x) => !/^-m|^\d+$/.test(x)));

  async function run(line) {
    if (!line.trim()) return "";
    st.history.push(line);
    if (line.trim() === "clear") return "\x1bCLEAR";
    let redirect = null;
    const m = line.match(/^(.*?)\s*>\s*(\S+)$/);
    if (m && !line.includes("awk")) { line = m[1]; redirect = m[2]; }
    let out = "";
    for (const seg of splitPipes(line)) {
      const [cmd, ...args] = tokenize(seg);
      if (!C[cmd]) throw new Error(`${cmd}: command not found. Type 'help'.`);
      out = await C[cmd](args, out);
    }
    if (redirect) { fs[resolve(redirect)] = out; return ""; }
    return out;
  }

  return { run, prompt: () => `analyst@socforge-kali:${st.cwd.replace(HOME, "~")}$`, complete: (w) => listDir(st.cwd).filter((n) => n.startsWith(w)) };
}
