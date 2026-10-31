import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { api } from "../lib/api";
import { RankAvatar } from "./RankAvatar";

const Entry = ({ u, i }) => {
  const body = (
    <>
      <RankAvatar rank="Elite" size="md" frame={u.frame} testId={`hof-avatar-${i}`} />
      <div className="min-w-0">
        <div className="font-bold truncate">{u.name}</div>
        <div className="text-[11px] font-mono text-red-300">{u.xp.toLocaleString()} XP{u.username ? ` · @${u.username}` : ""}</div>
      </div>
      {i < 3 && <Crown className={`h-4 w-4 ml-auto shrink-0 ${["text-yellow-300", "text-slate-300", "text-orange-400"][i]}`} />}
    </>
  );
  const cls = "flex items-center gap-3 p-3 border border-red-500/20 bg-red-500/[0.03] rounded-sm transition-colors";
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 8) * 0.05 }}>
      {u.username ? <Link to={`/u/${u.username}`} className={`${cls} hover:border-red-400/70`} data-testid={`hof-entry-${i}`}>{body}</Link>
        : <div className={cls} data-testid={`hof-entry-${i}`}>{body}</div>}
    </motion.div>
  );
};

export default function HallOfFame() {
  const [list, setList] = useState(null);
  useEffect(() => { api.get("/public/hall-of-fame").then((r) => setList(r.data)).catch(() => setList([])); }, []);
  if (!list?.length) return null;
  return (
    <section id="hall-of-fame" className="max-w-7xl mx-auto px-6 pb-24" data-testid="landing-hall-of-fame">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-5">
          <img src="/badges/level-elite.jpg" alt="Elite level" className="h-16 w-16 rounded-full object-cover border-2 border-red-500/70 shadow-[0_0_28px_rgba(239,68,68,.35)]" />
          <div><div className="eyebrow mb-2">// elite hall of fame</div><h2 className="text-3xl font-bold">The analysts who made Elite.</h2>
            <p className="text-slate-400 text-sm mt-1">{list.length} {list.length === 1 ? "student" : "students"} past 3,000 XP of hands-on triage, labs and CTFs.</p></div>
        </div>
        <Link to="/register" className="ghost-btn" data-testid="hof-cta">Join them</Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{list.map((u, i) => <Entry key={`${u.name}-${i}`} u={u} i={i} />)}</div>
    </section>
  );
}
