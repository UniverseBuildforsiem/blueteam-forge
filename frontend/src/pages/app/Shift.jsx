import { useEffect, useRef, useState } from "react";
import { Timer, Siren, Workflow, CheckCircle2, XCircle, Play, Trophy, History as HistoryIcon, Flag } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, PageHeader, SeverityBadge, Empty } from "../../components/common";
import { PlaybookPanel } from "../../components/playbook/PlaybookPanel";

const OPTIONS = [[15, 5, "Quick shift"], [30, 8, "Standard shift"], [60, 14, "Full shift"]];
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Start({ onStart }) {
  const [hist, setHist] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/shift/history").then((r) => setHist(r.data)); }, []);
  const go = async (m) => { setBusy(true); try { onStart((await api.post("/shift/start", { minutes: m })).data); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <div className="grid sm:grid-cols-3 gap-4">{OPTIONS.map(([m, n, l]) => (
        <Glass key={m} className="p-6 flex flex-col" data-testid={`shift-option-${m}`}>
          <div className="eyebrow">{l}</div><div className="text-4xl font-mono font-bold neon-text mt-2">{m}<span className="text-base text-slate-400"> min</span></div>
          <div className="text-sm text-slate-400 mt-2 flex-1">{n} mixed alerts from the queue. Triage each one before the timer hits zero.</div>
          <button className="glow-btn justify-center mt-5" disabled={busy} onClick={() => go(m)} data-testid={`shift-start-${m}`}><Play className="h-4 w-4" />Start shift</button>
        </Glass>))}</div>
      <Glass className="p-5"><div className="font-bold flex items-center gap-2 mb-3"><HistoryIcon className="h-4 w-4 text-cyan-400" />Your shifts</div>
        {hist.length ? <div className="divide-y divide-white/5" data-testid="shift-history">{hist.map((h) => <div key={h.id} className="py-2 flex items-center text-sm" data-testid={`shift-history-${h.id}`}>
          <span className="flex-1 text-slate-300">{h.minutes} min · {h.triaged}/{h.total} triaged<div className="text-[11px] text-slate-500">{fmtDate(h.finished_at)}</div></span>
          <span className="font-mono text-green-400">{h.score}</span></div>)}</div> : <Empty text="No shifts yet" />}</Glass>
    </div>);
}

function Triage({ s, a, onSaved }) {
  const [verdict, setVerdict] = useState("");
  const [report, setReport] = useState("");
  const [pbOpen, setPbOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/shift/${s.id}/triage/${a.id}`, { verdict, report }); toast.success("Alert triaged"); onSaved(data); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Glass className="p-5 space-y-4" data-testid="shift-alert-detail">
      <div className="flex items-center gap-2"><Siren className="h-5 w-5 text-red-400" /><span className="font-bold flex-1">{a.title}</span><SeverityBadge level={a.severity} /></div>
      <p className="text-sm text-slate-300">{a.description}</p>
      <div className="bg-black/40 border border-cyan-500/20 p-3 font-mono text-xs space-y-1">{Object.entries(a.alert).map(([k, v]) => <div key={k}><span className="text-cyan-400">{k}:</span> <span className="text-slate-200 break-all">{v}</span></div>)}</div>
      <div className="space-y-1.5">{a.evidence.map((e, i) => <div key={i} className="font-mono text-xs bg-black/30 border-l-2 border-green-500/40 px-3 py-2 text-slate-300 break-words"><span className="text-slate-500 mr-2">#{i + 1}</span>{e}</div>)}</div>
      <button className="ghost-btn !text-xs w-full justify-center" onClick={() => setPbOpen(true)} data-testid="shift-open-playbook"><Workflow className="h-4 w-4" />Open playbook{a.playbook_used ? " · path saved" : ""}</button>
      <PlaybookPanel c={a} open={pbOpen} setOpen={setPbOpen} shiftId={s.id} onRecorded={() => onSaved({ playbook: true })} />
      {a.triaged ? <div className="text-sm font-mono text-green-400 flex items-center gap-2" data-testid="shift-alert-done"><CheckCircle2 className="h-4 w-4" />Triaged — results at the end of the shift</div> : <>
        <div className="flex gap-2">{[["TP", "True Positive"], ["FP", "False Positive"]].map(([v, l]) => <button key={v} onClick={() => setVerdict(v)} data-testid={`shift-verdict-${v}`}
          className={`flex-1 py-2.5 border font-mono text-sm transition-colors ${verdict === v ? (v === "TP" ? "border-red-400 bg-red-500/15 text-red-300" : "border-green-400 bg-green-500/15 text-green-300") : "border-white/10 text-slate-400 hover:border-cyan-500/40"}`}>{l}</button>)}</div>
        <textarea className="field h-28 text-sm" value={report} onChange={(e) => setReport(e.target.value)} placeholder="What happened, key IOCs, impact, next actions..." data-testid="shift-report-input" />
        <button className="glow-btn w-full justify-center" disabled={busy || !verdict || report.length < 20} onClick={save} data-testid="shift-submit-alert">Submit triage</button></>}
    </Glass>);
}

function Active({ s, reload, onDone }) {
  const [sel, setSel] = useState(s.alerts.find((a) => !a.triaged)?.id || s.alerts[0].id);
  const [secs, setSecs] = useState(s.seconds_left);
  const ended = useRef(false);
  useEffect(() => { setSecs(s.seconds_left); }, [s.seconds_left]);
  useEffect(() => { const t = setInterval(() => setSecs((x) => Math.max(0, x - 1)), 1000); return () => clearInterval(t); }, []);
  const end = async () => { if (ended.current) return; ended.current = true; try { onDone((await api.post(`/shift/${s.id}/finish`)).data); } catch (e) { toast.error(errMsg(e)); ended.current = false; } };
  useEffect(() => { if (secs <= 0) { toast.error("Time's up — shift over"); end(); } }, [secs]); // eslint-disable-line
  const a = s.alerts.find((x) => x.id === sel);
  const saved = async (d) => {
    if (d.finished) { onDone(d.shift); return; }
    const next = await reload();
    if (!d.playbook) setSel(next.alerts.find((x) => !x.triaged)?.id || sel);
  };
  const done = s.alerts.filter((x) => x.triaged).length;
  return (<>
    <div className="sticky top-[61px] lg:top-0 z-10 -mx-5 sm:-mx-8 px-5 sm:px-8 py-3 mb-5 bg-[#0B0F1A]/90 backdrop-blur-xl border-b border-cyan-500/20 flex flex-wrap items-center gap-4" data-testid="shift-header">
      <span className={`font-mono text-2xl font-bold inline-flex items-center gap-2 ${secs < 120 ? "text-red-400 animate-pulse" : "neon-text"}`} data-testid="shift-timer"><Timer className="h-5 w-5" />{clock(secs)}</span>
      <span className="text-xs font-mono text-slate-400" data-testid="shift-progress">{done}/{s.alerts.length} triaged</span>
      <div className="flex-1 h-1 bg-white/5 max-w-xs"><div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${(100 * done) / s.alerts.length}%` }} /></div>
      <button className="ghost-btn !text-xs ml-auto" onClick={() => window.confirm("End the shift now? Untriaged alerts count as missed.") && end()} data-testid="shift-end"><Flag className="h-3.5 w-3.5" />End shift</button>
    </div>
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      <Glass className="divide-y divide-white/5 h-fit" data-testid="shift-queue">{s.alerts.map((x, i) => (
        <button key={x.id} onClick={() => setSel(x.id)} className={`w-full text-left p-3 flex items-center gap-3 transition-colors ${x.id === sel ? "bg-cyan-500/10" : "hover:bg-white/5"}`} data-testid={`shift-queue-${x.id}`}>
          <span className="font-mono text-xs text-slate-500 w-5">{i + 1}</span><SeverityBadge level={x.severity} />
          <span className="flex-1 min-w-0"><span className="block text-xs font-mono text-cyan-400 truncate">{x.alert.rule}</span><span className="block text-sm truncate">{x.title}</span></span>
          {x.triaged && <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />}</button>))}</Glass>
      {a && <Triage key={a.id} s={s} a={a} onSaved={saved} />}
    </div></>);
}

