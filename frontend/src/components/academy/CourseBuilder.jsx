import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Send, Check, X, Save, ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Glass, Empty } from "../common";
import { ITEM_TYPES } from "../../pages/app/Academy";

const STATUS = { draft: "text-slate-400 border-white/15", pending: "text-yellow-300 border-yellow-500/40", published: "text-green-400 border-green-500/40", rejected: "text-red-300 border-red-500/40" };
const blank = () => ({ title: "", subtitle: "", description: "", level: "Beginner", price: 0, cover: "", modules: [{ id: `m${Date.now()}`, title: "Module 1", items: [] }] });
const newItem = () => ({ id: `i${Date.now()}${Math.random().toString(36).slice(2, 5)}`, type: "video", title: "", ref: "", url: "", note: "", minutes: 10 });
const move = (arr, i, d) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };
const Badge = ({ s }) => <span className={`text-[10px] font-mono uppercase border px-1.5 py-0.5 ${STATUS[s]}`} data-testid="course-status">{s}</span>;

function ItemRow({ it, opts, up, del, mv, tid }) {
  const needsRef = ["quiz", "lab", "scenario", "sop"].includes(it.type);
  return (
    <div className="border border-white/10 p-2.5 space-y-2" data-testid={tid}>
      <div className="flex gap-2">
        <select className="field text-xs !w-40" value={it.type} onChange={(e) => up({ ...it, type: e.target.value, ref: "" })} data-testid={`${tid}-type`}>{Object.entries(ITEM_TYPES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="field text-xs" placeholder="Item title" value={it.title} onChange={(e) => up({ ...it, title: e.target.value })} data-testid={`${tid}-title`} />
        <input type="number" min={1} className="field text-xs !w-20" value={it.minutes} onChange={(e) => up({ ...it, minutes: +e.target.value || 1 })} title="minutes" data-testid={`${tid}-minutes`} />
        <button onClick={() => mv(-1)} className="text-slate-500 hover:text-cyan-300"><ChevronUp className="h-4 w-4" /></button><button onClick={() => mv(1)} className="text-slate-500 hover:text-cyan-300"><ChevronDown className="h-4 w-4" /></button>
        <button onClick={del} className="text-slate-500 hover:text-red-400" data-testid={`${tid}-delete`}><Trash2 className="h-4 w-4" /></button></div>
      {it.type === "video" && <input className="field text-xs font-mono" placeholder="Video link (YouTube, Vimeo or any URL)" value={it.url} onChange={(e) => up({ ...it, url: e.target.value })} data-testid={`${tid}-url`} />}
      {needsRef && <select className="field text-xs" value={it.ref} onChange={(e) => { const o = opts?.[it.type]?.find((x) => x.id === e.target.value); up({ ...it, ref: e.target.value, title: it.title || o?.title || "" }); }} data-testid={`${tid}-ref`}>
        <option value="">— pick a {ITEM_TYPES[it.type][0].toLowerCase()} —</option>{(opts?.[it.type] || []).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select>}
      <input className="field text-xs" placeholder={it.type === "siem" || it.type === "shift" ? "Task for the student, e.g. 'Hunt failed logons from one IP in the SIEM'" : "Optional note for students"} value={it.note} onChange={(e) => up({ ...it, note: e.target.value })} data-testid={`${tid}-note`} />
    </div>);
}

function Editor({ c, back }) {
  const { user } = useAuth();
  const [d, setD] = useState(c.id ? c : blank());
  const [opts, setOpts] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/academy/manage/options").then((r) => setOpts(r.data)); }, []);
  const upM = (i, m) => setD({ ...d, modules: d.modules.map((x, j) => (j === i ? m : x)) });
  const save = async () => {
    setBusy(true);
    try { const { data } = d.id ? await api.put(`/academy/manage/${d.id}`, d) : await api.post("/academy/manage", d); setD(data); toast.success("Course saved"); return data; }
    catch (e) { toast.error(errMsg(e)); return null; } finally { setBusy(false); }
  };
  const act = async (path, body, msg) => { const s = await save(); if (!s) return; try { await api.post(`/academy/manage/${s.id}/${path}`, body); toast.success(msg); back(); } catch (e) { toast.error(errMsg(e)); } };
  const f = (k, l, props = {}) => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><input className="field mt-1" value={d[k]} onChange={(e) => setD({ ...d, [k]: props.type === "number" ? +e.target.value : e.target.value })} data-testid={`course-${k}`} {...props} /></label>;
  return (
    <div className="space-y-4" data-testid="course-editor">
      <div className="flex flex-wrap items-center gap-2"><button onClick={back} className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="course-back"><ArrowLeft className="h-3.5 w-3.5" />Courses</button>
        {d.status && <Badge s={d.status} />}{d.review_note && <span className="text-xs text-red-300" data-testid="course-review-note">Admin note: {d.review_note}</span>}
        <span className="flex-1" />
        <button className="ghost-btn !text-xs" disabled={busy} onClick={save} data-testid="course-save"><Save className="h-3.5 w-3.5" />Save</button>
        {user.role !== "admin" && d.status !== "published" && <button className="glow-btn !text-xs" disabled={busy} onClick={() => act("submit", {}, "Submitted for admin review")} data-testid="course-submit"><Send className="h-3.5 w-3.5" />Submit for review</button>}
        {user.role === "admin" && d.status !== "published" && <button className="glow-btn !text-xs" disabled={busy} onClick={() => act("review", { action: "approve" }, "Course published")} data-testid="course-publish"><Check className="h-3.5 w-3.5" />Publish</button>}
      </div>
      <Glass className="p-5 grid sm:grid-cols-2 gap-3">
        {f("title", "Title")}{f("subtitle", "Subtitle")}
        <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">Level</span><select className="field mt-1" value={d.level} onChange={(e) => setD({ ...d, level: e.target.value })} data-testid="course-level">{["Beginner", "Intermediate", "Advanced"].map((l) => <option key={l}>{l}</option>)}</select></label>
        {f("price", "Price in ₹ (0 = free)", { type: "number", min: 0 })}
        <div className="sm:col-span-2">{f("cover", "Cover image URL (optional)")}</div>
        <label className="block sm:col-span-2"><span className="text-[11px] font-mono uppercase text-slate-500">Description</span><textarea className="field mt-1 h-24" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} data-testid="course-description" /></label>
      </Glass>
      {d.modules.map((m, mi) => <Glass key={m.id} className="p-4 space-y-2" data-testid={`course-module-${mi}`}>
        <div className="flex gap-2 items-center"><span className="text-xs font-mono text-cyan-400 whitespace-nowrap">Module {mi + 1}</span>
          <input className="field text-sm" value={m.title} onChange={(e) => upM(mi, { ...m, title: e.target.value })} data-testid={`course-module-title-${mi}`} />
          <button onClick={() => setD({ ...d, modules: move(d.modules, mi, -1) })} className="text-slate-500 hover:text-cyan-300"><ChevronUp className="h-4 w-4" /></button><button onClick={() => setD({ ...d, modules: move(d.modules, mi, 1) })} className="text-slate-500 hover:text-cyan-300"><ChevronDown className="h-4 w-4" /></button>
          <button onClick={() => setD({ ...d, modules: d.modules.filter((_, j) => j !== mi) })} className="text-slate-500 hover:text-red-400" data-testid={`course-module-delete-${mi}`}><Trash2 className="h-4 w-4" /></button></div>
        {m.items.map((it, ii) => <ItemRow key={it.id} it={it} opts={opts} tid={`course-item-${mi}-${ii}`} up={(x) => upM(mi, { ...m, items: m.items.map((y, k) => (k === ii ? x : y)) })}
          del={() => upM(mi, { ...m, items: m.items.filter((_, k) => k !== ii) })} mv={(dir) => upM(mi, { ...m, items: move(m.items, ii, dir) })} />)}
        <button className="ghost-btn !text-xs" onClick={() => upM(mi, { ...m, items: [...m.items, newItem()] })} data-testid={`course-add-item-${mi}`}><Plus className="h-3.5 w-3.5" />Add item</button>
      </Glass>)}
      <button className="ghost-btn !text-xs" onClick={() => setD({ ...d, modules: [...d.modules, { id: `m${Date.now()}`, title: `Module ${d.modules.length + 1}`, items: [] }] })} data-testid="course-add-module"><Plus className="h-3.5 w-3.5" />Add module</button>
    </div>);
}

export function CourseBuilder() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => api.get("/academy/manage").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  const review = async (c, action) => {
    const note = action === "reject" ? window.prompt("Reason for the instructor (optional)") ?? null : "";
    if (note === null) return;
    try { await api.post(`/academy/manage/${c.id}/review`, { action, note }); toast.success(`Course ${action === "approve" ? "published" : action === "reject" ? "sent back" : "unpublished"}`); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (c) => { if (!window.confirm(`Delete "${c.title}"?`)) return; try { await api.delete(`/academy/manage/${c.id}`); load(); } catch (e) { toast.error(errMsg(e)); } };
  if (edit) return <Editor c={edit} back={() => { setEdit(null); load(); }} />;
  return (
    <div data-testid="course-builder">
      <div className="flex items-center mb-4"><span className="text-sm text-slate-400 flex-1">{user.role === "admin" ? "All academy courses. Review pending courses before they go live." : "Build module-wise courses; an admin reviews them before publishing."}</span>
        <button className="glow-btn !text-xs" onClick={() => setEdit({})} data-testid="course-new"><Plus className="h-3.5 w-3.5" />New course</button></div>
      {list && !list.length && <Empty text="No courses yet" />}
      <div className="space-y-2">{(list || []).map((c) => <Glass key={c.id} className="p-4 flex flex-wrap items-center gap-3" data-testid={`course-row-${c.id}`}>
        <div className="flex-1 min-w-[200px]"><div className="font-bold text-sm">{c.title}</div><div className="text-[11px] font-mono text-slate-500">{c.instructor_name} · {c.modules.length} modules · {c.price ? `₹${c.price}` : "Free"} · updated {fmtDate(c.updated_at)}</div></div>
        <Badge s={c.status} />
        <button className="ghost-btn !text-xs" onClick={() => setEdit(c)} data-testid={`course-edit-${c.id}`}>Edit</button>
        {c.status === "published" && <a href={`/app/courses/${c.id}`} className="ghost-btn !text-xs" data-testid={`course-view-${c.id}`}><Eye className="h-3.5 w-3.5" />View</a>}
        {user.role === "admin" && c.status === "pending" && <><button className="glow-btn !text-xs" onClick={() => review(c, "approve")} data-testid={`course-approve-${c.id}`}><Check className="h-3.5 w-3.5" />Approve</button>
          <button className="ghost-btn !text-xs" onClick={() => review(c, "reject")} data-testid={`course-reject-${c.id}`}><X className="h-3.5 w-3.5" />Reject</button></>}
        {user.role === "admin" && c.status === "published" && <button className="ghost-btn !text-xs" onClick={() => review(c, "unpublish")} data-testid={`course-unpublish-${c.id}`}>Unpublish</button>}
        <button className="text-slate-500 hover:text-red-400" onClick={() => del(c)} data-testid={`course-delete-${c.id}`}><Trash2 className="h-4 w-4" /></button>
      </Glass>)}</div>
    </div>);
}
