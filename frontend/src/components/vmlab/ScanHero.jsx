import { useEffect, useState } from "react";
import { ScanLine } from "lucide-react";
import { Glass } from "../common";

const CVES = [["CVE-2021-44228", "Apache Log4j RCE (Log4Shell)", 5], ["CVE-2021-34527", "Windows Print Spooler RCE (PrintNightmare)", 5], ["CVE-2017-0144", "SMBv1 RCE (EternalBlue)", 5], ["CVE-2019-0708", "RDP RCE (BlueKeep)", 5],
  ["CVE-2020-1472", "Netlogon elevation (Zerologon)", 5], ["CVE-2021-26855", "Exchange SSRF (ProxyLogon)", 5], ["CVE-2023-4966", "NetScaler info disclosure (Citrix Bleed)", 4], ["CVE-2014-0160", "OpenSSL Heartbleed", 4],
  ["CVE-2022-0847", "Linux kernel Dirty Pipe", 4], ["CVE-2016-2183", "3DES birthday attack (SWEET32)", 3], ["CVE-2015-4000", "TLS DHE downgrade (Logjam)", 3], ["CVE-2013-2566", "RC4 cipher weaknesses", 3],
  ["CVE-2008-5161", "SSH CBC mode plaintext recovery", 2], ["CVE-1999-0524", "ICMP timestamp disclosure", 1], ["CVE-2004-2761", "MD5-signed certificate", 2], ["CVE-2023-48795", "SSH prefix truncation (Terrapin)", 3]];
export const LV = [[5, "Critical", "bg-red-600", "text-red-300"], [4, "High", "bg-orange-500", "text-orange-300"], [3, "Medium", "bg-yellow-500", "text-yellow-200"], [2, "Low", "bg-sky-500", "text-sky-300"], [1, "Info", "bg-slate-500", "text-slate-300"]];
export const TILE = { 5: "bg-red-600/30", 4: "bg-orange-500/30", 3: "bg-yellow-500/25", 2: "bg-sky-500/25", 1: "bg-slate-500/25" };
const HOSTS = Array.from({ length: 24 }, (_, i) => `${["SRV", "WS", "LNX", "FIN"][i % 4]}-${110 + i}`);

export function ScanHero() {
  const [found, setFound] = useState([]);
  const [count, setCount] = useState({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
  const [hit, setHit] = useState({});
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const c = CVES[Math.floor(Math.random() * CVES.length)], h = Math.floor(Math.random() * HOSTS.length);
      setFound((f) => [{ c, host: HOSTS[h], k: Date.now() }, ...f].slice(0, 5));
      setCount((n) => ({ ...n, [c[2]]: n[c[2]] + 1 }));
      setHit((x) => ({ ...x, [h]: Math.max(x[h] || 0, c[2]) }));
      setPct((p) => (p >= 100 ? 0 : p + 4));
    }, 1100);
    return () => clearInterval(id);
  }, []);
  const total = Object.values(count).reduce((a, b) => a + b, 0) || 1;
  return <Glass className="p-5 mb-6 overflow-hidden" data-testid="vm-scan-hero">
    <div className="flex flex-wrap items-center gap-3 mb-4"><ScanLine className="h-4 w-4 text-cyan-300" /><span className="eyebrow">live scan · 10.20.30.0/24</span>
      <span className="text-[10px] font-mono border border-yellow-400/40 text-yellow-200 px-1.5 py-0.5" data-testid="vm-scan-label">teaching animation · real public CVE names · simulated hosts</span>
      <span className="ml-auto text-xs font-mono text-slate-400" data-testid="vm-scan-progress">{pct}% complete</span></div>
    <div className="grid lg:grid-cols-[1fr_340px] gap-5">
      <div className="space-y-4">
        <div className="relative grid grid-cols-8 sm:grid-cols-12 gap-1.5" aria-hidden="true">
          {HOSTS.map((h, i) => <div key={h} className={`h-8 border text-[8px] font-mono grid place-items-center transition-colors duration-500 ${hit[i] ? `${TILE[hit[i]]} border-white/20 text-white` : "border-white/10 text-slate-600"}`}>{h}</div>)}
          <div className="vm-scanbar absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none" />
        </div>
        <div className="grid grid-cols-5 gap-2" data-testid="vm-scan-counters">{LV.map(([s, l, bg, tx]) => <div key={s} className="border border-white/10 p-2"><div className={`text-[10px] font-mono uppercase ${tx}`}>{l} · {s}</div>
          <div className="text-xl font-mono font-bold" data-testid={`vm-scan-count-${s}`}>{count[s]}</div><div className="h-1 bg-white/5 mt-1"><div className={`h-1 ${bg} transition-[width] duration-500`} style={{ width: `${(100 * count[s]) / total}%` }} /></div></div>)}</div>
      </div>
      <ul className="space-y-1.5" data-testid="vm-scan-feed">{found.map(({ c, host, k }) => { const l = LV.find((x) => x[0] === c[2]);
        return <li key={k} className="flex items-center gap-2 border border-white/10 px-2.5 py-1.5 radar-feed-in"><span className={`h-5 w-5 grid place-items-center text-[10px] font-bold text-white shrink-0 ${l[2]}`}>{c[2]}</span>
          <span className="min-w-0 flex-1"><span className="block text-xs font-mono text-cyan-200">{c[0]}</span><span className="block text-[11px] text-slate-400 truncate">{c[1]}</span></span><span className="text-[10px] font-mono text-slate-500 shrink-0">{host}</span></li>; })}</ul>
    </div>
  </Glass>;
}
