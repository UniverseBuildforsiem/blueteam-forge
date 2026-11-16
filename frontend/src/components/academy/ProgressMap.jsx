import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Lock, ListChecks, FileText, Flag, Award, PartyPopper, ArrowRight, PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Glass } from "../common";

const KIND = { quiz: ["Quiz", ListChecks, "quizzes", (i) => `/app/quizzes/${i.id}`], sop: ["SOP", FileText, "sops", (i) => `/sops/${i.id}`], ctf: ["CTF", Flag, "ctf", null] };
const GATED = Object.keys(KIND);

function Chip({ a, open }) {
  const [label, I] = KIND[a.type];
  return <span className={`inline-flex items-center gap-1 text-[10px] font-mono border px-1.5 py-0.5 ${open ? "border-green-500/40 text-green-300" : "border-white/15 text-slate-400"}`} data-testid={`map-chip-${a.type}-${a.id}`}>
    {open ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}<I className="h-3 w-3" />{label}: <span className="truncate max-w-[180px]">{a.title}</span></span>;
}

function Node({ l, state, open, idx }) {
  const gated = (l.attachments || []).filter((a) => GATED.includes(a.type));
  const dot = state === "done" ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : state === "next" ? <PlayCircle className="h-5 w-5 text-cyan-300" /> : <Circle className="h-5 w-5 text-slate-600" />;
  return <li className="relative pl-10" data-testid={`map-lesson-${l.id}`}>
    <span className={`absolute left-0 top-1 grid place-items-center h-8 w-8 rounded-full bg-[#0B0F1A] border ${state === "next" ? "border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,.5)]" : state === "done" ? "border-green-500/50" : "border-white/15"}`}>{dot}</span>
    <button onClick={() => open(l)} className={`w-full text-left border px-4 py-3 transition-colors ${state === "next" ? "border-cyan-400/50 bg-cyan-500/5" : "border-white/10 hover:border-white/25"}`} data-testid={`map-open-${l.id}`}>
      <div className="flex items-center gap-2"><span className="text-[10px] font-mono text-slate-500">L{idx}</span><span className="font-semibold text-sm flex-1 truncate">{l.title || "Untitled lesson"}</span>
        <span className={`text-[10px] font-mono uppercase ${state === "done" ? "text-green-400" : state === "next" ? "text-cyan-300" : "text-slate-500"}`}>{state === "done" ? "completed" : state === "next" ? "up next" : `${l.minutes || 0} min`}</span></div>
      {gated.length > 0 ? <div className="flex flex-wrap gap-1.5 mt-2">{gated.map((a) => <Chip key={`${a.type}-${a.id}`} a={a} open={state === "done"} />)}</div>
        : <div className="text-[11px] text-slate-600 mt-1">No unlocks in this lesson</div>}
    </button>
  </li>;
}

export function ProgressMap({ p, open }) {
  const done = new Set(p.completed_lessons);
  const all = p.modules.flatMap((m) => m.lessons);
  const nextId = all.find((l) => !done.has(l.id))?.id;
  const gated = all.flatMap((l) => (l.attachments || []).filter((a) => GATED.includes(a.type)).map((a) => ({ a, d: done.has(l.id) })));
  const opened = gated.filter((g) => g.d).length;
  let n = 0;
  return <div className="max-w-3xl space-y-5" data-testid="progress-map">
    <Glass className="p-5 flex flex-wrap items-center gap-6">
      <div><div className="text-[10px] font-mono uppercase text-slate-500">Lessons</div><div className="font-mono font-bold text-cyan-300" data-testid="map-lessons-count">{done.size}/{all.length}</div></div>
      <div><div className="text-[10px] font-mono uppercase text-slate-500">Unlocked</div><div className="font-mono font-bold text-green-300" data-testid="map-unlocked-count">{opened}/{gated.length}</div></div>
      <div className="flex-1 min-w-[160px]"><div className="h-1.5 bg-white/5"><div className="h-1.5 bg-gradient-to-r from-cyan-400 to-green-400 transition-[width] duration-700" style={{ width: `${all.length ? (done.size / all.length) * 100 : 0}%` }} /></div>
        <div className="text-[11px] text-slate-500 mt-1.5">Finish a lesson to unlock the quizzes, SOPs and CTFs attached to it.</div></div>
    </Glass>
    {p.modules.map((m, mi) => <section key={m.id}>
      <div className="eyebrow mb-3">module {mi + 1} · {m.title}</div>
      <ol className="relative space-y-3 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-white/10">
        {m.lessons.map((l) => <Node key={l.id} l={l} idx={++n} open={open} state={done.has(l.id) ? "done" : l.id === nextId ? "next" : "todo"} />)}
      </ol></section>)}
    {p.final_quiz && <Glass className={`p-4 flex items-center gap-3 ${!nextId ? "border-orange-400/50" : ""}`} data-testid="map-final-exam">
      <Award className={`h-5 w-5 ${!nextId ? "text-orange-300" : "text-slate-600"}`} /><div className="flex-1"><div className="font-semibold text-sm">Final exam · {p.final_quiz.title}</div><div className="text-[11px] text-slate-500">{nextId ? "Unlocks after every lesson is complete" : "Unlocked: pass it to earn your certificate"}</div></div>
      {!nextId ? <Link to={`/app/quizzes/${p.final_quiz.id}`} className="glow-btn !text-xs" data-testid="map-final-exam-open">Start</Link> : <Lock className="h-4 w-4 text-slate-500" />}
    </Glass>}
  </div>;
}

export function UnlockCelebration({ party, onClose, goTab }) {
  return <Dialog open={!!party} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="bg-[#0B0F1A] border-green-400/40 max-w-md shadow-[0_0_40px_rgba(74,222,128,.25)] animate-in zoom-in-95 fade-in duration-300" data-testid="unlock-celebration">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><PartyPopper className="h-5 w-5 text-green-400 animate-bounce" />New content unlocked!</DialogTitle></DialogHeader>
      <p className="text-sm text-slate-400">Completing “{party?.lesson}” unlocked:</p>
      <ul className="space-y-2">{party?.items.map((it) => { const [label, I, tab, to] = KIND[it.type];
        const inner = <><span className="h-8 w-8 grid place-items-center border border-green-500/40 bg-green-500/10"><I className="h-4 w-4 text-green-300" /></span>
          <span className="flex-1 min-w-0"><span className="block text-[10px] font-mono uppercase text-green-400">{it.final ? "Final exam" : label}</span><span className="block text-sm truncate">{it.title}</span></span><ArrowRight className="h-4 w-4 text-slate-500" /></>;
        const cls = "w-full flex items-center gap-3 border border-white/10 hover:border-green-400/50 px-3 py-2 text-left transition-colors";
        return <li key={`${it.type}-${it.id}`}>{to ? <Link to={to(it)} className={cls} data-testid={`unlock-open-${it.type}-${it.id}`}>{inner}</Link>
          : <button onClick={() => goTab(tab)} className={cls} data-testid={`unlock-open-${it.type}-${it.id}`}>{inner}</button>}</li>; })}</ul>
      <button className="ghost-btn !text-xs self-end" onClick={onClose} data-testid="unlock-celebration-close">Keep learning</button>
    </DialogContent>
  </Dialog>;
}
