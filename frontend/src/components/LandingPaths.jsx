import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Lock, PlayCircle, ListChecks, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

const IMG = "https://static.prod-images.emergentagent.com/jobs/19e1c124-b2d9-4563-9c5a-30ef0e507345/images/";
const ART = {
  "soc-fundamentals": "e5d3f9d7c0048857712fb5de16695ba7a7e5aefe7ff081ce52368adf4a9953f7.jpeg",
  "soc-l1": "e2cbfc2ac8d848e545da708ac87632b29006621b6809ca7353dcc08bc9278d24.jpeg",
  "soc-l2": "2836df60f7f04f044db858b2649587bbcfc1f5da5759e6c048134424c8419723.jpeg",
  "incident-response": "fdcdf963d001528a790d8d939e7c6a9f9a59c705393c56c53917af449fea88f5.jpeg",
  "interview-prep": "e976bc0122931f326c310dd9790a03fd0ba283d7f416a1c0133bb3a0beb93dea.jpeg",
};
const art = (id) => IMG + (ART[id] || ART["soc-fundamentals"]);
const hrs = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`);

function PathCard({ p, i, onOpen }) {
  const big = i < 2;
  return (
    <motion.div initial={{ opacity: 0, y: 40, x: i % 2 ? 24 : -24 }} whileInView={{ opacity: 1, y: 0, x: 0 }} viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }} className={big ? "md:col-span-3" : "md:col-span-2"}>
      <button type="button" onClick={() => onOpen(p)} data-testid={`landing-path-${p.id}`} className={`path-card group relative block w-full text-left overflow-hidden rounded-sm border border-cyan-500/15 ${big ? "h-80" : "h-72"}`}>
        <img src={art(p.id)} alt={p.title} loading="lazy" className="path-img absolute inset-0 h-full w-full object-cover" style={{ animationDelay: `${-i * 3}s` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F1A] via-[#0B0F1A]/70 to-transparent" />
        <div className="path-scan pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-transparent via-cyan-400/15 to-transparent" />
        <span className="absolute top-4 left-4 font-mono text-xs bg-black/60 border border-cyan-500/30 text-cyan-300 px-2 py-0.5">0{i + 1}</span>
        <span className="absolute top-4 right-4 font-mono text-[11px] bg-black/60 border border-green-500/30 text-green-300 px-2 py-0.5" data-testid={`landing-path-level-${p.id}`}>{p.level}</span>
        <div className="absolute inset-x-0 bottom-0 p-6">
          <h3 className={`font-mono font-bold group-hover:text-cyan-300 transition-colors ${big ? "text-2xl" : "text-xl"}`}>{p.title}</h3>
          <p className="text-sm text-slate-300 mt-2 line-clamp-2 max-w-xl">{p.description}</p>
          <span className="inline-flex items-center gap-2 mt-3 text-xs font-mono text-green-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-300">Preview modules & lessons <ArrowRight className="h-3.5 w-3.5" /></span>
        </div>
      </button>
    </motion.div>);
}

const Stat = ({ icon: I, v, l }) => <div className="flex items-center gap-2 text-xs font-mono text-slate-300"><I className="h-3.5 w-3.5 text-cyan-400" /><span className="font-bold">{v}</span><span className="text-slate-500">{l}</span></div>;

function PathPreview({ p, onClose }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); if (p) api.get(`/public/paths/${p.id}/outline`).then((r) => setD(r.data)).catch(() => setD({ error: true })); }, [p]);
  const start = () => {
    if (user) return nav(`/app/paths/${p.id}`);
    localStorage.setItem("pending_path", JSON.stringify({ id: p.id, at: Date.now() }));
    nav("/register");
  };
  const pricing = () => { onClose(); setTimeout(() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" }), 200); };
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-[#0B0F1A] border-cyan-500/30 max-h-[90vh] flex flex-col" data-testid="path-preview">
        {p && <>
          <div className="relative h-40 shrink-0 overflow-hidden"><img src={art(p.id)} alt="" className="path-img absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F1A] to-[#0B0F1A]/20" />
            <div className="absolute bottom-4 left-6 right-12"><span className="font-mono text-[11px] border border-green-500/30 bg-black/60 text-green-300 px-2 py-0.5">{p.level}</span>
              <DialogTitle className="text-2xl font-mono font-bold mt-2" data-testid="path-preview-title">{p.title}</DialogTitle></div></div>
          <div className="px-6 pb-6 overflow-y-auto">
            <DialogDescription className="text-sm text-slate-400">{p.description}</DialogDescription>
            {d && !d.error && <>
              <div className="flex flex-wrap gap-5 mt-4 pb-4 border-b border-white/10" data-testid="path-preview-stats">
                <Stat icon={Layers} v={d.modules.length} l="modules" /><Stat icon={ListChecks} v={d.lesson_count} l="lessons" /><Stat icon={Clock} v={hrs(d.minutes)} l="total" />
                {d.videos > 0 && <Stat icon={PlayCircle} v={d.videos} l="videos" />}{d.quizzes > 0 && <Stat icon={ListChecks} v={d.quizzes} l="graded quizzes" />}
              </div>
              <div className="mt-4 space-y-4" data-testid="path-preview-modules">
                {d.modules.map((m, mi) => (
                  <motion.div key={mi} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: mi * 0.08 }} data-testid={`path-preview-module-${mi}`}>
                    <div className="flex items-baseline gap-3"><span className="font-mono text-xs text-cyan-400">M{String(mi + 1).padStart(2, "0")}</span><span className="font-bold">{m.title}</span><span className="ml-auto text-[11px] font-mono text-slate-500">{m.lessons.length} lessons</span></div>
                    <ul className="mt-2 border-l border-white/10 ml-1.5">{m.lessons.map((l, li) => (
                      <li key={li} className="flex items-center gap-3 pl-4 py-1.5 text-sm text-slate-300"><Lock className="h-3 w-3 text-slate-600 shrink-0" /><span className="flex-1">{l.title}</span>
                        {l.video && <PlayCircle className="h-3.5 w-3.5 text-slate-500" />}{l.quiz && <span className="text-[10px] font-mono text-amber-300">quiz</span>}
                        <span className="text-[11px] font-mono text-slate-500 w-10 text-right">{l.minutes}m</span></li>))}</ul>
                  </motion.div>))}
              </div>
            </>}
            {!d && <div className="py-10 text-center text-xs font-mono text-slate-500">// loading outline...</div>}
            {d?.error && <div className="py-10 text-center text-xs font-mono text-slate-500">// outline unavailable right now</div>}
          </div>
          <div className="shrink-0 border-t border-white/10 px-6 py-4 flex flex-wrap items-center gap-3 bg-black/40">
            <span className="text-xs text-slate-400 flex-1">{user ? "Pick up right where you left off." : "Free to start. Lesson content unlocks after sign up."}</span>
            {!user && <button onClick={pricing} className="ghost-btn !text-xs" data-testid="path-preview-pricing">View pricing</button>}
            <button onClick={start} className="glow-btn !text-xs" data-testid="path-preview-start">{user ? "Open this path" : "Sign up to start this path"} <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </>}
      </DialogContent>
    </Dialog>);
}

export default function LandingPaths({ paths }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <div className="grid md:grid-cols-6 gap-5" data-testid="landing-paths-grid">{paths.map((p, i) => <PathCard key={p.id} p={p} i={i} onOpen={setOpen} />)}</div>
      <PathPreview p={open} onClose={() => setOpen(null)} />
    </>);
}
