import { useMemo, useState } from "react";
import { HelpCircle, Zap, Siren, CheckCircle2, Undo2, RotateCcw, Copy, FileText, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const KIND = {
  question: { Icon: HelpCircle, cls: "text-cyan-300 border-cyan-500/40", tag: "decision" },
  action: { Icon: Zap, cls: "text-yellow-300 border-yellow-500/40", tag: "action" },
  escalate: { Icon: Siren, cls: "text-red-300 border-red-500/50", tag: "escalate" },
  close: { Icon: CheckCircle2, cls: "text-green-300 border-green-500/50", tag: "close" },
};

function History({ steps, nodes, undo }) {
  if (!steps.length) return null;
  return (
    <ol className="space-y-1 mb-4" data-testid="pb-history">{steps.map((s, i) => { const n = nodes[s.node];
      return <li key={i} className="flex items-start gap-2 text-xs font-mono text-slate-400"><span className="text-slate-600 w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
        <span className="flex-1"><span className="text-slate-300">{n.title}</span>{s.answer !== null && s.answer !== undefined && <> <ChevronRight className="inline h-3 w-3" /> <span className="text-cyan-300">{n.answers[s.answer].label}</span></>}</span></li>; })}
      <li><button onClick={undo} className="text-[11px] font-mono text-slate-500 hover:text-cyan-300 inline-flex items-center gap-1 mt-1" data-testid="pb-undo"><Undo2 className="h-3 w-3" />back one step</button></li>
    </ol>);
}

function Report({ pb, end, steps, nodes }) {
  const [f, setF] = useState({});
  const md = () => [`# Incident report — ${pb.title}`, `Severity: ${pb.severity} · Outcome: ${end.title}`, "", "## Decision path",
    ...steps.map((s, i) => `${i + 1}. ${nodes[s.node].title}${s.answer != null ? ` → ${nodes[s.node].answers[s.answer].label}` : ""}`), "",
    ...(pb.report || []).flatMap((r) => [`## ${r.section}`, f[r.section] || "_(not filled)_", ""])].join("\n");
  const copy = () => { navigator.clipboard.writeText(md()); toast.success("Report copied as Markdown"); };
  return (
    <div className="mt-5 border-t border-white/10 pt-5" data-testid="pb-report">
      <div className="flex items-center gap-2 mb-3"><FileText className="h-4 w-4 text-cyan-400" /><span className="font-bold text-sm flex-1">Final step · Incident report template</span>
        <button onClick={copy} className="ghost-btn !text-xs !py-1" data-testid="pb-report-copy"><Copy className="h-3.5 w-3.5" />Copy report</button></div>
      <div className="space-y-3">{(pb.report || []).map((r, i) => <label key={r.section} className="block">
        <span className="text-[11px] font-mono uppercase text-slate-400">{r.section}</span>
        <textarea className="field mt-1 h-20 text-xs" placeholder={r.prompt} value={f[r.section] || ""} onChange={(e) => setF({ ...f, [r.section]: e.target.value })} data-testid={`pb-report-field-${i}`} /></label>)}</div>
    </div>);
}

export function PlaybookRunner({ pb, onFinish }) {
  const nodes = useMemo(() => Object.fromEntries(pb.nodes.map((n) => [n.id, n])), [pb]);
  const [steps, setSteps] = useState([]);
  const [cur, setCur] = useState(pb.start);
  const n = nodes[cur];
  const done = n && (n.type === "escalate" || n.type === "close");
  const go = (answer, next) => {
    const s = [...steps, { node: cur, answer }];
    setSteps(s); setCur(next);
    const nx = nodes[next];
    if (nx && (nx.type === "escalate" || nx.type === "close")) onFinish?.([...s, { node: next, answer: null }], nx);
  };
  const undo = () => { const s = steps.slice(0, -1); setCur(steps[steps.length - 1].node); setSteps(s); };
  const restart = () => { setSteps([]); setCur(pb.start); };
  if (!n) return <div className="text-sm text-red-300">This playbook has a broken step.</div>;
  const k = KIND[n.type];
  return (
    <div data-testid="pb-runner">
      <History steps={steps} nodes={nodes} undo={undo} />
      <div className={`border-l-2 ${k.cls} bg-black/30 p-4`} data-testid={`pb-node-${n.id}`}>
        <div className={`text-[10px] font-mono uppercase flex items-center gap-1.5 ${k.cls.split(" ")[0]}`}><k.Icon className="h-3.5 w-3.5" />{k.tag} · step {steps.length + 1}</div>
        <div className="font-bold mt-1.5" data-testid="pb-node-title">{n.title}</div>
        <p className="text-sm text-slate-300 mt-1.5 whitespace-pre-line">{n.text}</p>
        {n.type === "question" && <div className="grid gap-2 mt-4">{n.answers.map((a, i) => <button key={i} onClick={() => go(i, a.next)} className="text-left text-sm border border-white/10 hover:border-cyan-400 hover:bg-cyan-500/5 px-3 py-2 transition-colors" data-testid={`pb-answer-${i}`}>{a.label}</button>)}</div>}
        {n.type === "action" && <button onClick={() => go(null, n.next)} className="glow-btn !text-xs mt-4" data-testid="pb-action-done">Done — next step <ChevronRight className="h-3.5 w-3.5" /></button>}
        {done && <div className={`mt-3 text-xs font-mono ${k.cls.split(" ")[0]}`} data-testid="pb-outcome">{n.type === "escalate" ? "Outcome: escalated as a true positive" : "Outcome: closed as benign / false positive"}</div>}
      </div>
      {done && <><Report pb={pb} end={n} steps={[...steps, { node: cur, answer: null }]} nodes={nodes} />
        <button onClick={restart} className="mt-4 text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1.5" data-testid="pb-restart"><RotateCcw className="h-3.5 w-3.5" />Run the playbook again</button></>}
    </div>);
}

export const MitreTags = ({ tags }) => <div className="flex flex-wrap gap-1.5">{(tags || []).map((t) => <a key={t} href={`https://attack.mitre.org/techniques/${t.split(" ")[0].replace(".", "/")}/`} target="_blank" rel="noreferrer"
  className="text-[10px] font-mono border border-purple-400/30 text-purple-200 px-1.5 py-0.5 hover:bg-purple-500/10" data-testid={`pb-mitre-${t.split(" ")[0]}`}>{t}</a>)}</div>;
