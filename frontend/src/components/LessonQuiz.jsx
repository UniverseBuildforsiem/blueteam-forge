import { useState } from "react";
import { CheckCircle2, XCircle, RotateCcw, ListChecks } from "lucide-react";

function Question({ q, i, pick, done, onPick }) {
  return (
    <div className="space-y-2" data-testid={`lesson-quiz-q-${i}`}>
      <div className="text-sm font-medium text-slate-200"><span className="font-mono text-cyan-400 mr-2">{i + 1}.</span>{q.text}</div>
      <div className="grid sm:grid-cols-2 gap-2">{q.options.map((o, j) => {
        const right = done && j === q.answer, wrong = done && pick === j && j !== q.answer;
        return <button key={j} type="button" disabled={done} onClick={() => onPick(j)} data-testid={`lesson-quiz-option-${i}-${j}`}
          className={`text-left text-sm px-3 py-2 border rounded-sm transition-colors ${right ? "border-green-400 bg-green-500/10 text-green-200" : wrong ? "border-red-400 bg-red-500/10 text-red-200" : pick === j ? "border-cyan-400 bg-cyan-500/10 text-cyan-100" : "border-white/10 text-slate-300 hover:border-cyan-400/50"}`}>{o}</button>;
      })}</div>
      {done && <div className={`text-xs flex gap-1.5 ${pick === q.answer ? "text-green-300" : "text-red-300"}`} data-testid={`lesson-quiz-feedback-${i}`}>
        {pick === q.answer ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-px" /> : <XCircle className="h-3.5 w-3.5 shrink-0 mt-px" />}<span className="text-slate-400">{q.explanation}</span></div>}
    </div>);
}

export function LessonQuiz({ quiz }) {
  const [picks, setPicks] = useState({});
  const [done, setDone] = useState(false);
  const qs = quiz?.questions || [];
  if (!qs.length) return null;
  const score = qs.filter((q, i) => picks[i] === q.answer).length;
  return (
    <div className="mt-8 glass rounded-sm p-5 space-y-5" data-testid="lesson-quiz">
      <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-yellow-300" /><span className="eyebrow !mb-0 flex-1">check your understanding</span>
        <span className="text-[10px] font-mono uppercase text-slate-500">practice only · no XP</span></div>
      {qs.map((q, i) => <Question key={q.id || i} q={q} i={i} pick={picks[i]} done={done} onPick={(j) => setPicks({ ...picks, [i]: j })} />)}
      <div className="flex items-center gap-3 pt-1">
        {done ? <><span className={`font-mono text-sm ${score === qs.length ? "text-green-300" : "text-yellow-200"}`} data-testid="lesson-quiz-score">{score}/{qs.length} correct</span>
          <button className="ghost-btn !text-xs" onClick={() => { setPicks({}); setDone(false); }} data-testid="lesson-quiz-retry"><RotateCcw className="h-3.5 w-3.5" />Try again</button></>
          : <button className="glow-btn !text-xs" disabled={Object.keys(picks).length < qs.length} onClick={() => setDone(true)} data-testid="lesson-quiz-check">Check answers</button>}
      </div>
    </div>);
}
