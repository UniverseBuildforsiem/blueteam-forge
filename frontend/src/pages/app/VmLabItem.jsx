import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, Flag, Lightbulb } from "lucide-react";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass } from "../../components/common";

function useItem(kind) {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const load = () => api.get(`/vmlab/${kind}/${id}`).then((r) => setD(r.data)).catch((e) => { toast.error(errMsg(e)); nav("/app/vmlab"); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  return [d, load, id];
}

const Back = () => <Link to="/app/vmlab" className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="vm-back"><ArrowLeft className="h-3.5 w-3.5" />Vulnerability Management Lab</Link>;

export function VmQuiz() {
  const [d, load, id] = useItem("quizzes");
  const [ans, setAns] = useState({});
  const [res, setRes] = useState(null);
  if (!d) return null;
  const submit = async () => { const r = await api.post(`/vmlab/quizzes/${id}/submit`, { answers: d.questions.map((_, i) => ans[i] ?? null) }); setRes(r.data); load(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return <div className="max-w-3xl space-y-4" data-testid="vm-quiz"><Back /><div><div className="eyebrow">module {d.module} · quiz</div><h1 className="text-2xl font-bold">{d.title}</h1><p className="text-sm text-slate-400 mt-1">{d.summary}</p></div>
    {res && <Glass className={`p-4 ${res.passed ? "border-green-500/40" : "border-red-500/40"}`} data-testid="vm-quiz-result"><span className={`text-3xl font-mono font-bold ${res.passed ? "text-green-400" : "text-red-400"}`} data-testid="vm-quiz-score">{res.score}%</span> <span className="text-sm ml-2">{res.passed ? "Passed" : "70% needed to pass"}</span>
      <button className="ghost-btn !text-xs ml-4" onClick={() => { setRes(null); setAns({}); }} data-testid="vm-quiz-retry">Retry</button></Glass>}
    {d.questions.map((q, i) => { const r = res?.results[i];
      return <Glass key={i} className="p-4" data-testid={`vm-quiz-q-${i}`}><div className="text-sm font-semibold mb-2">{i + 1}. {q.q}</div>
        <div className="space-y-1.5">{q.options.map((o, j) => <label key={j} className={`flex gap-2 text-sm border px-3 py-2 cursor-pointer ${r ? (j === r.answer ? "border-green-500/50 bg-green-500/5" : ans[i] === j ? "border-red-500/50" : "border-white/10") : ans[i] === j ? "border-cyan-400/60" : "border-white/10 hover:border-white/25"}`}>
          <input type="radio" name={`q${i}`} disabled={!!res} checked={ans[i] === j} onChange={() => setAns({ ...ans, [i]: j })} data-testid={`vm-quiz-opt-${i}-${j}`} />{o}</label>)}</div>
        {r && <p className="text-xs mt-2 flex gap-1.5 text-slate-300">{r.correct ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}{r.explain}</p>}</Glass>; })}
    {!res && <button className="glow-btn" disabled={Object.keys(ans).length < d.questions.length} onClick={submit} data-testid="vm-quiz-submit">Submit answers</button>}
    {d.history.length > 0 && <Glass className="p-4"><div className="eyebrow mb-2">your attempts</div><ul className="space-y-1">{d.history.map((h) => <li key={h.id} className="text-xs flex gap-3"><span className={`font-mono ${h.score >= 70 ? "text-green-400" : "text-red-300"}`}>{h.score}%</span><span className="text-slate-500">{fmtDate(h.at)}</span></li>)}</ul></Glass>}
  </div>;
}

function Challenge({ c, i, id, onSolved }) {
  const [v, setV] = useState("");
  const [hint, setHint] = useState(false);
  const go = async (e) => { e.preventDefault(); const r = await api.post(`/vmlab/ctf/${id}/submit`, { index: i, flag: v }); if (r.data.correct) { toast.success(`Flag captured! +${c.points}`); onSolved(); } else toast.error("Wrong flag"); };
  return <Glass className={`p-4 ${c.solved ? "border-green-500/40" : ""}`} data-testid={`vm-ctf-${i}`}><div className="flex gap-2 items-start"><Flag className={`h-4 w-4 shrink-0 mt-0.5 ${c.solved ? "text-green-400" : "text-cyan-400"}`} /><div className="flex-1 text-sm font-semibold">{c.q}</div><span className="font-mono text-xs text-cyan-300">{c.points} pts</span></div>
    {c.solved ? <p className="text-xs font-mono text-green-300 mt-2" data-testid={`vm-ctf-solved-${i}`}>Solved · {c.answer}</p>
      : <form onSubmit={go} className="flex gap-2 mt-3"><input className="field !py-1.5 !text-sm font-mono" value={v} onChange={(e) => setV(e.target.value)} placeholder="flag" data-testid={`vm-ctf-input-${i}`} /><button className="glow-btn !text-xs" data-testid={`vm-ctf-submit-${i}`}>Submit</button></form>}
    {!c.solved && c.hint && (hint ? <p className="text-xs text-yellow-200 mt-2 flex gap-1.5"><Lightbulb className="h-3.5 w-3.5" />{c.hint}</p> : <button onClick={() => setHint(true)} className="text-[11px] font-mono text-yellow-300 mt-2 hover:underline" data-testid={`vm-ctf-hint-${i}`}>Show hint</button>)}
  </Glass>;
}

export function VmCtf() {
  const [d, load, id] = useItem("ctf");
  if (!d) return null;
  return <div className="max-w-3xl space-y-4" data-testid="vm-ctf-page"><Back /><div><div className="eyebrow">module {d.module} · ctf</div><h1 className="text-2xl font-bold">{d.title}</h1><p className="text-sm text-slate-400 mt-1">{d.summary}</p></div>
    {d.challenges.map((c, i) => <Challenge key={i} c={c} i={i} id={id} onSolved={load} />)}</div>;
}
