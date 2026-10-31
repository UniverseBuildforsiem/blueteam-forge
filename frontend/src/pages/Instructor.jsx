import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { api, errMsg, fmtDate } from "../lib/api";
import { Glass, PageHeader, Empty } from "../components/common";
import ContentEditor from "../components/ContentEditor";

const KINDS = [["paths", "Courses & Lessons"], ["quizzes", "Quizzes"], ["ctfs", "CTF"], ["challenges", "SOC Challenges"], ["labs", "Labs"], ["sessions", "Live Sessions"]];

function Content() {
  const [k, setK] = useState("paths");
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">{KINDS.map(([v, l]) => <button key={v} onClick={() => setK(v)} className={`px-3 py-1.5 text-xs font-mono border rounded-sm ${k === v ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-slate-400"}`} data-testid={`content-kind-${v}`}>{l}</button>)}</div>
      <ContentEditor kind={k} />
    </div>
  );
}

function Students() {
  const [s, setS] = useState([]);
  useEffect(() => { api.get("/instructor/students").then((r) => setS(r.data)); }, []);
  return (
    <Glass className="overflow-x-auto"><table className="w-full text-sm" data-testid="students-table">
      <thead><tr className="text-left text-xs font-mono text-slate-500 border-b border-cyan-500/15">{["Name", "Email", "Goal", "Rank", "XP", "Completion", "Quiz avg", "Certs"].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
      <tbody>{s.map((u) => <tr key={u.id} className="border-b border-white/5"><td className="px-4 py-2.5">{u.name}</td><td className="px-4 font-mono text-xs text-slate-400">{u.email}</td><td className="px-4 text-xs">{u.goal || "—"}</td>
        <td className="px-4 text-xs font-mono">{u.rank}</td><td className="px-4 font-mono text-green-400">{u.xp}</td>
        <td className="px-4"><div className="w-24 h-1.5 bg-white/5"><div className="h-1.5 bg-cyan-400" style={{ width: `${u.completion}%` }} /></div><span className="text-[10px] font-mono text-slate-500">{u.completion}%</span></td>
        <td className="px-4 font-mono text-xs">{u.quiz_avg ?? "—"}</td><td className="px-4 font-mono text-xs">{u.certs}</td></tr>)}</tbody></table></Glass>
  );
}

function Analytics() {
  const [a, setA] = useState([]);
  useEffect(() => { api.get("/instructor/quiz-analytics").then((r) => setA(r.data)); }, []);
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Glass className="p-5 h-80"><div className="font-bold mb-2">Average score by quiz</div>{a.length ? <ResponsiveContainer height="88%"><BarChart data={a}><XAxis dataKey="quiz" tick={{ fill: "#64748B", fontSize: 9 }} /><YAxis domain={[0, 100]} tick={{ fill: "#64748B", fontSize: 10 }} />
        <Tooltip contentStyle={{ background: "#0B0F1A", border: "1px solid rgba(0,240,255,.3)" }} /><Bar dataKey="avg" fill="#00F0FF" /><Bar dataKey="pass_rate" fill="#00FF66" /></BarChart></ResponsiveContainer> : <Empty text="no attempts yet" />}</Glass>
      <Glass className="divide-y divide-white/5" data-testid="quiz-analytics-list">{a.map((q) => <div key={q.quiz} className="p-3 flex justify-between text-sm"><span>{q.quiz}</span><span className="font-mono text-xs text-slate-400">{q.attempts} attempts · avg {q.avg}% · pass {q.pass_rate}%</span></div>)}</Glass>
    </div>
  );
}

function GradeRow({ s, onDone }) {
  const [g, setG] = useState(s.instructor_grade ?? s.auto_score);
  const [fb, setFb] = useState(s.feedback || "");
  const save = async () => { try { await api.post(`/instructor/submissions/${s.id}/grade`, { grade: +g, feedback: fb }); toast.success("Graded"); onDone(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Glass className="p-4" data-testid={`submission-${s.id}`}>
      <div className="flex flex-wrap justify-between gap-2 text-sm"><span><b>{s.user_name}</b> · {s.challenge_title}</span>
        <span className="font-mono text-xs">verdict {s.verdict} {s.verdict_correct ? "✓" : "✗"} · auto {s.auto_score} · <span className={s.status === "reviewed" ? "text-green-400" : "text-yellow-300"}>{s.status}</span></span></div>
      <p className="text-sm text-slate-300 mt-2 whitespace-pre-line bg-black/30 p-3">{s.report}</p>
      <div className="flex flex-wrap gap-2 mt-3"><input type="number" min={0} max={100} className="field !w-24" value={g} onChange={(e) => setG(e.target.value)} data-testid={`grade-input-${s.id}`} />
        <input className="field flex-1" placeholder="Feedback" value={fb} onChange={(e) => setFb(e.target.value)} data-testid={`feedback-input-${s.id}`} />
        <button className="glow-btn" onClick={save} data-testid={`grade-save-${s.id}`}>Save grade</button></div>
    </Glass>
  );
}

function Grading() {
  const [d, setD] = useState(null);
  const load = () => api.get("/instructor/submissions").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  if (!d) return null;
  return (
    <div className="space-y-3">
      {d.challenges.length ? d.challenges.map((s) => <GradeRow key={s.id} s={s} onDone={load} />) : <Empty text="no challenge reports yet" />}
      <div className="eyebrow pt-4">lab final reports</div>
      {d.lab_reports.map((r) => <Glass key={r.user_id + r.lab_id} className="p-4 text-sm"><b>{r.user_name}</b> · {r.lab_title}<p className="text-slate-300 mt-2 whitespace-pre-line">{r.report}</p></Glass>)}
    </div>
  );
}

function Attendance() {
  const [ss, setSs] = useState([]);
  const [sel, setSel] = useState(null);
  const [att, setAtt] = useState([]);
  useEffect(() => { api.get("/manage/sessions").then((r) => setSs(r.data)); }, []);
  const open = async (s) => { setSel(s); setAtt((await api.get(`/instructor/sessions/${s.id}/attendees`)).data); };
  const mark = async (u, v) => { await api.post(`/instructor/sessions/${sel.id}/attendance`, { user_id: u, attended: v }); open(sel); };
  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4">
      <div className="space-y-2">{ss.map((s) => <button key={s.id} onClick={() => open(s)} className={`w-full text-left glass rounded-sm p-3 ${sel?.id === s.id ? "!border-cyan-400" : ""}`} data-testid={`attendance-session-${s.id}`}><div className="text-sm">{s.title}</div><div className="text-xs font-mono text-slate-500">{fmtDate(s.start)} · cap {s.capacity}</div></button>)}</div>
      {sel ? <Glass className="divide-y divide-white/5" data-testid="attendance-list">{att.length ? att.map((a) => <label key={a.user_id} className="p-3 flex items-center gap-3 text-sm"><input type="checkbox" checked={a.attended} onChange={(e) => mark(a.user_id, e.target.checked)} data-testid={`attendance-check-${a.user_id}`} /><span className="flex-1">{a.name}</span><span className="font-mono text-xs text-slate-500">{a.email}</span></label>) : <Empty text="no RSVPs yet" />}</Glass> : <Empty text="select a session" />}
    </div>
  );
}

const TABS = [["content", "Content", Content], ["students", "Students", Students], ["analytics", "Quiz analytics", Analytics], ["grading", "Grading", Grading], ["attendance", "Attendance", Attendance]];

export default function Instructor() {
  return (
    <div>
      <PageHeader eyebrow="// instructor console" title="Instructor panel" sub="Build courses, quizzes, CTFs, labs and live sessions. Track students and grade written reports." />
      <Tabs defaultValue="content"><TabsList className="bg-black/40 mb-5 flex-wrap h-auto">{TABS.map(([v, l]) => <TabsTrigger key={v} value={v} data-testid={`instructor-tab-${v}`}>{l}</TabsTrigger>)}</TabsList>
        {TABS.map(([v, , C]) => <TabsContent key={v} value={v}><C /></TabsContent>)}</Tabs>
    </div>
  );
}
