import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { GraduationCap, CheckCircle2, Circle, Wrench, Share2, Linkedin, Download, Copy, Zap, ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { api, fmtDate } from "../../lib/api";
import { Glass, PageHeader, Empty } from "../../components/common";

function ShareBadge({ cid }) {
  const [card, setCard] = useState(null);
  const open = async () => {
    try { const { data } = await api.post(`/me/courses/${cid}/share-card`); setCard(data); } catch { toast.error("Couldn't create the share card"); }
  };
  const li = card && `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(card.share_url)}`;
  return (
    <>
      <button className="ghost-btn !py-1.5 !text-xs" onClick={open} data-testid={`mycourse-share-${cid}`}><Share2 className="h-3.5 w-3.5" />Share badge</button>
      <Dialog open={!!card} onOpenChange={(o) => !o && setCard(null)}>
        <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-2xl" data-testid="course-share-dialog">
          <DialogHeader><DialogTitle className="font-mono">Share your course badge</DialogTitle></DialogHeader>
          {card && <>
            <img src={card.image_url} alt="Your SOCForge course badge card" className="w-full border border-cyan-500/20" data-testid="course-share-image" />
            <div className="flex flex-wrap gap-2">
              <a href={li} target="_blank" rel="noreferrer" className="glow-btn" data-testid="course-share-linkedin"><Linkedin className="h-4 w-4" />Share on LinkedIn</a>
              <a href={card.image_url} download="socforge-course-badge.png" target="_blank" rel="noreferrer" className="ghost-btn" data-testid="course-share-download"><Download className="h-4 w-4" />Download image</a>
              <button className="ghost-btn" onClick={() => { navigator.clipboard.writeText(card.share_url); toast.success("Link copied"); }} data-testid="course-share-copy"><Copy className="h-4 w-4" />Copy link</button>
            </div>
            <p className="text-xs text-slate-500 font-mono">LinkedIn shows this card as the link preview. Anyone with the link can see your name and badge.</p>
          </>}
        </DialogContent>
      </Dialog>
    </>
  );
}

const ItemRow = ({ i, cid }) => {
  const Icon = !i.trackable ? Wrench : i.done ? CheckCircle2 : Circle;
  const tone = !i.trackable ? "text-slate-400" : i.done ? "text-green-400" : "text-orange-300";
  return (
    <Link to={i.link} data-testid={`mycourse-item-${cid}-${i.key}`} className="flex items-center gap-3 px-3 py-2 border border-white/10 hover:border-cyan-400/60 hover:bg-cyan-500/5 transition-colors">
      <Icon className={`h-4 w-4 ${tone}`} /><span className="text-sm flex-1">{i.title}</span>
      <span className={`text-[10px] font-mono uppercase ${tone}`}>{!i.trackable ? "practice tool" : i.done ? "done" : "to finish"}</span>
    </Link>
  );
};

function CourseRow({ r, bonus }) {
  const c = r.course;
  return (
    <Glass className="p-5 grid lg:grid-cols-[1fr_1.2fr] gap-6" data-testid={`mycourse-${c.id}`}>
      <div>
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 shrink-0 grid place-items-center border-2 border-green-400/60 bg-green-500/10 rotate-45"><GraduationCap className="h-6 w-6 text-cyan-300 -rotate-45" /></div>
          <div>
            <div className="eyebrow">badge · watched {fmtDate(r.watched_at)}</div>
            <h3 className="font-bold text-lg mt-1" data-testid={`mycourse-badge-${c.id}`}>{r.badge_name}</h3>
            <p className="text-xs text-slate-400 mt-1">{c.title}</p>
          </div>
        </div>
        <div className={`mt-5 flex items-center gap-2 text-xs font-mono px-3 py-2 border ${r.bonus_paid ? "border-green-500/40 text-green-300 bg-green-500/10" : "border-orange-400/40 text-orange-300"}`} data-testid={`mycourse-bonus-${c.id}`}>
          <Zap className="h-3.5 w-3.5" />{r.bonus_paid ? `+${bonus} XP course bonus earned` : `Finish any matching item to earn +${bonus} XP`}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ShareBadge cid={c.id} />
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="ghost-btn !py-1.5 !text-xs" data-testid={`mycourse-open-${c.id}`}>Course page <ArrowUpRight className="h-3.5 w-3.5" /></a>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs font-mono text-slate-400 mb-2"><span>matching labs & drills</span><span data-testid={`mycourse-count-${c.id}`}>{r.done_count}/{r.trackable_count} done</span></div>
        <div className="h-1.5 bg-white/5 mb-3"><div className="h-full bg-gradient-to-r from-cyan-400 to-green-400" style={{ width: `${r.trackable_count ? (100 * r.done_count) / r.trackable_count : 0}%` }} /></div>
        <div className="space-y-1.5">{r.items.map((i) => <ItemRow key={i.key} i={i} cid={c.id} />)}</div>
      </div>
    </Glass>
  );
}

export default function MyCourses() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get("/me/courses/progress").then((r) => {
      setD(r.data);
      r.data.awarded.forEach((t) => toast.success(`+${r.data.bonus_xp} XP course bonus: ${t}`));
    }).catch(() => setD({ courses: [], bonus_xp: 100 }));
  }, []);
  if (!d) return <div className="font-mono text-cyan-400 cursor-blink">loading courses </div>;
  return (
    <div>
      <PageHeader eyebrow="// self-paced learning" title="My courses" sub={`Watched courses, their badges and the matching labs still to finish. Each course pays +${d.bonus_xp} XP once you finish one of its labs or drills after watching.`}
        right={<Link to="/courses" className="glow-btn" data-testid="mycourses-browse">Browse courses</Link>} />
      {d.courses.length ? <div className="space-y-4" data-testid="mycourses-list">{d.courses.map((r) => <CourseRow key={r.course.id} r={r} bonus={d.bonus_xp} />)}</div>
        : <Glass className="p-10" data-testid="mycourses-empty"><Empty text="no watched courses yet — open a course and mark it as watched" /></Glass>}
    </div>
  );
}
