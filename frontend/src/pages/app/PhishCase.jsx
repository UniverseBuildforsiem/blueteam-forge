import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Send, MousePointerClick, Gavel } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { Glass } from "../../components/common";
import { Panels, PinCtx } from "../../components/phish/Panels";
import { Hud, Stepper, STEPS } from "../../components/phish/console/Hud";
import { PinDialog, PinBoard } from "../../components/phish/console/Pins";
import { HeaderAnalysis, Sandbox, IocBox } from "../../components/phish/console/Analyze";
import { Respond, Debrief } from "../../components/phish/console/Respond";

const splitIocs = (s) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

function VerdictStep({ c, verdict, setVerdict }) {
  return <Glass className="p-4 space-y-3" data-testid="verdict-panel">
    <div><div className="eyebrow flex items-center gap-1.5"><Gavel className="h-3.5 w-3.5" />verdict</div><p className="text-xs text-slate-400 mt-1">Base it on what you pinned and analysed. Not every reported message is phishing.</p></div>
    <fieldset className="space-y-1.5"><legend className="sr-only">Choose a verdict</legend>{c.verdicts.map((v, i) => <label key={v} className={`flex gap-2 text-sm border px-3 py-2.5 cursor-pointer transition-colors ${verdict === v ? "border-cyan-400/60 bg-cyan-500/5" : "border-white/10 hover:border-white/25"}`}>
      <input type="radio" name="verdict" checked={verdict === v} onChange={() => setVerdict(v)} data-testid={`phish-verdict-${i}`} />{v}</label>)}</fieldset>
  </Glass>;
}

