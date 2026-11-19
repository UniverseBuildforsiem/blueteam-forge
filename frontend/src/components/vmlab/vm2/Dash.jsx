import { Sev, Panel, Table } from "../ui";
import { subHosts, targetHosts, findings } from "./lib";

export function Dash2({ d, st }) {
  const scans = st.console.scans || [];
  const scanned = new Map();
  scans.forEach((s) => targetHosts(d, st, s.target).forEach((h) => scanned.set(h.ip, h)));
  const hs = [...scanned.values()], all = hs.flatMap((h) => findings(d, h).filter((k) => k.type !== "Information gathered"));
  const sev = [1, 2, 3, 4, 5].map((s) => all.filter((k) => k.severity === s).length), max = Math.max(1, ...sev);
  const kpi = [["Hosts in subscription", subHosts(d, st).length], ["Scanned hosts", hs.length], ["Confirmed", all.filter((k) => k.type === "Confirmed").length], ["Potential", all.filter((k) => k.type === "Potential").length]];
  return <div className="space-y-3" data-testid="vmc-dashboard">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{kpi.map(([k, v]) => <div key={k} className="bg-[#131c27] border border-slate-700/70 p-3"><div className="text-[11px] text-slate-400">{k}</div><div className="text-2xl font-semibold text-slate-100" data-testid={`vmc-kpi-${k.toLowerCase().replace(/\s/g, "-")}`}>{v}</div></div>)}</div>
    {hs.length ? <div className="grid xl:grid-cols-2 gap-3">
      <Panel title="Vulnerabilities by severity"><div className="space-y-1.5">{sev.map((v, i) => <div key={i} className="flex items-center gap-2 text-xs"><Sev n={i + 1} /><div className="flex-1 h-3 bg-slate-800"><div className={`h-3 ${["bg-slate-500", "bg-sky-500", "bg-yellow-500", "bg-orange-500", "bg-red-600"][i]}`} style={{ width: `${(100 * v) / max}%` }} /></div><span className="w-8 text-right text-slate-300">{v}</span></div>)}</div></Panel>
      <Panel title="Most vulnerable hosts"><Table cols={["Host", "IP", "Sev 5", "Total"]} rows={hs.map((h) => { const f = findings(d, h).filter((k) => k.type !== "Information gathered"); return [h.name.split(".")[0], h.ip, f.filter((k) => k.severity === 5).length, f.length]; }).sort((a, b) => b[3] - a[3]).slice(0, 5)} /></Panel>
    </div> : <Panel title="No scan data yet"><p className="text-xs text-slate-400">Add hosts under Assets → Address Management, then launch a scan from Scans. Training targets: {d.m2.range}.</p></Panel>}
  </div>;
}
