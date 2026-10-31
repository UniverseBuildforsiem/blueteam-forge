import { useEffect, useState } from "react";
import { Plus, Trash2, Save, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Glass, Empty } from "./common";

const uid = () => Math.random().toString(36).slice(2, 9);
const Lbl = ({ l, children }) => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><div className="mt-1">{children}</div></label>;

const TEMPLATES = {
  paths: () => ({ title: "", description: "", level: "Beginner", category: "Foundations", order: 10, published: false, modules: [] }),
  quizzes: () => ({ title: "", topic: "", time_limit_sec: 0, pass_mark: 70, path_id: null, published: false, questions: [] }),
  sessions: () => ({ title: "", description: "", instructor: "", start: new Date(Date.now() + 864e5).toISOString(), duration_min: 60, join_link: "", capacity: 50, recording_url: "" }),
  ctfs: () => ({ category: "Log Analysis", title: "", points: 100, flag: "SOCF{}", description: "", hints: [{ text: "", cost: 20 }], published: false }),
  challenges: () => ({ title: "", category: "Phishing", severity: "Medium", points: 100, verdict: "TP", description: "", alert: { rule: "", host: "", user: "" }, evidence: [], keywords: [], published: false }),
  labs: () => ({ title: "", description: "", difficulty: "Beginner", duration: "30 min", published: false, tasks: [{ id: "t1", title: "", question: "", answer: "", hint: "" }], kali: { fs: { "/home/analyst/README.txt": "" }, net: { whois: {}, dns: {}, nmap: {}, curl: {} }, pcap: "", cracked: {} } }),
};

function PathBuilder({ d, set }) {
  const mods = d.modules;
  const upMod = (i, m) => set({ ...d, modules: mods.map((x, j) => (j === i ? m : x)) });
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Lbl l="Title"><input className="field" value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} data-testid="builder-path-title" /></Lbl>
        <Lbl l="Level"><input className="field" value={d.level} onChange={(e) => set({ ...d, level: e.target.value })} /></Lbl>
        <Lbl l="Category"><input className="field" value={d.category} onChange={(e) => set({ ...d, category: e.target.value })} /></Lbl>
        <Lbl l="Order"><input type="number" className="field" value={d.order} onChange={(e) => set({ ...d, order: +e.target.value })} /></Lbl>
      </div>
      <Lbl l="Description"><textarea className="field h-20" value={d.description} onChange={(e) => set({ ...d, description: e.target.value })} data-testid="builder-path-description" /></Lbl>
      {mods.map((m, i) => (
        <Glass key={m.id} className="p-4 space-y-3">
          <div className="flex gap-2"><input className="field font-mono" value={m.title} placeholder="Module title" onChange={(e) => upMod(i, { ...m, title: e.target.value })} data-testid={`builder-module-title-${i}`} />
            <button onClick={() => set({ ...d, modules: mods.filter((_, j) => j !== i) })} className="text-red-400"><Trash2 className="h-4 w-4" /></button></div>
          {m.lessons.map((l, k) => {
            const upL = (nl) => upMod(i, { ...m, lessons: m.lessons.map((x, j) => (j === k ? nl : x)) });
            return (
              <div key={l.id} className="border-l-2 border-cyan-500/30 pl-3 space-y-2">
                <div className="flex gap-2"><input className="field" placeholder="Lesson title" value={l.title} onChange={(e) => upL({ ...l, title: e.target.value })} data-testid={`builder-lesson-title-${i}-${k}`} />
                  <button onClick={() => upMod(i, { ...m, lessons: m.lessons.filter((_, j) => j !== k) })} className="text-red-400"><Trash2 className="h-4 w-4" /></button></div>
                <textarea className="field h-28 text-sm" placeholder="Lesson content (rich text: use line breaks, '- ' bullets)" value={l.content} onChange={(e) => upL({ ...l, content: e.target.value })} />
                <div className="grid sm:grid-cols-3 gap-2">
                  <input className="field text-xs" placeholder="Video embed URL" value={l.video_url} onChange={(e) => upL({ ...l, video_url: e.target.value })} />
                  <input className="field text-xs" placeholder="Resource name" value={l.resources?.[0]?.name || ""} onChange={(e) => upL({ ...l, resources: [{ name: e.target.value, url: l.resources?.[0]?.url || "" }] })} />
                  <input className="field text-xs" placeholder="Resource file URL" value={l.resources?.[0]?.url || ""} onChange={(e) => upL({ ...l, resources: [{ name: l.resources?.[0]?.name || "Resource", url: e.target.value }] })} />
                </div>
              </div>);
          })}
          <button className="ghost-btn !text-xs" onClick={() => upMod(i, { ...m, lessons: [...m.lessons, { id: `l-${uid()}`, title: "", content: "", video_url: "", minutes: 10, resources: [] }] })} data-testid={`builder-add-lesson-${i}`}><Plus className="h-3 w-3" />Lesson</button>
        </Glass>))}
      <button className="ghost-btn" onClick={() => set({ ...d, modules: [...mods, { id: `m-${uid()}`, title: "", lessons: [] }] })} data-testid="builder-add-module"><Plus className="h-4 w-4" />Module</button>
    </div>
  );
}

