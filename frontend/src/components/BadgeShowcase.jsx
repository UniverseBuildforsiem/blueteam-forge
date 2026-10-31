import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { LEVELS, SHOWCASE_BADGES, BADGE_ART } from "../lib/badges";

const LevelCard = ({ name, i }) => {
  const l = LEVELS[name];
  const badges = SHOWCASE_BADGES.filter(([id]) => BADGE_ART[id][0] === name);
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
      className={`glass rounded-sm overflow-hidden border ${l.ring} group`} data-testid={`badge-level-${name.toLowerCase()}`}>
      <div className="relative aspect-square overflow-hidden bg-[#0B0F1A]">
        <img src={l.img} alt={`${name} level`} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B0F1A] via-[#0B0F1A]/80 to-transparent p-4 pt-16">
          <div className="font-mono text-[10px] text-slate-500">LEVEL 0{i + 1}</div>
          <div className={`text-2xl font-extrabold font-mono ${l.text}`}>{name}</div>
          <p className="text-xs text-slate-400 mt-1">{l.blurb}</p>
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        {badges.map(([id, n, d]) => (
          <div key={id} className="flex flex-col items-center text-center gap-1.5" title={d} data-testid={`landing-badge-${id}`}>
            <img src={BADGE_ART[id][1]} alt={n} loading="lazy" className={`h-14 w-14 rounded-full object-cover border-2 ${l.ring} hover:scale-110 transition-transform`} />
            <div className="text-xs font-mono font-bold">{n}</div><div className="text-[10px] text-slate-500 leading-tight">{d}</div>
          </div>))}
      </div>
    </motion.div>
  );
};

export default function BadgeShowcase() {
  return (
    <section id="badges" className="max-w-7xl mx-auto px-6 pb-24" data-testid="landing-badge-showcase">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div><div className="eyebrow mb-3">// badges · four levels</div><h2 className="text-3xl font-bold">Earn your way from Recruit to Elite.</h2>
          <p className="text-slate-400 text-sm mt-2 max-w-xl">Every badge has its own character, and harder badges unlock higher levels. Show them on your public profile for recruiters.</p></div>
        <Link to="/register" className="glow-btn" data-testid="landing-badges-cta">Start earning badges <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {Object.keys(LEVELS).map((n, i) => <LevelCard key={n} name={n} i={i} />)}
      </div>
    </section>
  );
}
