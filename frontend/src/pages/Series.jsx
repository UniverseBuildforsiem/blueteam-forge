import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Clock, Lock, Search, Mail, Share2, Linkedin, Twitter, MessageCircle, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import PublicNav, { Footer } from "../components/PublicNav";
import { Glass, Empty } from "../components/common";
import Markdown, { headingId } from "../components/Markdown";
import { api } from "../lib/api";

const num = (n) => String(n).padStart(3, "0");
export const imgSrc = (u) => (u?.startsWith("/") ? process.env.REACT_APP_BACKEND_URL + u : u);

function SeriesEmailToggle() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => { if (user) api.get("/me/series/next").then((r) => setD(r.data)).catch(() => {}); }, [user]);
  if (!user || !d) return null;
  const flip = async () => {
    try { const { data } = await api.patch("/me/preferences", { series_emails: !d.on }); setD({ ...d, on: data.series_emails }); toast.success(data.series_emails ? "Weekly series email on" : "Weekly series email off"); } catch { toast.error("Could not update, try again"); }
  };
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3" data-testid="series-email">
      <button onClick={flip} className={`inline-flex items-center gap-2 text-xs font-mono border px-3 py-2 rounded-sm transition-colors ${d.on ? "border-green-500/40 text-green-300" : "border-white/10 text-slate-400"}`} data-testid="series-email-toggle">
        <Mail className="h-3.5 w-3.5" />One series post every Monday: {d.on ? "ON" : "OFF"}</button>
      {d.on && d.next && <span className="text-xs text-slate-400" data-testid="series-email-next">Your next email: <Link to={`/soc-series/${d.next.slug}`} className="text-cyan-300 hover:text-cyan-200">#{num(d.next.number)} {d.next.title}</Link></span>}
    </div>);
}

