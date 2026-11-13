import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { Glass } from "../common";

const CATS = ["Brute Force", "Cloud", "Command and Control", "Data Exfiltration", "Insider Threat", "Lateral Movement", "Linux", "Malware", "Networking", "Persistence", "Phishing", "Privilege Escalation", "Ransomware", "Web Attacks"];
const TYPES = ["question", "action", "escalate", "close"];
const L = ({ l, children }) => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><div className="mt-1">{children}</div></label>;
const lines = (a) => (a || []).join("\n");
const split = (s, sep = "\n") => s.split(sep).map((x) => x.trim()).filter(Boolean);

function NextSelect({ value, ids, onChange, tid }) {
  return <select className="field text-xs !w-36" value={value || ""} onChange={(e) => onChange(e.target.value)} data-testid={tid}><option value="">— next —</option>{ids.map((i) => <option key={i}>{i}</option>)}</select>;
}

function NodeCard({ n, ids, up, del, i }) {
  const setA = (j, a) => up({ ...n, answers: n.answers.map((x, k) => (k === j ? a : x)) });
  return (
    <div className="border border-white/10 p-3 space-y-2" data-testid={`pb-edit-node-${i}`}>
      <div className="flex gap-2"><input className="field text-xs font-mono !w-24" value={n.id} onChange={(e) => up({ ...n, id: e.target.value.trim() })} data-testid={`pb-edit-node-id-${i}`} />
        <select className="field text-xs !w-32" value={n.type} onChange={(e) => up({ ...n, type: e.target.value, answers: e.target.value === "question" ? n.answers || [{ label: "", next: "" }, { label: "", next: "" }] : undefined, next: e.target.value === "action" ? n.next || "" : undefined })} data-testid={`pb-edit-node-type-${i}`}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <input className="field text-xs" placeholder="Step title" value={n.title} onChange={(e) => up({ ...n, title: e.target.value })} data-testid={`pb-edit-node-title-${i}`} />
        <button onClick={del} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div>
      <textarea className="field h-16 text-xs" placeholder="Question / action / outcome text" value={n.text} onChange={(e) => up({ ...n, text: e.target.value })} data-testid={`pb-edit-node-text-${i}`} />
      {n.type === "action" && <NextSelect value={n.next} ids={ids} onChange={(v) => up({ ...n, next: v })} tid={`pb-edit-node-next-${i}`} />}
      {n.type === "question" && <div className="space-y-1.5">{n.answers.map((a, j) => <div key={j} className="flex gap-2">
        <input className="field text-xs" placeholder={`Answer ${j + 1}`} value={a.label} onChange={(e) => setA(j, { ...a, label: e.target.value })} data-testid={`pb-edit-answer-${i}-${j}`} />
        <NextSelect value={a.next} ids={ids} onChange={(v) => setA(j, { ...a, next: v })} tid={`pb-edit-answer-next-${i}-${j}`} />
        {n.answers.length > 2 && <button onClick={() => up({ ...n, answers: n.answers.filter((_, k) => k !== j) })} className="text-slate-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>}</div>)}
        {n.answers.length < 4 && <button className="text-[11px] font-mono text-cyan-400" onClick={() => up({ ...n, answers: [...n.answers, { label: "", next: "" }] })} data-testid={`pb-edit-add-answer-${i}`}>+ answer</button>}</div>}
    </div>);
}

export function PlaybookForm({ d, set }) {
  const [labs, setLabs] = useState([]);
  useEffect(() => { api.get("/manage/labs").then((r) => setLabs(r.data)); }, []);
  const nodes = d.nodes || [];
  const ids = nodes.map((n) => n.id);
  const upN = (i, n) => set({ ...d, nodes: nodes.map((x, j) => (j === i ? n : x)) });
  const toggle = (k, v) => set({ ...d, [k]: (d[k] || []).includes(v) ? d[k].filter((x) => x !== v) : [...(d[k] || []), v] });
  return (
    <div className="space-y-4" data-testid="playbook-form">
      <div className="grid sm:grid-cols-[1fr_140px] gap-3"><L l="Title"><input className="field" value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} data-testid="pb-edit-title" /></L>
        <L l="Severity"><select className="field" value={d.severity} onChange={(e) => set({ ...d, severity: e.target.value })} data-testid="pb-edit-severity">{["Low", "Medium", "High", "Critical"].map((s) => <option key={s}>{s}</option>)}</select></L></div>
      <L l="Summary"><input className="field" value={d.summary || ""} onChange={(e) => set({ ...d, summary: e.target.value })} data-testid="pb-edit-summary" /></L>
      <div className="grid sm:grid-cols-2 gap-3"><L l="MITRE ATT&CK (one per line, e.g. T1110 Brute Force)"><textarea className="field h-24 text-xs font-mono" value={lines(d.mitre)} onChange={(e) => set({ ...d, mitre: split(e.target.value) })} data-testid="pb-edit-mitre" /></L>
        <L l="Trigger conditions (one per line)"><textarea className="field h-24 text-xs" value={lines(d.triggers)} onChange={(e) => set({ ...d, triggers: split(e.target.value) })} data-testid="pb-edit-triggers" /></L></div>
      <L l="Applies to challenge categories"><div className="flex flex-wrap gap-1.5">{CATS.map((c) => <button key={c} type="button" onClick={() => toggle("categories", c)} className={`text-[11px] font-mono px-2 py-1 border ${(d.categories || []).includes(c) ? "border-cyan-400 text-cyan-300" : "border-white/10 text-slate-500"}`} data-testid={`pb-edit-cat-${c}`}>{c}</button>)}</div></L>
      <L l="Linked labs"><div className="flex flex-wrap gap-1.5">{labs.map((l) => <button key={l.id} type="button" onClick={() => toggle("labs", l.id)} className={`text-[11px] font-mono px-2 py-1 border ${(d.labs || []).includes(l.id) ? "border-green-400 text-green-300" : "border-white/10 text-slate-500"}`} data-testid={`pb-edit-lab-${l.id}`}>{l.title}</button>)}</div></L>
      <Glass className="p-3 space-y-2"><div className="flex items-center gap-2"><span className="eyebrow flex-1">decision tree ({nodes.length} steps)</span>
        <span className="text-[11px] font-mono text-slate-500">start</span><NextSelect value={d.start} ids={ids} onChange={(v) => set({ ...d, start: v })} tid="pb-edit-start" /></div>
        {nodes.map((n, i) => <NodeCard key={i} i={i} n={n} ids={ids.filter((x) => x !== n.id)} up={(x) => upN(i, x)} del={() => set({ ...d, nodes: nodes.filter((_, j) => j !== i) })} />)}
        <button className="ghost-btn !text-xs" onClick={() => set({ ...d, nodes: [...nodes, { id: `n${nodes.length + 1}`, type: "question", title: "", text: "", answers: [{ label: "", next: "" }, { label: "", next: "" }] }] })} data-testid="pb-edit-add-node"><Plus className="h-3.5 w-3.5" />Add step</button></Glass>
      <L l="Incident report sections (Section | what to write, one per line)"><textarea className="field h-28 text-xs" value={(d.report || []).map((r) => `${r.section} | ${r.prompt}`).join("\n")}
        onChange={(e) => set({ ...d, report: split(e.target.value).map((x) => { const [s, ...p] = x.split("|"); return { section: s.trim(), prompt: p.join("|").trim() }; }) })} data-testid="pb-edit-report" /></L>
    </div>);
}

export const playbookTemplate = () => ({ title: "Playbook: ", severity: "Medium", summary: "", mitre: [], triggers: [], categories: [], labs: [], start: "q1", source: { type: "custom", id: "", title: "Custom" },
  nodes: [{ id: "q1", type: "question", title: "Is the activity expected?", text: "", answers: [{ label: "Yes - known/benign", next: "c1" }, { label: "No - unexplained", next: "e1" }] },
    { id: "e1", type: "escalate", title: "Escalate to L2 / IR", text: "" }, { id: "c1", type: "close", title: "Close as false positive", text: "" }],
  report: [{ section: "Summary", prompt: "What happened" }, { section: "Actions taken", prompt: "" }, { section: "Recommendations", prompt: "" }], published: true });
