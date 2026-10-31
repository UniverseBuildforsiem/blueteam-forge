import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { api } from "../lib/api";
import { LEVELS, BADGE_ART } from "../lib/badges";
import ShareCardButton from "./ShareCardButton";

export default function LevelUpReveal({ lu, onDone }) {
  const close = () => { api.post(`/me/level-up/${lu.level}/seen`).catch(() => {}); onDone(); };
  const l = LEVELS[lu.level];
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[60] bg-[#05070D]/95 backdrop-blur-xl grid place-items-center p-6 overflow-hidden" data-testid="level-up-reveal"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <button onClick={close} className="absolute top-6 right-6 text-slate-400 hover:text-white" data-testid="level-up-close" aria-label="Close"><X className="h-6 w-6" /></button>
        <div className="flex flex-col items-center text-center max-w-xl">
          <motion.div className="font-mono text-xs tracking-[0.4em] text-slate-400" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>// level unlocked</motion.div>
          <motion.div className="relative mt-6" initial={{ scale: 0.3, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 12, delay: 0.35 }}>
            <motion.div className={`absolute -inset-6 rounded-full border-2 ${l.ring}`} animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0.2, 0.8] }} transition={{ duration: 2.4, repeat: Infinity }} />
            <img src={BADGE_ART[lu.badge_id]?.[1] || l.img} alt={lu.badge_name} className={`h-56 w-56 sm:h-72 sm:w-72 rounded-full object-cover border-4 ${l.ring} ${l.glow}`} data-testid="level-up-character" />
          </motion.div>
          <motion.h2 className={`mt-8 text-5xl sm:text-6xl font-extrabold font-mono ${l.text}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} data-testid="level-up-title">{lu.level}</motion.h2>
          <motion.p className="mt-3 text-slate-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
            You earned <span className="font-bold text-white" data-testid="level-up-badge">{lu.badge_name}</span>, your first {lu.level} badge. {lu.description}.
          </motion.p>
          <motion.div className="mt-8 flex flex-wrap justify-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>
            <ShareCardButton endpoint={`/me/badges/${lu.badge_id}/share-card`} title={`Share your ${lu.badge_name} badge`} testId="level-up-share" />
            <button className="glow-btn" onClick={close} data-testid="level-up-continue">Continue</button>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
