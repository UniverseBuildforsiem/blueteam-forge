import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, PlayCircle } from "lucide-react";
import AnimatedBook, { LEARN, UDEMY_URL } from "./AnimatedBook";

export default function BookPromo() {
  return (
    <section id="ebook" className="max-w-7xl mx-auto px-6 pb-24" data-testid="landing-book-section">
      <div className="glass rounded-sm border border-orange-400/30 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 p-8 sm:p-12 overflow-hidden relative">
        <AnimatedBook />
        <div>
          <div className="eyebrow mb-3">// new · soc interview preparation ebook</div>
          <h2 className="text-3xl font-bold leading-tight">SOC Interview Preparation - Ebook</h2>
          <p className="text-slate-300 mt-3">100+ questions and answers from 200+ real interviews, by Gopi Pakanati.</p>
          <ul className="mt-6 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {LEARN.slice(0, 6).map((t, i) => (
              <motion.li key={t} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                className="flex gap-2 text-sm text-slate-300"><Check className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />{t}</motion.li>))}
          </ul>
          <div className="mt-7 flex flex-wrap items-baseline gap-3 font-mono">
            <span className="text-3xl font-bold neon-green" data-testid="landing-book-price">₹973</span>
            <span className="text-slate-500 line-through">₹2,999</span>
            <span className="text-xs bg-green-500 text-black font-bold px-2 py-0.5">67% OFF</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/book" className="glow-btn" data-testid="landing-book-cta">Get the ebook <ArrowRight className="h-4 w-4" /></Link>
            <a href={UDEMY_URL} target="_blank" rel="noopener noreferrer" className="ghost-btn" data-testid="landing-book-udemy"><PlayCircle className="h-4 w-4" />Video course on Udemy</a>
          </div>
        </div>
      </div>
    </section>
  );
}
