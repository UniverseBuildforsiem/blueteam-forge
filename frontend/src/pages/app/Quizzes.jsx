import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Timer, CheckCircle2, XCircle, RotateCcw, Award } from "lucide-react";
import { toast } from "sonner";
import { api, API, errMsg } from "../../lib/api";
import { Glass, PageHeader } from "../../components/common";

export function Quizzes() {
  const [qs, setQs] = useState([]);
  useEffect(() => { api.get("/quizzes").then((r) => setQs(r.data)); }, []);
  return (
    <div>
      <PageHeader eyebrow="// knowledge checks" title="Quizzes & exams" sub="Instant feedback, explanations on every question and unlimited retries." />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {qs.map((q) => (
          <Glass key={q.id} className="p-5 flex flex-col" data-testid={`quiz-card-${q.id}`}>
            <div className="flex justify-between text-xs font-mono"><span className={q.path_id ? "text-orange-300" : "text-cyan-400"}>{q.path_id ? "FINAL EXAM" : q.topic}</span>
              <span className="text-slate-500">{q.question_count} Q{q.time_limit_sec ? ` · ${Math.round(q.time_limit_sec / 60)} min` : ""}</span></div>
            <div className="font-bold mt-2 flex-1">{q.title}</div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs font-mono text-slate-400">best: {q.best_score ?? "—"}{q.best_score != null && "%"}</span>
              <Link to={`/app/quizzes/${q.id}`} className="ghost-btn !py-1.5" data-testid={`quiz-start-${q.id}`}>{q.best_score != null ? "Retry" : "Start"}</Link>
            </div>
          </Glass>
        ))}
      </div>
    </div>
  );
}

export function QuizPlayer() {
  const { id } = useParams();
  const [q, setQ] = useState(null);
  const [i, setI] = useState(0);
  const [ans, setAns] = useState({});
  const [fb, setFb] = useState({});
  const [result, setResult] = useState(null);
  const [left, setLeft] = useState(null);
  const started = useRef(Date.now());

  const start = () => api.get(`/quizzes/${id}`).then((r) => {
    setQ(r.data); setI(0); setAns({}); setFb({}); setResult(null); started.current = Date.now();
    setLeft(r.data.time_limit_sec || null);
  });
  useEffect(() => { start(); }, [id]); // eslint-disable-line

  const submit = async () => {
    try {
      const { data } = await api.post(`/quizzes/${id}/submit`, { answers: ans, time_spent: Math.round((Date.now() - started.current) / 1000) });
      setResult(data);
      if (data.certificate?.id) toast.success("Certificate issued!");
    } catch (e) { toast.error(errMsg(e)); }
  };

  useEffect(() => {
    if (left == null || result) return;
    if (left <= 0) { submit(); return; }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, result]); // eslint-disable-line

  if (!q) return null;
  const qu = q.questions[i];
  const sel = ans[qu.id] || [];
  const toggle = (idx) => {
    if (fb[qu.id]) return;
    setAns({ ...ans, [qu.id]: qu.type === "multi" ? (sel.includes(idx) ? sel.filter((x) => x !== idx) : [...sel, idx]) : [idx] });
  };
  const check = async () => {
    const { data } = await api.post(`/quizzes/${id}/check`, { question_id: qu.id, answer: sel });
    setFb({ ...fb, [qu.id]: data });
  };

  if (result) return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="// results" title={`${result.score}% — ${result.passed ? "PASSED" : "NOT PASSED"}`} sub={`${result.correct} of ${result.total} correct. Pass mark ${q.pass_mark}%.`}
        right={<button className="ghost-btn" onClick={start} data-testid="quiz-retry-button"><RotateCcw className="h-4 w-4" />Retry</button>} />
      {result.certificate?.id && <Glass className="p-5 mb-4 border-green-400/50 flex items-center justify-between" data-testid="quiz-certificate-issued"><span className="flex items-center gap-2 text-green-400"><Award className="h-5 w-5" />Certificate {result.certificate.id} issued</span>
        <a className="glow-btn" href={`${API}/public/certificates/${result.certificate.id}/pdf`} target="_blank" rel="noreferrer">Open PDF</a></Glass>}
      {result.certificate?.pending && <Glass className="p-4 mb-4 text-sm text-yellow-300" data-testid="quiz-certificate-pending">{result.certificate.message}</Glass>}
      <div className="space-y-3" data-testid="quiz-results">
        {q.questions.map((x, k) => { const r = result.results[k]; return (
          <Glass key={x.id} className="p-4"><div className="flex gap-2 font-medium">{r.correct ? <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" /> : <XCircle className="h-5 w-5 text-red-400 shrink-0" />}{x.text}</div>
            <div className="text-sm text-slate-400 mt-2 pl-7">Answer: {r.answer.map((a) => x.options[a]).join(", ")} — {r.explanation}</div></Glass>); })}
      </div>
    </div>
  );

  const f = fb[qu.id];
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow={`// question ${i + 1} of ${q.questions.length} · ${qu.type === "multi" ? "select all that apply" : qu.type === "tf" ? "true / false" : "single choice"}`} title={q.title}
        right={left != null && <span data-testid="quiz-timer" className={`font-mono text-lg flex items-center gap-2 ${left < 30 ? "text-red-400" : "text-cyan-300"}`}><Timer className="h-5 w-5" />{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>} />
      <Glass className="p-6">
        <div className="text-lg font-medium mb-5" data-testid="quiz-question-text">{qu.text}</div>
        <div className="space-y-2">
          {qu.options.map((o, k) => {
            const chosen = sel.includes(k);
            const state = f ? (f.answer.includes(k) ? "border-green-400 bg-green-500/10" : chosen ? "border-red-400 bg-red-500/10" : "border-white/10") : chosen ? "border-cyan-400 bg-cyan-500/10" : "border-white/10 hover:border-cyan-500/40";
            return <button key={k} onClick={() => toggle(k)} data-testid={`quiz-option-${k}`} className={`w-full text-left px-4 py-3 border rounded-sm text-sm transition-colors ${state}`}><span className="font-mono text-slate-500 mr-3">{String.fromCharCode(65 + k)}</span>{o}</button>;
          })}
        </div>
        {f && <div data-testid="quiz-feedback" className={`mt-5 text-sm p-3 border-l-2 ${f.correct ? "border-green-400 text-green-300" : "border-red-400 text-red-300"}`}>{f.correct ? "Correct. " : "Incorrect. "}<span className="text-slate-300">{f.explanation}</span></div>}
        <div className="flex justify-between mt-6">
          <button className="ghost-btn" disabled={i === 0} onClick={() => setI(i - 1)} data-testid="quiz-prev-button">Prev</button>
          <div className="flex gap-2">
            {!f && !q.path_id && <button className="ghost-btn" disabled={!sel.length} onClick={check} data-testid="quiz-check-button">Check answer</button>}
            {i < q.questions.length - 1 ? <button className="glow-btn" onClick={() => setI(i + 1)} data-testid="quiz-next-button">Next</button>
              : <button className="glow-btn" onClick={submit} data-testid="quiz-submit-button">Submit quiz</button>}
          </div>
        </div>
      </Glass>
    </div>
  );
}
