import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, User, BarChart3, BookOpen, Clock } from "lucide-react";
import { Glass } from "../common";

const list = (v) => (Array.isArray(v) ? v.filter((x) => String(x).trim()) : []);

const Section = ({ title, children }) => <section className="mt-6 first:mt-0"><h2 className="text-xl font-bold text-slate-100 mb-2.5">{title}</h2>{children}</section>;
const Bullets = ({ items, tid }) => <ul className="list-disc pl-6 space-y-1.5 marker:text-slate-500" data-testid={tid}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;

function Facts({ p }) {
  const ls = p.modules.flatMap((m) => m.lessons), mins = ls.reduce((n, l) => n + (Number(l.minutes) || 0), 0);
  const rows = [[User, "Creator", p.instructor_name || "SOCProfessionals"], [BarChart3, "Level", p.level], [BookOpen, "Lessons", `${ls.length} in ${p.modules.length} module${p.modules.length === 1 ? "" : "s"}`], [Clock, "Total time", mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`]];
  return <Glass className="p-5 space-y-3" data-testid="course-about-card">
    {rows.filter((r) => r[2]).map(([I, k, v]) => <div key={k} className="flex items-center gap-2.5 text-sm"><I className="h-4 w-4 text-cyan-400 shrink-0" /><span className="font-semibold text-slate-200">{k}:</span><span className="text-slate-400 truncate" data-testid={`course-about-${k.toLowerCase().replace(" ", "-")}`}>{v}</span></div>)}
    <div className="pt-1"><div className="flex justify-between text-[11px] font-mono text-slate-500 mb-1"><span>Your progress</span><span className="text-green-400" data-testid="course-about-progress">{p.percent}%</span></div>
      <div className="h-1.5 bg-white/5"><div className="h-1.5 bg-green-400 transition-[width] duration-700" style={{ width: `${p.percent}%` }} /></div></div>
  </Glass>;
}

export function CourseAbout({ p }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const learn = list(p.outcomes), req = list(p.requirements), aud = list(p.audience);
  useLayoutEffect(() => { const el = ref.current; if (el && !open) setLong(el.scrollHeight > el.clientHeight + 4); }, [p.id, open]);
  if (!p.description && !learn.length && !req.length && !aud.length) return null;
  return <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8 mb-8 items-start" data-testid="course-about">
    <div className="max-w-3xl min-w-0">
      <div className="relative">
        <div ref={ref} id="course-about-body" className={`text-[15px] leading-7 text-slate-400 overflow-hidden ${open ? "" : `max-h-[14.75rem] ${long ? "[mask-image:linear-gradient(to_bottom,black_70%,transparent)]" : ""}`}`} data-testid="course-about-body">
          {p.description && <Section title={p.kind === "course" ? "Course Description" : "Path Description"}><div className="space-y-2">{p.description.trim().split(/\n\s*\n/).map((t, i) => <p key={i} className="whitespace-pre-line">{t.trim()}</p>)}</div></Section>}
          {learn.length > 0 && <Section title="What you'll learn"><Bullets items={learn} tid="course-about-learn" /></Section>}
          {req.length > 0 && <Section title="Requirements"><Bullets items={req} tid="course-about-req" /></Section>}
          {aud.length > 0 && <Section title="Who this course is for"><Bullets items={aud} tid="course-about-aud" /></Section>}
        </div>
      </div>
      {long && <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="course-about-body" className="mt-3 text-sm font-bold text-slate-100 underline underline-offset-4 inline-flex items-center gap-1 hover:text-cyan-300 transition-colors" data-testid="course-about-toggle">
        {open ? "Show less" : "Keep Reading"}<ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></button>}
    </div>
    <Facts p={p} />
  </div>;
}
