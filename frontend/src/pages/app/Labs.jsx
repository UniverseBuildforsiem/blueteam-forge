import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Lightbulb, FlaskConical, NotebookPen, Wrench, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { api, errMsg } from "../../lib/api";
import { TOOLS } from "../../lib/kali";
import Terminal from "../../components/Terminal";
import { Glass, PageHeader } from "../../components/common";

export function Labs() {
  const [labs, setLabs] = useState([]);
  useEffect(() => { api.get("/labs").then((r) => setLabs(r.data)); }, []);
  return (
    <div>
      <PageHeader eyebrow="// scenario labs" title="Guided incident scenarios" sub="Multi-step investigations: read the briefing, work each phase with a Kali shell and seeded evidence, answer the questions, then write a final incident report that is auto-scored on key findings." />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {labs.map((l) => (
          <Glass key={l.id} className="p-6 flex flex-col" data-testid={`lab-card-${l.id}`}>
            <div className="flex justify-between text-xs font-mono"><span className={l.difficulty === "Advanced" ? "text-red-300" : l.difficulty === "Intermediate" ? "text-yellow-300" : "text-green-400"}>{l.difficulty} · {l.category}</span><span className="text-slate-500">{l.duration}</span></div>
            <h3 className="text-lg font-bold mt-3 flex items-center gap-2"><FlaskConical className="h-5 w-5 text-cyan-400 shrink-0" />{l.title}</h3>
            <p className="text-sm text-slate-400 mt-2 flex-1">{l.description}</p>
            <div className="flex flex-wrap gap-1.5 mt-4">{l.phases.map((p, i) => <span key={p} className="text-[10px] font-mono border border-white/10 px-1.5 py-0.5 text-slate-400">{i + 1}. {p}</span>)}</div>
            <div className="h-1 bg-white/5 mt-5"><div className="h-1 bg-green-400 transition-all" style={{ width: `${(100 * l.solved) / l.task_count}%` }} /></div>
            <div className="flex items-center justify-between mt-5">
              <Link to={`/app/labs/${l.id}`} className="glow-btn" data-testid={`lab-open-${l.id}`}>{l.solved ? "Resume" : "Launch lab"}</Link>
              <span className="text-xs font-mono text-slate-400" data-testid={`lab-progress-${l.id}`}>{l.solved}/{l.task_count} tasks{l.report_score != null && <span className="text-green-400"> · report {l.report_score}/100</span>}</span>
            </div>
          </Glass>
        ))}
      </div>
    </div>
  );
}

export function ToolsSidebar({ onPick }) {
  return (
    <div className="space-y-1 max-h-[440px] overflow-y-auto" data-testid="kali-tools-sidebar">
      {TOOLS.map(([n, c]) => (
        <button key={n} onClick={() => onPick(c)} className="w-full text-left px-2 py-1.5 hover:bg-white/5 rounded-sm" data-testid={`kali-tool-${n.split(" ")[0]}`}>
          <div className="text-xs font-mono text-cyan-300">{n}</div><div className="text-[11px] font-mono text-slate-500 truncate">{c}</div>
        </button>))}
    </div>
  );
}

export function Notes({ storageKey }) {
  const [n, setN] = useState(() => localStorage.getItem(storageKey) || "");
  useEffect(() => { localStorage.setItem(storageKey, n); }, [n, storageKey]);
  return <textarea value={n} onChange={(e) => setN(e.target.value)} placeholder="IOCs, timeline, hypotheses... (auto-saved)" className="field h-[440px] font-mono text-xs" data-testid="kali-notes" />;
}

