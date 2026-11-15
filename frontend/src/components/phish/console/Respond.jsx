import { Link } from "react-router-dom";
import { Play, CheckCircle2, XCircle, AlertTriangle, BookOpen, RotateCcw, Clock } from "lucide-react";
import { Glass } from "../../common";

export function Respond({ c, run, onAct, busy, frozen }) {
  const done = Object.fromEntries(run.actions.map((a) => [a.i, a]));
  return <Glass className="p-4 space-y-3" data-testid="respond-panel">
    <div><div className="eyebrow">response actions</div><p className="text-xs text-slate-400 mt-1">Each action runs immediately and can't be undone. Watch the consequence before you pick the next one.</p></div>
    <ul className="space-y-2">{c.response.map((t, i) => { const a = done[i];
      return <li key={i} className={`border px-3 py-2.5 transition-colors ${a ? (a.good ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5") : "border-white/10"}`} data-testid={`respond-action-${i}`}>
        <div className="flex items-start gap-3"><span className="flex-1 text-sm">{t}</span>
          {!a && <button className="ghost-btn !text-xs !py-1 shrink-0" disabled={busy || frozen} onClick={() => onAct(i)} data-testid={`respond-run-${i}`}><Play className="h-3.5 w-3.5" />Execute</button>}</div>
        {a && <div className={`mt-1.5 text-xs font-mono flex gap-1.5 ${a.good ? "text-green-300" : "text-red-300"}`} data-testid={`respond-effect-${i}`}>{a.good ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}{a.effect}</div>}
      </li>; })}</ul>
  </Glass>;
}

const Part = ({ k, v, m }) => <div className="border border-white/10 p-2 text-center"><div className="text-[10px] font-mono uppercase text-slate-500">{k}</div><b className="font-mono">{v}/{m}</b></div>;
const Mark = ({ ok }) => (ok ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : <XCircle className="h-4 w-4 text-red-400 shrink-0" />);
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function Debrief({ r, onRetry }) {
  const p = r.parts, pen = r.penalties;
  return <div className="space-y-4" data-testid="phish-result">
    <Glass className={`p-5 space-y-4 ${r.passed ? "border-green-500/40" : "border-red-500/40"}`}>
      <div className="flex flex-wrap items-center gap-3"><span className={`text-4xl font-mono font-bold ${r.passed ? "text-green-400" : "text-red-400"}`} data-testid="phish-score">{r.score}%</span>
        <span className="text-sm">{r.passed ? "Case closed correctly" : "Not quite. Review the debrief and try again"}{r.xp > 0 && <b className="text-cyan-300 ml-2">+{r.xp} XP</b>}</span>
        <span className="text-xs font-mono text-slate-500 sm:ml-auto flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{Math.floor(r.elapsed_seconds / 60)}m {r.elapsed_seconds % 60}s / SLA {r.sla_minutes}m</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px]" data-testid="phish-score-breakdown"><Part k="verdict" v={p.verdict} m={30} /><Part k="evidence" v={p.evidence} m={30} /><Part k="iocs" v={p.iocs} m={20} /><Part k="response" v={p.response} m={20} />
        <div className="border border-yellow-500/30 p-2 text-center"><div className="text-[10px] font-mono uppercase text-slate-500">hints</div><b className="font-mono text-yellow-300">−{pen.hints}</b></div>
        <div className="border border-red-500/30 p-2 text-center"><div className="text-[10px] font-mono uppercase text-slate-500">sla</div><b className="font-mono text-red-300">−{pen.sla}</b></div></div>
      <div className="text-sm flex gap-2 items-start" data-testid="phish-verdict-result"><Mark ok={r.verdict_ok} /><span>Correct verdict: <b>{r.verdict}</b></span></div>
      <p className="text-sm text-slate-300 border-l-2 border-cyan-400/60 pl-3" data-testid="phish-debrief">{r.debrief}</p>
      <div className="flex flex-wrap gap-2"><button className="ghost-btn !text-xs" onClick={onRetry} data-testid="phish-retry"><RotateCcw className="h-3.5 w-3.5" />Try again</button>
        <Link to={r.playbook} className="glow-btn !text-xs" data-testid="phish-playbook-link"><BookOpen className="h-3.5 w-3.5" />Open the Phishing playbook</Link></div>
    </Glass>
    <div className="grid lg:grid-cols-2 gap-4">
      <Glass className="p-4 space-y-2" data-testid="debrief-iocs"><div className="eyebrow">indicators · found vs missed</div>
        {r.iocs.length === 0 && <p className="text-xs text-slate-400">No indicators expected: this message isn't malicious.</p>}
        <ul className="space-y-1">{r.iocs.map((i) => <li key={i} className="flex gap-2 text-xs font-mono break-all"><Mark ok={r.ioc_hits.includes(i)} /><span className={r.ioc_hits.includes(i) ? "text-green-300" : "text-red-300"}>{i}</span><span className="text-slate-600 shrink-0">{r.ioc_hits.includes(i) ? "found" : "missed"}</span></li>)}</ul>
        {r.ioc_extra.length > 0 && <div className="text-[11px] font-mono text-slate-500">Not expected: {r.ioc_extra.join(", ")}</div>}</Glass>
      <Glass className="p-4 space-y-2" data-testid="debrief-findings"><div className="eyebrow">evidence findings</div>
        <ul className="space-y-1">{r.findings.map((f, i) => <li key={i} className="flex gap-2 text-xs"><span className="w-16 shrink-0 font-mono text-[10px] uppercase">{f.correct ? (f.pinned ? <span className="text-green-400">found</span> : <span className="text-red-300">missed</span>) : f.pinned ? <span className="text-red-300">wrong</span> : <span className="text-slate-600">distractor</span>}</span><span className={f.correct ? "text-slate-200" : "text-slate-500"}>{f.text}</span></li>)}</ul></Glass>
      <Glass className="p-4 space-y-2" data-testid="debrief-actions"><div className="eyebrow">response actions</div>
        <ul className="space-y-1">{r.response.map((a, i) => <li key={i} className="flex gap-2 text-xs"><span className="w-16 shrink-0 font-mono text-[10px] uppercase">{a.done ? (a.correct ? <span className="text-green-400">done</span> : <span className="text-red-300">harmful</span>) : a.correct ? <span className="text-yellow-300">skipped</span> : <span className="text-slate-600">avoided</span>}</span><span className={a.correct ? "text-slate-200" : "text-slate-500"}>{a.text}</span></li>)}</ul></Glass>
      <Glass className="p-4 space-y-2" data-testid="debrief-timeline"><div className="eyebrow">your investigation timeline</div>
        <ol className="relative border-l border-white/15 ml-1.5 space-y-2 max-h-80 overflow-auto">{r.timeline.map((e, i) => <li key={i} className="pl-3 text-xs relative"><span className="absolute -left-[4px] top-1.5 h-2 w-2 rounded-full bg-cyan-400/80" />
          <span className="font-mono text-slate-500 mr-2">{time(e.at)}</span><span className="font-mono text-[10px] uppercase text-cyan-300 mr-2">{e.kind}</span><span className="text-slate-300">{e.text}</span></li>)}</ol></Glass>
    </div>
    {r.summary && <Glass className="p-4" data-testid="debrief-summary"><div className="eyebrow mb-2">your incident summary</div><p className="text-sm text-slate-300 whitespace-pre-line">{r.summary}</p></Glass>}
  </div>;
}