function Results({ s, again }) {
  const r = s.result;
  return (
    <div className="space-y-5" data-testid="shift-results">
      <Glass className="p-6 flex flex-wrap items-center gap-8">
        <div><div className="eyebrow flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" />shift score</div><div className="text-6xl font-mono font-bold neon-text" data-testid="shift-score">{r.score}</div><div className="text-xs text-slate-500">{r.triaged}/{r.rows.length} triaged · {clock(s.used_sec)} used of {s.minutes}:00</div></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">{[["accuracy", 55], ["report", 20], ["playbook", 15], ["speed", 10]].map(([k, max]) => <div key={k} className="bg-black/40 border border-white/5 p-3" data-testid={`shift-part-${k}`}>
          <div className="text-[11px] font-mono uppercase text-slate-500">{k}</div><div className="font-mono text-xl text-slate-200">{r.parts[k]}<span className="text-xs text-slate-500">/{max}</span></div></div>)}</div>
        <button className="glow-btn" onClick={again} data-testid="shift-again"><Play className="h-4 w-4" />New shift</button>
      </Glass>
      <Glass className="overflow-x-auto"><table className="w-full text-sm" data-testid="shift-results-table">
        <thead><tr className="text-left text-xs font-mono text-slate-500 border-b border-white/10">{["Alert", "Severity", "Your verdict", "Expected", "Report", "Playbook path"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr></thead>
        <tbody>{r.rows.map((x) => <tr key={x.id} className="border-b border-white/5 align-top" data-testid={`shift-row-${x.id}`}>
          <td className="px-3 py-2">{x.title}<div className="text-[11px] text-slate-500">{x.category}</div>{x.missed_keywords?.length > 0 && <div className="text-[11px] text-orange-300 mt-1">missed: {x.missed_keywords.join(", ")}</div>}</td>
          <td className="px-3 py-2"><SeverityBadge level={x.severity} /></td>
          <td className="px-3 py-2 font-mono text-xs">{x.verdict ? <span className={x.verdict_correct ? "text-green-400" : "text-red-400"}>{x.verdict_correct ? <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> : <XCircle className="inline h-3.5 w-3.5 mr-1" />}{x.verdict}</span> : <span className="text-slate-500">missed</span>}</td>
          <td className="px-3 py-2 font-mono text-xs">{x.expected}</td><td className="px-3 py-2 font-mono text-xs">{x.verdict ? `${x.report_pct}%` : "—"}</td>
          <td className="px-3 py-2 text-xs">{x.playbook ? <span className={x.playbook.correct ? "text-green-400" : "text-orange-300"}>{x.playbook.correct ? "correct path" : `off at "${x.playbook.wrong_step?.title || "?"}"`}</span> : <span className="text-slate-500">not used</span>}</td></tr>)}</tbody>
      </table></Glass>
    </div>);
}

export default function Shift() {
  const [s, setS] = useState(undefined);
  const load = async () => { const { data } = await api.get("/shift/active"); setS(data); return data; };
  useEffect(() => { load(); }, []);
  const reload = async () => { const { data } = await api.get(`/shift/${s.id}`); setS(data); return data; };
  return (
    <div>
      <PageHeader eyebrow="// shift simulator" title="Shift Simulator" sub="Work a timed shift of mixed alerts like a real SOC analyst: triage each one, use the playbook panel, and get a shift score for accuracy, report quality, playbook path and speed." />
      {s === undefined ? null : !s ? <Start onStart={setS} /> : s.status === "active" ? <Active key={s.id} s={s} reload={reload} onDone={setS} /> : <Results s={s} again={() => setS(null)} />}
    </div>);
}
