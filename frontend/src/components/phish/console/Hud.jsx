import { useEffect, useState } from "react";
import { Timer, Lightbulb, Target, Loader2 } from "lucide-react";
import { Glass } from "../../common";

const clock = (s) => `${s < 0 ? "-" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;

export function useSla(run) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!run) return { left: 0, over: false };
  const left = Math.round((new Date(run.started_at).getTime() + run.sla_minutes * 60000 - now) / 1000);
  return { left, over: left < 0 };
}

export function Hud({ c, run, onHint, busy, frozen }) {
  const { left, over } = useSla(run);
  const [open, setOpen] = useState(false);
  const max = Math.max(0, run.max_score - (over ? 10 : 0));
  return <Glass className="p-3 sm:p-4 lg:sticky lg:top-2 z-20 space-y-3" data-testid="phish-hud">
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-2" data-testid="hud-sla"><Timer className={`h-4 w-4 ${over ? "text-red-400" : left < 120 ? "text-yellow-300" : "text-cyan-300"}`} />
        <div><div className="text-[10px] font-mono uppercase text-slate-500">SLA {run.sla_minutes} min</div><div className={`font-mono font-bold ${over ? "text-red-400" : "text-slate-100"}`} data-testid="hud-sla-time" aria-live="off">{frozen ? "—" : over ? `breached ${clock(-left)} · −10` : clock(left)}</div></div></div>
      <div className="flex items-center gap-2"><Target className="h-4 w-4 text-green-400" /><div><div className="text-[10px] font-mono uppercase text-slate-500">Max score</div><div className="font-mono font-bold text-green-300" data-testid="hud-score">{max}</div></div></div>
      <div className="flex items-center gap-2">
        <button className="ghost-btn !text-xs !py-1.5 disabled:opacity-40" disabled={frozen || busy || run.next_hint_cost == null} onClick={onHint} data-testid="hud-hint-btn">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}{run.next_hint_cost == null ? "No hints left" : `Hint (−${run.next_hint_cost})`}</button>
        {run.hints.length > 0 && <button className="text-[11px] font-mono text-yellow-300 underline" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="hud-hints-toggle">{run.hints.length}/{run.hints_total} used</button>}
      </div>
      <div className="flex flex-wrap gap-1.5 sm:ml-auto" data-testid="hud-attack-tags">{c.mitre.map((m) => <span key={m} className="text-[10px] font-mono border border-purple-400/30 text-purple-200 px-1.5 py-0.5">{m}</span>)}</div>
    </div>
    {open && <ul className="space-y-1 border-t border-white/10 pt-2" data-testid="hud-hints">{run.hints.map((h) => <li key={h.i} className="text-xs text-yellow-100 flex gap-2"><Lightbulb className="h-3.5 w-3.5 shrink-0 text-yellow-300 mt-0.5" />{h.text}<span className="text-slate-500 font-mono shrink-0">−{h.cost}</span></li>)}</ul>}
  </Glass>;
}

export const STEPS = ["Evidence", "Analyze", "Verdict", "Respond", "Report"];

export function Stepper({ step, setStep, done }) {
  return <nav aria-label="Investigation steps" data-testid="phish-stepper"><ol className="grid grid-cols-5 gap-1">
    {STEPS.map((s, i) => <li key={s}><button onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}
      className={`w-full text-left px-2 sm:px-3 py-2 border-b-2 transition-colors ${step === i ? "border-cyan-400 text-cyan-200 bg-cyan-500/5" : done[i] ? "border-green-500/60 text-slate-300" : "border-white/10 text-slate-500 hover:text-slate-300"}`} data-testid={`phish-step-${s.toLowerCase()}`}>
      <span className="block text-[10px] font-mono">{String(i + 1).padStart(2, "0")}</span><span className="block text-[11px] sm:text-sm font-semibold truncate">{s}</span></button></li>)}
  </ol></nav>;
}
