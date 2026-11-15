import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Lock, Clock, X } from "lucide-react";
import { Glass } from "../common";

export const GROUP_COLOR = { email: "#22d3ee", mobile: "#fbbf24", web: "#f43f5e", social: "#4ade80" };
const SEV = [["Critical", 0.26, 15], ["High", 0.46, 35], ["Medium", 0.66, 35], ["Low", 0.86, 15]];
const SEV_CLS = { Critical: "border-red-500/60 text-red-300", High: "border-orange-400/60 text-orange-300", Medium: "border-yellow-400/50 text-yellow-200", Low: "border-green-500/50 text-green-300" };
const mmss = (s) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;

function pickSev() {
  let r = Math.random() * 100;
  for (const s of SEV) { if ((r -= s[2]) < 0) return s; }
  return SEV[3];
}

export function RadarScope({ children }) {
  return <div className="relative aspect-square w-full radar-scope">
    <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs><linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" stopOpacity="0" /><stop offset="1" stopColor="#22d3ee" stopOpacity=".45" /></linearGradient>
        <radialGradient id="scopebg"><stop offset="0" stopColor="#0e3a44" stopOpacity=".55" /><stop offset="1" stopColor="#03080c" stopOpacity=".9" /></radialGradient></defs>
      <circle cx="100" cy="100" r="98" fill="url(#scopebg)" stroke="#22d3ee" strokeOpacity=".5" />
      {[24, 48, 72].map((r) => <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#22d3ee" strokeOpacity=".18" />)}
      <path d="M100 2V198M2 100H198" stroke="#22d3ee" strokeOpacity=".12" />
      <g className="radar-sweep"><path d="M100 100 L198 100 A98 98 0 0 0 175 37 Z" fill="url(#sweep)" /><line x1="100" y1="100" x2="198" y2="100" stroke="#67e8f9" strokeWidth="1.2" /></g>
      <circle cx="100" cy="100" r="2.5" fill="#67e8f9" />
    </svg>
    {children}
  </div>;
}

export const Legend = ({ groups, className = "" }) => <div className={`flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-mono text-slate-400 ${className}`} data-testid="radar-legend">
  {Object.entries(groups).map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLOR[k], boxShadow: `0 0 6px ${GROUP_COLOR[k]}` }} />{l}</span>)}</div>;

function useDetections(types) {
  const [blips, setBlips] = useState([]);
  const [stats, setStats] = useState({ detected: 0, queue: 6, triage: 252 });
  useEffect(() => {
    if (!types.length) return undefined;
    const spawn = () => {
      const t = types[Math.floor(Math.random() * types.length)], [sev, r] = pickSev(), a = Math.random() * Math.PI * 2, d = r + (Math.random() - 0.5) * 0.12;
      const b = { id: `${Date.now()}-${Math.random()}`, t, sev, x: 50 + Math.cos(a) * d * 50, y: 50 + Math.sin(a) * d * 50, at: Date.now(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
      setBlips((bs) => [...bs.filter((x) => Date.now() - x.at < 8000), b]);
      setStats((s) => ({ detected: s.detected + 1, queue: Math.min(14, Math.max(2, s.queue + Math.round(Math.random() * 2 - 1))), triage: Math.min(480, Math.max(120, s.triage + Math.round(Math.random() * 30 - 15))) }));
    };
    spawn();
    const id = setInterval(spawn, 2000);
    return () => clearInterval(id);
  }, [types]);
  return { blips, feed: blips.slice(-4).reverse(), stats };
}

function MatchCard({ b, onClose }) {
  const cs = b.t.cases || [];
  const c = cs.find((x) => !x.locked && !(x.best >= 70)) || cs.find((x) => !x.locked) || cs[0];
  return <Glass className="p-4 space-y-2 radar-feed-in" data-testid="radar-match-card">
    <div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-mono uppercase" style={{ color: GROUP_COLOR[b.t.group] }}>{b.t.channel} · {b.sev}</div><div className="font-bold text-sm mt-0.5">{b.t.name}</div></div>
      <button onClick={onClose} className="text-slate-500 hover:text-slate-200" aria-label="Close" data-testid="radar-match-close"><X className="h-4 w-4" /></button></div>
    {!c ? <p className="text-xs text-slate-400" data-testid="radar-coming-soon">Coming soon — no investigation case for this type yet. Read the technique guide meanwhile.</p>
      : c.locked ? <p className="text-xs text-slate-400 flex gap-1.5" data-testid="radar-match-locked"><Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />Matching case "{c.title}" is part of the full simulator.</p>
        : <p className="text-xs text-slate-300" data-testid="radar-match-title">Matching case: <b>{c.title}</b> <span className="text-slate-500">· {c.difficulty}</span></p>}
    <div className="flex gap-2">{c && <Link to={c.locked ? "/app/phishing?unlock=1" : `/app/phishing/case/${c.id}`} className="glow-btn !text-xs !py-1.5" data-testid="radar-match-open">{c.locked ? "Unlock" : "Open case"}</Link>}
      <Link to={`/app/phishing/${b.t.id}`} className="ghost-btn !text-xs !py-1.5" data-testid="radar-match-learn">Technique guide</Link></div>
  </Glass>;
}

const FeedItem = ({ b, onOpen, compact }) => <button onClick={() => onOpen(b)} className={`w-full text-left flex items-center gap-2.5 border border-white/10 hover:border-cyan-400/50 px-3 py-2 transition-colors radar-feed-in ${compact ? "min-w-0" : ""}`} data-testid="radar-feed-item">
  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: GROUP_COLOR[b.t.group] }} />
  <span className="flex-1 min-w-0"><span className="block text-xs font-semibold truncate">{b.t.name}</span><span className="block text-[10px] font-mono text-slate-500">{b.t.channel} · {b.time}</span></span>
  <span className={`text-[10px] font-mono border px-1.5 py-0.5 shrink-0 ${SEV_CLS[b.sev]}`}>{b.sev}</span></button>;

