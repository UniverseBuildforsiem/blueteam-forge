import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { GraduationCap, Printer, Star, Heart, Gift } from "lucide-react";
import { api, fmtDate } from "../../lib/api";
import { Glass, PageHeader, Empty } from "../../components/common";
import { CertShare } from "../../components/academy/CertShare";
import { PriceTag } from "../../components/academy/Price";
import { BundleCard } from "../../components/academy/Bundles";
import { SentGifts } from "../../components/academy/SentGifts";

export default function AcademyList() {
  const [all, setAll] = useState(null);
  const [wish, setWish] = useState(null);
  const [bs, setBs] = useState([]);
  const [sp] = useSearchParams();
  const [tab, setTab] = useState(sp.get("tab") || "all");
  useEffect(() => { api.get("/academy/courses").then((r) => setAll(r.data)); api.get("/public/academy/bundles").then((r) => setBs(r.data)).catch(() => {}); }, []);
  useEffect(() => { if (tab === "wishlist") api.get("/wishlist").then((r) => setWish(r.data)); }, [tab]);
  const cs = tab === "all" ? all : tab === "wishlist" ? wish && wish.filter((x) => x.kind === "course") : [];
  const wb = tab === "all" ? bs : tab === "wishlist" ? (wish || []).filter((x) => x.kind === "bundle") : [];
  return (
    <div>
      <PageHeader eyebrow="// academy courses" title="Courses" sub="Full SOC courses with video lessons, lesson quizzes, Kali labs, CTFs, SOPs, the SIEM & Shift simulators, a final exam and a shareable certificate." />
      <div className="flex gap-1 mb-5 border-b border-white/10" data-testid="academy-tabs">{[["all", "All courses", GraduationCap], ["wishlist", "My wishlist", Heart], ["gifts", "My gifts", Gift]].map(([v, l, I]) => (
        <button key={v} onClick={() => setTab(v)} data-testid={`academy-tab-${v}`} className={`px-4 py-2 text-xs font-mono border-b-2 -mb-px inline-flex items-center gap-1.5 transition-colors ${tab === v ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}><I className="h-3.5 w-3.5" />{l}</button>))}</div>
      {tab === "gifts" && <SentGifts />}
      {tab === "wishlist" && wish && !wish.length && <Empty text="Your wishlist is empty — tap 'Add to wishlist' on any course or bundle to get sale and price-drop emails" />}
      {wb.length > 0 && <div className="mb-6"><div className="eyebrow mb-3">{tab === "all" ? "bundles · save more" : "wishlisted bundles"}</div><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="academy-bundles">{wb.map((b) => <BundleCard key={b.id} b={b} />)}</div></div>}
      {tab === "all" && cs && !cs.length && <Empty text="No courses published yet" />}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="academy-list">{(cs || []).map((c) => (
        <Link key={c.id} to={c.owned && c.price ? `/app/courses/${c.id}` : `/course/${c.id}`} data-testid={`academy-card-${c.id}`}>
          <Glass className="h-full flex flex-col overflow-hidden hover:border-cyan-400/50 transition-colors">
            {c.cover ? <img src={c.cover} alt="" className="h-36 w-full object-cover" /> : <div className="h-36 grid place-items-center bg-gradient-to-br from-cyan-500/10 to-transparent"><GraduationCap className="h-12 w-12 text-cyan-400/60" /></div>}
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex items-center gap-2 text-[11px] font-mono"><span className="text-cyan-400">{c.level}</span><span className="text-slate-500">{c.modules_count} modules · {c.lessons_count} lessons</span></div>
              <div className="font-bold mt-2">{c.title}</div><p className="text-xs text-slate-400 mt-1 flex-1 line-clamp-2">{c.subtitle}</p>
              <div className="text-[11px] text-slate-500 mt-2">{c.instructor_name}</div>
              {c.rating && <div className="text-xs font-mono text-yellow-300 mt-1 inline-flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-300" />{c.rating} ({c.reviews_count})</div>}
              <div className="mt-3 flex items-center">{c.owned && c.price ? <span className="text-xs font-mono font-bold text-green-400" data-testid={`academy-price-${c.id}`}>Owned · {c.percent}%</span> : <PriceTag c={c} testId={`academy-price-${c.id}`} />}
                {c.previews > 0 && <span className="ml-auto text-[10px] font-mono text-cyan-300 border border-cyan-500/30 px-1.5">{c.previews} free previews</span>}</div>
              {c.owned && <div className="mt-3 h-1 bg-white/5"><div className="h-full bg-green-400" style={{ width: `${c.percent}%` }} /></div>}
            </div></Glass></Link>))}</div>
    </div>);
}

export function AcademyCert() {
  const { certId } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState(null);
  useEffect(() => { api.get(`/academy/certificates/${certId}`).then((r) => setC(r.data)).catch(() => nav("/app/courses")); }, [certId]); // eslint-disable-line
  if (!c) return null;
  return (
    <div className="max-w-3xl mx-auto">
      <div className="border-2 border-cyan-400/60 p-10 text-center bg-[#0B0F1A] print:bg-white print:text-black" data-testid="academy-certificate">
        <div className="eyebrow">SOCProfessionals Academy</div><div className="text-sm text-slate-400 mt-6">This certifies that</div>
        <div className="text-4xl font-bold mt-2" data-testid="academy-cert-name">{c.name}</div><div className="text-sm text-slate-400 mt-4">has completed the course</div>
        <div className="text-2xl font-bold neon-text mt-2" data-testid="academy-cert-course">{c.course_title}</div>
        <div className="text-xs font-mono text-slate-500 mt-8">{c.instructor_name ? `Instructor: ${c.instructor_name} · ` : ""}Issued {fmtDate(c.issued_at)} · ID {c.id}</div>
      </div>
      <div className="mt-4 print:hidden space-y-3"><CertShare cert={c} />
        <div className="flex gap-2"><Link to={`/verify/${c.id}`} className="ghost-btn !text-xs" data-testid="academy-cert-verify-page">Public verify page</Link>
          <button className="ghost-btn !text-xs" onClick={() => window.print()} data-testid="academy-cert-print"><Printer className="h-3.5 w-3.5" />Print</button>
          <Link to={`/app/courses/${c.course_id}`} className="ghost-btn !text-xs" data-testid="academy-cert-back">Back to course</Link></div></div>
    </div>);
}
