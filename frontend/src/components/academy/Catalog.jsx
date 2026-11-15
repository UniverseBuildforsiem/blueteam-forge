import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, GraduationCap, Star, PlayCircle } from "lucide-react";
import { api } from "../../lib/api";
import { Glass, Empty } from "../common";
import { PriceTag, Countdown } from "./Price";
import { BundleCard } from "./Bundles";

const SORTS = [["new", "Newest"], ["rating", "Highest rated"], ["low", "Price: low to high"], ["high", "Price: high to low"]];
const QUICK = [["all", "All"], ["sale", "On sale"], ["free", "Free"]];
const chip = (on) => `font-mono text-xs px-3 py-1.5 border transition-colors ${on ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:text-cyan-200"}`;

function CatalogCard({ c }) {
  return (
    <Link to={`/course/${c.id}`} data-testid={`catalog-course-${c.id}`}>
      <Glass className="h-full flex flex-col overflow-hidden hover:border-cyan-400/50 transition-colors">
        {c.cover ? <img src={c.cover} alt="" className="h-36 w-full object-cover" /> : <div className="h-36 grid place-items-center bg-gradient-to-br from-cyan-500/10 to-transparent"><GraduationCap className="h-12 w-12 text-cyan-400/60" /></div>}
        <div className="p-5 flex-1 flex flex-col">
          <div className="text-[11px] font-mono"><span className="text-cyan-400">{c.level}</span>{c.category && <span className="text-slate-500"> · {c.category}</span>}</div>
          <div className="font-bold mt-2">{c.title}</div><p className="text-xs text-slate-400 mt-1 flex-1 line-clamp-2">{c.subtitle}</p>
          <div className="text-[11px] text-slate-500 mt-2">{c.instructor_name} · {c.lessons_count} lessons</div>
          <div className="text-xs font-mono mt-1 inline-flex items-center gap-1">{c.rating ? <span className="text-yellow-300 inline-flex items-center gap-1" data-testid={`catalog-rating-${c.id}`}><Star className="h-3 w-3 fill-yellow-300" />{c.rating} ({c.reviews_count})</span> : <span className="text-slate-500">New</span>}
            {c.previews > 0 && <span className="ml-2 text-cyan-300 inline-flex items-center gap-1"><PlayCircle className="h-3 w-3" />{c.previews} free previews</span>}</div>
          <div className="mt-3"><PriceTag c={c} testId={`catalog-price-${c.id}`} /></div>
          {c.sale_ends_at && <div className="mt-1.5"><Countdown ends={c.sale_ends_at} /></div>}
        </div></Glass></Link>);
}

export function AcademyCatalog() {
  const [cs, setCs] = useState(null);
  const [bs, setBs] = useState([]);
  const [f, setF] = useState({ q: "", level: "", cat: "", sort: "new", quick: "all" });
  useEffect(() => { api.get("/public/academy/courses").then((r) => setCs(r.data)).catch(() => setCs([])); api.get("/public/academy/bundles").then((r) => setBs(r.data)).catch(() => {}); }, []);
  const cats = useMemo(() => [...new Set((cs || []).map((c) => c.category).filter(Boolean))].sort(), [cs]);
  const shown = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const l = (cs || []).filter((c) => (!q || c.title.toLowerCase().includes(q)) && (!f.level || c.level === f.level) && (!f.cat || c.category === f.cat)
      && (f.quick !== "sale" || c.off > 0) && (f.quick !== "free" || !c.price));
    const by = { rating: (a, b) => (b.rating || 0) - (a.rating || 0), low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price }[f.sort];
    return by ? [...l].sort(by) : l;
  }, [cs, f]);
  const bShown = bs.filter((b) => f.quick !== "free" && (f.quick !== "sale" || b.sale_ends_at || b.off > 0) && (!f.q.trim() || b.title.toLowerCase().includes(f.q.trim().toLowerCase())));
  if (cs && !cs.length) return null;
  return (
    <section data-testid="academy-catalog">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md"><Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="field !pl-9" placeholder="Search courses" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} data-testid="catalog-search" /></div>
        <select className="field !w-auto" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} data-testid="catalog-level"><option value="">All levels</option>{["Beginner", "Intermediate", "Advanced"].map((x) => <option key={x}>{x}</option>)}</select>
        {cats.length > 0 && <select className="field !w-auto" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} data-testid="catalog-category"><option value="">All categories</option>{cats.map((x) => <option key={x}>{x}</option>)}</select>}
        <select className="field !w-auto" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} data-testid="catalog-sort">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <div className="flex gap-2 mt-3">{QUICK.map(([v, l]) => <button key={v} className={chip(f.quick === v)} onClick={() => setF({ ...f, quick: v })} data-testid={`catalog-quick-${v}`}>{l}</button>)}</div>
      {bShown.length > 0 && <div className="mt-8"><div className="eyebrow mb-3">bundles · save more</div><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="catalog-bundles">{bShown.map((b) => <BundleCard key={b.id} b={b} />)}</div></div>}
      <div className="eyebrow mt-8 mb-3" data-testid="catalog-count">{shown.length} course{shown.length === 1 ? "" : "s"}</div>
      {cs && !shown.length && <Empty text="No courses match these filters" />}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="catalog-courses">{shown.map((c) => <CatalogCard key={c.id} c={c} />)}</div>
    </section>);
}