function Task({ t, labId, onSolved }) {
  const [a, setA] = useState("");
  const [hint, setHint] = useState(false);
  const submit = async (ans = a) => {
    try { const { data } = await api.post(`/labs/${labId}/tasks/${t.id}`, { answer: ans }); if (data.correct) { toast.success("Correct! +20 XP"); onSolved(); } else toast.error("Not quite — keep digging"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className={`p-3 border-l-2 ${t.solved ? "border-green-400 bg-green-500/5" : "border-cyan-500/30"}`} data-testid={`lab-task-${t.id}`}>
      <div className="text-xs font-mono text-slate-500 flex items-center gap-2">{t.solved && <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />}{t.title}{t.type === "mcq" && <span className="text-cyan-400/70">· choose one</span>}</div>
      <div className="text-sm mt-1">{t.question}</div>
      {!t.solved && t.type === "mcq" && <div className="space-y-1.5 mt-2">{t.options.map((o, i) => <button key={o} onClick={() => submit(o)} className="w-full text-left text-xs border border-white/10 hover:border-cyan-400/60 hover:bg-cyan-500/5 px-2.5 py-2 transition-colors" data-testid={`lab-task-option-${t.id}-${i}`}>{o}</button>)}</div>}
      {!t.solved && t.type !== "mcq" && <div className="flex gap-2 mt-2">
        <input className="field !py-1.5 font-mono text-xs" value={a} onChange={(e) => setA(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="answer" data-testid={`lab-task-input-${t.id}`} />
        <button className="ghost-btn !py-1 !px-3 !text-xs" onClick={() => submit()} data-testid={`lab-task-submit-${t.id}`}>Submit</button>
      </div>}
      {!t.solved && <button className="text-yellow-300 text-[11px] font-mono mt-2 inline-flex items-center gap-1" onClick={() => setHint(!hint)} data-testid={`lab-task-hint-${t.id}`}><Lightbulb className="h-3.5 w-3.5" />{hint ? t.hint : "hint"}</button>}
    </div>
  );
}

function Phases({ lab, onSolved }) {
  const phases = [...new Set(lab.tasks.map((t) => t.phase || "Investigation"))];
  return phases.map((p, i) => {
    const ts = lab.tasks.filter((t) => (t.phase || "Investigation") === p);
    const done = ts.every((t) => t.solved);
    return (
      <div key={p} data-testid={`lab-phase-${i}`}>
        <div className="flex items-center gap-2 text-xs font-mono mt-2 mb-1.5"><span className={`h-5 w-5 grid place-items-center border ${done ? "border-green-400 text-green-400" : "border-cyan-500/40 text-cyan-300"}`}>{done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}</span>
          <span className="uppercase tracking-wider text-slate-300">{p}</span><span className="text-slate-500 ml-auto">{ts.filter((t) => t.solved).length}/{ts.length}</span></div>
        <div className="space-y-2">{ts.map((t) => <Task key={t.id} t={t} labId={lab.id} onSolved={onSolved} />)}</div>
      </div>);
  });
}

function Report({ lab, id, report, setReport, onDone }) {
  const [res, setRes] = useState(null);
  const allSolved = lab.tasks.every((t) => t.solved);
  const pr = lab.progress;
  const shown = res || (pr.report_submitted ? { score: pr.report_score, keywords_hit: pr.keywords_hit, keywords_missed: pr.keywords_missed } : null);
  const send = async () => {
    try { const { data } = await api.post(`/labs/${id}/report`, { report }); setRes(data); toast.success(`Report scored ${data.score}/100`); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="pt-4" data-testid="lab-report">
      <div className="eyebrow mb-2">final incident report</div>
      {lab.report_guide && <div className="text-[11px] text-slate-400 mb-2">{lab.report_guide}</div>}
      <textarea className="field h-36 text-xs" disabled={!allSolved} value={report} onChange={(e) => setReport(e.target.value)} placeholder={allSolved ? "Summary, timeline, IOCs, impact, containment and recommendations..." : "Solve every task to unlock the report"} data-testid="lab-report-input" />
      <button className="glow-btn mt-2 w-full justify-center" disabled={!allSolved || report.length < 20} onClick={send} data-testid="lab-report-submit">{pr.report_submitted ? "Resubmit report" : "Submit report for auto-scoring"}</button>
      {shown && shown.score != null && <div className="mt-3 border border-white/10 p-3 text-xs font-mono space-y-1" data-testid="lab-report-result">
        <div className="text-sm font-bold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" />Report score {shown.score}/100{res && res.best !== res.score && <span className="text-slate-500 font-normal">(best {res.best})</span>}</div>
        <div className="text-slate-400">Covered: <span className="text-green-300">{shown.keywords_hit?.join(", ") || "—"}</span></div>
        <div className="text-slate-400">Missed: <span className="text-orange-300">{shown.keywords_missed?.join(", ") || "—"}</span></div>
        {pr.instructor_grade != null && <div className="text-cyan-300">Instructor grade: {pr.instructor_grade}/100 — {pr.feedback}</div>}
      </div>}
    </div>);
}

export function LabRunner() {
  const { id } = useParams();
  const [lab, setLab] = useState(null);
  const [report, setReport] = useState("");
  const term = useRef(null);
  const load = () => api.get(`/labs/${id}`).then((r) => { setLab((old) => (old ? { ...r.data, kali: old.kali } : r.data)); setReport((x) => x || r.data.progress.report); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  if (!lab) return null;
  const solved = lab.tasks.filter((t) => t.solved).length;
  return (
    <div>
      <PageHeader eyebrow={`// ${lab.category || "scenario"} · ${lab.difficulty} · ${lab.duration}`} title={lab.title} sub={lab.description} />
      {lab.scenario && <Glass className="p-4 mb-4 border-l-2 border-l-red-400/70" data-testid="lab-briefing"><div className="eyebrow mb-1 text-red-300">incident briefing</div><p className="text-sm text-slate-300">{lab.scenario}</p>
        <div className="h-1 bg-white/5 mt-3"><div className="h-1 bg-green-400 transition-all" style={{ width: `${(100 * solved) / lab.tasks.length}%` }} /></div><div className="text-[11px] font-mono text-slate-500 mt-1" data-testid="lab-runner-progress">{solved}/{lab.tasks.length} tasks solved</div></Glass>}
      <div className="grid xl:grid-cols-[1fr_400px] gap-4">
        <Terminal ref={term} lab={lab} height="640px" />
        <Glass className="p-4">
          <Tabs defaultValue="tasks">
            <TabsList className="bg-black/40 w-full"><TabsTrigger value="tasks" className="flex-1" data-testid="lab-tab-tasks"><ListChecks className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="tools" className="flex-1" data-testid="lab-tab-tools"><Wrench className="h-4 w-4" /></TabsTrigger><TabsTrigger value="notes" className="flex-1" data-testid="lab-tab-notes"><NotebookPen className="h-4 w-4" /></TabsTrigger></TabsList>
            <TabsContent value="tasks" className="space-y-2 mt-3 max-h-[560px] overflow-y-auto pr-1">
              <Phases lab={lab} onSolved={load} />
              <Report lab={lab} id={id} report={report} setReport={setReport} onDone={load} />
            </TabsContent>
            <TabsContent value="tools" className="mt-3"><ToolsSidebar onPick={(c) => term.current?.insert(c)} /></TabsContent>
            <TabsContent value="notes" className="mt-3"><Notes storageKey={`notes-${id}`} /></TabsContent>
          </Tabs>
        </Glass>
      </div>
    </div>
  );
}

export function KaliPage() {
  const [lab, setLab] = useState(null);
  const term = useRef(null);
  useEffect(() => { api.get("/labs/lab-phish-ransom").then((r) => setLab(r.data)); }, []);
  if (!lab) return null;
  return (
    <div>
      <PageHeader eyebrow="// kali linux simulator" title="Analyst workstation" sub="Free-play sandbox loaded with the Phishing to Ransomware evidence set. Nothing here touches a real network." />
      <div className="grid xl:grid-cols-[240px_1fr_300px] gap-4">
        <Glass className="p-3"><div className="eyebrow mb-2">tools</div><ToolsSidebar onPick={(c) => term.current?.insert(c)} /></Glass>
        <Terminal ref={term} lab={lab} height="600px" />
        <Glass className="p-3"><div className="eyebrow mb-2">notes</div><Notes storageKey="notes-kali" /></Glass>
      </div>
    </div>
  );
}