function QuizBuilder({ d, set }) {
  const qs = d.questions;
  const upQ = (i, q) => set({ ...d, questions: qs.map((x, j) => (j === i ? q : x)) });
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-4 gap-3">
        <Lbl l="Title"><input className="field" value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} data-testid="builder-quiz-title" /></Lbl>
        <Lbl l="Topic"><input className="field" value={d.topic} onChange={(e) => set({ ...d, topic: e.target.value })} /></Lbl>
        <Lbl l="Time limit (sec, 0=none)"><input type="number" className="field" value={d.time_limit_sec} onChange={(e) => set({ ...d, time_limit_sec: +e.target.value })} /></Lbl>
        <Lbl l="Final exam for path id"><input className="field" value={d.path_id || ""} onChange={(e) => set({ ...d, path_id: e.target.value || null })} /></Lbl>
      </div>
      {qs.map((q, i) => (
        <Glass key={q.id} className="p-4 space-y-2">
          <div className="flex gap-2"><select className="field !w-36" value={q.type} onChange={(e) => upQ(i, { ...q, type: e.target.value, ...(e.target.value === "tf" ? { options: ["True", "False"], answer: [0] } : {}) })}>
            <option value="mcq">MCQ</option><option value="multi">Multi-select</option><option value="tf">True/False</option></select>
            <input className="field" placeholder="Question" value={q.text} onChange={(e) => upQ(i, { ...q, text: e.target.value })} data-testid={`builder-question-${i}`} />
            <button onClick={() => set({ ...d, questions: qs.filter((_, j) => j !== i) })} className="text-red-400"><Trash2 className="h-4 w-4" /></button></div>
          {q.options.map((o, k) => (
            <div key={k} className="flex gap-2 items-center"><input type="checkbox" checked={q.answer.includes(k)} onChange={() => upQ(i, { ...q, answer: q.type === "multi" ? (q.answer.includes(k) ? q.answer.filter((x) => x !== k) : [...q.answer, k]) : [k] })} />
              <input className="field !py-1 text-sm" value={o} disabled={q.type === "tf"} onChange={(e) => upQ(i, { ...q, options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} /></div>))}
          {q.type !== "tf" && <button className="text-xs font-mono text-cyan-400" onClick={() => upQ(i, { ...q, options: [...q.options, ""] })}>+ option</button>}
          <div className="grid sm:grid-cols-2 gap-2"><input className="field text-sm" placeholder="Explanation" value={q.explanation} onChange={(e) => upQ(i, { ...q, explanation: e.target.value })} />
            <input className="field text-sm" placeholder="Topic (for radar)" value={q.topic} onChange={(e) => upQ(i, { ...q, topic: e.target.value })} /></div>
        </Glass>))}
      <button className="ghost-btn" onClick={() => set({ ...d, questions: [...qs, { id: `q-${uid()}`, type: "mcq", text: "", options: ["", ""], answer: [0], explanation: "", topic: d.topic }] })} data-testid="builder-add-question"><Plus className="h-4 w-4" />Question</button>
    </div>
  );
}

