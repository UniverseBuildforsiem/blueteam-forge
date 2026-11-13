import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { api, errMsg, fmtDate } from "../lib/api";
import { Glass, PageHeader, Empty } from "../components/common";
import ContentEditor from "../components/ContentEditor";
import { CatalogCourses, StudentsPanel, GradingPanel } from "../components/InstructorExtras";

const KINDS = [["paths", "Courses & Lessons"], ["quizzes", "Quizzes"], ["ctfs", "CTF"], ["challenges", "SOC Challenges"], ["playbooks", "Playbooks"], ["labs", "Labs"], ["sessions", "Live Sessions"]];

function PlaybookRuns() {
  const [r, setR] = useState(null);
  useEffect(() => { api.get("/instructor/playbook-runs").then((x) => setR(x.data)); }, []);
  if (!r) return null;
  if (!r.length) return <Empty text="No students have used a playbook on a challenge yet" />;
  return (
    <Glass className="overflow-x-auto"><table className="w-full text-sm" data-testid="playbook-runs-table">
      <thead><tr className="text-left text-xs font-mono text-slate-500 border-b border-white/10">{["Student", "Challenge", "Playbook", "Outcome", "Correct path", "Went wrong at", "When"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr></thead>
      <tbody>{r.map((x) => <tr key={x.id} className="border-b border-white/5" data-testid={`playbook-run-${x.id}`}>
        <td className="px-3 py-2">{x.user_name}</td><td className="px-3 py-2 text-xs">{x.challenge_title}</td><td className="px-3 py-2 text-xs text-slate-400">{x.playbook_title.replace(/^Playbook:\s*/, "")}</td>
        <td className="px-3 py-2 font-mono text-xs">{x.outcome}{x.after_submit && <span className="ml-1.5 text-[10px] text-slate-500 border border-white/10 px-1" data-testid={`playbook-run-after-${x.id}`}>after submit</span>}</td><td className={`px-3 py-2 font-mono text-xs ${x.correct ? "text-green-400" : "text-orange-300"}`}>{x.correct ? "yes" : "no"}</td>
        <td className="px-3 py-2 text-xs text-slate-400">{x.wrong_step?.title || "—"}</td><td className="px-3 py-2 text-xs text-slate-500">{fmtDate(x.created_at)}</td></tr>)}</tbody>
    </table></Glass>);
}

function Content() {
  const [k, setK] = useState("paths");
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">{KINDS.map(([v, l]) => <button key={v} onClick={() => setK(v)} className={`px-3 py-1.5 text-xs font-mono border rounded-sm ${k === v ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-slate-400"}`} data-testid={`content-kind-${v}`}>{l}</button>)}</div>
      <ContentEditor kind={k} />
    </div>
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

function Attendance() {
  const [ss, setSs] = useState([]);
  const [sel, setSel] = useState(null);
  const [att, setAtt] = useState([]);
  useEffect(() => { api.get("/manage/sessions").then((r) => setSs(r.data)); }, []);
  const open = async (s) => { setSel(s); setAtt((await api.get(`/instructor/sessions/${s.id}/attendees`)).data); };
  const mark = async (u, v) => {
    try { await api.post(`/instructor/sessions/${sel.id}/attendance`, { user_id: u, attended: v }); toast.success(v ? "Marked present" : "Marked absent"); open(sel); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4">
      <div className="space-y-2">{ss.map((s) => <button key={s.id} onClick={() => open(s)} className={`w-full text-left glass rounded-sm p-3 ${sel?.id === s.id ? "!border-cyan-400" : ""}`} data-testid={`attendance-session-${s.id}`}><div className="text-sm">{s.title}</div><div className="text-xs font-mono text-slate-500">{fmtDate(s.start)} · cap {s.capacity}</div></button>)}</div>
      {sel ? <Glass className="divide-y divide-white/5" data-testid="attendance-list">{att.length ? att.map((a) => <label key={a.user_id} className="p-3 flex items-center gap-3 text-sm"><input type="checkbox" checked={a.attended} onChange={(e) => mark(a.user_id, e.target.checked)} data-testid={`attendance-check-${a.user_id}`} /><span className="flex-1">{a.name}</span><span className="font-mono text-xs text-slate-500">{a.email}</span></label>) : <Empty text="no RSVPs yet" />}</Glass> : <Empty text="select a session" />}
    </div>
  );
}

const TABS = [["content", "Content", Content], ["catalog", "Catalog courses", CatalogCourses], ["students", "Students", StudentsPanel], ["analytics", "Quiz analytics", Analytics], ["grading", "Grading", GradingPanel], ["playbook-runs", "Playbook runs", PlaybookRuns], ["attendance", "Attendance", Attendance]];

export default function Instructor() {
  return (
    <div>
      <PageHeader eyebrow="// instructor console" title="Instructor panel" sub="Publish catalog courses, build paths, quizzes, CTFs, labs and live sessions. Monitor every student, spot who is at risk, and grade reports with emailed feedback." />
      <Tabs defaultValue="content"><TabsList className="bg-black/40 mb-5 flex-wrap h-auto">{TABS.map(([v, l]) => <TabsTrigger key={v} value={v} data-testid={`instructor-tab-${v}`}>{l}</TabsTrigger>)}</TabsList>
        {TABS.map(([v, , C]) => <TabsContent key={v} value={v}><C /></TabsContent>)}</Tabs>
    </div>
  );
}
