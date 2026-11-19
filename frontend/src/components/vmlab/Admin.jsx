import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { api, errMsg } from "../../lib/api";
import { Glass } from "../common";

const BLANK = { kind: "lab", module: 1, order: 1, title: "", summary: "", intro: "", minutes: 15, difficulty: "Beginner", free: false, status: "draft", tasks: [], questions: [], challenges: [] };
const NEW = {
  tasks: (n) => ({ id: `t${n + 1}`, title: "", instruction: "", hint: "", solution: "", check: { type: "event", event: "agent.installed" } }),
  questions: () => ({ q: "", options: ["", "", "", ""], answer: 0, explain: "" }),
  challenges: () => ({ q: "", answer: "", points: 100, hint: "" }),
};
const F = ({ l, children, className = "" }) => <label className={`block text-[11px] text-slate-400 space-y-1 ${className}`}><span>{l}</span>{children}</label>;

function TaskRow({ t, set, events }) {
  const c = t.check, m = Object.entries(c.match || {})[0] || ["", ""];
  const setC = (x) => set({ ...t, check: { ...c, ...x } });
  return <div className="grid sm:grid-cols-2 gap-2">
    <F l="Task title"><input className="field !py-1 !text-xs" value={t.title} onChange={(e) => set({ ...t, title: e.target.value })} data-testid="vma-task-title" /></F>
    <F l="Completes when"><select className="field !py-1 !text-xs" value={c.type} onChange={(e) => set({ ...t, check: e.target.value === "answer" ? { type: "answer", answer: "" } : { type: "event", event: Object.keys(events)[0] } })} data-testid="vma-task-type"><option value="event">Learner performs an action</option><option value="answer">Learner types an answer</option></select></F>
    <F l="Instruction" className="sm:col-span-2"><textarea className="field h-16 !text-xs" value={t.instruction} onChange={(e) => set({ ...t, instruction: e.target.value })} /></F>
    {c.type === "event" ? <><F l="Action"><select className="field !py-1 !text-xs" value={c.event} onChange={(e) => setC({ event: e.target.value })} data-testid="vma-task-event">{Object.entries(events).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
      <div className="grid grid-cols-2 gap-2"><F l="Match field (optional)"><input className="field !py-1 !text-xs" placeholder="e.g. host" value={m[0]} onChange={(e) => setC({ match: e.target.value ? { [e.target.value]: m[1] } : {} })} /></F><F l="Pattern (regex)"><input className="field !py-1 !text-xs" placeholder="e.g. WIN-LAB-01" value={m[1]} onChange={(e) => m[0] && setC({ match: { [m[0]]: e.target.value } })} /></F></div></>
      : <F l="Expected answer" className="sm:col-span-2"><input className="field !py-1 !text-xs font-mono" value={c.answer || ""} onChange={(e) => setC({ answer: e.target.value })} data-testid="vma-task-answer" /></F>}
    <F l="Hint"><input className="field !py-1 !text-xs" value={t.hint} onChange={(e) => set({ ...t, hint: e.target.value })} /></F>
    <F l="Solution"><input className="field !py-1 !text-xs font-mono" value={t.solution} onChange={(e) => set({ ...t, solution: e.target.value })} /></F>
  </div>;
}

function QRow({ q, set }) {
  return <div className="space-y-2"><F l="Question"><input className="field !py-1 !text-xs" value={q.q} onChange={(e) => set({ ...q, q: e.target.value })} data-testid="vma-q-text" /></F>
    {q.options.map((o, j) => <div key={j} className="flex gap-2 items-center"><input type="radio" checked={q.answer === j} onChange={() => set({ ...q, answer: j })} aria-label={`Correct option ${j + 1}`} />
      <input className="field !py-1 !text-xs" placeholder={`Option ${j + 1}`} value={o} onChange={(e) => set({ ...q, options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} data-testid={`vma-q-opt-${j}`} /></div>)}
    <F l="Explanation"><input className="field !py-1 !text-xs" value={q.explain} onChange={(e) => set({ ...q, explain: e.target.value })} /></F></div>;
}

function CRow({ c, set }) {
  return <div className="grid sm:grid-cols-[1fr_160px_90px] gap-2"><F l="Challenge question"><input className="field !py-1 !text-xs" value={c.q} onChange={(e) => set({ ...c, q: e.target.value })} data-testid="vma-c-q" /></F>
    <F l="Flag / answer"><input className="field !py-1 !text-xs font-mono" value={c.answer} onChange={(e) => set({ ...c, answer: e.target.value })} data-testid="vma-c-answer" /></F>
    <F l="Points"><input type="number" className="field !py-1 !text-xs" value={c.points} onChange={(e) => set({ ...c, points: Number(e.target.value) })} /></F>
    <F l="Hint" className="sm:col-span-3"><input className="field !py-1 !text-xs" value={c.hint} onChange={(e) => set({ ...c, hint: e.target.value })} /></F></div>;
}

function Editor({ init, events, onDone }) {
  const [d, setD] = useState({ ...BLANK, ...init });
  const list = d.kind === "lab" ? "tasks" : d.kind === "quiz" ? "questions" : "challenges";
  const Row = { tasks: TaskRow, questions: QRow, challenges: CRow }[list];
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Number(e.target.value) : e.target.value });
  const setRow = (i, v) => setD({ ...d, [list]: d[list].map((x, j) => (j === i ? v : x)) });
  const save = async () => {
    const body = { ...d, tasks: d.kind === "lab" ? d.tasks : [], questions: d.kind === "quiz" ? d.questions : [], challenges: d.kind === "ctf" ? d.challenges : [] };
    try { await (d.id ? api.put(`/vmlab/admin/items/${d.id}`, body) : api.post("/vmlab/admin/items", body)); toast.success("Saved"); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return <Glass className="p-5 space-y-4" data-testid="vma-editor">
    <div className="flex items-center"><div className="font-bold flex-1">{d.id ? "Edit" : "New"} {d.kind}</div><button onClick={() => onDone(true)} className="ghost-btn !text-xs" data-testid="vma-cancel"><X className="h-3.5 w-3.5" />Cancel</button></div>
    <div className="grid sm:grid-cols-4 gap-3">
      <F l="Type"><select className="field !py-1.5 !text-xs" value={d.kind} disabled={!!d.id} onChange={set("kind")} data-testid="vma-kind"><option value="lab">Lab</option><option value="quiz">Quiz</option><option value="ctf">CTF</option></select></F>
      <F l="Module"><select className="field !py-1.5 !text-xs" value={d.module} onChange={(e) => setD({ ...d, module: Number(e.target.value) })} data-testid="vma-module">{[1, 2, 3, 4].map((m) => <option key={m} value={m}>Module {m}</option>)}</select></F>
      <F l="Order"><input type="number" className="field !py-1.5 !text-xs" value={d.order} onChange={set("order")} /></F>
      <F l="Minutes"><input type="number" className="field !py-1.5 !text-xs" value={d.minutes} onChange={set("minutes")} /></F>
      <F l="Title" className="sm:col-span-2"><input className="field !py-1.5 !text-xs" value={d.title} onChange={set("title")} data-testid="vma-title" /></F>
      <F l="Difficulty"><select className="field !py-1.5 !text-xs" value={d.difficulty} onChange={set("difficulty")}>{["Beginner", "Intermediate", "Advanced"].map((x) => <option key={x}>{x}</option>)}</select></F>
      <F l="Status"><select className="field !py-1.5 !text-xs" value={d.status} onChange={set("status")} data-testid="vma-status"><option value="draft">Draft</option><option value="published">Published</option></select></F>
      <F l="Summary" className="sm:col-span-4"><input className="field !py-1.5 !text-xs" value={d.summary} onChange={set("summary")} /></F>
      {d.kind === "lab" && <F l="Scenario / intro" className="sm:col-span-4"><textarea className="field h-20 !text-xs" value={d.intro} onChange={set("intro")} /></F>}
      <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={d.free} onChange={set("free")} data-testid="vma-free" />Free preview</label>
    </div>
    <div className="space-y-3"><div className="eyebrow">{list}</div>
      {d[list].map((x, i) => <div key={i} className="border border-white/10 p-3 relative" data-testid={`vma-row-${i}`}><button onClick={() => setD({ ...d, [list]: d[list].filter((_, j) => j !== i) })} className="absolute top-2 right-2 text-slate-500 hover:text-red-400" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
        <div className="pr-6"><Row t={x} q={x} c={x} events={events} set={(v) => setRow(i, v)} /></div></div>)}
      <button className="ghost-btn !text-xs" onClick={() => setD({ ...d, [list]: [...d[list], NEW[list](d[list].length)] })} data-testid="vma-add-row"><Plus className="h-3.5 w-3.5" />Add {list === "tasks" ? "task" : list === "questions" ? "question" : "challenge"}</button></div>
    <button className="glow-btn" onClick={save} data-testid="vma-save"><Save className="h-4 w-4" />Save</button>
  </Glass>;
}

function Settings({ s, onSaved }) {
  const [price, setPrice] = useState(s.price);
  const [ids, setIds] = useState(s.course_ids || []);
  const [cs, setCs] = useState([]);
  useEffect(() => { api.get("/academy/courses").then((r) => setCs(r.data)); }, []);
  const save = () => api.put("/vmlab/admin/settings", { price: Number(price), course_ids: ids }).then(() => { toast.success("Access settings saved"); onSaved(); }).catch((e) => toast.error(errMsg(e)));
  return <Glass className="p-5 space-y-3" data-testid="vma-settings"><div className="font-bold">Access & pricing</div>
    <F l="One-time price (₹), 0 = not for sale"><input type="number" className="field !py-1.5 !text-xs max-w-[160px]" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="vma-price" /></F>
    <div><div className="text-[11px] text-slate-400 mb-1.5">Courses that include the full lab for free</div><div className="flex flex-wrap gap-2">{!cs.length && <span className="text-xs text-slate-500">No published courses yet.</span>}{cs.map((c) => <label key={c.id} className="flex items-center gap-1.5 text-xs border border-white/10 px-2 py-1"><input type="checkbox" checked={ids.includes(c.id)} onChange={(e) => setIds(e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} data-testid={`vma-course-${c.id}`} />{c.title}</label>)}</div></div>
    <button className="glow-btn !text-xs" onClick={save} data-testid="vma-settings-save">Save access settings</button></Glass>;
}

export function VmAdmin({ onChange }) {
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => api.get("/vmlab/admin/items").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  if (!d) return null;
  const del = async (it) => { if (!window.confirm(`Delete "${it.title}"? Learner progress for it is removed.`)) return; await api.delete(`/vmlab/admin/items/${it.id}`); load(); onChange(); };
  if (edit) return <Editor init={edit} events={d.events} onDone={(cancel) => { setEdit(null); if (!cancel) { load(); onChange(); } }} />;
  return <div className="space-y-4" data-testid="vm-admin">
    <Settings s={d.settings} onSaved={onChange} />
    <div className="flex justify-between items-center"><div className="font-bold">Labs, quizzes & CTFs</div><button className="glow-btn !text-xs" onClick={() => setEdit({})} data-testid="vma-new"><Plus className="h-3.5 w-3.5" />New item</button></div>
    {d.modules.map((m) => <Glass key={m.id} className="p-4"><div className="eyebrow mb-2">module {m.id} · {m.title}</div>
      {d.items.filter((i) => i.module === m.id).map((it) => <div key={it.id} className="flex items-center gap-3 border-b border-white/5 py-2 text-sm" data-testid={`vma-item-${it.id}`}>
        <span className="text-[10px] font-mono uppercase w-10 text-cyan-300">{it.kind}</span><span className="flex-1 truncate">{it.title}</span><span className={`text-[10px] font-mono ${it.status === "published" ? "text-green-400" : "text-yellow-300"}`}>{it.status}</span>
        <button onClick={() => setEdit(it)} className="text-slate-400 hover:text-cyan-300" aria-label="Edit" data-testid={`vma-edit-${it.id}`}><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => del(it)} className="text-slate-400 hover:text-red-400" aria-label="Delete" data-testid={`vma-delete-${it.id}`}><Trash2 className="h-3.5 w-3.5" /></button></div>)}
      {!d.items.some((i) => i.module === m.id) && <p className="text-xs text-slate-500">Nothing yet.</p>}</Glass>)}
  </div>;
}