function ReportStep({ verdict, pins, iocs, run, summary, setSummary, onSubmit, busy, go }) {
  const ok = verdict && summary.trim().length >= 20;
  const rows = [["Verdict", verdict || "not chosen", !!verdict, 2], ["Pinned evidence", `${pins.length} pins`, pins.length > 0, 0], ["Indicators", `${iocs} entered`, true, 1], ["Response actions", `${run.actions.length} executed`, run.actions.length > 0, 3]];
  return <Glass className="p-4 space-y-4" data-testid="report-panel">
    <div className="eyebrow">incident report</div>
    <ul className="grid sm:grid-cols-2 gap-2">{rows.map(([k, v, good, s]) => <li key={k}><button onClick={() => go(s)} className={`w-full text-left border px-3 py-2 text-xs ${good ? "border-white/10" : "border-yellow-400/40"}`}><span className="text-slate-500 font-mono uppercase text-[10px] block">{k}</span>{v}</button></li>)}</ul>
    <div><label htmlFor="phish-summary" className="text-xs text-slate-300">Incident summary: what happened, the evidence, and what you did (at least 20 characters)</label>
      <textarea id="phish-summary" className="field h-28 mt-1.5 !text-sm" maxLength={3000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Credential phish from a lookalike domain. SPF/DMARC failed. Blocked the domain, purged 14 copies, reset 1 user who clicked." data-testid="phish-summary" /></div>
    <button className="glow-btn w-full justify-center" disabled={!ok || busy} onClick={onSubmit} data-testid="phish-submit"><Send className="h-4 w-4" />Submit investigation</button>
    {!verdict && <p className="text-[11px] font-mono text-yellow-300">Choose a verdict in step 03 first.</p>}
  </Glass>;
}

function useConsole(cid) {
  const nav = useNavigate();
  const [c, setC] = useState(null);
  const [run, setRun] = useState(null);
  useEffect(() => { let on = true;
    api.get(`/phish/cases/${cid}`).then(async (x) => { if (!on) return; setC(x.data); const r = await api.post(`/phish/cases/${cid}/run`); if (on) setRun(r.data); })
      .catch((e) => { if (on) { toast.error(errMsg(e), { id: "phish-case-err" }); nav("/app/phishing"); } });
    return () => { on = false; }; }, [cid]); // eslint-disable-line
  return { c, run, setRun };
}

export default function PhishCase() {
  const { cid } = useParams();
  const { c, run, setRun } = useConsole(cid);
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState({ 0: true });
  const [pins, setPins] = useState([]);
  const [target, setTarget] = useState(null);
  const [iocs, setIocs] = useState("");
  const [verdict, setVerdict] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState(null);
  const ev = (kind, text) => api.post(`/phish/runs/${run.id}/event`, { kind, text: text.slice(0, 240) }).catch(() => {});
  const call = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const ctx = useMemo(() => ({ pinned: new Set(pins.map((p) => p.ref)), onPin: (ref, text) => setTarget({ ref, text: text.slice(0, 400) }), reported: run?.reported,
    onReport: () => { ev("report", "Reported via the mail client's Report phishing button"); setRun({ ...run, reported: true }); toast.success("Reported to the SOC queue"); } }), [pins, run]); // eslint-disable-line
  if (!c || !run) return null;
  const go = (i) => { setStep(i); if (!seen[i]) { setSeen({ ...seen, [i]: true }); ev("step", `Opened the ${STEPS[i]} step`); } };
  const existing = target && pins.find((p) => p.ref === target.ref);
  const savePin = (finding, note) => { setPins([...pins.filter((p) => p.ref !== target.ref), { ...target, finding, note }]); ev("pin", `Pinned "${target.text.slice(0, 70)}" → ${c.red_flags[finding].slice(0, 90)}`); setTarget(null); };
  const removePin = () => { setPins(pins.filter((p) => p.ref !== target.ref)); ev("unpin", `Unpinned "${target.text.slice(0, 90)}"`); setTarget(null); };
  const hint = () => call(async () => setRun((await api.post(`/phish/runs/${run.id}/hint`)).data));
  const act = (i) => call(async () => setRun((await api.post(`/phish/runs/${run.id}/act`, { index: i })).data));
  const submit = () => call(async () => { setR((await api.post(`/phish/runs/${run.id}/submit`, { verdict, pins, iocs: splitIocs(iocs), summary })).data); window.scrollTo({ top: 0, behavior: "smooth" }); });
  const retry = () => call(async () => { setRun((await api.post(`/phish/runs/${run.id}/restart`)).data); setR(null); setPins([]); setIocs(""); setVerdict(""); setSummary(""); setStep(0); setSeen({ 0: true }); });
  const done = [seen[1], pins.length > 0 || seen[2], !!verdict, run.actions.length > 0, false];
  return <PinCtx.Provider value={r ? null : ctx}><div className="space-y-5" data-testid="phish-case">
    <Link to={`/app/phishing/${c.type}`} className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="phish-case-back"><ArrowLeft className="h-3.5 w-3.5" />{c.type_name}</Link>
    <div><div className="eyebrow">{c.type_name} · {c.difficulty}</div><h1 className="text-2xl font-bold mt-1" data-testid="phish-case-title">{c.title}</h1><p className="text-sm text-slate-300 mt-2 border-l-2 border-yellow-400/60 pl-3">{c.brief}</p></div>
    {r ? <Debrief r={r} onRetry={retry} /> : <>
      <Hud c={c} run={run} onHint={hint} busy={busy} />
      <Stepper step={step} setStep={go} done={done} />
      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="space-y-4 min-w-0" data-testid={`phish-step-panel-${STEPS[step].toLowerCase()}`}>
          {step === 0 && <><p className="text-xs font-mono text-slate-400 flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5 text-cyan-400" />Hover links to reveal the real URL. Click any line to pin it as evidence.</p><Panels panels={c.panels} /></>}
          {step === 1 && <><HeaderAnalysis c={c} /><Sandbox c={c} runId={run.id} /><IocBox value={iocs} onChange={setIocs} count={c.ioc_count} /></>}
          {step === 2 && <VerdictStep c={c} verdict={verdict} setVerdict={setVerdict} />}
          {step === 3 && <Respond c={c} run={run} onAct={act} busy={busy} />}
          {step === 4 && <ReportStep verdict={verdict} pins={pins} iocs={splitIocs(iocs).length} run={run} summary={summary} setSummary={setSummary} onSubmit={submit} busy={busy} go={go} />}
          <div className="flex justify-between gap-2">
            <button className="ghost-btn !text-xs" disabled={step === 0} onClick={() => go(step - 1)} data-testid="phish-step-back"><ArrowLeft className="h-3.5 w-3.5" />Back</button>
            {step < 4 && <button className="glow-btn !text-xs" onClick={() => go(step + 1)} data-testid="phish-step-next">Next: {STEPS[step + 1]}<ArrowRight className="h-3.5 w-3.5" /></button>}
          </div>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-36"><PinBoard pins={pins} findings={c.red_flags} iocCount={splitIocs(iocs).length} onEdit={(p) => setTarget({ ref: p.ref, text: p.text })} /></aside>
      </div>
    </>}
    {target && <PinDialog key={target.ref} target={target} findings={c.red_flags} existing={existing} onSave={savePin} onRemove={removePin} onClose={() => setTarget(null)} />}
  </div></PinCtx.Provider>;
}
