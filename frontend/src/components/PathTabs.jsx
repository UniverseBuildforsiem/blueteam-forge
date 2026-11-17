import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ListChecks, FileText, Flag, Radar, Search, Lock, Eye, Map as MapIcon, NotebookPen } from "lucide-react";
import { api } from "../lib/api";
import { Glass, SeverityBadge } from "./common";

export const PATH_TABS = [["lessons", "Lessons", BookOpen], ["map", "Progress Map", MapIcon], ["quizzes", "Quizzes", ListChecks], ["sops", "SOPs", FileText], ["ctf", "CTF Arena", Flag], ["intel", "Threat Intel", Radar], ["notes", "My Notes", NotebookPen]];

export function pathItems(p, type) {
  const done = new Set(p.completed_lessons), out = new Map();
  p.modules.forEach((m) => m.lessons.forEach((l) => (l.attachments || []).filter((a) => a.type === type).forEach((a) => {
    const k = String(a.id), prev = out.get(k), open = done.has(l.id);
    if (!prev || (open && !prev.unlocked)) out.set(k, { id: a.id, title: a.title, lesson: l.title || "Untitled lesson", unlocked: open });
  })));
  if (type === "quiz" && p.final_quiz) {
    const all = p.modules.every((m) => m.lessons.every((l) => done.has(l.id)));
    out.set(String(p.final_quiz.id), { id: p.final_quiz.id, title: p.final_quiz.title, final: true, lesson: "every lesson", unlocked: all });
  }
  return out;
}

export function newUnlocks(before, after) {
  return ["quiz", "sop", "ctf"].flatMap((t) => { const b = pathItems(before, t);
    return [...pathItems(after, t).entries()].filter(([k, it]) => it.unlocked && !b.get(k)?.unlocked).map(([, it]) => ({ ...it, type: t })); });
}

const TAB_TYPE = { quizzes: "quiz", sops: "sop", ctf: "ctf" };
export const visibleTabs = (p) => PATH_TABS.filter(([id]) => !TAB_TYPE[id] || pathItems(p, TAB_TYPE[id]).size > 0);

export const LockNote = ({ it }) => <div className="text-[11px] font-mono text-yellow-300/90 mt-2 inline-flex items-start gap-1.5" data-testid={`path-item-locked-${it.id}`}><Lock className="h-3.5 w-3.5 shrink-0 mt-px" />Complete {it.final ? "every lesson" : <>lesson “{it.lesson}”</>} to unlock</div>;

export function PathQuizzes({ p }) {
  const items = pathItems(p, "quiz");
  const [meta, setMeta] = useState({});
  useEffect(() => { api.get("/quizzes").then((r) => setMeta(Object.fromEntries(r.data.map((q) => [String(q.id), q])))); }, []);
  return <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="path-quizzes">{[...items.values()].map((it) => { const q = meta[String(it.id)] || {};
    return <Glass key={it.id} className={`p-5 flex flex-col ${it.unlocked ? "" : "opacity-70"}`} data-testid={`quiz-card-${it.id}`}>
      <div className="flex justify-between text-xs font-mono"><span className={it.final ? "text-orange-300" : "text-cyan-400"}>{it.final ? "FINAL EXAM" : q.topic || "Quiz"}</span>
        <span className="text-slate-500">{q.question_count != null && `${q.question_count} Q`}{q.time_limit_sec ? ` · ${Math.round(q.time_limit_sec / 60)} min` : ""}</span></div>
      <div className="font-bold mt-2 flex-1">{q.title || it.title}</div>
      {it.unlocked ? <div className="flex items-center justify-between mt-4"><span className="text-xs font-mono text-slate-400">best: {q.best_score ?? "—"}{q.best_score != null && "%"}</span>
        <Link to={`/app/quizzes/${it.id}`} className="ghost-btn !py-1.5" data-testid={`quiz-start-${it.id}`}>{q.best_score != null ? "Retry" : "Start"}</Link></div> : <LockNote it={it} />}
    </Glass>; })}</div>;
}

export function PathTabBar({ p, tab, setTab }) {
  return (
    <div className="sticky top-[61px] lg:top-0 z-10 -mx-5 sm:-mx-8 px-5 sm:px-8 pt-4 mb-6 bg-[#0B0F1A]/90 backdrop-blur-xl border-b border-cyan-500/20" data-testid="path-tab-header">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl sm:text-2xl font-bold truncate" data-testid="path-title">{p.title}</h1>
        <span className="text-xs font-mono text-green-400">{p.level} · {p.percent}% complete</span>
        {p.video_lessons?.length > 0 && <span className="text-xs font-mono text-cyan-300 inline-flex items-center gap-1" data-testid="path-videos-watched"><Eye className="h-3.5 w-3.5" />videos watched {p.watched_lessons.length}/{p.video_lessons.length}</span>}
      </div>
      <div className="flex gap-1 mt-3 overflow-x-auto pr-8 sm:pr-0 [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:[mask-image:none]" data-testid="path-tabs">
        {visibleTabs(p).map(([id, l, I]) => <button key={id} onClick={() => { setTab(id); window.scrollTo({ top: 0 }); }} data-testid={`path-tab-${id}`}
          className={`px-4 py-2 text-xs font-mono border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${tab === id ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}><I className="h-3.5 w-3.5" />{l}</button>)}
      </div>
    </div>);
}

export function PathSops({ p }) {
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.get("/public/sops").then((r) => setD(r.data)); }, []);
  const items = pathItems(p, "sop");
  const shown = (d?.sops || []).filter((s) => items.has(String(s.id)) && (!q || `${s.title} ${s.category}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div data-testid="path-sops">
      <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 rounded-sm max-w-sm mb-5"><Search className="h-4 w-4 text-slate-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SOPs" className="bg-transparent py-2 text-sm outline-none flex-1" data-testid="path-sops-search" /></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{shown.map((s) => { const it = items.get(String(s.id));
        const card = <Glass className={`p-5 h-full transition-colors ${it.unlocked ? "hover:border-cyan-400/50" : "opacity-70"}`}>
          <div className="flex items-center gap-2 text-[11px] font-mono"><SeverityBadge level={s.severity} /><span className="text-cyan-400 truncate">{s.category}</span>
            {(!it.unlocked || s.locked) && <Lock className="h-3.5 w-3.5 text-slate-500 ml-auto" />}</div>
          <div className="font-bold text-sm mt-3">{s.title}</div>
          <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{s.summary}</p>
          {!it.unlocked && <LockNote it={it} />}
        </Glass>;
        return it.unlocked ? <Link key={s.id} to={`/sops/${s.id}`} data-testid={`path-sop-${s.id}`}>{card}</Link> : <div key={s.id} data-testid={`path-sop-${s.id}`} aria-disabled="true">{card}</div>; })}</div>
    </div>);
}
