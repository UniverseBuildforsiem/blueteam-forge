import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lock, Unlock, Radio, FileText, Terminal as TermIcon } from "lucide-react";
import { Glass, SeverityBadge } from "./common";
import { api } from "../lib/api";

const SEV_DOT = { Critical: "bg-red-500", High: "bg-orange-400", Medium: "bg-yellow-300", Low: "bg-green-400" };
const ago = (iso) => { const h = Math.max(1, Math.round((Date.now() - new Date(iso)) / 36e5)); return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };

export function ThreatTicker({ posts }) {
  if (!posts.length) return null;
  const items = [...posts, ...posts];
  return (
    <div className="border-y border-red-500/20 bg-black/60 overflow-hidden" data-testid="landing-threat-ticker">
      <div className="flex items-center">
        <div className="shrink-0 px-4 py-2.5 bg-[#1F0D10] text-red-300 font-mono text-xs uppercase tracking-widest flex items-center gap-2 border-r border-red-500/30 relative z-10"><Radio className="h-3.5 w-3.5 animate-pulse" />live threats</div>
        <div className="overflow-hidden flex-1"><div className="flex w-max ticker-track whitespace-nowrap">
          {items.map((p, i) => <Link key={i} to={`/blog/${p.slug}`} className="inline-flex items-center gap-2 px-6 py-2.5 font-mono text-xs text-slate-300 hover:text-cyan-300 transition-colors" data-testid={i < posts.length ? `ticker-item-${p.id}` : undefined}>
            <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[p.severity] || SEV_DOT.Low}`} /><span className="text-slate-500">{p.severity.toUpperCase()}</span>{p.title}<span className="text-slate-600">· {ago(p.published_at)}</span></Link>)}
        </div></div>
      </div>
    </div>);
}

function BlogMagazine({ posts }) {
  if (!posts.length) return null;
  const [lead, ...rest] = posts;
  return (
    <section className="max-w-7xl mx-auto px-6 pb-24" data-testid="landing-blog">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div><div className="eyebrow mb-3">// threat briefing · updated daily</div><h2 className="text-3xl font-bold max-w-xl">Today's security news, turned into <span className="neon-green">SOC action items.</span></h2></div>
        <Link to="/blog" className="ghost-btn" data-testid="landing-blog-link">Read the blog <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-5">
        <Link to={`/blog/${lead.slug}`} className="group relative overflow-hidden rounded-sm border border-cyan-500/20 min-h-[420px] flex" data-testid={`landing-blog-lead-${lead.id}`}>
          {lead.image ? <img src={lead.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 transition-transform duration-700 group-hover:scale-105" /> : <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F1A] via-[#0B0F1A]/90 to-[#0B0F1A]/20" />
          <div className="relative mt-auto p-7">
            <div className="flex items-center gap-2 text-xs font-mono"><SeverityBadge level={lead.severity} /><span className="text-cyan-300">{lead.category}</span><span className="text-slate-400">· {lead.source} · {ago(lead.published_at)}</span></div>
            <h3 className="text-2xl sm:text-3xl font-extrabold mt-4 leading-tight group-hover:text-cyan-300 transition-colors">{lead.title}</h3>
            <p className="text-slate-300 mt-3 max-w-xl text-sm">{lead.excerpt}</p>
            <span className="inline-flex items-center gap-2 mt-5 text-sm font-mono text-green-400">Read the SOC action items <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
          </div>
        </Link>
        <div className="flex flex-col gap-3">
          {rest.slice(0, 4).map((p, i) => <Link key={p.id} to={`/blog/${p.slug}`} className="group glass rounded-sm p-4 flex gap-4 items-start hover:border-cyan-400/50 transition-colors" data-testid={`landing-blog-item-${p.id}`}>
            <span className="font-mono text-2xl font-bold text-cyan-500/40 group-hover:text-cyan-300 transition-colors w-8 shrink-0">0{i + 2}</span>
            <div className="min-w-0"><div className="flex items-center gap-2 text-[11px] font-mono"><span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[p.severity]}`} /><span className="text-slate-400">{p.severity} · {p.category}</span></div>
              <div className="font-semibold mt-1 leading-snug group-hover:text-cyan-300 transition-colors">{p.title}</div><div className="text-[11px] font-mono text-slate-500 mt-1">{p.source} · {ago(p.published_at)}</div></div>
          </Link>)}
        </div>
      </div>
    </section>);
}

