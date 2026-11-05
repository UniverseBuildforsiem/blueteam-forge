import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle, Search, Siren, Loader2, RotateCcw, Trophy } from "lucide-react";
import { api, errMsg } from "../../lib/api";
import { Glass, Empty, SeverityBadge } from "../../components/common";

function AlertCard({ lab }) {
  const a = lab.alert;
  return (
    <Glass className="p-5" data-testid="lab-alert">
      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500"><Siren className="h-4 w-4 text-red-400" />{a.source} · {String(a.time).replace("T", " ").slice(0, 19)} UTC<span className="ml-auto"><SeverityBadge level={a.severity} /></span></div>
      <h2 className="font-bold text-lg mt-2" data-testid="lab-alert-title">{a.title}</h2>
      <p className="text-sm text-slate-300 mt-2">{a.description}</p>
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs mt-4">{Object.entries(a.entities || {}).map(([k, v]) => <div key={k} className="contents"><dt className="font-mono text-slate-500 truncate">{k}</dt><dd className="font-mono text-cyan-200 break-all">{String(v)}</dd></div>)}</dl>
      <div className="mt-4 border-l-2 border-amber-400/50 bg-amber-500/5 px-3 py-2 text-xs text-slate-300"><span className="font-mono text-amber-300 uppercase text-[10px] mr-2">context</span>{lab.background}</div>
    </Glass>);
}

