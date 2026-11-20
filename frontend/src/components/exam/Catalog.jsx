import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ClipboardCheck, Star, Timer, ShieldCheck, Target } from "lucide-react";
import { api } from "../../lib/api";
import { Glass, Empty } from "../common";
import { PriceTag, Countdown } from "../academy/Price";

const chip = (on) => `font-mono text-xs px-3 py-1.5 border transition-colors ${on ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:text-cyan-200"}`;
export const KIND_LABEL = { practice: "Practice test", exam: "Timed exam", certification: "Certification exam" };

function TestCard({ t, to }) {
  return (
    <Link to={to(t)} data-testid={`test-card-${t.id}`} className="group">
      <Glass className="h-full flex flex-col overflow-hidden group-hover:border-cyan-400/60 group-hover:-translate-y-1 transition-[transform,border-color] duration-300">
        <div className="h-36 relative overflow-hidden border-b border-cyan-500/15 bg-[#060912]">
          {t.cover ? <img src={t.cover} alt="" className="h-full w-full object-cover opacity-80" /> : <>
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(0,240,255,.15) 1px,transparent 1px),linear-gradient(90deg,rgba(0,240,255,.15) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
            <div className="absolute inset-0 grid place-items-center"><div className="text-center"><div className="font-mono text-3xl font-black neon-text tracking-wider">{t.code || "TEST"}</div><div className="text-[10px] font-mono text-slate-500 mt-1 uppercase tracking-[0.3em]">{t.vendor}</div></div></div></>}
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-cyan-400 text-black text-[10px] font-mono font-bold px-2 py-0.5" data-testid={`test-tag-${t.id}`}><ClipboardCheck className="h-3 w-3" />TESTS</span>
          {t.off > 0 && <span className="absolute top-2 right-2 bg-green-500 text-black text-[10px] font-mono font-bold px-2 py-0.5">{t.off}% OFF</span>}
        </div>
        <div className="p-5 flex-1 flex flex-col">
          <div className="text-[11px] font-mono"><span className="text-cyan-400">{t.level}</span><span className="text-slate-500"> · {t.vendor}{t.topic ? ` · ${t.topic}` : ""}</span></div>
          <div className="font-bold mt-2 leading-snug group-hover:text-cyan-200 transition-colors" data-testid={`test-title-${t.id}`}>{t.title}</div>
          <p className="text-xs text-slate-400 mt-1 flex-1 line-clamp-2">{t.subtitle}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-slate-400 mt-3">
            <span className="inline-flex items-center gap-1"><Target className="h-3 w-3 text-green-400" />{t.questions} Qs</span>
            {t.duration_min > 0 && <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3 text-green-400" />{t.duration_min} min</span>}
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-green-400" />pass {t.pass_mark}%</span>
          </div>
          <div className="text-xs font-mono mt-2">{t.rating ? <span className="text-yellow-300 inline-flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-300" />{t.rating} ({t.reviews_count})</span> : <span className="text-slate-500">New · {KIND_LABEL[t.kind]}</span>}</div>
          <div className="mt-3 flex items-center justify-between"><PriceTag c={t} testId={`test-price-${t.id}`} />{t.owned && <span className="text-[10px] font-mono text-green-300 border border-green-500/40 px-1.5 py-0.5">ENROLLED</span>}</div>
          {t.sale_ends_at && <div className="mt-1.5"><Countdown ends={t.sale_ends_at} /></div>}
        </div>
      </Glass>
    </Link>);
}

export function TestCatalog({ to = (t) => `/test/${t.id}` }) {
  const [ts, setTs] = useState(null);
  const [f, setF] = useState({ q: "", vendor: "", topic: "", level: "", price: "all" });
  useEffect(() => { api.get("/public/exams").then((r) => setTs(r.data)).catch(() => setTs([])); }, []);
  const opts = (k) => [...new Set((ts || []).map((t) => t[k]).filter(Boolean))].sort();
  const shown = useMemo(() => (ts || []).filter((t) => (!f.q || t.title.toLowerCase().includes(f.q.toLowerCase()) || (t.code || "").toLowerCase().includes(f.q.toLowerCase()))
    && (!f.vendor || t.vendor === f.vendor) && (!f.topic || t.topic === f.topic) && (!f.level || t.level === f.level) && (f.price === "all" || (f.price === "free" ? !t.price : t.price > 0))), [ts, f]);
  const sel = (k, label) => <select className="field !w-auto" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`tests-filter-${k}`}><option value="">{label}</option>{(k === "level" ? ["Beginner", "Intermediate", "Advanced"] : opts(k)).map((x) => <option key={x}>{x}</option>)}</select>;
  return (
    <section data-testid="tests-catalog">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md"><Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="field !pl-9" placeholder="Search tests or exam codes" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} data-testid="tests-search" /></div>
        {sel("vendor", "All vendors")}{sel("topic", "All topics")}{sel("level", "All levels")}
      </div>
      <div className="flex gap-2 mt-3">{[["all", "All"], ["free", "Free"], ["paid", "Paid"]].map(([v, l]) => <button key={v} className={chip(f.price === v)} onClick={() => setF({ ...f, price: v })} data-testid={`tests-price-${v}`}>{l}</button>)}</div>
      <div className="eyebrow mt-8 mb-3" data-testid="tests-count">{shown.length} test{shown.length === 1 ? "" : "s"}</div>
      {ts && !shown.length && <Empty text="No tests match these filters" />}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5" data-testid="tests-grid">{shown.map((t) => <TestCard key={t.id} t={t} to={to} />)}</div>
    </section>);
}
