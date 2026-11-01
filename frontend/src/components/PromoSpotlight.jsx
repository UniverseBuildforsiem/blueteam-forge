import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, PlayCircle, ShieldCheck, Smartphone, Route as RouteIcon, BookOpen, Pause } from "lucide-react";

const UDEMY = "https://www.udemy.com/course/certified-soc-analyst-splunk-qualys-vmdr-ir-l1-l2-socprofessionals/?referralCode=261E04A0E06901725704";
const SLIDES = [
  { id: "udemy-vmdr", tag: "Udemy course", title: "Qualys Guard VMDR", text: "Vulnerability management, detection and response with Qualys — scan, prioritise and remediate like an enterprise SOC.", price: "₹499", cta: "Enrol on Udemy", href: UDEMY, Icon: ShieldCheck, accent: "#00F0FF" },
  { id: "udemy-csa", tag: "Udemy course", title: "Certified SOC Analyst", text: "Splunk, Qualys VMDR and incident response for L1 & L2 analysts — the complete SOC analyst course.", price: "₹499", cta: "Enrol on Udemy", href: UDEMY, Icon: PlayCircle, accent: "#00FF66" },
  { id: "app", tag: "Android app", title: "SOCProfessionals Self-Learning", text: "Learn SOC skills on the go — lessons, quizzes and practice in your pocket.", price: "Free download", cta: "Get it on Google Play", href: "https://play.google.com/store/apps/details?id=co.lenord.utars&pcampaignid=web_share", Icon: Smartphone, accent: "#FACC15" },
  { id: "paths", tag: "On this platform", title: "SOC Learning Paths", text: "Structured tracks from SOC fundamentals to L2 hunting, with labs, quizzes and verifiable certificates.", price: "Start free", cta: "Explore learning paths", to: "/catalog", Icon: RouteIcon, accent: "#00F0FF" },
  { id: "book", tag: "Ebook", title: "SOC Interview Preparation", text: "Real interview questions, scenario walkthroughs and answers that get SOC analysts hired.", price: "Interview ready", cta: "See the book", to: "/book", Icon: BookOpen, accent: "#FB923C", img: "/book/cover.jpg" },
];
const MS = 6000;

function Cta({ s }) {
  const cls = "glow-btn";
  const inner = <>{s.cta} <ArrowRight className="h-4 w-4" /></>;
  return s.to ? <Link to={s.to} className={cls} data-testid={`promo-cta-${s.id}`}>{inner}</Link>
    : <a href={s.href} target="_blank" rel="noopener noreferrer" className={cls} data-testid={`promo-cta-${s.id}`}>{inner}</a>;
}

export default function PromoSpotlight() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const go = (n) => { setI((n + SLIDES.length) % SLIDES.length); setTick((k) => k + 1); };
  const s = SLIDES[i];
  return (
    <section className="max-w-7xl mx-auto px-6 pb-24" data-testid="promo-spotlight">
      <div className="eyebrow mb-3">// learn with socprofessionals</div>
      <div className="glass rounded-sm overflow-hidden relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="h-1 bg-white/5"><div key={`${i}-${tick}`} className="h-1 promo-timer" style={{ background: s.accent, animationDuration: `${MS}ms`, animationPlayState: paused ? "paused" : "running" }} onAnimationEnd={() => go(i + 1)} data-testid="promo-timer" /></div>
        <div key={s.id} className="grid md:grid-cols-[1fr_auto] gap-8 items-center p-8 sm:p-10 promo-in" data-testid={`promo-slide-${s.id}`}>
          <div>
            <div className="flex items-center gap-3 text-xs font-mono uppercase"><span style={{ color: s.accent }}>{s.tag}</span><span className="text-slate-600">{String(i + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}</span>
              {paused && <span className="text-slate-500 inline-flex items-center gap-1"><Pause className="h-3 w-3" />paused</span>}</div>
            <h3 className="text-2xl sm:text-3xl font-bold mt-3" data-testid="promo-title">{s.title}</h3>
            <p className="text-slate-400 text-sm sm:text-base mt-3 max-w-2xl">{s.text}</p>
            <div className="mt-6 flex flex-wrap items-center gap-5"><Cta s={s} /><span className="font-mono text-xl font-bold" style={{ color: s.accent }} data-testid="promo-price">{s.price}</span></div>
          </div>
          {s.img ? <img src={s.img} alt={s.title} className="hidden md:block h-44 w-auto border border-white/10 shadow-2xl -rotate-2" />
            : <div className="hidden md:grid place-items-center h-40 w-40 rounded-full border-2" style={{ borderColor: `${s.accent}66`, boxShadow: `0 0 40px ${s.accent}22` }}><s.Icon className="h-16 w-16" style={{ color: s.accent }} /></div>}
        </div>
        <div className="flex items-center gap-2 px-8 sm:px-10 pb-6 flex-wrap">
          <button onClick={() => go(i - 1)} className="text-slate-500 hover:text-cyan-300" aria-label="Previous" data-testid="promo-prev"><ChevronLeft className="h-5 w-5" /></button>
          {SLIDES.map((x, k) => <button key={x.id} onClick={() => go(k)} data-testid={`promo-dot-${x.id}`}
            className={`text-[11px] font-mono px-2.5 py-1 border rounded-sm transition-colors ${k === i ? "border-cyan-400/60 text-cyan-200 bg-cyan-500/10" : "border-white/10 text-slate-500 hover:text-slate-200"}`}>{x.title}</button>)}
          <button onClick={() => go(i + 1)} className="text-slate-500 hover:text-cyan-300" aria-label="Next" data-testid="promo-next"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>
    </section>);
}
