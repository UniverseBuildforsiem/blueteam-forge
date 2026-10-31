import { Link } from "react-router-dom";
import { ShieldHalf } from "lucide-react";

const SEV = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/40",
  High: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  Medium: "bg-yellow-400/15 text-yellow-300 border-yellow-400/40",
  Low: "bg-green-500/15 text-green-400 border-green-500/40",
};

export const SeverityBadge = ({ level, testId }) => (
  <span data-testid={testId} className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-sm ${SEV[level] || SEV.Low}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />{level}
  </span>
);

export const Glass = ({ className = "", children, ...p }) => (
  <div className={`glass rounded-sm ${className}`} {...p}>{children}</div>
);

export const Logo = ({ to = "/" }) => (
  <Link to={to} data-testid="brand-logo" className="flex items-center gap-2 font-mono font-extrabold tracking-tight text-lg">
    <ShieldHalf className="h-6 w-6 text-[#00F0FF]" />
    <span>SOC<span className="neon-green">Forge</span></span>
  </Link>
);

export const PageHeader = ({ eyebrow, title, sub, right }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 mb-8 rise">
    <div>
      {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
      <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
      {sub && <p className="text-slate-400 mt-2 text-sm max-w-2xl">{sub}</p>}
    </div>
    {right}
  </div>
);

export const ProgressRing = ({ value = 0, size = 88, stroke = 7, color = "#00F0FF", label, testId }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2" data-testid={testId}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(148,163,184,.15)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(value, 100)) / 100} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease", filter: `drop-shadow(0 0 6px ${color})` }} />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="#F8FAFC" className="font-mono text-sm font-bold rotate-90" style={{ transformOrigin: "center" }}>{value}%</text>
      </svg>
      {label && <span className="text-[11px] font-mono text-slate-400 text-center max-w-[110px] leading-tight">{label}</span>}
    </div>
  );
};

export const ProfileLink = ({ username, isPublic = true, children, className = "", testId }) => (isPublic && username
  ? <Link to={`/u/${username}`} data-testid={testId} className={`hover:text-cyan-300 hover:underline underline-offset-4 transition-colors ${className}`}>{children}</Link>
  : <span className={className}>{children}</span>);

export const Empty = ({ text }) => <div className="text-sm text-slate-500 font-mono py-8 text-center">// {text}</div>;

export const Stat = ({ label, value, accent = "neon-text", testId }) => (
  <Glass className="p-4">
    <div className="eyebrow !text-slate-400">{label}</div>
    <div data-testid={testId} className={`text-2xl font-mono font-bold mt-1 ${accent}`}>{value}</div>
  </Glass>
);
