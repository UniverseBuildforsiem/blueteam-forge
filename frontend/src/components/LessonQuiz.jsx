import { useState } from "react";
import { CheckCircle2, XCircle, RotateCcw, ListChecks, Lock } from "lucide-react";
import { toast } from "sonner";
import { errMsg } from "../lib/api";

function Question({ q, i, pick, res, onPick }) {
  const done = !!res;
  return (
    <div className="space-y-2" data-testid={`lesson-quiz-q-${i}`}>
      <div className="text-sm font-medium text-slate-200"><span className="font-mono text-cyan-400 mr-2">{i + 1}.</span>{q.text}</div>
      <div className="grid sm:grid-cols-2 gap-2">{q.options.map((o, j) => {
        const right = done && j === res.answer, wrong = done && pick === j && !res.correct;
        return <button key={j} type="button" disabled={done} onClick={() => onPick(j)} data-testid={`lesson-quiz-option-${i}-${j}`}
          className={`text-left text-sm px-3 py-2 border rounded-sm transition-colors ${right ? "border-green-400 bg-green-500/10 text-green-200" : wrong ? "border-red-400 bg-red-500/10 text-red-200" : pick === j ? "border-cyan-400 bg-cyan-500/10 text-cyan-100" : "border-white/10 text-slate-300 hover:border-cyan-400/50"}`}>{o}</button>;
      })}</div>
      {done && <div className={`text-xs flex gap-1.5 ${res.correct ? "text-green-300" : "text-red-300"}`} data-testid={`lesson-quiz-feedback-${i}`}>
        {res.correct ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-px" /> : <XCircle className="h-3.5 w-3.5 shrink-0 mt-px" />}
        <span className="text-slate-400">{res.explanation ?? (res.correct ? "" : "Not quite — re-read the lesson and try again.")}</span></div>}
    </div>);
}

const localGrade = (qs, answers) => {
  const results = qs.map((q, i) => ({ correct: answers[i] === q.answer, answer: q.answer, explanation: q.explanation }));
  const score = results.filter((r) => r.correct).length, need = Math.ceil((qs.length * 3) / 5);
  return { score, total: qs.length, pass_count: need, passed: score >= need, results };
};

export function LessonQuiz({ quiz, grade, completed }) {
  const [picks, setPicks] = useState({});
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const qs = quiz?.questions || [];
  if (!qs.length) return null;
  const req = !!quiz.required, need = quiz.pass_count || Math.ceil((qs.length * 3) / 5);
  const check = async () => {
    const answers = qs.map((_, i) => picks[i]);
    if (!req || !grade) return setRes(localGrade(qs, answers));
    setBusy(true);
    try { const r = await grade(answers); setRes(r); if (r.completed) toast.success(`Quiz passed · lesson complete +${r.xp} XP`); else if (!r.passed) toast.error(`${r.score}/${r.total} — you need ${r.pass_count} to pass`); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className={`mt-8 glass rounded-sm p-5 space-y-5 ${req ? "border-l-2 border-l-yellow-400/70" : ""}`} data-testid="lesson-quiz">
      <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-yellow-300" /><span className="eyebrow !mb-0 flex-1">{req ? "lesson quiz" : "check your understanding"}</span>
        <span className={`text-[10px] font-mono uppercase ${req ? "text-yellow-300" : "text-slate-500"}`} data-testid="lesson-quiz-mode">{req ? (completed ? "required · passed" : `required · pass ${need}/${qs.length} to complete`) : "practice only · no XP"}</span></div>
      {qs.map((q, i) => <Question key={q.id || i} q={q} i={i} pick={picks[i]} res={res?.results[i]} onPick={(j) => setPicks({ ...picks, [i]: j })} />)}
      <div className="flex items-center gap-3 pt-1">
        {res ? <><span className={`font-mono text-sm ${res.passed ? "text-green-300" : "text-yellow-200"}`} data-testid="lesson-quiz-score">{res.score}/{res.total} correct{req && (res.passed ? " · passed" : ` · need ${res.pass_count}`)}</span>
          <button className="ghost-btn !text-xs" onClick={() => { setPicks({}); setRes(null); }} data-testid="lesson-quiz-retry"><RotateCcw className="h-3.5 w-3.5" />Try again</button></>
          : <button className="glow-btn !text-xs" disabled={busy || Object.keys(picks).length < qs.length} onClick={check} data-testid="lesson-quiz-check">{req && !completed && <Lock className="h-3.5 w-3.5" />}{busy ? "Checking..." : req ? "Submit quiz" : "Check answers"}</button>}
      </div>
    </div>);
}
