import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ExternalLink, Newspaper, ShieldAlert, Crosshair, Search } from "lucide-react";
import PublicNav, { Footer } from "../components/PublicNav";
import { Glass, SeverityBadge, Empty } from "../components/common";
import { api } from "../lib/api";

const day = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const Cover = ({ p, className = "" }) => p.image
  ? <img src={p.image} alt="" loading="lazy" className={`w-full object-cover ${className}`} />
  : <div className={`w-full grid place-items-center bg-gradient-to-br from-cyan-500/10 to-transparent ${className}`}><ShieldAlert className="h-10 w-10 text-cyan-400/40" /></div>;

export function PostCard({ p }) {
  return (
    <Link to={`/blog/${p.slug}`} className="group" data-testid={`blog-card-${p.id}`}>
      <Glass className="overflow-hidden h-full flex flex-col transition-transform duration-300 group-hover:-translate-y-1">
        <Cover p={p} className="h-44" />
        <div className="p-5 flex flex-col flex-1">
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500"><SeverityBadge level={p.severity} /><span className="text-cyan-400">{p.category}</span><span className="ml-auto">{day(p.published_at)}</span></div>
          <h3 className="font-bold mt-3 leading-snug group-hover:text-cyan-300 transition-colors">{p.title}</h3>
          <p className="text-sm text-slate-400 mt-2 flex-1">{p.excerpt}</p>
          <div className="text-[11px] font-mono text-slate-500 mt-4">via {p.source}</div>
        </div>
      </Glass>
    </Link>
  );
}

export function BlogList() {
  const [d, setD] = useState(null);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const load = (c = cat, s = q) => api.get("/public/blog", { params: { category: c, q: s } }).then((r) => setD(r.data));
  useEffect(() => { load(); }, [cat]); // eslint-disable-line
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <section className="max-w-7xl mx-auto px-6 pt-14 pb-20">
        <div className="eyebrow mb-3">// security blog</div>
        <h1 className="text-4xl sm:text-5xl font-extrabold max-w-3xl">Today's threats, <span className="neon-text">turned into SOC action.</span></h1>
        <p className="text-slate-400 mt-4 max-w-2xl text-sm md:text-base">Fresh stories from The Hacker News and BleepingComputer every morning, summarised for analysts with the hunts, detections and fixes to run on your shift.</p>
        <div className="flex flex-wrap items-center gap-2 mt-8" data-testid="blog-filters">
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 rounded-sm"><Search className="h-4 w-4 text-slate-500" />
            <input value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) load(cat, ""); }} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search posts" className="bg-transparent py-2 text-sm outline-none w-48" data-testid="blog-search" />
            <button onClick={() => load()} className="text-xs font-mono text-cyan-300 hover:text-cyan-200" data-testid="blog-search-button">go</button></div>
          {["", ...(d?.categories || [])].map((c) => <button key={c || "all"} onClick={() => setCat(c)} data-testid={`blog-cat-${c || "all"}`}
            className={`px-3 py-1.5 text-xs font-mono border rounded-sm transition-colors ${cat === c ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-slate-400 hover:border-cyan-500/40"}`}>{c || "All"}</button>)}
          {d?.updated_at && <span className="ml-auto text-[11px] font-mono text-slate-500" data-testid="blog-updated">updated {day(d.updated_at)} · {d.total} posts</span>}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8" data-testid="blog-grid">
          {d?.posts.map((p) => <PostCard key={p.id} p={p} />)}
        </div>
        {d && !d.posts.length && <div data-testid="blog-empty"><Empty text={d.total ? "no posts in this category yet — new stories arrive every morning" : "the first posts are being written — check back in a few minutes"} /></div>}
      </section>
      <Footer />
    </div>
  );
}

const Block = ({ icon: I, title, items, testId, accent = "text-cyan-400" }) => items?.length ? (
  <Glass className="p-6" data-testid={testId}>
    <div className={`eyebrow mb-4 flex items-center gap-2 ${accent}`}><I className="h-4 w-4" />{title}</div>
    <ul className="space-y-2.5">{items.map((x, i) => <li key={i} className="flex gap-3 text-sm text-slate-300"><span className="font-mono text-green-400 shrink-0">{String(i + 1).padStart(2, "0")}</span><span>{x}</span></li>)}</ul>
  </Glass>) : null;

