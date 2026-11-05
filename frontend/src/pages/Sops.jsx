import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Lock, Unlock, Copy, Check, FileText, Users, AlertTriangle, ListChecks, Wrench, Timer, CheckCircle2, Radar, Search } from "lucide-react";
import { huntUrl } from "./Blog";
import PublicNav, { Footer } from "../components/PublicNav";
import { Glass, SeverityBadge, Empty } from "../components/common";
import { useAuth } from "../context/AuthContext";
import { api, errMsg } from "../lib/api";
import { payRazorpay, payCashfree } from "../lib/pay";

const ITEM = "sop-bundle";

function useCfReturn(onDone) {
  const [sp, setSp] = useSearchParams();
  const { user } = useAuth();
  useEffect(() => {
    const cf = sp.get("cf_order");
    if (!cf || !user) return;
    api.get(`/payments/cashfree/${cf}`).then((r) => { r.data.status === "PAID" ? toast.success("Payment confirmed. All SOPs unlocked!") : toast.error(`Payment status: ${r.data.status}`); onDone(); });
    setSp({}, { replace: true });
  }, [user]); // eslint-disable-line
}

function UnlockBox({ price, onPaid, from }) {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [phone, setPhone] = useState("");
  useEffect(() => { api.get("/payments/config").then((r) => setCfg(r.data)).catch(() => {}); }, []);
  if (!user) return <Link to="/login" state={{ from }} className="glow-btn w-full justify-center" data-testid="sop-login-to-unlock">Log in to unlock all SOPs</Link>;
  if (!cfg) return <div className="h-24 bg-white/5 animate-pulse rounded-sm" data-testid="sop-unlock-loading" />;
  const rzp = () => payRazorpay(ITEM, "SOC SOP Library - Full Access", onPaid, (e) => toast.error(errMsg(e))).catch((e) => toast.error(errMsg(e)));
  const cf = () => (/^\d{10}$/.test(phone) ? payCashfree(ITEM, phone, cfg.cashfree_mode).catch((e) => toast.error(errMsg(e))) : toast.error("Enter a 10-digit mobile number for Cashfree"));
  return (
    <div className="space-y-2.5" data-testid="sop-unlock-box">
      {!cfg.razorpay && !cfg.cashfree && <div className="text-xs font-mono text-yellow-300 border border-yellow-500/30 p-2" data-testid="sop-pay-not-configured">Payments open soon. The store is waiting on its payment keys.</div>}
      <button className="glow-btn w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed" disabled={!cfg.razorpay} onClick={rzp} data-testid="sop-pay-razorpay">Unlock all for ₹{price} with Razorpay</button>
      {cfg.cashfree && <input className="field w-full" placeholder="Mobile number (for Cashfree)" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="sop-phone-input" />}
      <button className="ghost-btn w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed" disabled={!cfg.cashfree} onClick={cf} data-testid="sop-pay-cashfree">Pay ₹{price} with Cashfree</button>
      <p className="text-[11px] font-mono text-slate-500">One-time payment · lifetime access · included free with Pro plans</p>
    </div>
  );
}

