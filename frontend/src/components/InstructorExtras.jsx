import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, AlertTriangle, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { api, errMsg } from "../lib/api";
import { Glass, Empty } from "./common";

const BLANK = { title: "", type: "Videos", price: 999, mrp: 2999, image: "", url: "https://www.socprofessionals.com/courses/", videos: 0, tests: 0, files: 0, tags: [], order: 100, active: true };
const F = ({ l, children }) => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><div className="mt-1">{children}</div></label>;

function CourseForm({ init, onDone, onCancel }) {
  const [d, setD] = useState(init.id ? { ...init, ...init.content, tags: init.tags || [] } : BLANK);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === "number" ? +e.target.value : e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async () => {
    const body = { ...d, tags: typeof d.tags === "string" ? d.tags.split(",") : d.tags };
    ["id", "content", "source", "created_by", "created_at", "synced_at", "updated_at", "editable", "off", "practice", "topics"].forEach((k) => delete body[k]);
    try { init.id ? await api.put(`/instructor/courses/${init.id}`, body) : await api.post("/instructor/courses", body); toast.success(init.id ? "Course updated" : "Course published"); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Glass className="p-5 space-y-3" data-testid="course-form">
      <div className="grid sm:grid-cols-2 gap-3">
        <F l="Title"><input className="field" value={d.title} onChange={set("title")} data-testid="course-title-input" /></F>
        <F l="Course link (buy page)"><input className="field" value={d.url} onChange={set("url")} data-testid="course-url-input" /></F>
        <F l="Price ₹"><input type="number" className="field" value={d.price} onChange={set("price")} data-testid="course-price-input" /></F>
        <F l="MRP ₹"><input type="number" className="field" value={d.mrp} onChange={set("mrp")} data-testid="course-mrp-input" /></F>
        <F l="Cover image URL"><input className="field" value={d.image} onChange={set("image")} placeholder="https://..." data-testid="course-image-input" /></F>
        <F l="Type"><select className="field" value={d.type} onChange={set("type")} data-testid="course-type-select">{["Videos", "Tests", "Files"].map((t) => <option key={t}>{t}</option>)}</select></F>
        <F l="Videos"><input type="number" className="field" value={d.videos} onChange={set("videos")} data-testid="course-videos-input" /></F>
        <F l="Tests"><input type="number" className="field" value={d.tests} onChange={set("tests")} data-testid="course-tests-input" /></F>
        <F l="Tags (comma separated)"><input className="field" value={Array.isArray(d.tags) ? d.tags.join(",") : d.tags} onChange={set("tags")} placeholder="New, Free content" data-testid="course-tags-input" /></F>
        <F l="Display order"><input type="number" className="field" value={d.order} onChange={set("order")} data-testid="course-order-input" /></F>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.active} onChange={set("active")} data-testid="course-active-check" />Visible in the public catalog (students with course alerts on get an email for new visible courses)</label>
      <div className="flex gap-2"><button className="glow-btn" onClick={save} disabled={d.title.length < 3} data-testid="course-save-button">{init.id ? "Save changes" : "Publish course"}</button><button className="ghost-btn" onClick={onCancel} data-testid="course-cancel-button">Cancel</button></div>
    </Glass>);
}

