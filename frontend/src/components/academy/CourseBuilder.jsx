import { useEffect, useState } from "react";
import { Plus, Trash2, Send, Check, X, Save, ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Glass, Empty } from "../common";
import PathBuilder from "../PathBuilder";
import { VideoFrame } from "../VideoField";
import { embedSrc } from "../../lib/video";
import { PriceTag } from "./Price";

const STATUS = { draft: "text-slate-400 border-white/15", pending: "text-yellow-300 border-yellow-500/40", published: "text-green-400 border-green-500/40", rejected: "text-red-300 border-red-500/40" };
const blank = () => ({ title: "", subtitle: "", description: "", level: "Beginner", category: "", price: 0, mrp: 0, sale_ends_at: null, cover: "", promo_video: "", outcomes: [], requirements: [], audience: [], final_quiz_id: null,
  modules: [{ id: `m-${Date.now()}`, title: "Module 1", lessons: [] }] });
const Badge = ({ s }) => <span className={`text-[10px] font-mono uppercase border px-1.5 py-0.5 ${STATUS[s]}`} data-testid="course-status">{s}</span>;
const L = ({ l, children, cls = "" }) => <label className={`block ${cls}`}><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><div className="mt-1">{children}</div></label>;
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
const off = (d) => (d.mrp > d.price ? Math.round((100 * (d.mrp - d.price)) / d.mrp) : 0);

function Lines({ k, l, d, setD, ph }) {
  const [txt, setTxt] = useState((d[k] || []).join("\n"));
  return <L l={l}><textarea className="field h-24 text-sm" placeholder={ph} value={txt} onChange={(e) => { setTxt(e.target.value); setD((x) => ({ ...x, [k]: e.target.value.split("\n") })); }} data-testid={`course-${k}`} /></L>;
}

