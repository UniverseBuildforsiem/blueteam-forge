import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

export const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function left(ends) {
  const ms = new Date(ends) - Date.now();
  if (ms <= 0) return null;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  return d ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
}

export function Countdown({ ends, onEnd }) {
  const [t, setT] = useState(() => left(ends));
  useEffect(() => { const i = setInterval(() => { const v = left(ends); setT(v); if (!v) { clearInterval(i); onEnd?.(); } }, 1000); return () => clearInterval(i); }, [ends]); // eslint-disable-line
  if (!t) return null;
  return <div className="text-xs font-mono text-red-300 inline-flex items-center gap-1.5" data-testid="sale-countdown"><Timer className="h-3.5 w-3.5" />Sale ends in <b>{t}</b></div>;
}

export function PriceTag({ c, size = "sm", testId = "course-price" }) {
  if (!c.price) return <span className={`font-mono font-bold text-green-400 ${size === "lg" ? "text-3xl" : ""}`} data-testid={testId}>Free</span>;
  return (
    <span className="inline-flex items-baseline gap-2 flex-wrap" data-testid={testId}>
      <span className={`font-mono font-bold neon-text ${size === "lg" ? "text-3xl" : "text-sm"}`}>{inr(c.price)}</span>
      {c.mrp && <span className={`font-mono text-slate-500 line-through ${size === "lg" ? "text-lg" : "text-xs"}`} data-testid={`${testId}-mrp`}>{inr(c.mrp)}</span>}
      {c.off > 0 && <span className={`font-mono text-yellow-300 ${size === "lg" ? "text-base" : "text-[11px]"}`} data-testid={`${testId}-off`}>{c.off}% off</span>}
    </span>);
}