export function CatalogCourses() {
  const [cs, setCs] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.get("/instructor/courses").then((r) => setCs(r.data));
  useEffect(() => { load(); }, []);
  const del = async (c) => { if (!window.confirm(`Delete "${c.title}"?`)) return; try { await api.delete(`/instructor/courses/${c.id}`); toast.success("Course deleted"); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-slate-400">Courses shown on the landing page and /courses. Synced courses come from socprofessionals.com every morning and are read-only here.</p>
        {!edit && <button className="glow-btn" onClick={() => setEdit({})} data-testid="course-new-button"><Plus className="h-4 w-4" />New course</button>}</div>
      {edit && <CourseForm key={edit.id || "new"} init={edit} onDone={() => { setEdit(null); load(); }} onCancel={() => setEdit(null)} />}
      <Glass className="overflow-x-auto"><table className="w-full text-sm" data-testid="catalog-courses-table">
        <thead><tr className="text-left text-xs font-mono text-slate-500 border-b border-cyan-500/15">{["Course", "Source", "Price", "Videos", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>{cs.map((c) => <tr key={c.id} className="border-b border-white/5" data-testid={`catalog-course-${c.id}`}>
          <td className="px-4 py-2.5"><div className="flex items-center gap-3">{c.image && <img src={c.image} alt="" className="h-9 w-14 object-cover" />}<span>{c.title}</span></div></td>
          <td className="px-4 text-xs font-mono">{c.editable ? <span className="text-cyan-300">instructor</span> : <span className="text-slate-500">synced</span>}</td>
          <td className="px-4 font-mono text-xs">₹{c.price?.toLocaleString()} <span className="text-slate-500 line-through">₹{c.mrp?.toLocaleString()}</span></td>
          <td className="px-4 font-mono text-xs">{c.content?.videos ?? 0}</td>
          <td className={`px-4 text-xs font-mono ${c.active ? "text-green-400" : "text-slate-500"}`}>{c.active ? "live" : "hidden"}</td>
          <td className="px-4 text-right whitespace-nowrap">{c.editable ? <><button onClick={() => setEdit(c)} className="text-slate-400 hover:text-cyan-300 mr-3" data-testid={`catalog-course-edit-${c.id}`}><Pencil className="h-4 w-4" /></button>
            <button onClick={() => del(c)} className="text-slate-400 hover:text-red-400" data-testid={`catalog-course-delete-${c.id}`}><Trash2 className="h-4 w-4" /></button></> : <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-cyan-300"><ExternalLink className="h-4 w-4" /></a>}</td>
        </tr>)}</tbody></table></Glass>
    </div>);
}

const Section = ({ title, children }) => <div><div className="eyebrow mb-2 mt-5">{title}</div>{children}</div>;

function StudentDetail({ uid, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); if (uid) api.get(`/instructor/students/${uid}`).then((r) => setD(r.data)); }, [uid]);
  const s = d?.student;
  return (
    <Sheet open={!!uid} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="bg-[#0B0F1A] border-cyan-500/20 w-full sm:max-w-2xl overflow-y-auto" data-testid="student-detail">
        {s && <>
          <SheetHeader><SheetTitle className="font-mono">{s.name}</SheetTitle><div className="text-xs font-mono text-slate-400">{s.email} · {s.rank} · {s.plan} · last active {s.last_active || "never"}</div></SheetHeader>
          {d.reasons.length > 0 && <div className="mt-3 border border-orange-500/30 bg-orange-500/5 p-3 text-xs font-mono text-orange-300" data-testid="student-detail-risk"><AlertTriangle className="inline h-3.5 w-3.5 mr-1" />{d.reasons.join(" · ")}</div>}
          <div className="grid grid-cols-4 gap-2 mt-4 font-mono text-xs">{[["XP", s.xp], ["Streak", s.streak], ["Lessons", `${s.completion}%`], ["Quiz avg", s.quiz_avg ?? "—"], ["Challenges", s.challenges], ["Labs done", s.labs_done], ["Drills", s.drills], ["Certs", s.certs]].map(([k, v]) =>
            <div key={k} className="bg-black/40 border border-white/5 p-2"><div className="text-slate-500">{k}</div><div className="text-cyan-300 text-sm">{v}</div></div>)}</div>
          <Section title="labs">{d.labs.length ? d.labs.map((l) => <div key={l.lab_id} className="text-sm flex justify-between border-b border-white/5 py-1.5" data-testid={`student-lab-${l.lab_id}`}><span>{l.title}</span><span className="font-mono text-xs text-slate-400">{l.solved}/{l.tasks} tasks{l.report_submitted && ` · report ${l.report_score ?? "—"}/100`}{l.instructor_grade != null && ` · graded ${l.instructor_grade}`}</span></div>) : <Empty text="no labs started" />}</Section>
          <Section title="soc challenges">{d.challenges.length ? d.challenges.map((c) => <div key={c.id} className="text-sm flex justify-between border-b border-white/5 py-1.5"><span>{c.challenge_title}</span><span className={`font-mono text-xs ${c.verdict_correct ? "text-green-400" : "text-orange-300"}`}>{c.auto_score}/100{c.instructor_grade != null && ` · graded ${c.instructor_grade}`}</span></div>) : <Empty text="no challenges yet" />}</Section>
          <Section title="quizzes">{d.quizzes.length ? d.quizzes.map((q, i) => <div key={i} className="text-sm flex justify-between border-b border-white/5 py-1.5"><span>{q.quiz_title}</span><span className={`font-mono text-xs ${q.passed ? "text-green-400" : "text-red-400"}`}>{q.score}%</span></div>) : <Empty text="no quiz attempts" />}</Section>
          <Section title="daily drills">{d.drills.length ? <div className="flex flex-wrap gap-1">{d.drills.map((x) => <span key={x.date} title={x.date} className={`h-4 w-4 ${x.verdict_correct ? "bg-green-500/70" : "bg-orange-500/60"}`} />)}</div> : <Empty text="no drills" />}</Section>
          <Section title="recent activity"><div data-testid="student-activity">{d.activity.map((a, i) => <div key={i} className="text-xs flex justify-between gap-3 border-b border-white/5 py-1.5"><span className="text-slate-300">{a.text}</span><span className={`font-mono ${a.xp < 0 ? "text-orange-300" : "text-green-400"}`}>{a.xp > 0 ? "+" : ""}{a.xp}</span></div>)}</div></Section>
        </>}
      </SheetContent>
    </Sheet>);
}

const downloadCsv = async () => {
  try {
    const r = await api.get("/instructor/students.csv", { responseType: "blob" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(r.data); a.download = `student-progress-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  } catch (e) { toast.error(errMsg(e)); }
};

export function StudentsPanel() {
  const [s, setS] = useState([]);
  const [risk, setRisk] = useState([]);
  const [view, setView] = useState("all");
  const [sel, setSel] = useState(null);
  useEffect(() => { api.get("/instructor/students").then((r) => setS(r.data)); api.get("/instructor/at-risk").then((r) => setRisk(r.data)); }, []);
  const rows = view === "risk" ? risk : s;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[["all", `All students (${s.length})`], ["risk", `At risk (${risk.length})`]].map(([v, l]) => <button key={v} onClick={() => setView(v)} data-testid={`students-view-${v}`}
          className={`px-3 py-1.5 text-xs font-mono border rounded-sm ${view === v ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-slate-400"}`}>{l}</button>)}
        <button onClick={downloadCsv} className="ghost-btn !text-xs ml-auto" data-testid="students-export-csv"><Download className="h-4 w-4" />Export CSV</button>
      </div>
      <Glass className="overflow-x-auto"><table className="w-full text-sm" data-testid={view === "risk" ? "at-risk-table" : "students-table"}>
        <thead><tr className="text-left text-xs font-mono text-slate-500 border-b border-cyan-500/15">{["Name", "Email", "Rank", "XP", view === "risk" ? "Why at risk" : "Completion", "Quiz avg", "Last active"].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>{rows.map((u) => <tr key={u.id} onClick={() => setSel(u.id)} className="border-b border-white/5 hover:bg-cyan-500/5 cursor-pointer" data-testid={`student-row-${u.id}`}>
          <td className="px-4 py-2.5">{u.name}</td><td className="px-4 font-mono text-xs text-slate-400">{u.email}</td><td className="px-4 text-xs font-mono">{u.rank}</td><td className="px-4 font-mono text-green-400">{u.xp}</td>
          <td className="px-4">{view === "risk" ? <span className="text-xs text-orange-300">{u.reasons.join(" · ")}</span> : <><div className="w-24 h-1.5 bg-white/5"><div className="h-1.5 bg-cyan-400" style={{ width: `${u.completion}%` }} /></div><span className="text-[10px] font-mono text-slate-500">{u.completion}%</span></>}</td>
          <td className="px-4 font-mono text-xs">{u.quiz_avg ?? "—"}</td><td className="px-4 font-mono text-xs text-slate-400">{u.last_active || "never"}</td></tr>)}</tbody></table>
        {!rows.length && <Empty text={view === "risk" ? "no at-risk students" : "no students"} />}</Glass>
      <StudentDetail uid={sel} onClose={() => setSel(null)} />
    </div>);
}

function GradeBox({ init, onSave, testId }) {
  const [g, setG] = useState(init.grade);
  const [fb, setFb] = useState(init.feedback || "");
  return (
    <div className="flex flex-wrap gap-2 mt-3"><input type="number" min={0} max={100} className="field !w-24" value={g} onChange={(e) => setG(e.target.value)} data-testid={`grade-input-${testId}`} />
      <input className="field flex-1" placeholder="Feedback for the student (emailed with the grade)" value={fb} onChange={(e) => setFb(e.target.value)} data-testid={`feedback-input-${testId}`} />
      <button className="glow-btn" onClick={() => onSave(+g, fb)} data-testid={`grade-save-${testId}`}>Save & email</button></div>);
}

export function GradingPanel() {
  const [d, setD] = useState(null);
  const [f, setF] = useState("pending");
  const load = () => api.get("/instructor/submissions").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  if (!d) return null;
  const post = async (url, grade, feedback) => { try { await api.post(url, { grade, feedback }); toast.success("Graded — the student has been emailed"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const show = (reviewed) => f === "all" || (f === "pending" ? !reviewed : reviewed);
  const chs = d.challenges.filter((s) => show(s.status === "reviewed"));
  const labs = d.lab_reports.filter((r) => show(r.review_status === "reviewed"));
  return (
    <div className="space-y-3">
      <div className="flex gap-2">{["pending", "reviewed", "all"].map((v) => <button key={v} onClick={() => setF(v)} data-testid={`grading-filter-${v}`} className={`px-3 py-1.5 text-xs font-mono border rounded-sm capitalize ${f === v ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-slate-400"}`}>{v}</button>)}</div>
      <div className="eyebrow pt-2">soc challenge reports ({chs.length})</div>
      {chs.length ? chs.map((s) => <Glass key={s.id} className="p-4" data-testid={`submission-${s.id}`}>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><span><b>{s.user_name}</b> · {s.challenge_title} <span className="text-xs text-slate-500">({s.category})</span></span>
          <span className="font-mono text-xs">verdict {s.verdict} {s.verdict_correct ? "✓" : "✗"} · auto {s.auto_score} · <span className={s.status === "reviewed" ? "text-green-400" : "text-yellow-300"}>{s.status === "reviewed" ? `graded ${s.instructor_grade}` : "pending"}</span></span></div>
        <p className="text-sm text-slate-300 mt-2 whitespace-pre-line bg-black/30 p-3">{s.report}</p>
        <GradeBox init={{ grade: s.instructor_grade ?? s.auto_score, feedback: s.feedback }} testId={s.id} onSave={(g, fb) => post(`/instructor/submissions/${s.id}/grade`, g, fb)} />
      </Glass>) : <Empty text="nothing here" />}
      <div className="eyebrow pt-4">lab final reports ({labs.length})</div>
      {labs.length ? labs.map((r) => { const k = `${r.user_id}-${r.lab_id}`; return <Glass key={k} className="p-4" data-testid={`lab-report-${k}`}>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><span><b>{r.user_name}</b> · {r.lab_title}</span>
          <span className="font-mono text-xs">auto {r.report_score ?? "—"}/100 · <span className={r.review_status === "reviewed" ? "text-green-400" : "text-yellow-300"}>{r.review_status === "reviewed" ? `graded ${r.instructor_grade}` : "pending"}</span></span></div>
        {r.keywords_missed?.length > 0 && <div className="text-xs font-mono text-orange-300 mt-1">missed: {r.keywords_missed.join(", ")}</div>}
        <p className="text-sm text-slate-300 mt-2 whitespace-pre-line bg-black/30 p-3">{r.report}</p>
        <GradeBox init={{ grade: r.instructor_grade ?? r.report_score ?? 0, feedback: r.feedback }} testId={k} onSave={(g, fb) => post(`/instructor/lab-reports/${r.user_id}/${r.lab_id}/grade`, g, fb)} />
      </Glass>; }) : <Empty text="nothing here" />}
    </div>);
}
