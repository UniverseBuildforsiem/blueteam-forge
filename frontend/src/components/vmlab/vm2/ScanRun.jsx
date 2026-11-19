import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { LV, TILE } from "../ScanHero";
import { findings } from "./lib";

const PHASES = ["Queued", "Running", "Finished", "Processed"];

export function ScanRun({ d, hosts, title, onDone, items }) {
  const queue = useRef(items ? [...items] : hosts.flatMap((h) => findings(d, h).filter((k) => k.type !== "Information gathered").map((k) => ({ k, h }))));
  const total = useRef(queue.current.length || 1);
  const [phase, setPhase] = useState(0);
  const [feed, setFeed] = useState([]);
  const [hit, setHit] = useState({});
  useEffect(() => {
    const t0 = setTimeout(() => setPhase(1), 900);
    return () => clearTimeout(t0);
  }, []);
  useEffect(() => {
    if (phase !== 1) {
      if (phase === 2) { const t = setTimeout(() => setPhase(3), 1200); return () => clearTimeout(t); }
      if (phase === 3) { const t = setTimeout(onDone, 700); return () => clearTimeout(t); }
      return undefined;
    }
    const id = setInterval(() => {
      const nx = queue.current.shift();
      if (!nx) { clearInterval(id); setPhase(2); return; }
      setFeed((f) => [{ ...nx, key: `${nx.h.ip}-${nx.k.qid}` }, ...f].slice(0, 5));
      setHit((x) => ({ ...x, [nx.h.ip]: Math.max(x[nx.h.ip] || 0, nx.k.severity) }));
    }, 260);
    return () => clearInterval(id);
  }, [phase]); // eslint-disable-line
  const pct = phase >= 2 ? 100 : Math.round((100 * (total.current - queue.current.length)) / total.current);
  return <div className="border border-sky-700/60 bg-[#0b1520] p-3 space-y-3" data-testid="vmc-scan-run">
    <div className="flex items-center gap-2 text-xs"><ScanLine className="h-4 w-4 text-sky-300" /><b className="text-slate-100">{title}</b>
      <span className="ml-auto font-mono text-sky-200" data-testid="vmc-scan-run-status">{PHASES[phase]} · {pct}%</span></div>
    <div className="h-1 bg-slate-800"><div className="h-1 bg-sky-500 transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
    {hosts.length ? <div className="grid grid-cols-4 gap-1.5">{hosts.map((h) => <div key={h.ip} className={`border text-[9px] font-mono px-1 py-1.5 text-center transition-colors duration-500 ${hit[h.ip] ? `${TILE[hit[h.ip]]} border-white/20 text-white` : "border-slate-700 text-slate-500"}`}>{h.label || `${h.ip.split(".").pop()} · ${h.name.split(".")[0]}`}</div>)}</div>
      : <p className="text-xs text-yellow-200">No live scannable hosts in the target. Check the target IPs are in your subscription.</p>}
    <ul className="space-y-1">{feed.map(({ k, h, key }) => { const l = LV.find((x) => x[0] === k.severity);
      return <li key={key} className="flex items-center gap-2 text-[11px] radar-feed-in"><span className={`h-4 w-4 grid place-items-center text-[9px] font-bold text-white shrink-0 ${l[2]}`}>{k.severity}</span><span className="font-mono text-sky-200 shrink-0">{k.tag || (k.cve && k.cve !== "-" ? k.cve : `QID ${k.qid}`)}</span><span className="truncate text-slate-400">{k.title}</span><span className="ml-auto text-slate-500 font-mono shrink-0">{h.tag || h.ip}</span></li>; })}</ul>
  </div>;
}
