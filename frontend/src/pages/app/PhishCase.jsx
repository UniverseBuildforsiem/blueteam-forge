import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { Glass } from "../../components/common";
import { Panels } from "../../components/phish/Panels";

function Options({ title, opts, sel, setSel, result, testId }) {
  const tog = (i) => setSel(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]);
  return <div data-testid={testId}><div className="eyebrow mb-2">{title}</div><div className="space-y-1.5">{opts.map((o, i) => {
    const right = result?.[i], picked = sel.includes(i);
    const tone = result ? (right ? "border-green-500/50 bg-green-500/5" : picked ? "border-red-500/50 bg-red-500/5" : "border-white/10") : picked ? "border-cyan-400/60 bg-cyan-500/5" : "border-white/10";
    return <label key={i} className={`flex gap-2 items-start text-sm border px-3 py-2 cursor-pointer transition-colors ${tone}`}>
      <input type="checkbox" checked={picked} disabled={!!result} onChange={() => tog(i)} className="mt-1" data-testid={`${testId}-${i}`} />
      <span className="flex-1">{o}</span>{result && (right ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : picked ? <XCircle className="h-4 w-4 text-red-400 shrink-0" /> : null)}</label>; })}</div></div>;
}

function Result({ r, again }) {
  return <Glass className={`p-5 space-y-3 ${r.passed ? "border-green-500/40" : "border-red-500/40"}`} data-testid="phish-result">
    <div className="flex items-center gap-3"><span className={`text-3xl font-mono font-bold ${r.passed ? "text-green-400" : "text-red-400"}`} data-testid="phish-score">{r.score}%</span>
      <span className="text-sm">{r.passed ? "Case closed correctly" : "Not quite — review and try again"}{r.xp > 0 && <b className="text-cyan-300 ml-2">+{r.xp} XP</b>}</span></div>
    <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-mono">{[["verdict", 30], ["red_flags", 30], ["iocs", 20], ["response", 20]].map(([k, m]) => <div key={k} className="border border-white/10 p-2"><div className="text-slate-500">{k.replace("_", " ")}</div><b>{r.parts[k]}/{m}</b></div>)}</div>
    <p className="text-sm text-slate-300" data-testid="phish-debrief">{r.debrief}</p>
    <div className="text-xs font-mono"><span className="text-slate-500">Expected IOCs:</span> {r.iocs.map((i) => <span key={i} className={`mr-2 ${r.ioc_hits.includes(i) ? "text-green-400" : "text-red-300"}`}>{i}</span>)}</div>
    <button className="ghost-btn !text-xs" onClick={again} data-testid="phish-retry">Try again</button>
  </Glass>;
}

export default function PhishCase() {
  const { cid } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState(null);
  const [verdict, setVerdict] = useState("");
  const [flags, setFlags] = useState([]);
  const [resp, setResp] = useState([]);
  const [iocs, setIocs] = useState("");
  const [r, setR] = useState(null);
  useEffect(() => { let on = true; api.get(`/phish/cases/${cid}`).then((x) => on && setC(x.data)).catch((e) => { if (on) { toast.error(errMsg(e), { id: "phish-case-err" }); nav("/app/phishing"); } }); return () => { on = false; }; }, [cid]); // eslint-disable-line
  if (!c) return null;
  const submit = async () => { try { const x = await api.post(`/phish/cases/${cid}/submit`, { verdict, flags, response: resp, iocs: iocs.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) }); setR(x.data);
    window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { toast.error(errMsg(e)); } };
  const again = () => { setR(null); setVerdict(""); setFlags([]); setResp([]); setIocs(""); };
  return <div className="space-y-5" data-testid="phish-case">
    <Link to={`/app/phishing/${c.type}`} className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="phish-case-back"><ArrowLeft className="h-3.5 w-3.5" />{c.type_name}</Link>
    <div><div className="eyebrow">{c.type_name} · {c.difficulty}</div><h1 className="text-2xl font-bold mt-1" data-testid="phish-case-title">{c.title}</h1><p className="text-sm text-slate-300 mt-2 border-l-2 border-yellow-400/60 pl-3">{c.brief}</p></div>
    {r && <Result r={r} again={again} />}
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5 items-start">
      <Panels panels={c.panels} />
      <Glass className="p-5 space-y-5 lg:sticky lg:top-4" data-testid="phish-answer">
        <div><div className="eyebrow mb-2">1 · verdict</div><div className="space-y-1.5">{c.verdicts.map((v) => <label key={v} className={`flex gap-2 text-sm border px-3 py-2 cursor-pointer ${r ? (v === r.verdict ? "border-green-500/50" : verdict === v ? "border-red-500/50" : "border-white/10") : verdict === v ? "border-cyan-400/60 bg-cyan-500/5" : "border-white/10"}`}>
          <input type="radio" name="verdict" disabled={!!r} checked={verdict === v} onChange={() => setVerdict(v)} data-testid={`phish-verdict-${c.verdicts.indexOf(v)}`} />{v}</label>)}</div></div>
        <Options title="2 · red flags you found" opts={c.red_flags} sel={flags} setSel={setFlags} result={r?.red_flags} testId="phish-flag" />
        <div><div className="eyebrow mb-2">3 · indicators of compromise ({c.ioc_count} expected)</div>
          <textarea className="field h-24 font-mono !text-xs" disabled={!!r} placeholder="One per line: domains, URLs, IPs, emails, phone numbers" value={iocs} onChange={(e) => setIocs(e.target.value)} data-testid="phish-iocs" />
          <Link to="/app/phishing?tab=osint" target="_blank" className="text-[11px] font-mono text-cyan-300 hover:underline" data-testid="phish-open-osint">Open the OSINT toolkit in a new tab →</Link></div>
        <Options title="4 · response actions" opts={c.response} sel={resp} setSel={setResp} result={r?.response} testId="phish-response" />
        {!r && <button className="glow-btn w-full justify-center" disabled={!verdict} onClick={submit} data-testid="phish-submit"><Send className="h-4 w-4" />Submit investigation</button>}
      </Glass>
    </div>
  </div>;
}
