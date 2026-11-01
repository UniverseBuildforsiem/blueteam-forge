import { useRef, useState } from "react";
import { Layers, CheckCircle2, Loader2, AlertTriangle, SkipForward, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { QuestionEditor, RequiredToggle, generate, MIN_CONTENT } from "./LessonQuizBuilder";

const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const ICON = { queued: <span className="h-3.5 w-3.5 rounded-full border border-white/20" />, running: <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />,
  ready: <span className="h-2 w-2 rounded-full bg-yellow-300" />, error: <AlertTriangle className="h-3.5 w-3.5 text-red-400" />, attached: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  skipped: <SkipForward className="h-3.5 w-3.5 text-slate-500" /> };

function plan(mods) {
  const all = mods.flatMap((m) => m.lessons);
  return { targets: all.filter((l) => !l.quiz?.questions?.length && (l.content || "").trim().length >= MIN_CONTENT),
    short: all.filter((l) => !l.quiz?.questions?.length && (l.content || "").trim().length < MIN_CONTENT), has: all.filter((l) => l.quiz?.questions?.length).length };
}

function Review({ item, onAttach, onSkip, onRetry }) {
  const [qs, setQs] = useState(item.questions);
  const [req, setReq] = useState(false);
  const attach = () => (qs.some((q) => !q.text.trim() || q.options.some((o) => !o.trim())) ? toast.error("Fill in every question and option first") : onAttach(qs, req));
  return (
    <div className="space-y-2" data-testid="bulk-quiz-review">
      <div className="font-bold text-sm" data-testid="bulk-quiz-review-title">{item.title}</div>
      <div className="max-h-[52vh] overflow-y-auto space-y-2 pr-1">{qs.map((q, i) => <QuestionEditor key={q.id} q={q} i={i} up={(nq) => setQs(qs.map((x, k) => (k === i ? nq : x)))} />)}</div>
      <RequiredToggle on={req} set={setReq} tid="bulk-quiz-required" />
      <div className="flex flex-wrap gap-2 pt-1">
        <button className="glow-btn !text-xs" onClick={attach} data-testid="bulk-quiz-attach"><Check className="h-3.5 w-3.5" />Attach & next</button>
        <button className="ghost-btn !text-xs" onClick={onRetry} data-testid="bulk-quiz-regenerate"><RefreshCw className="h-3 w-3" />Regenerate</button>
        <button className="ghost-btn !text-xs" onClick={onSkip} data-testid="bulk-quiz-skip"><SkipForward className="h-3 w-3" />Skip</button>
      </div>
    </div>);
}

export function BulkQuiz({ mods, updateLesson, level }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(null);
  const live = useRef(false);
  const p = plan(mods);
  const patch = (id, v) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...v } : x)));
  const runOne = async (l) => {
    patch(l.id, { status: "running" });
    try { const r = await generate(l, level); if (!live.current) return; r.status === "done" ? patch(l.id, { status: "ready", questions: r.questions }) : patch(l.id, { status: "error", error: r.error }); }
    catch (e) { patch(l.id, { status: "error", error: "generation failed" }); }
  };
  const start = async () => {
    const queue = [...p.targets];
    setItems(queue.map((l) => ({ id: l.id, title: l.title, status: "queued" })));
    live.current = true;
    const worker = async () => { while (queue.length && live.current) await runOne(queue.shift()); };
    await Promise.all([worker(), worker(), worker()]);
  };
  const close = (v) => {
    if (v) return setOpen(true);
    if (items.some((x) => ["queued", "running", "ready"].includes(x.status)) && !window.confirm("Close? Drafts you haven't attached will be lost.")) return;
    live.current = false; setOpen(false); setItems([]); setSel(null);
  };
  const ready = items.filter((x) => x.status === "ready");
  const current = items.find((x) => x.id === sel && x.status === "ready") || ready[0];
  const next = (id, v) => { patch(id, v); setSel(null); };
  const done = items.filter((x) => x.status === "attached").length;
  return (<>
    <button className="ghost-btn !text-xs" onClick={() => setOpen(true)} data-testid="bulk-quiz-open"><Layers className="h-3.5 w-3.5" />Quiz all lessons</button>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-4xl" data-testid="bulk-quiz-dialog">
        <DialogHeader><DialogTitle className="font-mono">Quiz all lessons</DialogTitle></DialogHeader>
        {!items.length ? <div className="space-y-3 text-sm" data-testid="bulk-quiz-plan">
          <div><span className="text-green-300 font-mono" data-testid="bulk-quiz-target-count">{p.targets.length}</span> {p.targets.length === 1 ? "lesson" : "lessons"} will get an AI-drafted 5-question quiz for you to review one by one.</div>
          {p.has > 0 && <div className="text-slate-400 text-xs" data-testid="bulk-quiz-has-count">{pl(p.has, "lesson")} already {p.has === 1 ? "has" : "have"} a quiz and will be skipped.</div>}
          {p.short.length > 0 && <div className="text-slate-400 text-xs" data-testid="bulk-quiz-short-count">{pl(p.short.length, "lesson")} {p.short.length === 1 ? "has" : "have"} under {MIN_CONTENT} characters of content and will be skipped: <span className="text-slate-500">{p.short.map((l) => l.title).join(" · ")}</span></div>}
          <button className="glow-btn" disabled={!p.targets.length} onClick={start} data-testid="bulk-quiz-start">Generate {p.targets.length === 1 ? "1 quiz" : `${p.targets.length} quizzes`}</button>
        </div> : <div className="grid md:grid-cols-[240px_1fr] gap-4">
          <div className="space-y-1 max-h-[62vh] overflow-y-auto pr-1" data-testid="bulk-quiz-list">
            <div className="text-[11px] font-mono text-slate-500 mb-2" data-testid="bulk-quiz-progress">{done} attached · {ready.length} to review · {items.filter((x) => ["queued", "running"].includes(x.status)).length} generating</div>
            {items.map((x, i) => <button key={x.id} disabled={x.status !== "ready"} onClick={() => setSel(x.id)} data-testid={`bulk-quiz-item-${i}`} title={x.error}
              className={`w-full flex items-center gap-2 text-left text-xs px-2 py-1.5 border-l-2 ${current?.id === x.id ? "border-yellow-300 bg-yellow-500/5" : "border-transparent"} ${x.status === "ready" ? "hover:bg-white/5" : "opacity-70"}`}>
              <span className="w-4 flex justify-center shrink-0">{ICON[x.status]}</span><span className="truncate">{x.title}</span></button>)}
          </div>
          {current ? <Review key={current.id} item={current} onSkip={() => next(current.id, { status: "skipped" })} onRetry={() => { setSel(null); runOne(mods.flatMap((m) => m.lessons).find((l) => l.id === current.id)); }}
            onAttach={(qs, req) => { updateLesson(current.id, (l) => ({ ...l, quiz: { questions: qs, required: req } })); next(current.id, { status: "attached" }); }} />
            : <div className="text-sm text-slate-400 flex items-center justify-center min-h-[200px]" data-testid="bulk-quiz-waiting">
              {items.some((x) => ["queued", "running"].includes(x.status)) ? "Drafting quizzes — the first one appears here in about 30 seconds..." : `All done — ${done === 1 ? "1 quiz" : `${done} quizzes`} attached. Close this window and Save the path.`}</div>}
        </div>}
      </DialogContent>
    </Dialog>
  </>);
}
