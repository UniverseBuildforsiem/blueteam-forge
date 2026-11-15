import { useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Sparkles, Snowflake, Palette, PartyPopper, Copy, X, Gift } from "lucide-react";
import { toast } from "sonner";
import { useCampaign, campaignOff } from "../lib/campaign";
import { Countdown } from "./academy/Price";

const THEME = {
  diwali: { I: Flame, cls: "fest-diwali", accent: "text-amber-300", chip: "border-amber-300/60 text-amber-200", deco: "diyas" },
  newyear: { I: PartyPopper, cls: "fest-newyear", accent: "text-sky-200", chip: "border-sky-300/60 text-sky-100", deco: "fireworks" },
  christmas: { I: Snowflake, cls: "fest-christmas", accent: "text-red-300", chip: "border-red-300/60 text-red-100", deco: "snow" },
  holi: { I: Palette, cls: "fest-holi", accent: "text-pink-200", chip: "border-pink-300/60 text-pink-100", deco: "splash" },
  festive: { I: Sparkles, cls: "fest-festive", accent: "text-cyan-200", chip: "border-cyan-300/60 text-cyan-100", deco: "fireworks" },
};

function Deco({ kind }) {
  if (kind === "diyas") return <div className="fest-deco">{[8, 22, 70, 84, 94].map((l, i) => <Flame key={l} className="fest-diya" style={{ left: `${l}%`, animationDelay: `${i * 0.4}s` }} />)}</div>;
  if (kind === "snow") return <div className="fest-deco">{Array.from({ length: 18 }, (_, i) => <span key={i} className="fest-snow" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.7}s` }} />)}</div>;
  if (kind === "splash") return <div className="fest-deco">{["#ec4899", "#facc15", "#22c55e", "#3b82f6", "#f97316"].map((c, i) => <span key={c} className="fest-splash" style={{ background: c, left: `${10 + i * 20}%`, top: i % 2 ? "55%" : "-10%" }} />)}</div>;
  return <div className="fest-deco">{[12, 35, 62, 88].map((l, i) => <span key={l} className="fest-burst" style={{ left: `${l}%`, top: `${20 + (i % 2) * 40}%`, animationDelay: `${i * 0.6}s` }} />)}</div>;
}

export function FestivalBanner({ compact = false, cta = true, className = "" }) {
  const c = useCampaign();
  const [gone, setGone] = useState(() => !!localStorage.getItem("fest_dismissed"));
  if (!c || (gone && localStorage.getItem("fest_dismissed") === c.id)) return null;
  const t = THEME[c.theme] || THEME.festive;
  const copy = () => navigator.clipboard.writeText(c.coupon_code).then(() => toast.success(`${c.coupon_code} copied — paste it at checkout`));
  const close = () => { localStorage.setItem("fest_dismissed", c.id); setGone(true); };
  return (
    <div className={`fest-banner ${t.cls} relative overflow-hidden border ${className}`} data-testid="festival-banner" data-theme={c.theme}>
      <Deco kind={t.deco} />
      <div className={`relative flex flex-wrap items-center gap-x-6 gap-y-3 ${compact ? "px-4 py-3" : "px-6 py-5"}`}>
        <t.I className={`${compact ? "h-6 w-6" : "h-9 w-9"} ${t.accent} shrink-0`} />
        <div className="flex-1 min-w-[220px]">
          <div className={`text-[10px] font-mono uppercase tracking-[0.25em] ${t.accent}`}>{c.name}</div>
          <div className={`font-bold text-white ${compact ? "text-sm" : "text-lg md:text-xl"}`} data-testid="festival-headline">{c.headline}</div>
          {c.subtext && !compact && <div className="text-xs text-slate-200/80 mt-0.5">{c.subtext}</div>}
          <div className="mt-1"><Countdown ends={c.ends_at} label="Offer ends in" /></div>
        </div>
        <button onClick={copy} className={`border border-dashed px-3 py-1.5 font-mono text-sm inline-flex items-center gap-2 bg-black/30 hover:bg-black/50 transition-colors ${t.chip}`} data-testid="festival-coupon-copy">
          <span className="text-[10px] uppercase opacity-70">{campaignOff(c)} · code</span><b>{c.coupon_code}</b><Copy className="h-3.5 w-3.5" /></button>
        {cta && <Link to="/courses" className="glow-btn !text-xs" data-testid="festival-cta"><Gift className="h-3.5 w-3.5" />Gift a course</Link>}
        <button onClick={close} className="absolute top-2 right-2 text-white/50 hover:text-white" aria-label="Dismiss" data-testid="festival-dismiss"><X className="h-3.5 w-3.5" /></button>
      </div>
    </div>);
}