function SessionForm({ d, set }) {
  const F = (k, l, t = "text") => <Lbl l={l}><input type={t} className="field" value={t === "datetime-local" ? d[k].slice(0, 16) : d[k]} onChange={(e) => set({ ...d, [k]: t === "number" ? +e.target.value : t === "datetime-local" ? new Date(e.target.value).toISOString() : e.target.value })} data-testid={`session-form-${k}`} /></Lbl>;
  return <div className="grid sm:grid-cols-2 gap-3">{F("title", "Title")}{F("instructor", "Instructor")}{F("start", "Date / time", "datetime-local")}{F("duration_min", "Duration (min)", "number")}{F("join_link", "Join link")}{F("capacity", "Capacity", "number")}{F("recording_url", "Recording URL (after event)")}
    <div className="sm:col-span-2"><Lbl l="Description"><textarea className="field h-20" value={d.description} onChange={(e) => set({ ...d, description: e.target.value })} /></Lbl></div></div>;
}

function JsonForm({ d, set }) {
  const [txt, setTxt] = useState(JSON.stringify(d, null, 2));
  const [err, setErr] = useState("");
  return <div><textarea className="field h-[480px] font-mono text-xs" value={txt} onChange={(e) => { setTxt(e.target.value); try { set(JSON.parse(e.target.value)); setErr(""); } catch (x) { setErr(x.message); } }} data-testid="builder-json" />
    {err && <div className="text-xs text-red-400 font-mono mt-1">{err}</div>}<div className="text-xs text-slate-500 mt-1 font-mono">Labs ship as JSON seed data: tasks, Kali filesystem, network fixtures, pcap summary and cracked hashes.</div></div>;
}

const FORMS = { paths: PathBuilder, quizzes: QuizBuilder, sessions: SessionForm, ctfs: JsonForm, challenges: JsonForm, labs: JsonForm };

export default function ContentEditor({ kind }) {
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const load = () => api.get(`/manage/${kind}`).then((r) => setItems(r.data));
  useEffect(() => { setEdit(null); load(); }, [kind]); // eslint-disable-line
  const save = async () => {
    try {
      if (isNew) await api.post(`/manage/${kind}`, edit); else await api.put(`/manage/${kind}/${edit.id}`, edit);
      toast.success("Saved"); setEdit(null); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (id) => { if (!window.confirm("Delete this item?")) return; await api.delete(`/manage/${kind}/${id}`); load(); };
  if (edit) {
    const Form = FORMS[kind];
    return (
      <div>
        <div className="flex justify-between mb-4"><button className="ghost-btn" onClick={() => setEdit(null)} data-testid="builder-back"><ChevronLeft className="h-4 w-4" />Back</button>
          <div className="flex gap-3 items-center">{"published" in edit && <label className="text-sm font-mono flex items-center gap-2"><input type="checkbox" checked={!!edit.published} onChange={(e) => setEdit({ ...edit, published: e.target.checked })} data-testid="builder-published" />Published</label>}
            <button className="glow-btn" onClick={save} data-testid="builder-save"><Save className="h-4 w-4" />Save</button></div></div>
        <Form key={edit.id || "new"} d={edit} set={setEdit} />
      </div>
    );
  }
  return (
    <div>
      <button className="glow-btn mb-4" onClick={() => { setIsNew(true); setEdit(TEMPLATES[kind]()); }} data-testid={`content-new-${kind}`}><Plus className="h-4 w-4" />New</button>
      <Glass className="divide-y divide-white/5">{items.length ? items.map((it) => (
        <div key={it.id} className="p-3 flex items-center gap-3" data-testid={`content-item-${it.id}`}>
          <span className="flex-1 text-sm">{it.title}</span>
          {"published" in it && <span className={`text-[10px] font-mono ${it.published ? "text-green-400" : "text-slate-500"}`}>{it.published ? "PUBLISHED" : "DRAFT"}</span>}
          <button className="ghost-btn !py-1 !text-xs" onClick={() => { setIsNew(false); setEdit(it); }} data-testid={`content-edit-${it.id}`}>Edit</button>
          <button className="text-slate-500 hover:text-red-400" onClick={() => del(it.id)} data-testid={`content-delete-${it.id}`}><Trash2 className="h-4 w-4" /></button>
        </div>)) : <Empty text="nothing here yet" />}</Glass>
    </div>
  );
}
