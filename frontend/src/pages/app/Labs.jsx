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
      <PageHeader eyebrow="// scenario labs" title="Guided incident scenarios" sub="Multi-step investigations with a Kali shell, seeded evidence, hints and a final report." />
      <div className="grid md:grid-cols-2 gap-4">
        {labs.map((l) => (
          <Glass key={l.id} className="p-6 flex flex-col" data-testid={`lab-card-${l.id}`}>
            <div className="flex justify-between text-xs font-mono"><span className="text-green-400">{l.difficulty}</span><span className="text-slate-500">{l.duration} · {l.solved}/{l.task_count} tasks</span></div>
            <h3 className="text-lg font-bold mt-3 flex items-center gap-2"><FlaskConical className="h-5 w-5 text-cyan-400" />{l.title}</h3>
            <p className="text-sm text-slate-400 mt-2 flex-1">{l.description}</p>
            <div className="h-1 bg-white/5 mt-5"><div className="h-1 bg-green-400" style={{ width: `${(100 * l.solved) / l.task_count}%` }} /></div>
            <Link to={`/app/labs/${l.id}`} className="glow-btn mt-5 self-start" data-testid={`lab-open-${l.id}`}>{l.solved ? "Resume" : "Launch lab"}</Link>
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
  const submit = async () => {
    try { const { data } = await api.post(`/labs/${labId}/tasks/${t.id}`, { answer: a }); if (data.correct) { toast.success("Correct! +20 XP"); onSolved(); } else toast.error("Not quite — keep digging"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className={`p-3 border-l-2 ${t.solved ? "border-green-400 bg-green-500/5" : "border-cyan-500/30"}`} data-testid={`lab-task-${t.id}`}>
      <div className="text-xs font-mono text-slate-500 flex items-center gap-2">{t.solved && <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />}{t.title}</div>
      <div className="text-sm mt-1">{t.question}</div>
      {!t.solved && <div className="flex gap-2 mt-2">
        <input className="field !py-1.5 font-mono text-xs" value={a} onChange={(e) => setA(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="answer" data-testid={`lab-task-input-${t.id}`} />
        <button className="ghost-btn !py-1 !px-3 !text-xs" onClick={submit} data-testid={`lab-task-submit-${t.id}`}>Submit</button>
        <button className="text-yellow-300" onClick={() => setHint(!hint)} title="Hint" data-testid={`lab-task-hint-${t.id}`}><Lightbulb className="h-4 w-4" /></button>
      </div>}
      {hint && !t.solved && <div className="text-xs text-yellow-300 font-mono mt-2">hint: {t.hint}</div>}
    </div>
  );
}

export function LabRunner() {
  const { id } = useParams();
  const [lab, setLab] = useState(null);
  const [report, setReport] = useState("");
  const term = useRef(null);
  const load = () => api.get(`/labs/${id}`).then((r) => { setLab((old) => (old ? { ...r.data, kali: old.kali } : r.data)); setReport((x) => x || r.data.progress.report); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  if (!lab) return null;
  const allSolved = lab.tasks.every((t) => t.solved);
  const sendReport = async () => {
    try { await api.post(`/labs/${id}/report`, { report }); toast.success("Final report submitted"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div>
      <PageHeader eyebrow={`// ${lab.difficulty} · ${lab.duration}`} title={lab.title} sub={lab.description} />
      <div className="grid xl:grid-cols-[1fr_380px] gap-4">
        <Terminal ref={term} lab={lab} height="600px" />
        <Glass className="p-4">
          <Tabs defaultValue="tasks">
            <TabsList className="bg-black/40 w-full"><TabsTrigger value="tasks" className="flex-1" data-testid="lab-tab-tasks"><ListChecks className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="tools" className="flex-1" data-testid="lab-tab-tools"><Wrench className="h-4 w-4" /></TabsTrigger><TabsTrigger value="notes" className="flex-1" data-testid="lab-tab-notes"><NotebookPen className="h-4 w-4" /></TabsTrigger></TabsList>
            <TabsContent value="tasks" className="space-y-2 mt-3 max-h-[520px] overflow-y-auto">
              {lab.tasks.map((t) => <Task key={t.id} t={t} labId={id} onSolved={load} />)}
              <div className="pt-3">
                <div className="eyebrow mb-2">final report</div>
                {lab.progress.report_submitted ? <div className="text-sm text-green-400 font-mono" data-testid="lab-report-submitted">✓ Report submitted for instructor review</div> : <>
                  <textarea className="field h-32 text-xs" disabled={!allSolved} value={report} onChange={(e) => setReport(e.target.value)} placeholder={allSolved ? "Summary, timeline, IOCs, impact, recommendations..." : "Solve all tasks to unlock the report"} data-testid="lab-report-input" />
                  <button className="glow-btn mt-2 w-full justify-center" disabled={!allSolved || report.length < 20} onClick={sendReport} data-testid="lab-report-submit">Submit report (+50 XP)</button></>}
              </div>
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