function SopShowcase({ d }) {
  const [feat, setFeat] = useState(null);
  const [lang, setLang] = useState("spl");
  useEffect(() => { api.get("/public/sops/sop-phishing").then((r) => setFeat(r.data)).catch(() => {}); }, []);
  if (!d) return null;
  const q = feat?.queries?.[0];
  return (
    <section className="relative border-y border-cyan-500/10 bg-black/40 py-24 mb-24 overflow-hidden" data-testid="landing-sops">
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1fr_1.1fr] gap-12 items-start relative">
        <div>
          <div className="eyebrow mb-3">// soc sop library</div>
          <h2 className="text-3xl font-bold">Shift-ready playbooks with <span className="neon-text">SPL & KQL</span> you can paste.</h2>
          <p className="text-slate-400 mt-4 text-sm md:text-base">{d.sops.length} standard operating procedures: triggers, roles, phase-by-phase actions, escalation, SLAs and detection queries for Splunk and Microsoft Sentinel. Every query opens in our SIEM for practice.</p>
          {q && <Glass className="mt-8 overflow-hidden" data-testid="landing-sop-query">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 text-xs font-mono">
              <span className="flex items-center gap-2 text-slate-400"><TermIcon className="h-3.5 w-3.5 text-green-400" />{feat.title}</span>
              <div className="flex border border-white/10">{["spl", "kql"].map((l) => <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 ${lang === l ? "bg-cyan-500/15 text-cyan-300" : "text-slate-500"}`} data-testid={`landing-sop-lang-${l}`}>{l.toUpperCase()}</button>)}</div>
            </div>
            <div className="px-4 pt-3 text-xs text-slate-400">{q.name}</div>
            <pre className="px-4 pb-4 pt-2 text-xs font-mono text-green-300 whitespace-pre-wrap break-words cursor-blink">{q[lang]}</pre>
          </Glass>}
          <div className="flex flex-wrap items-center gap-4 mt-8">
            <Link to="/sops" className="glow-btn" data-testid="landing-sops-link">Open the SOP library <ArrowRight className="h-4 w-4" /></Link>
            <span className="text-sm font-mono text-slate-400" data-testid="landing-sop-offer"><span className="text-green-400">{d.free_count} free</span> · all {d.sops.length} for <span className="text-cyan-300 text-lg">₹{d.price}</span></span>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3" data-testid="landing-sop-grid">
          {d.sops.map((s, i) => <Link key={s.id} to={`/sops/${s.id}`} style={{ animationDelay: `${i * 60}ms` }} className="rise group glass rounded-sm p-4 hover:border-cyan-400/50 transition-colors" data-testid={`landing-sop-${s.id}`}>
            <div className="flex items-center justify-between text-[10px] font-mono"><span className="text-cyan-400">{s.category}</span>{s.locked ? <Lock className="h-3.5 w-3.5 text-slate-500" /> : <Unlock className="h-3.5 w-3.5 text-green-400" />}</div>
            <div className="text-sm font-semibold mt-2 flex items-start gap-2 group-hover:text-cyan-300 transition-colors"><FileText className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" />{s.title}</div>
            <div className="text-[10px] font-mono text-slate-500 mt-2">{s.free ? <span className="text-green-400">FREE</span> : "PREMIUM"} · {s.query_count} queries</div>
          </Link>)}
        </div>
      </div>
    </section>);
}

export function useLandingIntel() {
  const [posts, setPosts] = useState([]);
  const [sops, setSops] = useState(null);
  useEffect(() => {
    api.get("/public/blog", { params: { limit: 10 } }).then((r) => setPosts(r.data.posts)).catch(() => {});
    api.get("/public/sops").then((r) => setSops(r.data)).catch(() => {});
  }, []);
  return { posts, sops };
}

export default function LandingIntel({ posts, sops }) {
  return (<><BlogMagazine posts={posts} /><SopShowcase d={sops} /></>);
}