function Logs({ logs, evidence }) {
  const [q, setQ] = useState("");
  const ev = new Set(evidence || []);
  const rows = logs.map((l, i) => ({ ...l, i })).filter((l) => !q || `${l.source} ${l.line}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Glass className="overflow-hidden" data-testid="lab-logs">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10"><span className="text-[11px] font-mono uppercase text-cyan-300">raw logs · {logs.length} events</span>
        <div className="ml-auto flex items-center gap-1 bg-black/40 border border-white/10 px-2"><Search className="h-3.5 w-3.5 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter logs" className="bg-transparent text-xs py-1 outline-none w-40" data-testid="lab-logs-filter" /></div></div>
      <div className="max-h-[420px] overflow-y-auto font-mono text-[11px]">{rows.map((l) => (
        <div key={l.i} className={`px-4 py-1.5 border-b border-white/5 ${ev.has(l.i) ? "bg-red-500/10 border-l-2 border-l-red-400" : ""}`} data-testid={`lab-log-${l.i}`}>
          <span className="text-slate-500">{String(l.ts).replace("T", " ").slice(5, 19)}</span> <span className="text-green-400">{l.source}</span> <span className="text-slate-300 break-all">{l.line}</span>
          {ev.has(l.i) && <span className="ml-2 text-[10px] text-red-300 uppercase">evidence</span>}</div>))}
        {!rows.length && <Empty text="no log lines match" />}</div>
    </Glass>);
}

const Opt = ({ on, children, ...p }) => <button type="button" {...p} className={`w-full text-left text-sm border px-3 py-2 rounded-sm transition-colors ${on ? "border-cyan-400 bg-cyan-500/10 text-cyan-100" : "border-white/10 text-slate-300 hover:border-cyan-500/40"}`}>{children}</button>;

function Walkthrough({ lab, onDone }) {
  const n = lab.questions.length;
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState(Array(n).fill(null));
  const [verdict, setVerdict] = useState("");
  const [sev, setSev] = useState("");
  const [cont, setCont] = useState([]);
  const [busy, setBusy] = useState(false);
  const last = n;
  const submit = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/sop-labs/${lab.sop_id}/submit`, { answers: ans, verdict, severity: sev, containment: cont }); onDone(data); if (data.xp) toast.success(`+${data.xp} XP — lab passed!`); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const ready = step < n ? ans[step] !== null : verdict && sev && cont.length;
  return (
    <Glass className="p-5" data-testid="lab-walkthrough">
      <div className="flex items-center gap-1 mb-4">{[...Array(n + 1)].map((_, i) => <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-green-500" : i === step ? "bg-cyan-400" : "bg-white/10"}`} />)}</div>
      {step < n ? <div data-testid={`lab-q-${step}`}>
        <div className="text-[11px] font-mono text-cyan-300 uppercase">analysis step {step + 1} of {n}</div>
        <div className="font-bold mt-2 mb-4">{lab.questions[step].q}</div>
        <div className="space-y-2">{lab.questions[step].options.map((o, i) => <Opt key={i} on={ans[step] === i} onClick={() => setAns(ans.map((x, j) => (j === step ? i : x)))} data-testid={`lab-q-${step}-opt-${i}`}>{o}</Opt>)}</div>
      </div> : <div className="space-y-5" data-testid="lab-decision">
        <div><div className="text-[11px] font-mono text-cyan-300 uppercase mb-2">your verdict</div>
          <div className="grid grid-cols-2 gap-2">{[["true_positive", "True positive"], ["false_positive", "False positive"]].map(([k, l]) => <Opt key={k} on={verdict === k} onClick={() => setVerdict(k)} data-testid={`lab-verdict-${k}`}>{l}</Opt>)}</div></div>
        <div><div className="text-[11px] font-mono text-cyan-300 uppercase mb-2">final severity</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{lab.severities.map((s) => <Opt key={s} on={sev === s} onClick={() => setSev(s)} data-testid={`lab-sev-${s.toLowerCase()}`}>{s}</Opt>)}</div></div>
        <div><div className="text-[11px] font-mono text-cyan-300 uppercase mb-2">response actions (pick all that apply)</div>
          <div className="space-y-2">{lab.containment.map((c, i) => <Opt key={i} on={cont.includes(i)} onClick={() => setCont(cont.includes(i) ? cont.filter((x) => x !== i) : [...cont, i])} data-testid={`lab-cont-${i}`}>{c}</Opt>)}</div></div>
      </div>}
      <div className="flex items-center gap-2 mt-6">
        <button className="ghost-btn !text-xs" disabled={step === 0} onClick={() => setStep(step - 1)} data-testid="lab-prev"><ArrowLeft className="h-3.5 w-3.5" />Back</button>
        <div className="flex-1" />
        {step < last ? <button className="glow-btn !text-xs" disabled={!ready} onClick={() => setStep(step + 1)} data-testid="lab-next">Next<ArrowRight className="h-3.5 w-3.5" /></button>
          : <button className="glow-btn !text-xs" disabled={!ready || busy} onClick={submit} data-testid="lab-submit">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Submit investigation</button>}
      </div>
    </Glass>);
}

const Mark = ({ ok }) => (ok ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : <XCircle className="h-4 w-4 text-red-400 shrink-0" />);

function Results({ r, onRetry, sopId }) {
  return (
    <div className="space-y-4" data-testid="lab-results">
      <Glass className={`p-5 border ${r.passed ? "border-green-500/40" : "border-amber-500/40"}`}>
        <div className="flex items-center gap-4"><Trophy className={`h-10 w-10 ${r.passed ? "text-green-400" : "text-amber-300"}`} />
          <div className="flex-1"><div className="text-3xl font-bold font-mono" data-testid="lab-score">{r.score}%</div><div className="text-xs text-slate-400">{r.passed ? "Passed" : `Not yet — pass mark ${r.pass_mark}%`}{r.xp ? ` · +${r.xp} XP` : ""}</div></div>
          <button className="ghost-btn !text-xs" onClick={onRetry} data-testid="lab-retry"><RotateCcw className="h-3.5 w-3.5" />Try again</button>
          <Link to={`/sops/${sopId}`} className="ghost-btn !text-xs" data-testid="lab-open-sop">Open SOP</Link></div>
      </Glass>
      <Glass className="p-5 space-y-3">{r.questions.map((q, i) => (
        <div key={i} className="text-sm" data-testid={`lab-result-q-${i}`}><div className="flex gap-2 font-semibold"><Mark ok={q.correct} />{q.q}</div>
          <div className="ml-6 text-xs mt-1">{!q.correct && <span className="text-red-300">Your answer: {q.options[q.your]} · </span>}<span className="text-green-300">Correct: {q.options[q.answer]}</span></div>
          <div className="ml-6 text-xs text-slate-400 mt-1">{q.explain}</div></div>))}
        <div className="text-sm border-t border-white/10 pt-3" data-testid="lab-result-verdict"><div className="flex gap-2 font-semibold"><Mark ok={r.verdict.correct} />Verdict: {r.verdict.answer.replace("_", " ")}</div><div className="ml-6 text-xs text-slate-400 mt-1">{r.verdict.explain}</div></div>
        <div className="text-sm flex gap-2 font-semibold" data-testid="lab-result-severity"><Mark ok={r.severity.correct} />Severity: {r.severity.answer}{!r.severity.correct && <span className="text-xs text-red-300 font-normal">(you chose {r.severity.your})</span>}</div>
        <div className="text-sm border-t border-white/10 pt-3"><div className="font-semibold mb-2">Response actions</div>{r.containment.map((c, i) => (
          <div key={i} className="flex gap-2 text-xs py-0.5"><Mark ok={c.correct === c.picked} /><span className={c.correct ? "text-green-300" : "text-slate-400"}>{c.action}</span>{c.picked && <span className="text-slate-500">(picked)</span>}</div>))}</div>
        <div className="text-sm border-t border-white/10 pt-3"><div className="font-semibold mb-1">Model incident summary</div><p className="text-xs text-slate-300">{r.summary}</p></div>
      </Glass>
    </div>);
}

export default function SopLab() {
  const { id } = useParams();
  const [lab, setLab] = useState(null);
  const [err, setErr] = useState("");
  const [res, setRes] = useState(null);
  const [key, setKey] = useState(0);
  useEffect(() => { api.get(`/sop-labs/${id}`).then((r) => setLab(r.data)).catch((e) => setErr(errMsg(e))); }, [id]);
  const evidence = useMemo(() => res?.evidence, [res]);
  if (err) return <div className="p-10"><Empty text={err} /><div className="text-center mt-4"><Link to={`/sops/${id}`} className="ghost-btn !text-xs" data-testid="lab-error-sop">Back to the SOP</Link></div></div>;
  if (!lab) return <div className="p-10"><Loader2 className="h-5 w-5 animate-spin text-cyan-400" /></div>;
  return (
    <div className="p-6 lg:p-10 max-w-7xl" data-testid="sop-lab-page">
      <Link to={`/sops/${id}`} className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="lab-back"><ArrowLeft className="h-3.5 w-3.5" />{lab.sop_title}</Link>
      <div className="eyebrow mt-4 mb-1">// sop practice lab · {lab.category}</div>
      <h1 className="text-2xl sm:text-3xl font-extrabold">Work this alert end to end</h1>
      {lab.best && <div className="text-xs font-mono text-slate-400 mt-1" data-testid="lab-best">best score {lab.best.score}%{lab.best.passed ? " · passed" : ""}</div>}
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-5 mt-6">
        <div className="space-y-5"><AlertCard lab={lab} /><Logs logs={lab.logs} evidence={evidence} /></div>
        <div>{res ? <Results r={res} sopId={id} onRetry={() => { setRes(null); setKey(key + 1); }} /> : <Walkthrough key={key} lab={lab} onDone={(r) => { setRes(r); if (!lab.best || r.score > lab.best.score) setLab({ ...lab, best: { score: r.score, passed: r.passed || !!lab.best?.passed } }); }} />}</div>
      </div>
    </div>);
}
