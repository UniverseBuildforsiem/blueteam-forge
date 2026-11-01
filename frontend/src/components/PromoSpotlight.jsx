import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, PlayCircle, ShieldCheck, Smartphone, Route as RouteIcon, BookOpen, Pause, Radio, Timer } from "lucide-react";
import { api } from "../lib/api";

const ICONS = { shield: ShieldCheck, play: PlayCircle, phone: Smartphone, route: RouteIcon, book: BookOpen, live: Radio };
const MS = 6000;

function useCountdown(end) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { if (!end) return undefined; const x = setInterval(() => setT(Date.now()), 1000); return () => clearInterval(x); }, [end]);
  if (!end) return null;
  const ms = new Date(end).getTime() - t;
  if (ms <= 0) return "offer ended";
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4), sec = Math.floor((ms % 6e4) / 1e3);
  return `offer ends in ${d ? `${d}d ` : ""}${h}h ${m}m${d ? "" : ` ${sec}s`}`;
}

export function Countdown({ end, accent }) {
  const txt = useCountdown(end);
  return txt ? <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 border rounded-sm" style={{ color: accent, borderColor: `${accent}55` }} data-testid="promo-countdown"><Timer className="h-3.5 w-3.5" />{txt}</span> : null;
}

function Cta({ s }) {
  const cls = "glow-btn";
  const inner = <>{s.cta} <ArrowRight className="h-4 w-4" /></>;
  return s.url.startsWith("/") ? <Link to={s.url} className={cls} data-testid={`promo-cta-${s.id}`}>{inner}</Link>
    : <a href={s.url} target="_blank" rel="noopener noreferrer" className={cls} data-testid={`promo-cta-${s.id}`}>{inner}</a>;
}

export default function PromoSpotlight() {
  const [slides, setSlides] = useState([]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { api.get("/public/promos").then((r) => setSlides(r.data)).catch(() => {}); }, []);
  const live = slides.filter((x) => !x.ends_at || new Date(x.ends_at).getTime() > Date.now());
  if (!live.length) return null;
  const n = live.length;
  const go = (k) => { setI((k + n) % n); setTick((x) => x + 1); };
  const s = live[i % n];
  const Icon = ICONS[s.icon] || ShieldCheck;
  return (
    <section className="max-w-7xl mx-auto px-6 pb-16" data-testid="promo-spotlight">
      <div className="eyebrow mb-3">// learn with socprofessionals</div>
      <div className="glass rounded-sm overflow-hidden relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="h-1 bg-white/5"><div key={`${i}-${tick}`} className="h-1 promo-timer" style={{ background: s.accent, animationDuration: `${MS}ms`, animationPlayState: paused || n < 2 ? "paused" : "running" }} onAnimationEnd={() => go(i + 1)} data-testid="promo-timer" /></div>
        <div key={s.id} className="grid md:grid-cols-[1fr_auto] gap-8 items-center p-8 sm:p-10 promo-in" data-testid={`promo-slide-${s.id}`}>
          <div>
            <div className="flex items-center gap-3 text-xs font-mono uppercase"><span style={{ color: s.accent }}>{s.tag}</span><span className="text-slate-600">{String((i % n) + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
              {paused && <span className="text-slate-500 inline-flex items-center gap-1"><Pause className="h-3 w-3" />paused</span>}</div>
            <h3 className="text-2xl sm:text-3xl font-bold mt-3" data-testid="promo-title">{s.title}</h3>
            <p className="text-slate-400 text-sm sm:text-base mt-3 max-w-2xl">{s.text}</p>
            <div className="mt-6 flex flex-wrap items-center gap-5"><Cta s={s} />{s.price && <span className="font-mono text-xl font-bold" style={{ color: s.accent }} data-testid="promo-price">{s.price}</span>}<Countdown end={s.ends_at} accent={s.accent} /></div>
          </div>
          {s.img ? <img src={s.img} alt={s.title} className="hidden md:block h-44 w-auto border border-white/10 shadow-2xl -rotate-2" />
            : <div className="hidden md:grid place-items-center h-40 w-40 rounded-full border-2" style={{ borderColor: `${s.accent}66`, boxShadow: `0 0 40px ${s.accent}22` }}><Icon className="h-16 w-16" style={{ color: s.accent }} /></div>}
        </div>
        {n > 1 && <div className="flex items-center gap-2 px-8 sm:px-10 pb-6 flex-wrap">
          <button onClick={() => go(i - 1)} className="text-slate-500 hover:text-cyan-300" aria-label="Previous" data-testid="promo-prev"><ChevronLeft className="h-5 w-5" /></button>
          {live.map((x, k) => <button key={x.id} onClick={() => go(k)} data-testid={`promo-dot-${x.id}`}
            className={`text-[11px] font-mono px-2.5 py-1 border rounded-sm transition-colors ${k === i % n ? "border-cyan-400/60 text-cyan-200 bg-cyan-500/10" : "border-white/10 text-slate-500 hover:text-slate-200"}`}>{x.title}</button>)}
          <button onClick={() => go(i + 1)} className="text-slate-500 hover:text-cyan-300" aria-label="Next" data-testid="promo-next"><ChevronRight className="h-5 w-5" /></button>
        </div>}
      </div>
    </section>);
}
