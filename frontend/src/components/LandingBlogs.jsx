import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PostCard } from "../pages/Blog";
import { SeriesCard } from "../pages/Series";
import { api } from "../lib/api";

const TABS = [["news", "Zer0 Day Vulnerabilities and Attacks", "/blog"], ["soc", "SOC Blog", "/soc-series"]];

export default function LandingBlogs() {
  const [tab, setTab] = useState("news");
  const [news, setNews] = useState([]);
  const [soc, setSoc] = useState([]);
  useEffect(() => {
    api.get("/public/blog", { params: { limit: 3 } }).then((r) => setNews(r.data.posts)).catch(() => {});
    api.get("/public/series").then((r) => setSoc(r.data.sections.flatMap((s) => s.posts).filter((p) => p.status === "ready").slice(0, 4))).catch(() => {});
  }, []);
  const href = TABS.find((t) => t[0] === tab)[2];
  return (
    <section id="blogs" className="max-w-7xl mx-auto px-6 pb-24" data-testid="landing-blogs">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div><div className="eyebrow mb-3">// blogs</div><h2 className="text-3xl font-bold max-w-xl">Read like an analyst, hunt like one too.</h2></div>
        <Link to={href} className="ghost-btn" data-testid="landing-blogs-view-all">View all <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="inline-flex flex-wrap border border-white/10 bg-black/40 rounded-sm p-1 mb-8" data-testid="landing-blogs-tabs">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} data-testid={`landing-blogs-tab-${k}`}
          className={`px-4 py-2 text-xs sm:text-sm font-mono rounded-sm transition-colors ${tab === k ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>{l}</button>)}
      </div>
      {tab === "news"
        ? <div className="grid md:grid-cols-3 gap-5" data-testid="landing-blogs-news">{news.map((p) => <PostCard key={p.id} p={p} />)}</div>
        : <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="landing-blogs-soc">{soc.map((p) => <SeriesCard key={p.id} p={p} />)}</div>}
    </section>);
}
