import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Sparkles, Snowflake, Palette, PartyPopper, Copy, X, Gift } from "lucide-react";
import { toast } from "sonner";
import { useCampaign, campaignOff } from "../lib/campaign";

const parts = (ends) => { const ms = Math.max(0, new Date(ends) - Date.now()); return [Math.floor(ms / 864e5), Math.floor(ms / 36e5) % 24, Math.floor(ms / 6e4) % 60, Math.floor(ms / 1e3) % 60]; };

function BigCountdown({ ends, compact, accent }) {
  const [p, setP] = useState(() => parts(ends));
  useEffect(() => { const i = setInterval(() => setP(parts(ends)), 1000); return () => clearInterval(i); }, [ends]);
  const box = compact ? "min-w-[34px] px-1 py-0.5 text-sm" : "min-w-[52px] px-2 py-1.5 text-2xl";
  return (
    <div className="flex items-end gap-1.5" data-testid="festival-countdown">
      {[["days", p[0]], ["hrs", p[1]], ["min", p[2]], ["sec", p[3]]].map(([l, v], i) => (
        <div key={l} className="flex items-end gap-1.5">
          {i > 0 && <span className={`font-mono font-bold ${accent} ${compact ? "text-sm pb-3" : "text-2xl pb-5"} animate-pulse`}>:</span>}
          <div className="text-center">
            <div key={l === "sec" ? v : undefined} className={`fest-digit bg-black/45 border border-white/15 font-mono font-bold text-white tabular-nums ${box}`} data-testid={`festival-countdown-${l}`}>{String(v).padStart(2, "0")}</div>
            <div className="text-[9px] font-mono uppercase tracking-wider text-white/60 mt-0.5">{l}</div>
          </div></div>))}
    </div>);
}

const THEME = {
  diwali: { I: Flame, cls: "fest-diwali", accent: "text-amber-300", chip: "border-amber-300/60 text-amber-200", deco: "diyas" },
  newyear: { I: PartyPopper, cls: "fest-newyear", accent: "text-sky-200", chip: "border-sky-300/60 text-sky-100", deco: "fireworks" },
  christmas: { I: Snowflake, cls: "fest-christmas", accent: "text-red-300", chip: "border-red-300/60 text-red-100", deco: "snow" },
  holi: { I: Palette, cls: "fest-holi", accent: "text-pink-200", chip: "border-pink-300/60 text-pink-100", deco: "splash" },
  festive: { I: Sparkles, cls: "fest-festive", accent: "text-cyan-200", chip: "border-cyan-300/60 text-cyan-100", deco: "fireworks" },
};

function Deco({ kind, compact }) {
  if (kind === "diyas") return <div className="fest-deco">{(compact ? [97.5] : [1.5, 97.5]).map((l, i) => <Flame key={l} className="fest-diya" style={{ left: `${l}%`, animationDelay: `${i * 0.4}s` }} />)}</div>;
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
      <Deco kind={t.deco} compact={compact} />
      <div className={`relative flex flex-wrap items-center gap-x-6 gap-y-3 ${compact ? "px-4 py-3" : "px-6 py-5"}`}>
        <t.I className={`${compact ? "h-6 w-6" : "h-9 w-9"} ${t.accent} shrink-0`} />
        <div className="flex-1 min-w-[220px]">
          <div className={`text-[10px] font-mono uppercase tracking-[0.25em] ${t.accent}`}>{c.name}</div>
          <div className={`font-bold text-white ${compact ? "text-sm" : "text-lg md:text-xl"}`} data-testid="festival-headline">{c.headline}</div>
          {c.subtext && !compact && <div className="text-xs text-slate-200/80 mt-0.5">{c.subtext}</div>}
        </div>
        <div><div className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${t.accent}`}>offer ends in</div><BigCountdown ends={c.ends_at} compact={compact} accent={t.accent} /></div>
        <button onClick={copy} className={`border border-dashed px-3 py-1.5 font-mono text-sm inline-flex items-center gap-2 bg-black/30 hover:bg-black/50 transition-colors ${t.chip}`} data-testid="festival-coupon-copy">
          <span className="text-[10px] uppercase opacity-70">{campaignOff(c)} · code</span><b>{c.coupon_code}</b><Copy className="h-3.5 w-3.5" /></button>
        {cta && <Link to="/courses" className="glow-btn !text-xs" data-testid="festival-cta"><Gift className="h-3.5 w-3.5" />Gift a course</Link>}
        <button onClick={close} className="absolute top-2 right-2 text-white/50 hover:text-white" aria-label="Dismiss" data-testid="festival-dismiss"><X className="h-3.5 w-3.5" /></button>
      </div>
    </div>);
}
