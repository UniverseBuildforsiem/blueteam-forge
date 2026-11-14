import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Eye, Pencil, X, Layers, FileText, Sparkles, Wand2, Flag } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Glass, Empty } from "./common";
import { LessonBody } from "../pages/app/Paths";
import { LessonQuizBuilder } from "./LessonQuizBuilder";
import { BulkQuiz } from "./BulkQuiz";
import { CtfCreator } from "./CtfCreator";
import { VideoField } from "./VideoField";

const uid = () => Math.random().toString(36).slice(2, 9);
const Lbl = ({ l, children }) => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><div className="mt-1">{children}</div></label>;
const TYPES = [["quiz", "Quiz"], ["lab", "Lab"], ["challenge", "SOC challenge"], ["ctf", "CTF"], ["course", "Course"], ["sop", "SOP"], ["siem", "SIEM simulator"], ["shift", "Shift simulator"]];
const STATIC = { siem: [{ id: "siem", title: "SIEM simulator" }], shift: [{ id: "shift", title: "Shift simulator" }] };
const newLesson = () => ({ id: `l-${uid()}`, title: "New lesson", content: "", video_url: "", minutes: 10, resources: [], attachments: [] });

const move = (arr, from, to) => { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };

function Attachments({ l, upL, assets, onAsset, level }) {
  const [type, setType] = useState("quiz");
  const [id, setId] = useState("");
  const [creating, setCreating] = useState(false);
  const opts = assets?.[type] || STATIC[type] || [];
  const created = (c) => { onAsset("ctf", { id: c.id, title: c.title }); upL((cur) => ({ ...cur, attachments: [...(cur.attachments || []), { type: "ctf", id: c.id, title: c.title }] })); setCreating(false); };
  const add = () => {
    const it = opts.find((o) => String(o.id) === id);
    if (!it || (l.attachments || []).some((a) => a.type === type && String(a.id) === id)) return;
    upL({ ...l, attachments: [...(l.attachments || []), { type, id: it.id, title: it.title, ...(it.url ? { url: it.url } : {}) }] });
    setId("");
  };
  return (
    <div data-testid="builder-attachments">
      <div className="flex flex-wrap gap-2 mb-2">{(l.attachments || []).map((a, i) => <span key={`${a.type}-${a.id}`} className="inline-flex items-center gap-1.5 text-xs border border-green-500/30 bg-green-500/5 px-2 py-1" data-testid={`builder-attachment-${i}`}>
        <span className="font-mono uppercase text-[10px] text-green-400">{a.type}</span>{a.title}<button onClick={() => upL({ ...l, attachments: l.attachments.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-400" data-testid={`builder-attachment-remove-${i}`}><X className="h-3 w-3" /></button></span>)}</div>
      <div className="flex gap-2">
        <select className="field !w-40 text-xs" value={type} onChange={(e) => { setType(e.target.value); setId(""); }} data-testid="builder-attach-type">{TYPES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        <select className="field text-xs" value={id} onChange={(e) => setId(e.target.value)} data-testid="builder-attach-item"><option value="">Choose {type}...</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select>
        <button className="ghost-btn !text-xs" onClick={add} disabled={!id} data-testid="builder-attach-add"><Plus className="h-3.5 w-3.5" />Attach</button>
        {!creating && <button className="ghost-btn !text-xs whitespace-nowrap" onClick={() => setCreating(true)} data-testid="builder-create-ctf"><Flag className="h-3.5 w-3.5" />New CTF</button>}
      </div>
      {creating && <CtfCreator lesson={l} level={level} onCreated={created} onClose={() => setCreating(false)} />}
    </div>);
}

function Suggestions({ l, upL }) {
  const [sug, setSug] = useState(null);
  const [busy, setBusy] = useState(false);
  const has = (s) => (l.attachments || []).some((a) => a.type === s.type && String(a.id) === String(s.id));
  const find = async () => { setBusy(true); try { const { data } = await api.post("/builder/suggest", { title: l.title, content: l.content || "" }); setSug(data); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  const add = (list) => { const fresh = list.filter((s) => !has(s)).map(({ type, id, title }) => ({ type, id, title })); if (fresh.length) upL({ ...l, attachments: [...(l.attachments || []), ...fresh] }); };
  useEffect(() => { setSug(null); }, [l.id]);
  return (
    <div className="mt-3 border border-dashed border-cyan-500/25 p-3" data-testid="builder-suggestions">
      <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-yellow-300" /><span className="text-xs text-slate-300 flex-1">Suggested practice for this lesson</span>
        <button className="ghost-btn !text-xs !py-1" onClick={find} disabled={busy} data-testid="builder-suggest-button">{busy ? "Finding..." : sug ? "Refresh" : "Suggest practice"}</button>
        {sug?.some((s) => !has(s)) && <button className="glow-btn !text-xs !py-1" onClick={() => add(sug)} data-testid="builder-suggest-attach-all">Attach all</button>}</div>
      {sug && (sug.length ? <div className="flex flex-wrap gap-2 mt-2">{sug.map((s, i) => <button key={`${s.type}-${s.id}`} disabled={has(s)} onClick={() => add([s])} data-testid={`builder-suggestion-${i}`}
        className="inline-flex items-center gap-1.5 text-xs border border-white/10 hover:border-green-500/50 px-2 py-1 disabled:opacity-40 transition-colors"><span className="font-mono uppercase text-[10px] text-cyan-400">{s.type}</span>{s.title}{has(s) ? <span className="text-green-400">✓</span> : <Plus className="h-3 w-3 text-green-400" />}</button>)}</div>
        : <div className="text-[11px] font-mono text-slate-500 mt-2" data-testid="builder-suggest-empty">no close matches — attach manually below</div>)}
    </div>);
}

function WriteButton({ l, upL, ctx }) {
  const [busy, setBusy] = useState(false);
  const write = async () => {
    if (l.content?.trim() && !window.confirm("Replace the current lesson content with an AI draft?")) return;
    setBusy(true);
    try {
      const { data: job } = await api.post("/builder/write-lesson", { title: l.title, minutes: l.minutes || 15, ...ctx });
      let r = null;
      for (let i = 0; i < 60; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        r = (await api.get(`/builder/write-lesson/${job.job_id}`)).data;
        if (r.status !== "running") break;
      }
      if (r?.status === "done") { upL((cur) => ({ ...cur, content: r.content })); toast.success("Draft written — review it, then Save the path"); }
      else toast.error(r?.error || "The lesson writer took too long — please try again");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return <button type="button" onClick={write} disabled={busy || !l.title?.trim()} className="text-[11px] font-mono text-yellow-300 hover:text-yellow-200 inline-flex items-center gap-1 disabled:opacity-50" data-testid="builder-write-lesson">
    <Wand2 className={`h-3.5 w-3.5 ${busy ? "animate-pulse" : ""}`} />{busy ? "Writing lesson (about 30s)..." : "Write this lesson"}</button>;
}

function LessonEditor({ l, upL, assets, onAsset, ctx }) {
  const [tab, setTab] = useState("edit");
  const res = l.resources?.length ? l.resources : [];
  return (
    <Glass className="p-5" data-testid="builder-lesson-editor">
      <div className="flex items-center gap-2 mb-4">{[["edit", "Edit", Pencil], ["preview", "Student preview", Eye]].map(([v, n, I]) => <button key={v} onClick={() => setTab(v)} data-testid={`builder-tab-${v}`}
        className={`px-3 py-1.5 text-xs font-mono border rounded-sm inline-flex items-center gap-1.5 ${tab === v ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-slate-400"}`}><I className="h-3.5 w-3.5" />{n}</button>)}</div>
      {tab === "preview" ? <div data-testid="builder-preview"><LessonBody lesson={l} /></div> : <div className="space-y-3">
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Lbl l="Lesson title"><input className="field" value={l.title} onChange={(e) => upL({ ...l, title: e.target.value })} data-testid="builder-lesson-title" /></Lbl>
          <Lbl l="Minutes"><input type="number" min={1} className="field" value={l.minutes} onChange={(e) => upL({ ...l, minutes: +e.target.value })} data-testid="builder-lesson-minutes" /></Lbl>
        </div>
        <Lbl l="Video (Vimeo or YouTube)"><VideoField key={l.id} l={l} upL={upL} /></Lbl>
        {ctx.course && <label className="flex items-center gap-2 text-xs font-mono text-slate-300" data-testid="builder-lesson-preview-label"><input type="checkbox" checked={!!l.preview} onChange={(e) => upL({ ...l, preview: e.target.checked })} data-testid="builder-lesson-preview" />Free preview — anyone can watch this lesson on the course page</label>}
        <div><div className="flex items-center justify-between"><span className="text-[11px] font-mono uppercase text-slate-500">Content</span><WriteButton l={l} upL={upL} ctx={ctx} /></div>
          <textarea className="field h-44 text-sm mt-1" placeholder="Lesson content (line breaks and '- ' bullets)" value={l.content} onChange={(e) => upL({ ...l, content: e.target.value })} data-testid="builder-lesson-content" />
          <LessonQuizBuilder l={l} upL={upL} level={ctx.level} /></div>
        <Lbl l="Practice: attach quizzes, labs, challenges, CTFs, courses or SOPs"><Attachments l={l} upL={upL} assets={assets} onAsset={onAsset} level={ctx.level} /><Suggestions l={l} upL={upL} /></Lbl>
        <Lbl l="Downloadable resources">
          <div className="space-y-2">{res.map((r, i) => <div key={i} className="flex gap-2">
            <input className="field text-xs" placeholder="Name" value={r.name} onChange={(e) => upL({ ...l, resources: res.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} data-testid={`builder-resource-name-${i}`} />
            <input className="field text-xs" placeholder="File URL" value={r.url} onChange={(e) => upL({ ...l, resources: res.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} data-testid={`builder-resource-url-${i}`} />
            <button onClick={() => upL({ ...l, resources: res.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div>)}
            <button className="ghost-btn !text-xs" onClick={() => upL({ ...l, resources: [...res, { name: "", url: "" }] })} data-testid="builder-add-resource"><Plus className="h-3 w-3" />Resource</button></div>
        </Lbl>
      </div>}
    </Glass>);
}

function Outline({ mods, setMods, sel, setSel }) {
  const drag = useRef(null);
  const [over, setOver] = useState(null);
  const drop = (target) => {
    const s = drag.current;
    drag.current = null;
    setOver(null);
    if (!s) return;
    if (s.type === "module" && target.type === "module") return setMods(move(mods, s.mi, target.mi));
    if (s.type !== "lesson") return;
    const lesson = mods[s.mi].lessons[s.li];
    let next = mods.map((m, i) => (i === s.mi ? { ...m, lessons: m.lessons.filter((_, j) => j !== s.li) } : m));
    let at = target.type === "lesson" ? target.li : next[target.mi].lessons.length;
    if (target.type === "lesson" && s.mi === target.mi && s.li < target.li) at -= 1;
    next = next.map((m, i) => (i === target.mi ? { ...m, lessons: [...m.lessons.slice(0, at), lesson, ...m.lessons.slice(at)] } : m));
    setMods(next);
  };
  const dz = (target, key) => ({ onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); setOver(key); }, onDragLeave: () => setOver((o) => (o === key ? null : o)), onDrop: (e) => { e.preventDefault(); e.stopPropagation(); drop(target); } });
  const upMod = (i, m) => setMods(mods.map((x, j) => (j === i ? m : x)));
  return (
    <div className="space-y-3" data-testid="builder-outline">
      {mods.map((m, mi) => (
        <div key={m.id} draggable onDragStart={(e) => { e.stopPropagation(); drag.current = { type: "module", mi }; }} {...dz({ type: "module", mi }, `m${mi}`)}
          className={`glass rounded-sm transition-colors ${over === `m${mi}` ? "border-cyan-400/70 bg-cyan-500/5" : ""}`} data-testid={`builder-module-${mi}`}>
          <div className="flex items-center gap-1.5 p-2 border-b border-white/5">
            <GripVertical className="h-4 w-4 text-slate-500 cursor-grab shrink-0" />
            <Layers className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <input className="bg-transparent outline-none font-mono text-sm flex-1 min-w-0" value={m.title} placeholder="Module title" onChange={(e) => upMod(mi, { ...m, title: e.target.value })} data-testid={`builder-module-title-${mi}`} />
            <button disabled={mi === 0} onClick={() => setMods(move(mods, mi, mi - 1))} className="text-slate-500 hover:text-cyan-300 disabled:opacity-30" data-testid={`builder-module-up-${mi}`}><ChevronUp className="h-4 w-4" /></button>
            <button disabled={mi === mods.length - 1} onClick={() => setMods(move(mods, mi, mi + 1))} className="text-slate-500 hover:text-cyan-300 disabled:opacity-30" data-testid={`builder-module-down-${mi}`}><ChevronDown className="h-4 w-4" /></button>
            <button onClick={() => window.confirm(`Delete module "${m.title || "untitled"}" and its lessons?`) && setMods(mods.filter((_, j) => j !== mi))} className="text-slate-500 hover:text-red-400" data-testid={`builder-module-delete-${mi}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="p-1.5 space-y-1">
            {m.lessons.map((l, li) => (
              <div key={l.id} draggable onDragStart={(e) => { e.stopPropagation(); drag.current = { type: "lesson", mi, li }; }} {...dz({ type: "lesson", mi, li }, `l${mi}-${li}`)} onClick={() => setSel(l.id)}
                className={`flex items-center gap-1.5 px-2 py-1.5 text-xs cursor-pointer border-l-2 transition-colors ${sel === l.id ? "border-green-400 bg-green-500/5 text-slate-100" : "border-transparent text-slate-400 hover:bg-white/5"} ${over === `l${mi}-${li}` ? "border-t border-t-cyan-400" : ""}`} data-testid={`builder-lesson-${mi}-${li}`}>
                <GripVertical className="h-3.5 w-3.5 text-slate-600 cursor-grab shrink-0" /><FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate flex-1">{l.title || "Untitled lesson"}</span>
                {l.quiz?.questions?.length > 0 && <span className={`font-mono text-[10px] ${l.quiz.required ? "text-yellow-300" : "text-slate-500"}`} title={l.quiz.required ? "required quiz" : "practice quiz"}>Q{l.quiz.required ? "*" : ""}</span>}
                {l.attachments?.length > 0 && <span className="font-mono text-[10px] text-green-400">+{l.attachments.length}</span>}
                {l.preview && <span className="font-mono text-[10px] text-yellow-300" title="free preview">FREE</span>}
                <button disabled={li === 0} onClick={(e) => { e.stopPropagation(); upMod(mi, { ...m, lessons: move(m.lessons, li, li - 1) }); }} className="hover:text-cyan-300 disabled:opacity-30" data-testid={`builder-lesson-up-${mi}-${li}`}><ChevronUp className="h-3.5 w-3.5" /></button>
                <button disabled={li === m.lessons.length - 1} onClick={(e) => { e.stopPropagation(); upMod(mi, { ...m, lessons: move(m.lessons, li, li + 1) }); }} className="hover:text-cyan-300 disabled:opacity-30" data-testid={`builder-lesson-down-${mi}-${li}`}><ChevronDown className="h-3.5 w-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); upMod(mi, { ...m, lessons: m.lessons.filter((_, j) => j !== li) }); }} className="hover:text-red-400" data-testid={`builder-lesson-delete-${mi}-${li}`}><Trash2 className="h-3 w-3" /></button>
              </div>))}
            {!m.lessons.length && <div className="text-[11px] font-mono text-slate-600 px-2 py-2">drop lessons here</div>}
            <button className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 px-2 py-1 inline-flex items-center gap-1" onClick={() => { const nl = newLesson(); upMod(mi, { ...m, lessons: [...m.lessons, nl] }); setSel(nl.id); }} data-testid={`builder-add-lesson-${mi}`}><Plus className="h-3 w-3" />Lesson</button>
          </div>
        </div>))}
      <button className="ghost-btn w-full justify-center !text-xs" onClick={() => setMods([...mods, { id: `m-${uid()}`, title: `Module ${mods.length + 1}`, lessons: [] }])} data-testid="builder-add-module"><Plus className="h-4 w-4" />Module</button>
      <p className="text-[10px] font-mono text-slate-600">Drag modules and lessons to reorder (lessons can move between modules), or use the arrows.</p>
    </div>);
}

export default function PathBuilder({ d, set, course }) {
  const [assets, setAssets] = useState(null);
  const [sel, setSel] = useState(d.modules?.[0]?.lessons?.[0]?.id || null);
  useEffect(() => { api.get("/builder/assets").then((r) => setAssets(r.data)).catch(() => {}); }, []);
  const mods = d.modules || [];
  const setMods = (m) => set((prev) => ({ ...prev, modules: typeof m === "function" ? m(prev.modules || []) : m }));
  const pos = mods.flatMap((m, mi) => m.lessons.map((l, li) => ({ id: l.id, mi, li }))).find((x) => x.id === sel);
  const lesson = pos && mods[pos.mi].lessons[pos.li];
  const upL = (nl) => { const lid = lesson.id; setMods((ms) => ms.map((m) => ({ ...m, lessons: m.lessons.map((x) => (x.id === lid ? (typeof nl === "function" ? nl(x) : nl) : x)) }))); };
  const total = mods.reduce((n, m) => n + m.lessons.length, 0);
  return (
    <div className="space-y-4">
      {!course && <div className="grid sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2"><Lbl l="Title"><input className="field" value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} data-testid="builder-path-title" /></Lbl></div>
        <Lbl l="Level"><select className="field" value={d.level} onChange={(e) => set({ ...d, level: e.target.value })} data-testid="builder-path-level">{["Beginner", "Intermediate", "Advanced"].map((x) => <option key={x}>{x}</option>)}</select></Lbl>
        <Lbl l="Order"><input type="number" className="field" value={d.order} onChange={(e) => set({ ...d, order: +e.target.value })} data-testid="builder-path-order" /></Lbl>
        <Lbl l="Category"><input className="field" value={d.category} onChange={(e) => set({ ...d, category: e.target.value })} data-testid="builder-path-category" /></Lbl>
        <div className="sm:col-span-3"><Lbl l="Description"><input className="field" value={d.description} onChange={(e) => set({ ...d, description: e.target.value })} data-testid="builder-path-description" /></Lbl></div>
      </div>}
      <div className="flex flex-wrap items-center gap-3"><div className="text-[11px] font-mono text-slate-500 flex-1" data-testid="builder-summary">{mods.length} modules · {total} lessons · {mods.reduce((n, m) => n + m.lessons.reduce((k, l) => k + (+l.minutes || 0), 0), 0)} min · {mods.reduce((n, m) => n + m.lessons.reduce((k, l) => k + (l.attachments?.length || 0), 0), 0)} practice items</div>
        <BulkQuiz mods={mods} level={d.level || "Beginner"} updateLesson={(lid, fn) => setMods((ms) => ms.map((m) => ({ ...m, lessons: m.lessons.map((x) => (x.id === lid ? fn(x) : x)) })))} /></div>
      <div className="grid lg:grid-cols-[340px_1fr] gap-4 items-start">
        <Outline mods={mods} setMods={setMods} sel={sel} setSel={setSel} />
        {lesson ? <LessonEditor key={lesson.id} l={lesson} upL={upL} assets={assets} onAsset={(t, it) => setAssets((a) => ({ ...(a || {}), [t]: [...(a?.[t] || []), it] }))} ctx={{ path_title: d.title || "", module_title: mods[pos.mi].title || "", level: d.level || "Beginner", course }} /> : <Glass className="p-8"><Empty text="add or select a lesson to edit it" /></Glass>}
      </div>
    </div>);
}
