import { Lock } from "lucide-react";
import { badgeArt } from "../lib/badges";

export const BadgeTile = ({ b, size = "md", testId }) => {
  const a = badgeArt(b);
  const locked = b.earned === false;
  const dim = size === "sm" ? "h-16 w-16" : "h-24 w-24";
  return (
    <div title={b.description} data-testid={testId} className={`group flex flex-col items-center text-center p-3 border rounded-sm transition-[transform,border-color] duration-300 hover:-translate-y-1 ${locked ? "border-white/5" : `${a.ring} bg-white/[0.02]`}`}>
      <div className={`relative ${dim} rounded-full overflow-hidden border-2 ${locked ? "border-white/10" : `${a.ring} ${a.glow}`}`}>
        <img src={a.img2} alt={b.name} loading="lazy" className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 ${locked ? "grayscale opacity-30" : ""}`} />
        {locked && <Lock className="absolute inset-0 m-auto h-5 w-5 text-slate-400" />}
      </div>
      <span className={`mt-2 text-[9px] font-mono uppercase tracking-[0.2em] ${locked ? "text-slate-600" : a.text}`} data-testid={testId && `${testId}-level`}>{a.level}</span>
      <div className={`text-[11px] font-mono leading-tight mt-0.5 ${locked ? "text-slate-500" : "text-slate-100"}`}>{b.name}</div>
      {size !== "sm" && b.description && <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{b.description}</div>}
    </div>
  );
};
