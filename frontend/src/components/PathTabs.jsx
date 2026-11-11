import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ListChecks, FileText, Flag, Radar, Search, Lock, Eye } from "lucide-react";
import { api } from "../lib/api";
import { Glass, SeverityBadge } from "./common";

export const PATH_TABS = [["lessons", "Lessons", BookOpen], ["quizzes", "Quizzes", ListChecks], ["sops", "SOPs", FileText], ["ctf", "CTF Arena", Flag], ["intel", "Threat Intel", Radar]];

export function PathTabBar({ p, tab, setTab }) {
  return (
    <div className="sticky top-[61px] lg:top-0 z-10 -mx-5 sm:-mx-8 px-5 sm:px-8 pt-4 mb-6 bg-[#0B0F1A]/90 backdrop-blur-xl border-b border-cyan-500/20" data-testid="path-tab-header">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl sm:text-2xl font-bold truncate" data-testid="path-title">{p.title}</h1>
        <span className="text-xs font-mono text-green-400">{p.level} · {p.percent}% complete</span>
        {p.video_lessons?.length > 0 && <span className="text-xs font-mono text-cyan-300 inline-flex items-center gap-1" data-testid="path-videos-watched"><Eye className="h-3.5 w-3.5" />videos watched {p.watched_lessons.length}/{p.video_lessons.length}</span>}
      </div>
      <div className="flex gap-1 mt-3 overflow-x-auto" data-testid="path-tabs">
        {PATH_TABS.map(([id, l, I]) => <button key={id} onClick={() => { setTab(id); window.scrollTo({ top: 0 }); }} data-testid={`path-tab-${id}`}
          className={`px-4 py-2 text-xs font-mono border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${tab === id ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}><I className="h-3.5 w-3.5" />{l}</button>)}
      </div>
    </div>);
}

export function PathSops({ p }) {
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.get("/public/sops").then((r) => setD(r.data)); }, []);
  const inPath = new Set(p.modules.flatMap((m) => m.lessons.flatMap((l) => (l.attachments || []).filter((a) => a.type === "sop").map((a) => String(a.id)))));
  const shown = (d?.sops || []).filter((s) => !q || `${s.title} ${s.category}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => inPath.has(String(b.id)) - inPath.has(String(a.id)));
  return (
    <div data-testid="path-sops">
      <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 rounded-sm max-w-sm mb-5"><Search className="h-4 w-4 text-slate-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SOPs" className="bg-transparent py-2 text-sm outline-none flex-1" data-testid="path-sops-search" /></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{shown.map((s) => (
        <Link key={s.id} to={`/sops/${s.id}`} data-testid={`path-sop-${s.id}`}>
          <Glass className="p-5 h-full hover:border-cyan-400/50 transition-colors">
            <div className="flex items-center gap-2 text-[11px] font-mono"><SeverityBadge level={s.severity} /><span className="text-cyan-400 truncate">{s.category}</span>
              {inPath.has(String(s.id)) && <span className="ml-auto text-green-400 border border-green-500/30 px-1.5" data-testid={`path-sop-inpath-${s.id}`}>in this path</span>}
              {s.locked && <Lock className="h-3.5 w-3.5 text-slate-500 ml-auto" />}</div>
            <div className="font-bold text-sm mt-3">{s.title}</div>
            <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{s.summary}</p>
          </Glass></Link>))}</div>
    </div>);
}