export function BlogPost() {
  const { slug } = useParams();
  const [p, setP] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { setP(null); api.get(`/public/blog/${slug}`).then((r) => setP(r.data)).catch(() => setErr(true)); window.scrollTo(0, 0); }, [slug]);
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <article className="max-w-4xl mx-auto px-6 pt-10 pb-20" data-testid="blog-post">
        <Link to="/blog" className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="blog-back"><ArrowLeft className="h-3.5 w-3.5" />All posts</Link>
        {err && <Empty text="post not found" />}
        {p && <>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono mt-6"><SeverityBadge level={p.severity} /><span className="text-cyan-400">{p.category}</span><span className="text-slate-500">· {day(p.published_at)}</span></div>
          <h1 className="text-3xl sm:text-4xl font-extrabold mt-4 leading-tight" data-testid="blog-post-title">{p.title}</h1>
          <Cover p={p} className="h-64 sm:h-80 mt-8 rounded-sm" />
          <div className="mt-8 space-y-4 text-slate-300 leading-relaxed" data-testid="blog-post-summary">{p.summary.map((s, i) => <p key={i}>{s}</p>)}</div>
          <div className="grid md:grid-cols-2 gap-4 mt-10">
            <Block icon={Newspaper} title="key points" items={p.key_points} testId="blog-key-points" />
            <Block icon={Crosshair} title="soc action items" items={p.soc_actions} testId="blog-soc-actions" accent="text-green-400" />
          </div>
          {(p.iocs?.length > 0 || p.mitre?.length > 0) && <Glass className="p-6 mt-4 grid md:grid-cols-2 gap-6" data-testid="blog-iocs">
            {p.iocs?.length > 0 && <div><div className="eyebrow mb-3">indicators & cves</div><div className="flex flex-wrap gap-2">{p.iocs.map((x) => <code key={x} className="text-xs font-mono bg-black/40 border border-red-500/20 text-red-300 px-2 py-1">{x}</code>)}</div></div>}
            {p.mitre?.length > 0 && <div><div className="eyebrow mb-3">mitre att&ck</div><div className="flex flex-wrap gap-2">{p.mitre.map((x) => <code key={x} className="text-xs font-mono bg-black/40 border border-cyan-500/20 text-cyan-300 px-2 py-1">{x}</code>)}</div></div>}
          </Glass>}
          <Glass className="p-5 mt-4 flex flex-wrap items-center gap-4" data-testid="blog-source">
            <div className="text-sm text-slate-400 flex-1">Summary by SOCProfessionals Academy. Original reporting: <span className="text-slate-200">{p.source}</span></div>
            <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="ghost-btn !text-xs" data-testid="blog-source-link">Read the original <ExternalLink className="h-3.5 w-3.5" /></a>
          </Glass>
          <Glass className="p-6 mt-4 flex flex-wrap items-center gap-4 border-green-500/20">
            <div className="flex-1"><div className="font-bold">Want the full playbook for incidents like this?</div><div className="text-sm text-slate-400 mt-1">Step-by-step SOC SOPs with ready-to-run SPL and KQL queries.</div></div>
            <Link to="/sops" className="glow-btn" data-testid="blog-sop-cta">Open SOP library <ArrowRight className="h-4 w-4" /></Link>
          </Glass>
          {p.related?.length > 0 && <><div className="eyebrow mt-14 mb-4">related</div><div className="grid sm:grid-cols-3 gap-4">{p.related.map((r) => <PostCard key={r.id} p={r} />)}</div></>}
        </>}
      </article>
      <Footer />
    </div>
  );
}

export function LatestPosts() {
  const [posts, setPosts] = useState([]);
  useEffect(() => { api.get("/public/blog", { params: { limit: 3 } }).then((r) => setPosts(r.data.posts)).catch(() => {}); }, []);
  if (!posts.length) return null;
  return (
    <section className="max-w-7xl mx-auto px-6 pb-24" data-testid="landing-blog">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div><div className="eyebrow mb-3">// threat briefing</div><h2 className="text-3xl font-bold max-w-xl">Today's security news, with SOC action items.</h2></div>
        <div className="flex gap-3"><Link to="/sops" className="ghost-btn" data-testid="landing-sops-link">SOP library</Link><Link to="/blog" className="ghost-btn" data-testid="landing-blog-link">All posts <ArrowRight className="h-4 w-4" /></Link></div>
      </div>
      <div className="grid md:grid-cols-3 gap-5">{posts.map((p) => <PostCard key={p.id} p={p} />)}</div>
    </section>
  );
}
