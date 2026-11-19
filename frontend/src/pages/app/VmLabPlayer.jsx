import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Circle, Lightbulb, Eye, RotateCcw, TerminalSquare, MonitorCog, Award } from "lucide-react";
import { api, errMsg } from "../../lib/api";
import { Glass } from "../../components/common";
import { Terminal } from "../../components/vmlab/Terminal";
import { Console } from "../../components/vmlab/Console";

function AnswerBox({ t, onAnswer }) {
  const [v, setV] = useState("");
  return <form onSubmit={(e) => { e.preventDefault(); onAnswer(t.id, v); }} className="flex gap-1.5 mt-2"><input className="field !py-1 !text-xs font-mono" value={v} onChange={(e) => setV(e.target.value)} placeholder="Your answer" aria-label={`Answer for ${t.title}`} data-testid={`vm-answer-${t.id}`} />
    <button className="ghost-btn !text-xs !py-1" data-testid={`vm-answer-submit-${t.id}`}>Check</button></form>;
}

function Task({ t, i, onReveal, onAnswer }) {
  return <li className={`border px-3 py-2.5 transition-colors ${t.done ? "border-green-500/40 bg-green-500/5" : "border-white/10"}`} data-testid={`vm-task-${t.id}`}>
    <div className="flex gap-2.5">{t.done ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" data-testid={`vm-task-done-${t.id}`} /> : <Circle className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0"><div className="text-sm font-semibold"><span className="text-slate-500 font-mono text-xs mr-1.5">{i + 1}.</span>{t.title}</div>
        <p className="text-xs text-slate-400 mt-1 whitespace-pre-line">{t.instruction}</p>
        {t.type === "answer" && !t.done && <AnswerBox t={t} onAnswer={onAnswer} />}
        {t.hint && <p className="text-xs text-yellow-200 mt-2 flex gap-1.5" data-testid={`vm-hint-text-${t.id}`}><Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />{t.hint}</p>}
        {t.solution && <pre className="text-[11px] font-mono text-sky-200 bg-black/40 border border-white/10 p-2 mt-2 whitespace-pre-wrap break-all" data-testid={`vm-solution-text-${t.id}`}>{t.solution}</pre>}
        {!t.done && <div className="flex gap-3 mt-2 text-[11px] font-mono">{!t.hint && <button onClick={() => onReveal("hint", t.id)} className="text-yellow-300 hover:underline" data-testid={`vm-hint-${t.id}`}>Hint (−5)</button>}
          {!t.solution && <button onClick={() => window.confirm("Show the solution? It costs 10 points for this task.") && onReveal("solution", t.id)} className="text-sky-300 hover:underline" data-testid={`vm-solution-${t.id}`}>Show solution (−10)</button>}</div>}
      </div></div></li>;
}

export default function VmLabPlayer() {
  const { id } = useParams();
  const nav = useNavigate();
  const [lab, setLab] = useState(null);
  const [tab, setTab] = useState("terminal");
  const [key, setKey] = useState(0);
  useEffect(() => { api.get(`/vmlab/labs/${id}`).then((r) => setLab(r.data)).catch((e) => { toast.error(errMsg(e)); nav("/app/vmlab"); }); }, [id]); // eslint-disable-line
  if (!lab) return null;
  const after = (d) => {
    const L = d.lab || d;
    (d.new || []).forEach((tid) => toast.success(`Task complete: ${L.tasks.find((t) => t.id === tid)?.title}`));
    if (L.completed_at && !lab.completed_at) toast.success("Lab complete! +100 XP", { duration: 5000 });
    setLab(L);
  };
  const emit = (event, data) => api.post(`/vmlab/labs/${id}/event`, { event, data }).then((r) => after(r.data)).catch((e) => toast.error(errMsg(e)));
  const reveal = (what, tid) => api.post(`/vmlab/labs/${id}/${what}/${tid}`).then((r) => setLab(r.data));
  const answer = (tid, v) => api.post(`/vmlab/labs/${id}/answer`, { task_id: tid, answer: v }).then((r) => { if (!r.data.correct) toast.error("Not quite. Check the log again"); after(r.data); });
  const reset = async () => { if (!window.confirm("Reset this lab? Progress, terminal and console changes are cleared.")) return; setLab((await api.post(`/vmlab/labs/${id}/reset`)).data); setKey((k) => k + 1); toast.success("Lab reset"); };
  const done = lab.tasks.filter((t) => t.done).length;
  return <div className="space-y-4" data-testid="vm-lab-player">
    <div className="flex flex-wrap items-center gap-3"><Link to="/app/vmlab" className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="vm-back"><ArrowLeft className="h-3.5 w-3.5" />Vulnerability Management Lab</Link>
      <span className="ml-auto text-xs font-mono text-slate-400">score <b className="text-green-300" data-testid="vm-score">{lab.score}</b></span>
      <button className="ghost-btn !text-xs !py-1.5" onClick={reset} data-testid="vm-reset"><RotateCcw className="h-3.5 w-3.5" />Reset lab</button></div>
    <div className="grid lg:grid-cols-[minmax(300px,380px)_1fr] gap-4 items-start">
      <Glass className="p-4 space-y-4 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto" data-testid="vm-instructions">
        <div><div className="eyebrow">module {lab.module} · lab · {lab.difficulty}</div><h1 className="text-xl font-bold mt-1" data-testid="vm-lab-title">{lab.title}</h1><p className="text-xs text-slate-400 mt-2 whitespace-pre-line">{lab.intro}</p></div>
        <div><div className="flex justify-between text-[11px] font-mono text-slate-500 mb-1"><span>tasks</span><span data-testid="vm-task-count">{done}/{lab.tasks.length}</span></div><div className="h-1.5 bg-white/5"><div className="h-1.5 bg-green-400 transition-[width] duration-500" style={{ width: `${(100 * done) / lab.tasks.length}%` }} /></div></div>
        {lab.completed_at && <div className="border border-green-500/40 bg-green-500/10 p-3 text-sm flex gap-2 items-center" data-testid="vm-lab-complete"><Award className="h-5 w-5 text-green-400" />Lab complete. Your agent is deployed and validated.</div>}
        <ol className="space-y-2">{lab.tasks.map((t, i) => <Task key={t.id} t={t} i={i} onReveal={reveal} onAnswer={answer} />)}</ol>
      </Glass>
      <div className="space-y-2 min-w-0">
        <div className="flex gap-1" role="tablist">{[["terminal", "Terminal", TerminalSquare], ["console", "Console", MonitorCog]].map(([k, l, I]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 text-xs font-semibold border inline-flex items-center gap-1.5 ${tab === k ? "border-cyan-400/60 text-cyan-200 bg-cyan-500/10" : "border-white/10 text-slate-400"}`} data-testid={`vm-tab-${k}`}><I className="h-3.5 w-3.5" />{l}</button>)}</div>
        <div className="h-[560px] lg:h-[calc(100vh-190px)] min-h-[460px]">
          <div className={tab === "terminal" ? "h-full" : "hidden"}><Terminal key={key} lab={lab} onResult={after} active={tab === "terminal"} /></div>
          <div className={tab === "console" ? "h-full" : "hidden"}><Console key={key} lab={lab} emit={emit} /></div>
        </div>
      </div>
    </div>
  </div>;
}
