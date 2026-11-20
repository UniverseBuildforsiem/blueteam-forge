import { useState } from "react";
import { Check, X, Lightbulb } from "lucide-react";
import { Glass } from "../common";

export function ScenarioPanel({ s, testId = "scenario-panel" }) {
  if (!s) return null;
  const table = s.kind === "table" ? s.body.split("\n").filter((l) => l.trim().startsWith("|") && !/^\|[\s|:-]+\|$/.test(l.trim())).map((l) => l.trim().slice(1, -1).split("|").map((x) => x.trim())) : null;
  return (
    <div className="border border-yellow-500/30 bg-yellow-500/[0.03]" data-testid={testId}>
      <div className="px-3 py-1.5 border-b border-yellow-500/20 text-[11px] font-mono uppercase tracking-wider text-yellow-300 flex justify-between"><span>case study · {s.title}</span><span>{s.kind}</span></div>
      {table ? <table className="w-full text-xs"><tbody>{table.map((r, i) => <tr key={i} className={i ? "border-t border-white/5" : "text-cyan-300 font-mono uppercase text-[10px]"}>{r.map((c, j) => <td key={j} className="px-3 py-1.5">{c}</td>)}</tr>)}</tbody></table>
        : <pre className={`p-3 text-xs whitespace-pre-wrap break-all ${s.kind === "log" ? "font-mono text-green-300/90" : "text-slate-200 font-sans"}`}>{s.body}</pre>}
    </div>);
}

export function Options({ q, picked, onPick, reveal, disabled }) {
  const multi = q.type === "multi";
  return (
    <div className="space-y-2" data-testid="question-options">
      {q.options.map((o, i) => {
        const on = picked.includes(o.id), ok = reveal && q.correct?.includes(o.id);
        const cls = reveal ? (ok ? "border-green-500/60 bg-green-500/10" : on ? "border-red-500/60 bg-red-500/10" : "border-white/10") : on ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 hover:border-cyan-400/50";
        return (
          <button key={o.id} type="button" disabled={disabled} onClick={() => onPick(multi ? (on ? picked.filter((x) => x !== o.id) : [...picked, o.id]) : [o.id])}
            className={`w-full text-left border px-3 py-2.5 flex gap-3 transition-colors ${cls} disabled:cursor-default`} data-testid={`option-${o.id}`}>
            <span className={`h-6 w-6 shrink-0 grid place-items-center font-mono text-xs border ${multi ? "" : "rounded-full"} ${on ? "border-cyan-300 text-cyan-200" : "border-white/20 text-slate-400"}`}>{String.fromCharCode(65 + i)}</span>
            <span className="flex-1 text-sm">
              <span className="text-slate-100">{o.text}</span>
              {reveal && o.why && <span className={`block text-xs mt-1 ${ok ? "text-green-300" : "text-slate-400"}`} data-testid={`option-why-${o.id}`}>{ok ? <Check className="inline h-3 w-3 mr-1" /> : <X className="inline h-3 w-3 mr-1 text-red-400" />}{o.why}</span>}
            </span>
          </button>);
      })}
    </div>);
}

export const typeLabel = (q) => (q.type === "multi" ? `Choose ${q.choose}` : q.type === "tf" ? "True / False" : "Single choice");

export function SampleQuestion({ q, i, scenario }) {
  const [p, setP] = useState([]);
  const [show, setShow] = useState(false);
  const [hint, setHint] = useState(false);
  return (
    <Glass className="p-5 space-y-3" data-testid={`sample-question-${i}`}>
      <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase"><span className="text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5">sample {i + 1}</span><span className="text-slate-400 border border-white/10 px-1.5 py-0.5">{q.domain}</span><span className="text-slate-400 border border-white/10 px-1.5 py-0.5">{typeLabel(q)}</span><span className="text-slate-400 border border-white/10 px-1.5 py-0.5">{q.difficulty}</span></div>
      <ScenarioPanel s={scenario} testId={`sample-scenario-${i}`} />
      <p className="text-sm font-semibold">{q.stem}</p>
      <Options q={q} picked={p} onPick={(v) => !show && setP(v)} reveal={show} />
      <div className="flex gap-3 text-xs">
        <button className="glow-btn !text-xs !py-1.5" disabled={!p.length || show} onClick={() => setShow(true)} data-testid={`sample-check-${i}`}>Check answer</button>
        <button className="ghost-btn !text-xs !py-1.5" onClick={() => setHint(true)} data-testid={`sample-hint-${i}`}><Lightbulb className="h-3.5 w-3.5" />Hint</button>
        {show && <span className={`self-center font-mono ${p.length && [...p].sort().join() === [...q.correct].sort().join() ? "text-green-400" : "text-red-400"}`} data-testid={`sample-verdict-${i}`}>{[...p].sort().join() === [...q.correct].sort().join() ? "CORRECT" : "INCORRECT"}</span>}
      </div>
      {hint && <p className="text-xs text-yellow-200 border-l-2 border-yellow-400 pl-2" data-testid={`sample-hint-text-${i}`}>{q.hint}</p>}
    </Glass>);
}