function Meta({ d, setD, quizzes }) {
  const f = (k, l, props = {}) => <L l={l}><input className="field" value={d[k] ?? ""} onChange={(e) => setD({ ...d, [k]: props.type === "number" ? +e.target.value : e.target.value })} data-testid={`course-${k}`} {...props} /></L>;
  const src = embedSrc(d.promo_video);
  return (
    <Glass className="p-5 space-y-4" data-testid="course-meta">
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2">{f("title", "Title")}</div>
        <L l="Level"><select className="field" value={d.level} onChange={(e) => setD({ ...d, level: e.target.value })} data-testid="course-level">{["Beginner", "Intermediate", "Advanced"].map((x) => <option key={x}>{x}</option>)}</select></L>
        {f("category", "Category")}
        <div className="sm:col-span-4">{f("subtitle", "Subtitle (one line under the title)")}</div>
      </div>
      <div className="border border-yellow-500/20 bg-yellow-500/5 p-3 grid sm:grid-cols-4 gap-3 items-end" data-testid="course-pricing">
        {f("price", "Sale price ₹ (what students pay)", { type: "number", min: 0 })}
        {f("mrp", "Original price ₹ (shown struck out)", { type: "number", min: 0 })}
        <L l="Sale ends (optional countdown)"><input type="datetime-local" className="field" value={toLocal(d.sale_ends_at)} onChange={(e) => setD({ ...d, sale_ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} data-testid="course-sale_ends_at" /></L>
        <div className="text-xs font-mono pb-2" data-testid="course-price-preview"><PriceTag c={{ price: d.price, mrp: d.mrp > d.price ? d.mrp : null, off: off(d) }} />
          {d.sale_ends_at && <div className="text-[10px] text-slate-500 mt-1">after the sale: ₹{d.mrp || d.price}</div>}</div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-3">{f("promo_video", "Demo / promo video (YouTube or Vimeo)")}{f("cover", "Cover image URL")}
          <L l="Final exam (optional — required for the certificate)"><select className="field" value={d.final_quiz_id || ""} onChange={(e) => setD({ ...d, final_quiz_id: e.target.value || null })} data-testid="course-final-quiz">
            <option value="">No final exam</option>{quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}</select></L></div>
        {src ? <div className="aspect-video border border-cyan-500/20"><VideoFrame src={src} title="Promo preview" testId="course-promo-preview" /></div> : <div className="aspect-video border border-dashed border-white/10 grid place-items-center text-xs font-mono text-slate-600">promo video preview</div>}
      </div>
      <L l="Description"><textarea className="field h-28 text-sm" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} data-testid="course-description" /></L>
      <div className="grid md:grid-cols-3 gap-3">
        <Lines k="outcomes" l="What you'll learn (one per line)" d={d} setD={setD} ph={"Triage phishing alerts end to end\nWrite SIEM queries"} />
        <Lines k="requirements" l="Requirements (one per line)" d={d} setD={setD} ph="Basic networking knowledge" />
        <Lines k="audience" l="Who this course is for (one per line)" d={d} setD={setD} ph="Aspiring SOC L1 analysts" />
      </div>
    </Glass>);
}

function Editor({ c, back }) {
  const { user } = useAuth();
  const [d, setD] = useState(c.id ? (c.pending_changes ? { ...c, ...c.pending_changes } : c) : blank());
  const [quizzes, setQuizzes] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/builder/assets").then((r) => setQuizzes(r.data.quiz || [])).catch(() => {}); }, []);
  const save = async () => {
    setBusy(true);
    try { const { data } = d.id ? await api.put(`/academy/manage/${d.id}`, d) : await api.post("/academy/manage", d); setD(data.pending_changes ? { ...data, ...data.pending_changes } : data); toast.success("Course saved"); return data; }
    catch (e) { toast.error(errMsg(e)); return null; } finally { setBusy(false); }
  };
  const act = async (path, body, msg) => { const s = await save(); if (!s) return; try { await api.post(`/academy/manage/${s.id}/${path}`, body); toast.success(msg); back(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-4" data-testid="course-editor">
      <div className="flex flex-wrap items-center gap-2"><button onClick={back} className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="course-back"><ArrowLeft className="h-3.5 w-3.5" />Courses</button>
        {d.status && <Badge s={d.status} />}{d.review_note && <span className="text-xs text-red-300" data-testid="course-review-note">Admin note: {d.review_note}</span>}
        <span className="flex-1" />
        {d.pending_changes && <span className="text-[11px] font-mono text-yellow-300" data-testid="course-changes-pending">changes {d.changes_submitted ? "awaiting review" : "saved, not submitted"} — students still see the live version</span>}
        {d.id && <a href={`/course/${d.id}`} target="_blank" rel="noreferrer" className="ghost-btn !text-xs" data-testid="course-open-landing"><Eye className="h-3.5 w-3.5" />Course page</a>}
        <button className="ghost-btn !text-xs" disabled={busy} onClick={save} data-testid="course-save"><Save className="h-3.5 w-3.5" />Save</button>
        {user.role !== "admin" && <button className="glow-btn !text-xs" disabled={busy} onClick={() => act("submit", {}, d.status === "published" ? "Changes sent for admin review" : "Submitted for admin review")} data-testid="course-submit"><Send className="h-3.5 w-3.5" />Submit for review</button>}
        {user.role === "admin" && d.status !== "published" && <button className="glow-btn !text-xs" disabled={busy} onClick={() => act("review", { action: "approve" }, "Course published")} data-testid="course-publish"><Check className="h-3.5 w-3.5" />Publish</button>}
      </div>
      <Meta d={d} setD={setD} quizzes={quizzes} />
      <PathBuilder d={d} set={setD} course />
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
  if (edit) return <Editor c={edit} back={() => { setEdit(null); setList(null); load(); }} />;
  const count = (c) => c.modules.reduce((n, m) => n + (m.lessons?.length || 0), 0);
  return (
    <div data-testid="course-builder">
      <div className="flex items-center mb-4"><span className="text-sm text-slate-400 flex-1">{user.role === "admin" ? "All academy courses. Review pending courses before they go live." : "Build full courses with the learning-path builder plus pricing; an admin reviews them before publishing."}</span>
        <button className="glow-btn !text-xs" onClick={() => setEdit({})} data-testid="course-new"><Plus className="h-3.5 w-3.5" />New course</button></div>
      {list && !list.length && <Empty text="No courses yet" />}
      <div className="space-y-2">{(list || []).map((c) => <Glass key={c.id} className="p-4 flex flex-wrap items-center gap-3" data-testid={`course-row-${c.id}`}>
        <div className="flex-1 min-w-[200px]"><div className="font-bold text-sm">{c.title}</div><div className="text-[11px] font-mono text-slate-500">{c.instructor_name} · {c.modules.length} modules · {count(c)} lessons · {c.price ? `₹${c.price}${c.mrp > c.price ? ` (was ₹${c.mrp})` : ""}` : "Free"} · updated {fmtDate(c.updated_at)}</div></div>
        <Badge s={c.status} />{c.changes_submitted && <span className="text-[10px] font-mono text-yellow-300 border border-yellow-500/40 px-1.5 py-0.5" data-testid={`course-changes-${c.id}`}>changes to review</span>}
        <button className="ghost-btn !text-xs" onClick={() => setEdit(c)} data-testid={`course-edit-${c.id}`}>Edit</button>
        <a href={`/course/${c.id}`} className="ghost-btn !text-xs" data-testid={`course-view-${c.id}`}><Eye className="h-3.5 w-3.5" />View</a>
        {user.role === "admin" && (c.status === "pending" || c.changes_submitted) && <><button className="glow-btn !text-xs" onClick={() => review(c, "approve")} data-testid={`course-approve-${c.id}`}><Check className="h-3.5 w-3.5" />Approve</button>
          <button className="ghost-btn !text-xs" onClick={() => review(c, "reject")} data-testid={`course-reject-${c.id}`}><X className="h-3.5 w-3.5" />Reject</button></>}
        {user.role === "admin" && c.status === "published" && <button className="ghost-btn !text-xs" onClick={() => review(c, "unpublish")} data-testid={`course-unpublish-${c.id}`}>Unpublish</button>}
        <button className="text-slate-500 hover:text-red-400" onClick={() => del(c)} data-testid={`course-delete-${c.id}`}><Trash2 className="h-4 w-4" /></button>
      </Glass>)}</div>
    </div>);
}
