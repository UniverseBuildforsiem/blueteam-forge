import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowUpRight, PlayCircle, ClipboardCheck, FileText, FlaskConical, Flag, Flame, Terminal, BookOpen, ShieldCheck, CheckCircle2, GraduationCap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

const TYPE_ICON = { Videos: PlayCircle, Tests: ClipboardCheck, Files: FileText };
const KIND_ICON = { Lab: FlaskConical, CTF: Flag, Drill: Flame, Tool: Terminal, Path: BookOpen, Challenge: ShieldCheck, Quiz: ClipboardCheck };
export const inr = (n) => `₹${n.toLocaleString("en-IN")}`;

export const PracticeList = ({ c }) => {
  const { user } = useAuth();
  return (
    <div className="space-y-1.5" data-testid={`course-practice-${c.id}`}>
      {c.practice.map((p) => {
        const I = KIND_ICON[p.kind] || Terminal;
        return (
          <Link key={p.key} to={user ? p.link : "/register"} data-testid={`course-practice-link-${c.id}-${p.key}`}
            className="flex items-center gap-3 px-3 py-2 border border-white/10 hover:border-cyan-400/60 hover:bg-cyan-500/10 transition-colors">
            <I className="h-4 w-4 text-green-400" /><span className="text-sm flex-1">{p.title}</span>
            <span className="text-[10px] font-mono uppercase text-slate-500">{p.kind}</span>
          </Link>);
      })}
      {!user && <p className="text-[11px] font-mono text-slate-500 pt-1">Free account needed to open labs and drills.</p>}
    </div>
  );
};

const WatchButton = ({ c, done, toggle }) => (
  <button onClick={() => toggle(c)} data-testid="course-dialog-watched"
    className={`flex items-center justify-center gap-2 px-4 py-2.5 border font-mono text-sm rounded-sm transition-colors ${done ? "border-green-400/60 bg-green-500/10 text-green-300" : "border-white/15 text-slate-300 hover:border-green-400/60"}`}>
    {done ? <><CheckCircle2 className="h-4 w-4" />Watched · badge earned</> : <><GraduationCap className="h-4 w-4" />Mark as watched · earn badge</>}
  </button>
);

const CourseDialog = ({ c, onClose, done, toggle }) => (
  <Dialog open onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-2xl" data-testid="course-dialog">
      <div className="grid sm:grid-cols-[220px_1fr] gap-5">
        <img src={c.image} alt={c.title} className="w-full aspect-[16/11] object-cover border border-white/10" />
        <DialogHeader className="text-left">
          <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300">{c.type} · {c.off}% off</span>
          <DialogTitle className="text-lg leading-snug" data-testid="course-dialog-title">{c.title}</DialogTitle>
          <DialogDescription className="font-mono"><span className="text-xl font-bold neon-green">{inr(c.price)}</span> <span className="line-through text-slate-500 text-sm">{inr(c.mrp)}</span></DialogDescription>
        </DialogHeader>
      </div>
      <div>
        <div className="eyebrow mb-3">// practise it in socforge</div>
        <PracticeList c={c} />
      </div>
      <div className={`grid gap-3 ${toggle ? "sm:grid-cols-2" : ""}`}>
        {toggle && <WatchButton c={c} done={done} toggle={toggle} />}
        <a href={c.url} target="_blank" rel="noopener noreferrer" className="glow-btn justify-center" data-testid="course-dialog-open">Open course page <ArrowUpRight className="h-4 w-4" /></a>
      </div>
    </DialogContent>
  </Dialog>
);

export const CourseCard = ({ c, i = 0, onOpen, done }) => {
  const Icon = TYPE_ICON[c.type] || PlayCircle;
  return (
    <motion.button type="button" onClick={() => onOpen(c)} data-testid={`course-card-${c.id}`}
      initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 4) * 0.06 }}
      className="group text-left flex flex-col glass rounded-sm overflow-hidden hover:border-cyan-400/60 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(0,240,255,.12)] transition-[transform,box-shadow,border-color] duration-300">
      <div className="relative aspect-[16/11] w-full overflow-hidden bg-black/50">
        <img src={c.image} alt={c.title} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <span className="absolute top-2 right-2 bg-green-500 text-black text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm" data-testid={`course-off-${c.id}`}>{c.off}% OFF</span>
      </div>
      <div className="flex flex-col flex-1 p-4 w-full">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded-sm" data-testid={`course-type-${c.id}`}><Icon className="h-3 w-3" />{c.type}</span>
          {c.tags.map((t) => <span key={t} className="text-[10px] font-mono uppercase tracking-wider text-red-300 border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 rounded-sm">{t}</span>)}
          {done && <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-green-300 border border-green-500/40 bg-green-500/10 px-1.5 py-0.5 rounded-sm" data-testid={`course-watched-${c.id}`}><CheckCircle2 className="h-3 w-3" />Watched</span>}
        </div>
        <h3 className="mt-3 text-sm font-bold leading-snug line-clamp-2 group-hover:text-cyan-200 transition-colors" data-testid={`course-title-${c.id}`}>{c.title}</h3>
        <div className="mt-auto pt-4 flex items-baseline gap-2 font-mono">
          <span className="text-lg font-bold neon-green" data-testid={`course-price-${c.id}`}>{inr(c.price)}</span>
          <span className="text-xs text-slate-500 line-through" data-testid={`course-mrp-${c.id}`}>{inr(c.mrp)}</span>
          <span className="ml-auto text-[10px] text-green-400/80">{c.practice.length} labs & drills</span>
        </div>
        <span className="mt-3 inline-flex items-center justify-center gap-1.5 text-xs font-mono py-2 border border-cyan-500/40 text-cyan-200 rounded-sm group-hover:bg-cyan-400 group-hover:text-black transition-colors" data-testid={`course-cta-${c.id}`}>
          View course & practice
        </span>
      </div>
    </motion.button>
  );
};

export const CourseGrid = ({ courses, testId = "course-grid" }) => {
  const [open, setOpen] = useState(null);
  const { user } = useAuth();
  const [done, setDone] = useState(new Set());
  useEffect(() => {
    if (user) api.get("/me/courses").then((r) => setDone(new Set(r.data.completed))).catch(() => {});
  }, [user]);
  const toggle = async (c) => {
    const on = done.has(c.id);
    try {
      await (on ? api.delete(`/me/courses/${c.id}/complete`) : api.post(`/me/courses/${c.id}/complete`));
      setDone((s) => { const n = new Set(s); on ? n.delete(c.id) : n.add(c.id); return n; });
      toast.success(on ? "Marked as not watched" : "Course badge earned");
    } catch { toast.error("Couldn't update the course"); }
  };
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid={testId}>
        {courses.map((c, i) => <CourseCard key={c.id} c={c} i={i} onOpen={setOpen} done={done.has(c.id)} />)}
      </div>
      {open && <CourseDialog c={open} onClose={() => setOpen(null)} done={done.has(open.id)} toggle={user ? toggle : null} />}
    </>
  );
};
