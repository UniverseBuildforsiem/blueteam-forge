import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FlaskConical, ListChecks, Flag, Lock, CheckCircle2, Award, BarChart3, Settings2, Clock } from "lucide-react";
import { api, fmtDate } from "../../lib/api";
import { Glass, PageHeader } from "../../components/common";
import { PhishUnlock } from "../../components/phish/Unlock";
import { VmAdmin } from "../../components/vmlab/Admin";
import { useAuth } from "../../context/AuthContext";
import { ScanHero } from "../../components/vmlab/ScanHero";

const KIND = { lab: ["Lab", FlaskConical, "lab"], quiz: ["Quiz", ListChecks, "quiz"], ctf: ["CTF", Flag, "ctf"] };

function Item({ it }) {
  const [label, I, path] = KIND[it.kind];
  const body = <div className={`flex items-center gap-3 border px-3 py-2.5 transition-colors ${it.locked ? "border-white/5 opacity-60" : "border-white/10 hover:border-cyan-400/50"}`}>
    <I className="h-4 w-4 text-cyan-400 shrink-0" /><div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{it.title}{it.status === "draft" && <span className="ml-2 text-[10px] font-mono text-yellow-300">draft</span>}</div>
      <div className="text-[11px] text-slate-500 font-mono">{label} · {it.difficulty} · {it.minutes} min{it.free && <span className="text-green-400"> · free preview</span>}</div></div>
    {it.locked ? <Lock className="h-4 w-4 text-slate-500" /> : it.done ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <span className="text-[11px] font-mono text-cyan-300">{it.percent}%</span>}</div>;
  return it.locked ? <div data-testid={`vm-item-${it.id}`} aria-disabled="true">{body}</div> : <Link to={`/app/vmlab/${path}/${it.id}`} data-testid={`vm-item-${it.id}`}>{body}</Link>;
}

function Modules({ d }) {
  return <div className="grid lg:grid-cols-2 gap-4">{d.modules.map((m) => <Glass key={m.id} className="p-5 space-y-3" data-testid={`vm-module-${m.id}`}>
    <div><div className="eyebrow">module {m.id}</div><div className="font-bold text-lg">{m.title}</div><p className="text-xs text-slate-400 mt-1">{m.summary}</p></div>
    {m.items.length ? <div className="space-y-2">{m.items.map((it) => <Item key={it.id} it={it} />)}</div>
      : <div className="text-xs font-mono text-slate-500 border border-dashed border-white/10 p-3" data-testid={`vm-module-soon-${m.id}`}>Labs, quizzes and CTFs coming soon</div>}
  </Glass>)}</div>;
}

function Progress({ d }) {
  return <div className="space-y-4" data-testid="vm-progress">
    <div className="grid sm:grid-cols-3 gap-3">{[["Completed", `${d.stats.done}/${d.stats.total}`], ["Labs finished", d.stats.xp_labs], ["CTF points", d.stats.ctf_points]].map(([k, v]) => <Glass key={k} className="p-4"><div className="text-[10px] font-mono uppercase text-slate-500">{k}</div><div className="text-2xl font-mono font-bold text-cyan-300" data-testid={`vm-stat-${k.toLowerCase().replace(" ", "-")}`}>{v}</div></Glass>)}</div>
    <Glass className="p-5"><div className="eyebrow mb-3">module progress</div><div className="space-y-2.5">{d.modules.map((m) => { const n = m.items.length, k = m.items.filter((i) => i.done).length;
      return <div key={m.id} className="text-sm"><div className="flex justify-between text-xs mb-1"><span>{m.title}</span><span className="font-mono text-slate-400">{n ? `${k}/${n}` : "soon"}</span></div><div className="h-1.5 bg-white/5"><div className="h-1.5 bg-cyan-400" style={{ width: `${n ? (100 * k) / n : 0}%` }} /></div></div>; })}</div></Glass>
    <Glass className="p-5"><div className="eyebrow mb-3">badges</div>{d.badges.length ? <div className="flex flex-wrap gap-3" data-testid="vm-badges">{d.badges.map((b) => <div key={b.id} className="flex items-center gap-2 border border-yellow-400/40 bg-yellow-500/5 px-3 py-2" data-testid={`vm-badge-${b.id}`}><Award className="h-5 w-5 text-yellow-300" /><div><div className="text-sm font-semibold">{b.title}</div><div className="text-[11px] text-slate-400">{b.desc}</div></div></div>)}</div> : <p className="text-xs text-slate-500">Finish a lab, ace a quiz or capture a flag to earn badges.</p>}</Glass>
    <Glass className="p-5"><div className="eyebrow mb-3">quiz score history</div>{d.quiz_history.length ? <ul className="space-y-1.5" data-testid="vm-quiz-history">{d.quiz_history.map((a) => <li key={a.id} className="flex text-xs gap-3"><span className="flex-1 truncate">{a.title}</span><span className={`font-mono ${a.score >= 70 ? "text-green-400" : "text-red-300"}`}>{a.score}%</span><span className="text-slate-500 font-mono flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(a.at)}</span></li>)}</ul> : <p className="text-xs text-slate-500">No quiz attempts yet.</p>}</Glass>
  </div>;
}

export default function VmLab() {
  const [sp, setSp] = useSearchParams();
  const [d, setD] = useState(null);
  const { user: me } = useAuth();
  const tab = sp.get("tab") || "labs";
  const load = () => api.get("/vmlab").then((r) => setD(r.data));
  useEffect(() => { load(); }, [tab]); // eslint-disable-line
  if (!d) return null;
  const tabs = [["labs", "Labs", FlaskConical], ["progress", "My progress", BarChart3], ...(me?.role === "admin" ? [["manage", "Manage", Settings2]] : [])];
  return <div data-testid="vm-hub">
    <PageHeader eyebrow="// simulated vmdr training" title="Vulnerability Management Lab" sub="Hands-on, fully simulated practice for agent deployment, vulnerability management, web app scanning and compliance. Original branding, fake data, safe to break." />
    <div className="flex gap-1 mb-5 border-b border-white/10">{tabs.map(([k, l, I]) => <button key={k} onClick={() => setSp(k === "labs" ? {} : { tab: k })} className={`px-4 py-2 text-sm inline-flex items-center gap-1.5 border-b-2 -mb-px ${tab === k ? "border-cyan-400 text-cyan-200" : "border-transparent text-slate-400 hover:text-slate-200"}`} data-testid={`vm-tab-${k}`}><I className="h-4 w-4" />{l}</button>)}</div>
    {tab === "labs" && <><ScanHero />{!d.access && !d.price && <Glass className="p-4 mb-6 text-sm text-slate-400" data-testid="vm-not-for-sale">Lab 1 of each module is a free preview. Full access isn't on sale yet. Check back soon or ask your instructor.</Glass>}
      {!d.access && d.price > 0 && <PhishUnlock item="vm-lab" name="Vulnerability Management Lab - Full Access" price={d.price} heading="Unlock every lab, quiz and CTF for" note="Lab 1 of each module (Cloud Agent Deployment, Account and Application Setup) is a free preview. One-time payment · lifetime access · also included with selected courses." onPaid={load} />}<Modules d={d} /></>}
    {tab === "progress" && <Progress d={d} />}
    {tab === "manage" && me?.role === "admin" && <VmAdmin onChange={load} />}
  </div>;
}
