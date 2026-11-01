import { useState } from "react";
import { ListChecks, RefreshCw, Trash2, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Switch } from "./ui/switch";

export const MIN_CONTENT = 150;

export const RequiredToggle = ({ on, set, tid = "lesson-quiz-required" }) => (
  <label className="flex items-center gap-2 mt-2 text-xs text-slate-300 cursor-pointer select-none">
    <Switch checked={on} onCheckedChange={set} data-testid={tid} />Required to complete the lesson <span className="font-mono text-[10px] text-slate-500">(pass 3/5 · auto-completes, +10 XP)</span></label>);

export function QuestionEditor({ q, i, up }) {
  return (
    <div className="border border-white/10 p-3 space-y-2" data-testid={`quiz-draft-question-${i}`}>
      <div className="flex gap-2 items-start"><span className="font-mono text-[11px] text-cyan-400 pt-2">Q{i + 1}</span>
        <textarea className="field text-sm h-16" value={q.text} onChange={(e) => up({ ...q, text: e.target.value })} data-testid={`quiz-draft-text-${i}`} /></div>
      {q.options.map((o, j) => <div key={j} className="flex items-center gap-2 pl-6">
        <button type="button" onClick={() => up({ ...q, answer: j })} title="Mark as correct answer" data-testid={`quiz-draft-correct-${i}-${j}`}
          className={`h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors ${q.answer === j ? "border-green-400 bg-green-500/20 text-green-300" : "border-white/20 text-transparent hover:border-green-400/60"}`}><Check className="h-3 w-3" /></button>
        <input className="field text-xs" value={o} onChange={(e) => up({ ...q, options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} data-testid={`quiz-draft-option-${i}-${j}`} /></div>)}
      <input className="field text-xs ml-6 !w-[calc(100%-1.5rem)]" placeholder="Why the answer is correct" value={q.explanation} onChange={(e) => up({ ...q, explanation: e.target.value })} data-testid={`quiz-draft-explanation-${i}`} />
    </div>);
}

export async function generate(l, level) {
  const { data: job } = await api.post("/builder/lesson-quiz", { title: l.title, content: l.content, level });
  for (let i = 0; i < 60; i++) {
    await new Promise((res) => setTimeout(res, 3000));
    const r = (await api.get(`/builder/jobs/${job.job_id}`)).data;
    if (r.status !== "running") return r;
  }
  return { status: "error", error: "The quiz generator took too long — please try again" };
}

export function LessonQuizBuilder({ l, upL, level }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const ready = (l.content || "").trim().length >= MIN_CONTENT;
  const run = async () => {
    setBusy(true);
    try { const r = await generate(l, level); if (r.status === "done") { setDraft(r.questions); toast.success("Quiz drafted — review it, then attach"); } else toast.error(r.error); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const attach = () => {
    if (draft.some((q) => !q.text.trim() || q.options.some((o) => !o.trim()))) return toast.error("Fill in every question and option first");
    upL((cur) => ({ ...cur, quiz: { questions: draft, required: !!cur.quiz?.required } })); setDraft(null); toast.success("Quiz attached — Save the path to publish it");
  };
  const remove = () => window.confirm("Remove this lesson's quiz?") && upL((cur) => { const { quiz, ...rest } = cur; return rest; });
  const n = l.quiz?.questions?.length || 0;
  return (
    <div className="mt-3 border border-dashed border-yellow-400/25 p-3" data-testid="lesson-quiz-builder">
      <div className="flex flex-wrap items-center gap-2"><ListChecks className="h-3.5 w-3.5 text-yellow-300" />
        <span className="text-xs text-slate-300 flex-1" data-testid="lesson-quiz-status">{draft ? "Review the draft quiz — click a circle to set the correct answer" : n ? `${n}-question ${l.quiz.required ? "required" : "practice"} quiz attached` : "Lesson quiz (optional — mark it required after attaching)"}</span>
        {!draft && n > 0 && <><button className="ghost-btn !text-xs !py-1" onClick={() => setDraft(l.quiz.questions)} data-testid="lesson-quiz-edit"><Pencil className="h-3 w-3" />Edit</button>
          <button className="ghost-btn !text-xs !py-1 hover:!text-red-300" onClick={remove} data-testid="lesson-quiz-remove"><Trash2 className="h-3 w-3" />Remove</button></>}
        {!draft && <button className="glow-btn !text-xs !py-1" onClick={run} disabled={busy || !ready} data-testid="lesson-quiz-generate">
          <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />{busy ? "Generating (about 30s)..." : n ? "Regenerate" : "Generate 5-question quiz"}</button>}
      </div>
      {!draft && n > 0 && <RequiredToggle on={!!l.quiz.required} set={(v) => upL((cur) => ({ ...cur, quiz: { ...cur.quiz, required: v } }))} />}
      {!ready && !draft && <div className="text-[11px] font-mono text-slate-500 mt-2" data-testid="lesson-quiz-need-content">add at least {MIN_CONTENT} characters of lesson content (or use “Write this lesson”) to generate a quiz</div>}
      {draft && <div className="space-y-2 mt-3" data-testid="lesson-quiz-draft">
        {draft.map((q, i) => <QuestionEditor key={q.id} q={q} i={i} up={(nq) => setDraft(draft.map((x, k) => (k === i ? nq : x)))} />)}
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="glow-btn !text-xs" onClick={attach} data-testid="lesson-quiz-attach"><Check className="h-3.5 w-3.5" />Attach quiz to lesson</button>
          <button className="ghost-btn !text-xs" onClick={run} disabled={busy} data-testid="lesson-quiz-regenerate"><RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />{busy ? "Generating..." : "Regenerate"}</button>
          <button className="ghost-btn !text-xs" onClick={() => setDraft(null)} data-testid="lesson-quiz-discard">Discard</button>
        </div></div>}
    </div>);
}