const Counters = ({ s }) => <div className="grid grid-cols-3 gap-2" data-testid="radar-counters">
  {[["Detected", s.detected, "radar-detected"], ["In queue", s.queue, "radar-queue"], ["Avg triage", mmss(s.triage), "radar-triage"]].map(([l, v, id]) => <div key={l} className="border border-white/10 px-2 py-2"><div className="text-[10px] font-mono uppercase text-slate-500">{l}</div><div className="font-mono font-bold text-cyan-300 text-sm" data-testid={id}>{v}</div></div>)}</div>;

function useMobile() {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q), f = () => setM(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  return m;
}

export function ThreatRadar({ types, groups }) {
  const stable = useMemo(() => types, [types]);
  const { blips, feed, stats } = useDetections(stable);
  const [open, setOpen] = useState(null);
  const mobile = useMobile();
  return <section className="mb-8" data-testid="phish-radar" aria-label="Simulated phishing detection radar">
    {!mobile ? <Glass className="grid grid-cols-[minmax(240px,340px)_1fr] gap-8 p-6 items-start">
      <RadarScope>{blips.map((b) => <button key={b.id} onClick={() => setOpen(b)} aria-label={`Simulated ${b.t.name} detection, ${b.sev} severity. Open matching case`}
        className="radar-blip absolute h-3 w-3 rounded-full focus-visible:ring-2 focus-visible:ring-white" style={{ left: `${b.x}%`, top: `${b.y}%`, background: GROUP_COLOR[b.t.group], boxShadow: `0 0 10px ${GROUP_COLOR[b.t.group]}` }} data-testid="radar-blip">
        <span className="radar-ping absolute inset-0 rounded-full" style={{ background: GROUP_COLOR[b.t.group] }} /></button>)}</RadarScope>
      <div className="space-y-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="eyebrow flex items-center gap-2"><Activity className="h-3.5 w-3.5" />threat radar</div>
          <span className="text-[10px] font-mono uppercase border border-yellow-400/40 text-yellow-200 px-1.5 py-0.5" data-testid="radar-simulated-label">simulated feed</span></div>
        <Legend groups={groups} />
        <p className="text-[11px] font-mono text-slate-500">Closer to the centre = more severe. Click a blip or detection to open a matching case.</p>
        <Counters s={stats} />
        <div className="space-y-1.5" data-testid="radar-feed">{feed.map((b) => <FeedItem key={b.id} b={b} onOpen={setOpen} />)}</div>
        {open && <MatchCard b={open} onClose={() => setOpen(null)} />}
      </div>
    </Glass>
    : <Glass className="p-3 space-y-2.5" data-testid="radar-strip">
      <div className="flex items-center justify-between"><span className="eyebrow flex items-center gap-1.5"><Clock className="h-3 w-3" />threat radar</span><span className="text-[10px] font-mono text-yellow-200" data-testid="radar-simulated-label">simulated</span></div>
      <Legend groups={groups} />
      {feed[0] && <FeedItem b={feed[0]} onOpen={setOpen} compact />}
      <Counters s={stats} />
      {open && <MatchCard b={open} onClose={() => setOpen(null)} />}
    </Glass>}
  </section>;
}
