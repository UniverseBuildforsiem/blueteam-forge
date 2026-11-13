import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock, Search, Workflow, FlaskConical, BookMarked, Radar, ListChecks } from "lucide-react";
import PublicNav, { Footer } from "../components/PublicNav";
import { Glass, SeverityBadge, Empty } from "../components/common";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { PlaybookRunner, MitreTags } from "../components/playbook/PlaybookRunner";

const Shell = ({ children }) => <div className="grid-bg min-h-screen"><PublicNav />{children}<Footer /></div>;

function Card({ p }) {
  return (
    <Link to={`/playbooks/${p.id}`} data-testid={`pb-card-${p.id}`}>
      <Glass className="p-5 h-full hover:border-cyan-400/50 transition-colors flex flex-col">
        <div className="flex items-center gap-2 text-[11px] font-mono"><SeverityBadge level={p.severity} />
          <span className={p.source.type === "siem" ? "text-yellow-300" : "text-cyan-400"}>{p.source.type === "siem" ? "SIEM alert" : "SOP"}</span>
          <span className="ml-auto">{p.locked ? <Lock className="h-3.5 w-3.5 text-slate-500" /> : p.free ? <span className="text-green-400">free</span> : null}</span></div>
        <div className="font-bold text-sm mt-3">{p.title.replace(/^Playbook:\s*/, "")}</div>
        <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 flex-1">{p.summary}</p>
        <div className="mt-3"><MitreTags tags={p.mitre?.slice(0, 3)} /></div>
        <div className="text-[10px] font-mono text-slate-500 mt-3">{p.question_count} decisions · {p.labs?.length || 0} linked labs</div>
      </Glass></Link>);
}

export function PlaybookList() {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ q: "", src: "all", sev: "all" });
  useEffect(() => { api.get("/public/playbooks").then((r) => setD(r.data)); }, []);
  const shown = (d?.playbooks || []).filter((p) => (f.src === "all" || p.source.type === f.src) && (f.sev === "all" || p.severity === f.sev)
    && `${p.title} ${p.summary} ${(p.mitre || []).join(" ")}`.toLowerCase().includes(f.q.toLowerCase()));
  const sel = (k, opts) => <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="field !w-auto text-xs" data-testid={`pb-filter-${k}`}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  return (
    <Shell>
      <section className="max-w-7xl mx-auto px-6 pt-12 pb-20" data-testid="playbooks-page">
        <div className="eyebrow">// incident response playbooks</div>
        <h1 className="text-4xl sm:text-5xl font-bold mt-3 flex items-center gap-3"><Workflow className="h-10 w-10 text-cyan-400" />Playbooks & Runbooks</h1>
        <p className="text-slate-400 mt-4 max-w-2xl text-sm md:text-base">Interactive decision trees for every SIEM alert and SOP: answer each triage question, follow the branch to the right action, escalate or close, and finish with an incident report.</p>
        <div className="flex flex-wrap items-center gap-2 mt-8 mb-6">
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 rounded-sm w-72"><Search className="h-4 w-4 text-slate-500" /><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search playbooks or ATT&CK IDs" className="bg-transparent py-2 text-sm outline-none flex-1" data-testid="pb-search" /></div>
          {sel("src", [["all", "All sources"], ["siem", "SIEM alerts"], ["sop", "SOPs"]])}
          {sel("sev", [["all", "All severities"], ["Critical", "Critical"], ["High", "High"], ["Medium", "Medium"], ["Low", "Low"]])}
          <span className="ml-auto text-xs font-mono text-slate-500" data-testid="pb-count">{shown.length} playbooks{d?.pending ? ` · ${d.pending} more being written` : ""}</span>
        </div>
        {!d ? null : shown.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{shown.map((p) => <Card key={p.id} p={p} />)}</div> : <Empty text="No playbooks match" />}
      </section>
    </Shell>);
}

function Side({ p }) {
  return (
    <div className="space-y-4">
      <Glass className="p-5"><div className="eyebrow mb-3 flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" />trigger conditions</div>
        <ul className="space-y-2" data-testid="pb-triggers">{p.triggers.map((t) => <li key={t} className="text-xs text-slate-300 border-l-2 border-cyan-500/40 pl-2">{t}</li>)}</ul></Glass>
      <Glass className="p-5"><div className="eyebrow mb-3 flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" />practise in a lab</div>
        {p.lab_info?.length ? <div className="space-y-2">{p.lab_info.map((l) => <Link key={l.id} to={`/app/labs/${l.id}`} className="block text-sm hover:text-cyan-300 border border-white/10 hover:border-cyan-500/40 p-2.5 transition-colors" data-testid={`pb-lab-${l.id}`}>
          {l.title}<div className="text-[10px] font-mono text-slate-500 mt-0.5">{l.difficulty} · {l.duration}</div></Link>)}</div> : <div className="text-xs text-slate-500">No linked lab yet.</div>}</Glass>
      <Glass className="p-5"><div className="eyebrow mb-3">source</div>
        {p.source.type === "sop" ? <Link to={`/sops/${p.source.id}`} className="text-sm text-cyan-300 inline-flex items-center gap-1.5" data-testid="pb-source-link"><BookMarked className="h-4 w-4" />{p.source.title} SOP</Link>
          : <Link to="/app/siem" className="text-sm text-yellow-300 inline-flex items-center gap-1.5" data-testid="pb-source-link"><Radar className="h-4 w-4" />SIEM rule: {p.source.title}</Link>}</Glass>
    </div>);
}

export function PlaybookDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { setP(null); api.get(`/public/playbooks/${id}`).then((r) => setP(r.data)).catch(() => setErr(true)); window.scrollTo(0, 0); }, [id, user?.id]);
  return (
    <Shell>
      <article className="max-w-6xl mx-auto px-6 pt-10 pb-20" data-testid="playbook-detail">
        <Link to="/playbooks" className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="pb-back"><ArrowLeft className="h-3.5 w-3.5" />All playbooks</Link>
        {err && <Empty text="Playbook not found" />}
        {p && <>
          <div className="flex items-center gap-3 mt-5 text-xs font-mono"><SeverityBadge level={p.severity} /><span className="text-slate-500">{p.categories?.join(" · ")}</span></div>
          <h1 className="text-3xl sm:text-4xl font-bold mt-3" data-testid="pb-title">{p.title}</h1>
          <p className="text-slate-400 mt-3 max-w-3xl">{p.summary}</p>
          <div className="mt-4"><MitreTags tags={p.mitre} /></div>
          <div className="grid lg:grid-cols-[1fr_320px] gap-6 mt-8">
            <Glass className="p-6">{p.locked ? <div data-testid="pb-locked">
              <div className="eyebrow mb-2">first decision</div><div className="font-bold">{p.preview.title}</div><p className="text-sm text-slate-300 mt-1.5">{p.preview.text}</p>
              <div className="mt-6 border border-cyan-500/30 bg-cyan-500/5 p-4 text-sm"><Lock className="inline h-4 w-4 mr-1.5 text-cyan-300" />The full decision tree ({p.question_count} decisions) and report template ({p.report_sections.length} sections) unlock with the SOP Library.
                <div className="mt-3"><Link to="/sops" className="glow-btn !text-xs" data-testid="pb-unlock">{user ? "Unlock the SOP Library" : "Sign up to unlock"}</Link></div></div></div>
              : <PlaybookRunner pb={p} />}</Glass>
            <Side p={p} />
          </div></>}
      </article>
    </Shell>);
}