export function SopList() {
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const load = () => api.get("/public/sops").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  useCfReturn(load);
  const cats = [...new Set((d?.sops || []).map((s) => s.category))].sort();
  const shown = (d?.sops || []).filter((s) => (!cat || s.category === cat) && (!q || `${s.title} ${s.summary} ${s.mitre?.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <section className="max-w-7xl mx-auto px-6 pt-14 pb-20">
        <div className="grid lg:grid-cols-[1fr_360px] gap-10 items-start">
          <div>
            <div className="eyebrow mb-3">// standard operating procedures</div>
            <h1 className="text-4xl sm:text-5xl font-extrabold">SOC SOP <span className="neon-text">Library</span></h1>
            <p className="text-slate-400 mt-4 max-w-2xl text-sm md:text-base">Shift-ready playbooks for the alerts you will see most: triggers, roles, step-by-step actions per phase, escalation rules, SLAs and copy-paste hunting queries in both Splunk SPL and Microsoft Sentinel KQL.</p>
          </div>
          {d && <Glass className="p-5" data-testid="sop-access-card">
            {d.owned ? <div className="flex items-center gap-3 text-green-400 font-mono text-sm" data-testid="sop-owned"><Unlock className="h-5 w-5" />All {d.sops.length} SOPs unlocked</div> : <>
              <div className="text-sm text-slate-300"><span className="text-green-400 font-mono">{d.free_count} SOPs free</span> · unlock all {d.sops.length} for <span className="font-mono text-cyan-300 text-lg">₹{d.price}</span></div>
              <div className="mt-4"><UnlockBox price={d.price} onPaid={() => { toast.success("All SOPs unlocked!"); load(); }} from="/sops" /></div></>}
          </Glass>}
        </div>
        {d && <div className="flex flex-wrap items-center gap-2 mt-12" data-testid="sop-filters">
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 rounded-sm"><Search className="h-4 w-4 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search alerts, e.g. Okta, LSASS" className="bg-transparent py-2 text-sm outline-none w-56" data-testid="sop-search" /></div>
          {["", ...cats].map((c) => <button key={c || "all"} onClick={() => setCat(c)} data-testid={`sop-cat-${(c || "all").toLowerCase().replace(/\s+/g, "-")}`}
            className={`px-3 py-1.5 text-xs font-mono border rounded-sm transition-colors ${cat === c ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-slate-400 hover:border-cyan-500/40"}`}>{c || `All (${d.sops.length})`}</button>)}
        </div>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-6" data-testid="sop-grid">
          {shown.map((s) => (
            <Link key={s.id} to={`/sops/${s.id}`} className="group" data-testid={`sop-card-${s.id}`}>
              <Glass className={`p-6 h-full flex flex-col transition-transform duration-300 group-hover:-translate-y-1 ${s.locked ? "opacity-80" : ""}`}>
                <div className="flex items-center gap-2 text-[11px] font-mono"><SeverityBadge level={s.severity} /><span className="text-cyan-400">{s.category}</span>
                  <span className="ml-auto" data-testid={`sop-status-${s.id}`}>{s.locked ? <span className="text-slate-500 inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" />locked</span> : s.free ? <span className="text-green-400">free</span> : <span className="text-green-400 inline-flex items-center gap-1"><Unlock className="h-3.5 w-3.5" />unlocked</span>}</span></div>
                <h3 className="font-bold mt-4 group-hover:text-cyan-300 transition-colors flex items-start gap-2"><FileText className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />{s.title}</h3>
                <p className="text-sm text-slate-400 mt-2 flex-1">{s.summary}</p>
                <div className="text-[11px] font-mono text-slate-500 mt-4">{s.step_count} phases · {s.query_count} SPL + KQL queries · v{s.version}</div>
              </Glass>
            </Link>))}
        </div>
      </section>
      <Footer />
    </div>
  );
}

function CodeBlock({ label, code, hunt, testId }) {
  const [ok, setOk] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setOk(true); setTimeout(() => setOk(false), 1500); };
  return (
    <div className="bg-black/50 border border-white/10" data-testid={testId}>
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-white/5 text-[11px] font-mono"><span className={label === "SPL" ? "text-green-400" : "text-cyan-400"}>{label === "SPL" ? "Splunk SPL" : "Sentinel KQL"}</span>
        <span className="flex items-center gap-3">
          {hunt && <Link to={huntUrl(label.toLowerCase(), hunt)} title={`Simulator version: ${hunt}`} className="text-yellow-300 hover:text-yellow-200 inline-flex items-center gap-1" data-testid={`${testId}-hunt`}><Radar className="h-3.5 w-3.5" />hunt in SIEM</Link>}
          <button onClick={copy} className="text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid={`${testId}-copy`}>{ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{ok ? "copied" : "copy"}</button></span></div>
      <pre className="p-3 text-xs font-mono text-slate-200 whitespace-pre-wrap break-words">{code}</pre>
    </div>
  );
}

const List = ({ icon: I, title, items, testId }) => (
  <Glass className="p-5" data-testid={testId}><div className="eyebrow mb-3 flex items-center gap-2"><I className="h-4 w-4" />{title}</div>
    <ul className="space-y-2">{items.map((x) => <li key={x} className="text-sm text-slate-300 flex gap-2"><span className="text-green-400">›</span>{x}</li>)}</ul></Glass>);

function Locked({ s, onPaid }) {
  return (
    <Glass className="p-8 mt-8 text-center border-cyan-500/30" data-testid="sop-locked">
      <Lock className="h-8 w-8 text-cyan-400 mx-auto" />
      <div className="font-bold text-lg mt-3">This SOP is part of the full library</div>
      <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">Unlock all {s.phases?.length ? "phases, " : ""}escalation rules, SLAs and {s.query_count} SPL + KQL queries for this and every other SOP.</p>
      <div className="flex flex-wrap justify-center gap-2 mt-4">{s.phases?.map((p) => <span key={p} className="text-[11px] font-mono border border-white/10 px-2 py-1 text-slate-400">{p}</span>)}</div>
      <div className="max-w-sm mx-auto mt-6"><UnlockBox price={s.price} onPaid={onPaid} from={`/sops/${s.id}`} /></div>
    </Glass>
  );
}

export function SopDetail() {
  const { id } = useParams();
  const [s, setS] = useState(null);
  const [err, setErr] = useState(false);
  const load = () => api.get(`/public/sops/${id}`).then((r) => setS(r.data)).catch(() => setErr(true));
  useEffect(() => { load(); window.scrollTo(0, 0); }, [id]); // eslint-disable-line
  useCfReturn(load);
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <article className="max-w-5xl mx-auto px-6 pt-10 pb-20" data-testid="sop-detail">
        <Link to="/sops" className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="sop-back"><ArrowLeft className="h-3.5 w-3.5" />All SOPs</Link>
        {err && <Empty text="SOP not found" />}
        {s && <>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono mt-6"><SeverityBadge level={s.severity} /><span className="text-cyan-400">{s.category}</span><span className="text-slate-500">· v{s.version} · updated {s.updated}</span></div>
          <h1 className="text-3xl sm:text-4xl font-extrabold mt-4" data-testid="sop-title">{s.title}</h1>
          <p className="text-slate-400 mt-3">{s.summary}</p>
          <Glass className="p-5 mt-6"><div className="eyebrow mb-2">objective</div><p className="text-sm text-slate-300">{s.objective}</p></Glass>
          <div className="mt-4"><List icon={AlertTriangle} title="triggers" items={s.triggers} testId="sop-triggers" /></div>
          {s.locked ? <Locked s={s} onPaid={() => { toast.success("All SOPs unlocked!"); load(); }} /> : <>
            <Glass className="p-5 mt-4"><div className="eyebrow mb-2">scope</div><p className="text-sm text-slate-300">{s.scope}</p></Glass>
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <List icon={Wrench} title="tools" items={s.tools} testId="sop-tools" />
              <Glass className="p-5" data-testid="sop-roles"><div className="eyebrow mb-3 flex items-center gap-2"><Users className="h-4 w-4" />roles</div>
                {s.roles.map((r) => <div key={r.role} className="text-sm mb-2"><span className="font-mono text-cyan-300">{r.role}</span><span className="text-slate-400"> — {r.duty}</span></div>)}</Glass>
            </div>
            {s.analysis?.length > 0 && <>
              <div className="eyebrow mt-12 mb-4 flex items-center gap-2"><Search className="h-4 w-4" />analysis checklist</div>
              <div className="space-y-3" data-testid="sop-analysis">{s.analysis.map((a, i) => (
                <Glass key={i} className="p-5" data-testid={`sop-analysis-${i}`}>
                  <div className="font-bold text-sm flex gap-2"><span className="font-mono text-cyan-400">Q{i + 1}</span>{a.check}</div>
                  <p className="text-sm text-slate-300 mt-2"><span className="text-[11px] font-mono uppercase text-slate-500 mr-2">how</span>{a.how}</p>
                  <div className="grid md:grid-cols-2 gap-3 mt-3 text-sm">
                    <div className="border border-red-500/20 bg-red-500/5 p-3"><div className="text-[11px] font-mono uppercase text-red-300 mb-1">true positive if</div><span className="text-slate-300">{a.malicious_if}</span></div>
                    <div className="border border-green-500/20 bg-green-500/5 p-3"><div className="text-[11px] font-mono uppercase text-green-300 mb-1">false positive if</div><span className="text-slate-300">{a.benign_if}</span></div>
                  </div>
                </Glass>))}</div>
            </>}
            <div className="eyebrow mt-12 mb-4 flex items-center gap-2"><ListChecks className="h-4 w-4" />procedure</div>
            <div className="space-y-4" data-testid="sop-steps">{s.steps.map((p, i) => (
              <Glass key={p.phase} className="p-5 border-l-2 border-l-cyan-400/60" data-testid={`sop-phase-${i}`}>
                <div className="font-mono text-sm"><span className="text-green-400">0{i + 1}</span> <span className="font-bold">{p.phase}</span></div>
                <ol className="mt-3 space-y-2">{p.actions.map((a, j) => <li key={j} className="text-sm text-slate-300 flex gap-3"><CheckCircle2 className="h-4 w-4 text-cyan-400/60 shrink-0 mt-0.5" />{a}</li>)}</ol>
              </Glass>))}</div>
            <div className="eyebrow mt-12 mb-1">detection & hunting queries</div>
            <p className="text-xs text-slate-500 mb-4" data-testid="sop-hunt-note">"Hunt in SIEM" opens a version of each query adjusted to run on our practice logs, so you see real hits.</p>
            <div className="space-y-6" data-testid="sop-queries">{s.queries.map((q, i) => (
              <div key={q.name}><div className="font-bold text-sm">{q.name}</div><div className="text-xs text-slate-500 mb-2">{q.purpose}</div>
                <div className="grid lg:grid-cols-2 gap-3"><CodeBlock label="SPL" code={q.spl} hunt={q.hunt?.spl} testId={`sop-spl-${i}`} /><CodeBlock label="KQL" code={q.kql} hunt={q.hunt?.kql} testId={`sop-kql-${i}`} /></div></div>))}</div>
            <div className="grid md:grid-cols-2 gap-4 mt-12">
              <List icon={AlertTriangle} title="escalation" items={s.escalation} testId="sop-escalation" />
              <Glass className="p-5" data-testid="sop-sla"><div className="eyebrow mb-3 flex items-center gap-2"><Timer className="h-4 w-4" />sla</div>
                {Object.entries(s.sla).map(([k, v]) => <div key={k} className="text-sm flex justify-between gap-3 py-1 border-b border-white/5"><span className="font-mono text-cyan-300">{k}</span><span className="text-slate-400 text-right">{v}</span></div>)}</Glass>
              <List icon={FileText} title="mitre att&ck" items={s.mitre} testId="sop-mitre" />
              <List icon={CheckCircle2} title="closure criteria" items={s.closure} testId="sop-closure" />
            </div>
          </>}
        </>}
      </article>
      <Footer />
    </div>
  );
}
