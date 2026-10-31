import { useEffect, useState } from "react";
import { Siren, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { api, errMsg } from "../../lib/api";
import { Glass, PageHeader, SeverityBadge } from "../../components/common";

function Investigate({ c, onDone }) {
  const [verdict, setVerdict] = useState(c.submission?.verdict || "");
  const [report, setReport] = useState(c.submission?.report || "");
  const [res, setRes] = useState(null);
  const submit = async () => {
    try { const { data } = await api.post(`/challenges/${c.id}/submit`, { verdict, report }); setRes(data); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-5 mt-4">
      <div className="text-sm text-slate-300">{c.description}</div>
      <div className="bg-black/40 border border-cyan-500/20 p-4 font-mono text-xs space-y-1" data-testid="challenge-alert-details">
        {Object.entries(c.alert).map(([k, v]) => <div key={k}><span className="text-cyan-400">{k}:</span> <span className="text-slate-200 break-all">{v}</span></div>)}
      </div>
      <div><div className="eyebrow mb-2">evidence</div>
        <div className="space-y-1.5">{c.evidence.map((e, i) => <div key={i} className="font-mono text-xs bg-black/30 border-l-2 border-green-500/40 px-3 py-2 text-slate-300 break-words">{e}</div>)}</div></div>
      <div><div className="eyebrow mb-2">verdict</div>
        <div className="flex gap-2">
          {[["TP", "True Positive"], ["FP", "False Positive"]].map(([v, l]) => <button key={v} onClick={() => setVerdict(v)} data-testid={`challenge-verdict-${v}`}
            className={`flex-1 py-2.5 border font-mono text-sm rounded-sm transition-colors ${verdict === v ? (v === "TP" ? "border-red-400 bg-red-500/15 text-red-300" : "border-green-400 bg-green-500/15 text-green-300") : "border-white/10 text-slate-400 hover:border-cyan-500/40"}`}>{l}</button>)}
        </div></div>
      <div><div className="eyebrow mb-2">analyst report</div>
        <textarea className="field h-36 text-sm" value={report} onChange={(e) => setReport(e.target.value)} placeholder="What happened, key IOCs, impact, and your recommended next actions..." data-testid="challenge-report-input" /></div>
      <button className="glow-btn w-full justify-center" disabled={!verdict || report.length < 20} onClick={submit} data-testid="challenge-submit-button">Submit for auto-grading</button>
      {res && <Glass className="p-4" data-testid="challenge-result">
        <div className="flex items-center gap-2 font-mono font-bold">{res.verdict_correct ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <XCircle className="h-5 w-5 text-red-400" />}Score {res.auto_score}/100</div>
        <div className="text-xs text-slate-400 mt-2">Expected verdict: <span className="text-slate-200">{res.expected_verdict}</span></div>
        <div className="text-xs text-slate-400 mt-1">Covered: <span className="text-green-300">{res.keywords_hit.join(", ") || "—"}</span></div>
        <div className="text-xs text-slate-400 mt-1">Missed: <span className="text-orange-300">{res.missed_keywords.join(", ") || "—"}</span></div>
      </Glass>}
      {c.submission?.status === "reviewed" && <div className="text-sm text-cyan-300 font-mono">Instructor grade: {c.submission.instructor_grade}/100 — {c.submission.feedback}</div>}
    </div>
  );
}

export default function Challenges() {
  const [cs, setCs] = useState([]);
  const [open, setOpen] = useState(null);
  const load = () => api.get("/challenges").then((r) => { setCs(r.data); setOpen((o) => (o ? r.data.find((x) => x.id === o.id) : o)); });
  useEffect(() => { load(); }, []);
  return (
    <div>
      <PageHeader eyebrow="// alert queue" title="SOC Challenges" sub="Investigate each alert, decide True or False Positive, and write a short report. Auto-graded on verdict and evidence coverage." />
      <Glass className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="challenges-table">
          <thead><tr className="text-left text-xs font-mono text-slate-500 border-b border-cyan-500/15">{["Severity", "Rule / Title", "Category", "Host", "Points", "Status"].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody>{cs.map((c) => (
            <tr key={c.id} onClick={() => setOpen(c)} className="border-b border-white/5 hover:bg-cyan-500/5 cursor-pointer transition-colors" data-testid={`challenge-row-${c.id}`}>
              <td className="px-4 py-3"><SeverityBadge level={c.severity} /></td>
              <td className="px-4 py-3"><div className="font-mono text-xs text-cyan-400">{c.alert.rule}</div><div>{c.title}</div></td>
              <td className="px-4 py-3 text-slate-400">{c.category}</td><td className="px-4 py-3 font-mono text-xs">{c.alert.host}</td>
              <td className="px-4 py-3 font-mono text-green-400">{c.points}</td>
              <td className="px-4 py-3 text-xs font-mono">{c.submission ? <span className={c.submission.verdict_correct ? "text-green-400" : "text-orange-300"}>{c.submission.auto_score}/100</span> : <span className="text-slate-500">open</span>}</td>
            </tr>))}</tbody>
        </table>
      </Glass>
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="bg-[#0B0F1A] border-cyan-500/20 w-full sm:max-w-xl overflow-y-auto">
          {open && <><SheetHeader><SheetTitle className="font-mono flex items-center gap-2"><Siren className="h-5 w-5 text-red-400" />{open.title}</SheetTitle><div><SeverityBadge level={open.severity} /></div></SheetHeader>
            <Investigate key={open.id} c={open} onDone={load} /></>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
