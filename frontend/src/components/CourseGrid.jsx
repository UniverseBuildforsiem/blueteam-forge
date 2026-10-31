import { motion } from "framer-motion";
import { ArrowUpRight, PlayCircle, ClipboardCheck, FileText } from "lucide-react";

const TYPE_ICON = { Videos: PlayCircle, Tests: ClipboardCheck, Files: FileText };
const inr = (n) => `₹${n.toLocaleString("en-IN")}`;

export const CourseCard = ({ c, i = 0 }) => {
  const Icon = TYPE_ICON[c.type] || PlayCircle;
  return (
    <motion.a href={c.url} target="_blank" rel="noopener noreferrer" data-testid={`course-card-${c.id}`}
      initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 4) * 0.06 }}
      className="group flex flex-col glass rounded-sm overflow-hidden hover:border-cyan-400/60 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(0,240,255,.12)] transition-[transform,box-shadow,border-color] duration-300">
      <div className="relative aspect-[16/11] overflow-hidden bg-black/50">
        <img src={c.image} alt={c.title} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <span className="absolute top-2 right-2 bg-green-500 text-black text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm" data-testid={`course-off-${c.id}`}>{c.off}% OFF</span>
      </div>
      <div className="flex flex-col flex-1 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded-sm" data-testid={`course-type-${c.id}`}><Icon className="h-3 w-3" />{c.type}</span>
          {c.tags.map((t) => <span key={t} className="text-[10px] font-mono uppercase tracking-wider text-red-300 border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 rounded-sm">{t}</span>)}
        </div>
        <h3 className="mt-3 text-sm font-bold leading-snug line-clamp-2 group-hover:text-cyan-200 transition-colors" data-testid={`course-title-${c.id}`}>{c.title}</h3>
        <div className="mt-auto pt-4 flex items-baseline gap-2 font-mono">
          <span className="text-lg font-bold neon-green" data-testid={`course-price-${c.id}`}>{inr(c.price)}</span>
          <span className="text-xs text-slate-500 line-through" data-testid={`course-mrp-${c.id}`}>{inr(c.mrp)}</span>
        </div>
        <span className="mt-3 inline-flex items-center justify-center gap-1.5 text-xs font-mono py-2 border border-cyan-500/40 text-cyan-200 rounded-sm group-hover:bg-cyan-400 group-hover:text-black transition-colors" data-testid={`course-cta-${c.id}`}>
          Get this course <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </motion.a>
  );
};

export const CourseGrid = ({ courses, testId = "course-grid" }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid={testId}>
    {courses.map((c, i) => <CourseCard key={c.id} c={c} i={i} />)}
  </div>
);
