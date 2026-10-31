import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Siren, CheckCircle2, XCircle, Crosshair, ArrowRight, Lightbulb, Lock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { api, errMsg } from "../../lib/api";
import { Glass, PageHeader, SeverityBadge } from "../../components/common";

export function Investigate({ c, onDone, submitUrl }) {
  const [verdict, setVerdict] = useState(c.submission?.verdict || "");
  const [report, setReport] = useState(c.submission?.report || "");
  const [res, setRes] = useState(null);
  const submit = async () => {
    try { const { data } = await api.post(submitUrl || `/challenges/${c.id}/submit`, { verdict, report }); setRes(data); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-5 mt-4">
      <div className="text-sm text-slate-300">{c.description}</div>
      <div className="bg-black/40 border border-cyan-500/20 p-4 font-mono text-xs space-y-1" data-testid="challenge-alert-details">
        {Object.entries(c.alert).map(([k, v]) => <div key={k}><span className="text-cyan-400">{k}:</span> <span className="text-slate-200 break-all">{v}</span></div>)}
      </div>
      <div><div className="eyebrow mb-2">evidence</div>
        <div className="space-y-1.5">{c.evidence.map((e, i) => <div key={i} className="font-mono text-xs bg-black/30 border-l-2 border-green-500/40 px-3 py-2 text-slate-300 break-words"><span className="text-slate-500 mr-2">#{i + 1}</span>{e}</div>)}</div></div>
      {c.hints && <Hints c={c} onDone={onDone} />}
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

function Hints({ c, onDone }) {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const unlock = async (i) => {
    setBusy(true);
    try { await api.post(`/challenges/${c.id}/hint/${i}`); toast.success(`Hint unlocked (-${c.hints[i].cost} pts)`); onDone(); refresh(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const next = c.hints.findIndex((h) => !h.text);
  return (
    <div data-testid="challenge-hints"><div className="eyebrow mb-2 flex items-center justify-between">hints<span className="text-slate-500 normal-case" data-testid="challenge-hint-balance">balance: {user?.xp ?? 0} pts</span></div>
      <div className="space-y-1.5">{c.hints.map((h) => h.text
        ? <div key={h.idx} className="font-mono text-xs bg-yellow-500/5 border-l-2 border-yellow-400/60 px-3 py-2 text-yellow-200" data-testid={`challenge-hint-text-${h.idx}`}><Lightbulb className="inline h-3.5 w-3.5 mr-1.5" />{h.text}</div>
        : h.idx === next
          ? <button key={h.idx} disabled={busy} onClick={() => unlock(h.idx)} className="ghost-btn !text-xs" data-testid={`challenge-hint-unlock-${h.idx}`}><Lightbulb className="h-3.5 w-3.5" />Unlock hint {h.idx + 1} (-{h.cost} pts)</button>
          : <div key={h.idx} className="font-mono text-xs text-slate-500 flex items-center gap-1.5 px-1" data-testid={`challenge-hint-locked-${h.idx}`}><Lock className="h-3.5 w-3.5" />Hint {h.idx + 1} — unlock hint {h.idx} first</div>)}</div>
    </div>);
}

const STEPS = ["Read the alert: rule, host, user and time", "Work through every evidence line and note the IOCs", "Decide: True Positive or False Positive", "Write a short report: what happened, impact, next actions"];

function Briefing({ c, onBegin, onClose }) {
  if (!c) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-lg" data-testid="mission-briefing">
        <DialogHeader>
          <div className="eyebrow">// mission briefing · {c.category}</div>
          <DialogTitle className="font-mono text-xl mt-1 flex items-center gap-2"><Crosshair className="h-5 w-5 text-red-400" />{c.title}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 font-mono text-xs"><SeverityBadge level={c.severity} /><span className="text-cyan-400">{c.alert.rule}</span></div>
        <p className="text-sm text-slate-300">{c.description}</p>
        <div className="grid grid-cols-3 gap-2 font-mono text-xs">
          {[["host", c.alert.host], ["user", c.alert.user], ["reward", `${c.points} XP`]].map(([k, v]) => <div key={k} className="bg-black/40 border border-white/5 p-2"><div className="text-slate-500">{k}</div><div className="text-slate-200 truncate">{v}</div></div>)}
        </div>
        <div><div className="eyebrow mb-2">objectives</div>
          <ol className="space-y-1.5">{STEPS.map((t, i) => <li key={t} className="flex gap-3 text-sm text-slate-300"><span className="font-mono text-green-400">0{i + 1}</span>{t}</li>)}</ol></div>
        <button className="glow-btn justify-center mt-1" onClick={onBegin} data-testid="mission-begin-button">Begin investigation <ArrowRight className="h-4 w-4" /></button>
      </DialogContent>
    </Dialog>
  );
}

export default function Challenges() {
  const [cs, setCs] = useState([]);
  const [open, setOpen] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [sp, setSp] = useSearchParams();
  const load = () => api.get("/challenges").then((r) => {
    setCs(r.data);
    const want = sp.get("case");
    setOpen((o) => (o ? r.data.find((x) => x.id === o.id) : o));
    if (want) setBriefing(r.data.find((x) => x.id === want) || null);
    if (want) setSp({}, { replace: true });
  });
  useEffect(() => { load(); }, []); // eslint-disable-line
  const [f, setF] = useState({ q: "", cat: "All", diff: "All", status: "All" });
  const cats = ["All", ...Array.from(new Set(cs.map((c) => c.category)))];
  const shown = cs.filter((c) => (f.cat === "All" || c.category === f.cat) && (f.diff === "All" || c.difficulty === f.diff)
    && (f.status === "All" || (f.status === "Attempted" ? !!c.submission : !c.submission))
    && `${c.title} ${c.alert.rule} ${c.alert.host}`.toLowerCase().includes(f.q.toLowerCase()));
  const sel = (k, opts) => (
    <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="bg-black/40 border border-white/10 text-sm font-mono px-2 py-1.5 rounded-sm focus:border-cyan-400 outline-none" data-testid={`challenge-filter-${k}`}>
      {opts.map((o) => <option key={o} value={o}>{k === "cat" && o === "All" ? "All categories" : k === "diff" && o === "All" ? "All difficulties" : k === "status" && o === "All" ? "All statuses" : o}</option>)}
    </select>);
  return (
    <div>
      <PageHeader eyebrow="// alert queue" title="SOC Challenges" sub="Investigate each alert, decide True or False Positive, and write a short report. Auto-graded on verdict and evidence coverage." />
      <div className="flex flex-wrap items-center gap-2 mb-4" data-testid="challenge-filters">
        <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search alerts, rules, hosts" className="field !w-64" data-testid="challenge-search" />
        {sel("cat", cats)}{sel("diff", ["All", "Easy", "Medium", "Hard"])}{sel("status", ["All", "Open", "Attempted"])}
        <span className="ml-auto text-xs font-mono text-slate-400" data-testid="challenge-count">{shown.length} of {cs.length} alerts · {cs.filter((c) => c.submission?.verdict_correct).length} solved correctly</span>
      </div>
      <Glass className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="challenges-table">
          <thead><tr className="text-left text-xs font-mono text-slate-500 border-b border-cyan-500/15">{["Severity", "Rule / Title", "Category", "Difficulty", "Host", "Points", "Status"].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody>{shown.map((c) => (
            <tr key={c.id} onClick={() => setOpen(c)} className="border-b border-white/5 hover:bg-cyan-500/5 cursor-pointer transition-colors" data-testid={`challenge-row-${c.id}`}>
              <td className="px-4 py-3"><SeverityBadge level={c.severity} /></td>
              <td className="px-4 py-3"><div className="font-mono text-xs text-cyan-400">{c.alert.rule}</div><div>{c.title}</div></td>
              <td className="px-4 py-3 text-slate-400">{c.category}</td><td className={`px-4 py-3 text-xs font-mono ${c.difficulty === "Hard" ? "text-red-300" : c.difficulty === "Medium" ? "text-yellow-300" : "text-green-300"}`} data-testid={`challenge-difficulty-${c.id}`}>{c.difficulty}</td><td className="px-4 py-3 font-mono text-xs">{c.alert.host}</td>
              <td className="px-4 py-3 font-mono text-green-400">{c.points}</td>
              <td className="px-4 py-3 text-xs font-mono">{c.submission ? <span className={c.submission.verdict_correct ? "text-green-400" : "text-orange-300"}>{c.submission.auto_score}/100</span> : <span className="text-slate-500">open</span>}</td>
            </tr>))}</tbody>
        </table>
      </Glass>
      <Briefing c={briefing} onBegin={() => { setOpen(briefing); setBriefing(null); }} onClose={() => setBriefing(null)} />
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="bg-[#0B0F1A] border-cyan-500/20 w-full sm:max-w-xl overflow-y-auto">
          {open && <><SheetHeader><SheetTitle className="font-mono flex items-center gap-2"><Siren className="h-5 w-5 text-red-400" />{open.title}</SheetTitle><div><SeverityBadge level={open.severity} /></div></SheetHeader>
            <Investigate key={open.id} c={open} onDone={load} /></>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
