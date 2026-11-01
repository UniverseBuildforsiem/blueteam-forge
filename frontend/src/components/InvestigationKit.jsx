import { useEffect, useState } from "react";
import { Search, FileSearch, ShieldCheck, ShieldAlert, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Glass } from "./common";

export const VCOL = { malicious: "text-red-400", suspicious: "text-orange-300", clean: "text-green-400", unknown: "text-slate-400" };
const Field = ({ k, v }) => <div><div className="text-[10px] font-mono uppercase text-slate-500">{k.replace(/_/g, " ")}</div><div className="text-sm break-all">{v}</div></div>;

export function IntelReport({ r, onPivot }) {
  const flagged = r.vendors?.filter((v) => v.flagged).length || 0;
  return (
    <Glass className="p-5 space-y-5" data-testid="intel-result">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div><div className="text-[10px] font-mono uppercase text-slate-500">{r.type}</div><div className="font-mono break-all" data-testid="intel-indicator">{r.indicator}</div></div>
        <div className="text-right"><div className={`font-mono text-2xl font-bold ${VCOL[r.verdict]}`} data-testid="intel-detections">{r.detections}</div>
          <div className={`text-xs font-mono uppercase ${VCOL[r.verdict]}`} data-testid="intel-verdict">{r.verdict}</div></div>
      </div>
      {r.note ? <div className="text-xs font-mono text-slate-500">{r.note}</div> : <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field k="community score" v={<span className={r.community_score < 0 ? "text-red-300" : "text-green-300"}>{r.community_score}</span>} />
          <Field k="first seen" v={r.first_seen} /><Field k="last seen" v={r.last_seen} /><Field k="last analysis" v={r.last_analysis} />
          {Object.entries(r.details || {}).map(([k, v]) => <Field key={k} k={k} v={v} />)}
        </div>
        <div className="flex flex-wrap gap-2">{r.tags.map((t) => <span key={t} className="px-2 py-0.5 text-xs font-mono border border-cyan-500/30 text-cyan-300">{t}</span>)}</div>
        <div><div className="eyebrow mb-2">security vendors' analysis · {flagged}/{r.vendors.length} shown flagged</div>
          <div className="grid sm:grid-cols-2 gap-x-6 text-xs font-mono" data-testid="intel-vendors">{r.vendors.map((v) => <div key={v.vendor} className="flex justify-between border-b border-white/5 py-1.5">
            <span className="text-slate-300">{v.vendor}</span><span className={`inline-flex items-center gap-1 ${v.flagged ? "text-red-300" : "text-green-400"}`}>{v.flagged ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}{v.result}</span></div>)}</div></div>
        {r.related?.length > 0 && <div><div className="eyebrow mb-2">relations</div><div className="flex flex-wrap gap-2" data-testid="intel-related">{r.related.map((x) => <button key={x.value} onClick={() => onPivot?.(x.value)} title={x.relation}
          className="inline-flex items-center gap-1.5 text-xs font-mono border border-white/10 hover:border-cyan-400/50 px-2 py-1 transition-colors"><Link2 className="h-3 w-3 text-cyan-400" /><span className="text-slate-500">{x.type}</span><span className="truncate max-w-[220px]">{x.value}</span></button>)}</div></div>}
        {r.seen_in?.length > 0 && <div className="text-[11px] font-mono text-slate-500">seen in: {r.seen_in.map((s) => s.title).join(" · ")}</div>}
      </>}
    </Glass>);
}

export function SandboxReport({ x }) {
  const bad = x.verdict !== "clean";
  return (
    <Glass className="p-5 font-mono text-xs space-y-3" data-testid={`sandbox-report-${x.id}`}>
      <div className="flex justify-between items-center gap-3"><span className="text-sm font-bold break-all">{x.file}</span><span className={`text-lg shrink-0 ${bad ? "text-red-400" : "text-green-400"}`} data-testid="sandbox-score">{x.score}/100 {x.verdict && <span className="text-xs uppercase">{x.verdict}</span>}</span></div>
      <div className="text-slate-500 break-all">sha256 {x.sha256}</div>
      {x.environment && <div className="text-slate-500">{x.environment} · {x.duration}</div>}
      {[["process tree", x.processes], ["network", x.network], ["dropped / touched files", x.files], ["behaviour signatures", x.signatures], ["mitre att&ck", x.mitre]].filter(([, v]) => v?.length).map(([k, v]) =>
        <div key={k}><div className="eyebrow mb-1">{k}</div>{v.map((l) => <div key={l} className="text-slate-300 whitespace-pre-wrap break-all">{l}</div>)}</div>)}
    </Glass>);
}

export function AlertToolkit({ kind, id }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { api.get("/tools/alert-iocs", { params: { kind, id } }).then((r) => setData(r.data)).catch(() => setData({ iocs: [], files: [] })); }, [kind, id]);
  const lookup = async (q) => { setBusy(q); try { setView({ type: "intel", r: (await api.get("/tools/intel", { params: { q, kind, id } })).data }); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  const detonate = async (file) => { setBusy(file); try { setView({ type: "sandbox", r: (await api.get("/tools/sandbox/report", { params: { file, kind, id } })).data }); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  if (!data) return null;
  const chip = (key, label, sub, onClick, tid) => <button key={key} onClick={onClick} disabled={!!busy} data-testid={tid}
    className={`inline-flex items-center gap-1.5 text-xs font-mono border px-2 py-1 transition-colors ${busy === key ? "border-cyan-400 animate-pulse" : "border-white/10 hover:border-cyan-400/50"}`}>
    <span className="text-[10px] uppercase text-cyan-400">{sub}</span><span className="truncate max-w-[230px]">{label}</span></button>;
  return (
    <div className="border border-cyan-500/20 bg-cyan-500/[0.03] p-3 space-y-3" data-testid="alert-toolkit">
      <div className="eyebrow flex items-center gap-2"><Search className="h-3.5 w-3.5" />investigation toolkit</div>
      {data.iocs.length + data.files.length === 0 && <div className="text-[11px] font-mono text-slate-500" data-testid="alert-toolkit-empty">no indicators or files in this alert — use the evidence and your judgement</div>}
      {data.iocs.length > 0 && <div><div className="text-[10px] font-mono uppercase text-slate-500 mb-1.5">reputation lookup</div><div className="flex flex-wrap gap-2">
        {data.iocs.map((x, i) => chip(x.value, x.value, x.internal ? `${x.type} · internal` : x.type, () => lookup(x.value), `alert-ioc-${i}`))}</div></div>}
      {data.files.length > 0 && <div><div className="text-[10px] font-mono uppercase text-slate-500 mb-1.5">sandbox a file</div><div className="flex flex-wrap gap-2">
        {data.files.map((f, i) => chip(f, f.split(/[\\/]/).pop(), <FileSearch className="h-3 w-3" />, () => detonate(f), `alert-file-${i}`))}</div></div>}
      {view && <div className="relative"><button className="absolute right-2 top-2 z-10 text-slate-500 hover:text-slate-200" onClick={() => setView(null)} data-testid="alert-toolkit-close"><X className="h-4 w-4" /></button>
        {view.type === "intel" ? <IntelReport r={view.r} onPivot={lookup} /> : <SandboxReport x={view.r} />}</div>}
    </div>);
}