export const BlogTabs = ({ active }) => (
  <div className="inline-flex border border-white/10 bg-black/40 rounded-sm p-1 mb-8" data-testid="blog-tabs">
    {[["news", "/blog", "Threat news"], ["series", "/soc-series", "SOC Analyst Series"]].map(([k, to, l]) =>
      <Link key={k} to={to} data-testid={`blog-tab-${k}`} className={`px-4 py-1.5 text-xs font-mono rounded-sm transition-colors ${active === k ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>{l}</Link>)}
  </div>);

function SeriesCard({ p }) {
  const ready = p.status === "ready";
  const inner = (
    <Glass className={`overflow-hidden h-full flex flex-col transition-transform duration-300 ${ready ? "group-hover:-translate-y-1" : "opacity-50"}`}>
      <div className="relative h-32 overflow-hidden"><img src={imgSrc(p.cover)} alt="" loading="lazy" className="w-full h-full object-cover" />
        <span className="absolute top-2 left-2 font-mono text-[11px] bg-black/70 border border-cyan-500/30 text-cyan-300 px-2 py-0.5">#{num(p.number)}</span></div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className={`font-bold text-sm leading-snug ${ready ? "group-hover:text-cyan-300 transition-colors" : "text-slate-400"}`}>{p.title}</h3>
        {ready && p.excerpt && <p className="text-xs text-slate-400 mt-2 flex-1 line-clamp-3">{p.excerpt}</p>}
        <div className="text-[11px] font-mono mt-3 flex items-center gap-1.5">{ready
          ? <span className="text-green-400 flex items-center gap-1"><Clock className="h-3 w-3" />{p.read_min} min read</span>
          : <span className="text-slate-500 flex items-center gap-1"><Lock className="h-3 w-3" />coming soon</span>}</div>
      </div>
    </Glass>);
  return ready ? <Link to={`/soc-series/${p.slug}`} className="group" data-testid={`series-card-${p.slug}`}>{inner}</Link> : <div data-testid={`series-card-${p.slug}`}>{inner}</div>;
}

export function SeriesList() {
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  const [sec, setSec] = useState("");
  useEffect(() => { api.get("/public/series").then((r) => setD(r.data)); }, []);
  const sections = useMemo(() => (d?.sections || []).filter((s) => !sec || s.name === sec)
    .map((s) => ({ ...s, posts: s.posts.filter((p) => !q || `${p.title} ${p.tags?.join(" ")}`.toLowerCase().includes(q.toLowerCase())) })).filter((s) => s.posts.length), [d, q, sec]);
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <section className="max-w-7xl mx-auto px-6 pt-14 pb-20">
        <BlogTabs active="series" />
        <div className="eyebrow mb-3">// soc analyst technical blog series</div>
        <h1 className="text-4xl sm:text-5xl font-extrabold max-w-3xl">{d?.total || "120+"} hands-on guides, <span className="neon-text">from L1 to threat hunter.</span></h1>
        <p className="text-slate-400 mt-4 max-w-2xl text-sm md:text-base">Real log samples, Splunk SPL and Sentinel KQL detections, step-by-step investigation playbooks and real-world incidents for SOC analysts, threat hunters and incident responders.</p>
        <SeriesEmailToggle />
        {d && <div className="flex flex-wrap gap-6 mt-6 font-mono text-xs" data-testid="series-stats"><span><span className="text-green-400 text-lg font-bold">{d.written}</span> <span className="text-slate-500">published</span></span><span><span className="text-cyan-300 text-lg font-bold">{d.total}</span> <span className="text-slate-500">in the series</span></span><span><span className="text-slate-200 text-lg font-bold">{d.sections.length}</span> <span className="text-slate-500">tracks</span></span></div>}
        <div className="flex flex-wrap items-center gap-2 mt-8" data-testid="series-filters">
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 rounded-sm"><Search className="h-4 w-4 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the series" className="bg-transparent py-2 text-sm outline-none w-48" data-testid="series-search" /></div>
          {["", ...(d?.sections || []).map((s) => s.name)].map((s) => <button key={s || "all"} onClick={() => setSec(s)} data-testid={`series-sec-${s ? headingId(s) : "all"}`}
            className={`px-3 py-1.5 text-xs font-mono border rounded-sm transition-colors ${sec === s ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-slate-400 hover:border-cyan-500/40"}`}>{s || "All tracks"}</button>)}
        </div>
        {sections.map((s) => (
          <div key={s.name} className="mt-12" data-testid={`series-section-${headingId(s.name)}`}>
            <div className="flex items-baseline gap-3 mb-5"><h2 className="text-xl font-bold">{s.name}</h2><span className="text-xs font-mono text-slate-500">{s.posts.filter((p) => p.status === "ready").length}/{s.posts.length} published</span></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{s.posts.map((p) => <SeriesCard key={p.id} p={p} />)}</div>
          </div>))}
        {d && !sections.length && <Empty text="no posts match your search" />}
      </section>
      <Footer />
    </div>);
}

const shareUrl = (slug) => `${process.env.REACT_APP_BACKEND_URL}/api/public/series-share/${slug}`;

function ShareBar({ p, place }) {
  const url = shareUrl(p.slug);
  const text = `${p.title} — SOC Analyst Series #${num(p.number)} on SOCProfessionals Academy`;
  const links = [
    ["linkedin", "LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, Linkedin],
    ["x", "X", `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, Twitter],
    ["whatsapp", "WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, MessageCircle],
  ];
  const copy = () => { navigator.clipboard.writeText(url); toast.success("Link copied"); };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`series-share-${place}`}>
      <span className="text-[11px] font-mono uppercase text-slate-500 mr-1 flex items-center gap-1"><Share2 className="h-3.5 w-3.5" />share</span>
      {links.map(([k, l, href, I]) => <a key={k} href={href} target="_blank" rel="noopener noreferrer" data-testid={`series-share-${place}-${k}`}
        className="inline-flex items-center gap-1.5 text-xs font-mono border border-white/10 px-3 py-1.5 rounded-sm text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-colors"><I className="h-3.5 w-3.5" />{l}</a>)}
      <button onClick={copy} data-testid={`series-share-${place}-copy`} className="inline-flex items-center gap-1.5 text-xs font-mono border border-white/10 px-3 py-1.5 rounded-sm text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-colors"><Link2 className="h-3.5 w-3.5" />Copy link</button>
    </div>);
}

function ShareCard({ p }) {
  return (
    <Glass className="p-5 mt-12 grid md:grid-cols-[320px_1fr] gap-5 items-center border-cyan-500/20" data-testid="series-share-card">
      <img src={`${shareUrl(p.slug)}.png`} alt="Share card" loading="lazy" className="w-full border border-white/10" data-testid="series-share-card-img" />
      <div><div className="font-bold">Found this useful? Share it with your network.</div>
        <div className="text-sm text-slate-400 mt-1 mb-4">Your post shows this card with the title and series number.</div>
        <ShareBar p={p} place="bottom" /></div>
    </Glass>);
}

const NavCard = ({ p, dir }) => p ? (
  <Link to={`/soc-series/${p.slug}`} className="group flex-1" data-testid={`series-${dir}`}>
    <Glass className={`p-4 h-full transition-colors group-hover:border-cyan-500/40 ${dir === "next" ? "text-right" : ""}`}>
      <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1 justify-between">{dir === "prev" ? <><ArrowLeft className="h-3 w-3" />previous</> : <span className="ml-auto flex items-center gap-1">next<ArrowRight className="h-3 w-3" /></span>}</div>
      <div className="font-bold text-sm mt-1 group-hover:text-cyan-300">{p.title}</div>
    </Glass>
  </Link>) : <div className="flex-1" />;

export function SeriesPost() {
  const { slug } = useParams();
  const [p, setP] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { setP(null); setErr(false); api.get(`/public/series/${slug}`).then((r) => setP(r.data)).catch(() => setErr(true)); window.scrollTo(0, 0); }, [slug]);
  const toc = useMemo(() => (p?.body.match(/^## .+$/gm) || []).map((h) => h.slice(3).replace(/[*`]/g, "").trim()), [p]);
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-20">
        <Link to="/soc-series" className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="series-back"><ArrowLeft className="h-3.5 w-3.5" />All series posts</Link>
        {err && <Empty text="post not found" />}
        {p && <div className="grid lg:grid-cols-[1fr_240px] gap-10 mt-6">
          <article className="min-w-0" data-testid="series-post">
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono"><span className="text-cyan-300 border border-cyan-500/30 px-2 py-0.5">#{num(p.number)} / {p.total}</span><span className="text-green-400">{p.section}</span><span className="text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3" />{p.read_min} min read</span></div>
            <h1 className="text-3xl sm:text-4xl font-extrabold mt-4 leading-tight" data-testid="series-post-title">{p.title}</h1>
            {p.excerpt && <p className="text-slate-400 mt-4 text-base">{p.excerpt}</p>}
            <img src={imgSrc(p.cover)} alt="" className="w-full h-56 sm:h-72 object-cover mt-8 rounded-sm border border-white/10" data-testid="series-post-cover" />
            <div className="mt-6"><ShareBar p={p} place="top" /></div>
            {(p.mitre?.length > 0 || p.tags?.length > 0) && <div className="flex flex-wrap gap-2 mt-6" data-testid="series-post-tags">
              {p.mitre?.map((m) => <code key={m} className="text-[11px] font-mono bg-black/40 border border-cyan-500/20 text-cyan-300 px-2 py-0.5">{m}</code>)}
              {p.tags?.map((t) => <span key={t} className="text-[11px] font-mono text-slate-400 border border-white/10 px-2 py-0.5">#{t}</span>)}</div>}
            <div className="mt-6" data-testid="series-post-body"><Markdown>{p.body}</Markdown></div>
            <ShareCard p={p} />
            <Glass className="p-6 mt-4 flex flex-wrap items-center gap-4 border-green-500/20">
              <div className="flex-1"><div className="font-bold">Practise this on a real shift</div><div className="text-sm text-slate-400 mt-1">Run these queries in our SIEM simulator and work live alerts in the triage labs.</div></div>
              <Link to="/register" className="glow-btn" data-testid="series-cta">Start practising <ArrowRight className="h-4 w-4" /></Link>
            </Glass>
            <div className="flex flex-col sm:flex-row gap-4 mt-6"><NavCard p={p.prev} dir="prev" /><NavCard p={p.next} dir="next" /></div>
          </article>
          {toc.length > 0 && <aside className="hidden lg:block"><div className="sticky top-24" data-testid="series-toc">
            <div className="eyebrow mb-3 flex items-center gap-2"><BookOpen className="h-3.5 w-3.5" />on this page</div>
            <ul className="space-y-2 border-l border-white/10">{toc.map((h) => <li key={h}><a href={`#${headingId(h)}`} className="block pl-3 text-xs text-slate-400 hover:text-cyan-300 -ml-px border-l border-transparent hover:border-cyan-400">{h}</a></li>)}</ul>
          </div></aside>}
        </div>}
      </div>
      <Footer />
    </div>);
}
