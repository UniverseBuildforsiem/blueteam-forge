import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Lock, CheckCircle2, ShieldAlert, Swords, Sparkles, ArrowLeft, Mail, Crosshair, Crown, Briefcase, MessageSquare, PhoneCall, QrCode, Copy, CalendarDays, Network, AtSign, Globe, Wifi, Droplets } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Glass, PageHeader } from "../../components/common";
import { OsintToolkit } from "../../components/phish/Osint";
import { PhishManage } from "../../components/phish/Manage";

const Icons = { Mail, Crosshair, Crown, Briefcase, MessageSquare, PhoneCall, QrCode, Copy, CalendarDays, Network, AtSign, Globe, Wifi, Droplets };
const DIFF = { Easy: "text-green-400", Medium: "text-yellow-300", Hard: "text-red-400" };
const tabCls = (on) => `px-4 py-2 text-xs font-mono border-b-2 -mb-px transition-colors ${on ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"}`;

export function CaseRow({ c }) {
  return <Link to={c.locked ? "/app/billing" : `/app/phishing/case/${c.id}`} data-testid={`phish-case-${c.id}`}>
    <Glass className="p-3 flex items-center gap-3 hover:border-cyan-400/50 transition-colors">
      {c.locked ? <Lock className="h-4 w-4 text-slate-500" /> : c.best >= 70 ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Swords className="h-4 w-4 text-cyan-400" />}
      <span className="flex-1 text-sm">{c.title}{c.source === "ai" && <Sparkles className="inline h-3 w-3 ml-1.5 text-purple-300" />}</span>
      <span className={`text-[11px] font-mono ${DIFF[c.difficulty]}`}>{c.difficulty}</span>
      <span className="text-[11px] font-mono text-slate-500 w-24 text-right">{c.locked ? "paid members" : c.best != null ? `best ${c.best}%` : `+${c.xp} XP`}</span>
    </Glass></Link>;
}

function TypeGrid({ types }) {
  return <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="phish-type-grid">{types.map((t) => { const I = Icons[t.icon] || ShieldAlert;
    const solved = t.cases.filter((c) => c.best >= 70).length;
    return <Link key={t.id} to={`/app/phishing/${t.id}`} data-testid={`phish-type-${t.id}`}>
      <Glass className="p-5 h-full hover:border-cyan-400/50 transition-colors flex flex-col">
        <div className="flex items-center gap-3"><span className="h-10 w-10 grid place-items-center bg-red-500/10 border border-red-500/30"><I className="h-5 w-5 text-red-300" /></span><div className="font-bold">{t.name}</div></div>
        <p className="text-xs text-slate-400 mt-3 flex-1">{t.summary}</p>
        <div className="text-[11px] font-mono text-slate-500 mt-3">{t.cases.length} case{t.cases.length !== 1 ? "s" : ""} · {solved} solved{t.cases.some((c) => c.free) && <span className="text-green-400"> · free case</span>}</div>
      </Glass></Link>; })}</div>;
}

const Sec = ({ title, items, testId }) => <Glass className="p-5" data-testid={testId}><div className="eyebrow mb-3">{title}</div><ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-cyan-400 font-mono">{String(i + 1).padStart(2, "0")}</span>{x}</li>)}</ul></Glass>;

function TypeDetail({ t }) {
  const I = Icons[t.icon] || ShieldAlert;
  return <div className="space-y-5" data-testid="phish-type-detail">
    <Link to="/app/phishing" className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="phish-back"><ArrowLeft className="h-3.5 w-3.5" />All phishing types</Link>
    <div className="flex items-start gap-4"><span className="h-14 w-14 grid place-items-center bg-red-500/10 border border-red-500/30 shrink-0"><I className="h-7 w-7 text-red-300" /></span>
      <div><h2 className="text-2xl font-bold" data-testid="phish-type-name">{t.name}</h2><p className="text-sm text-slate-300 mt-1">{t.summary}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">{t.mitre.map((m) => <span key={m} className="text-[10px] font-mono border border-purple-400/30 text-purple-200 px-1.5 py-0.5">{m}</span>)}</div></div></div>
    <div className="grid lg:grid-cols-2 gap-4">
      <Sec title="how the attack works" items={t.how} testId="phish-how" />
      <Sec title="red flags to spot" items={t.red_flags} testId="phish-red-flags" />
      <Sec title="defences & SOC controls" items={t.defenses} testId="phish-defenses" />
      <Glass className="p-5" data-testid="phish-example"><div className="eyebrow mb-3">real-world example</div><p className="text-sm text-slate-300">{t.example}</p></Glass>
    </div>
    <div><div className="eyebrow mb-3">investigation cases</div><div className="space-y-2">{t.cases.map((c) => <CaseRow key={c.id} c={c} />)}</div></div>
  </div>;
}

export default function Phishing() {
  const { typeId } = useParams();
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [d, setD] = useState(null);
  const staff = ["admin", "instructor"].includes(user?.role);
  const tab = sp.get("tab") === "manage" && !staff ? "learn" : sp.get("tab") || "learn";
  useEffect(() => { if (tab === "learn") api.get("/phish/types").then((r) => setD(r.data)); }, [tab]);
  const t = d && typeId && d.types.find((x) => x.id === typeId);
  return <div>
    <PageHeader eyebrow="// phishing simulator" title="Phishing Simulator" sub="Learn 14 phishing techniques, investigate realistic evidence, then prove it with real OSINT tools." />
    <div className="flex gap-1 mb-6 border-b border-white/10" data-testid="phish-tabs">
      {[["learn", "Learn & Investigate"], ["osint", "OSINT Toolkit"], ...(staff ? [["manage", "Manage cases"]] : [])].map(([v, l]) => <button key={v} className={tabCls(tab === v)} onClick={() => setSp(v === "learn" ? {} : { tab: v })} data-testid={`phish-tab-${v}`}>{l}</button>)}
    </div>
    {tab === "osint" && <OsintToolkit initValue={sp.get("value")} initQr={sp.get("qr")} />}
    {tab === "manage" && staff && <PhishManage types={d?.types || []} />}
    {tab === "learn" && d && (t ? <TypeDetail t={t} /> : <>
      {!d.paid && <div className="mb-4 text-xs font-mono text-yellow-300 border border-yellow-500/30 p-3" data-testid="phish-free-note">All learning is free. The first 3 investigation cases are free — <Link to="/app/billing" className="underline">upgrade</Link> to unlock every case.</div>}
      <TypeGrid types={d.types} /></>)}
  </div>;
}
