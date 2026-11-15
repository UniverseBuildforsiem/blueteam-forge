import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Check, Star, Users, Clock, BarChart3, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import PublicNav from "../components/PublicNav";
import { Glass, Empty } from "../components/common";
import { BuyCard } from "../components/academy/BuyCard";
import { Curriculum, PreviewDialog } from "../components/academy/Curriculum";
import { Reviews, Stars } from "../components/academy/Reviews";
import { BundleOffers } from "../components/academy/Bundles";
import { FestivalBanner } from "../components/FestivalBanner";

const List = ({ title, items, icon = true, testId }) => (items?.length ? (
  <section data-testid={testId}><h2 className="text-xl font-bold mb-3">{title}</h2>
    <ul className="space-y-2">{items.map((x) => <li key={x} className="text-sm text-slate-300 flex gap-2">{icon ? <Check className="h-4 w-4 text-green-400 shrink-0 mt-0.5" /> : <span className="text-cyan-400">•</span>}{x}</li>)}</ul></section>) : null);

function useWide() {
  const q = "(min-width: 1024px)";
  const [w, setW] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setW(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return w;
}

function Hero({ c, card }) {
  const wide = useWide();
  return (
    <div className="border-b border-cyan-500/20 bg-[#070A12] relative z-10">
      <div className="max-w-6xl mx-auto px-6 py-10 lg:pr-[400px] relative">
        {wide && <div className="absolute right-6 top-10 w-[360px]">{card}</div>}
        <div className="text-xs font-mono text-cyan-400 flex items-center gap-1.5"><Link to={c.signed_in ? "/app/courses" : "/courses"} className="hover:underline" data-testid="course-breadcrumb">Courses</Link>{c.category && <><ChevronRight className="h-3 w-3" />{c.category}</>}</div>
        {c.status !== "published" && <div className="mt-3 text-xs font-mono text-yellow-300 border border-yellow-500/30 p-2 inline-block" data-testid="academy-preview-banner">Preview — this course is {c.status} and not visible to students yet.</div>}
        <h1 className="text-3xl sm:text-4xl font-bold mt-3 leading-tight" data-testid="course-landing-title">{c.title}</h1>
        {c.subtitle && <p className="text-base md:text-lg text-slate-300 mt-3" data-testid="course-landing-subtitle">{c.subtitle}</p>}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm">
          {c.rating ? <span className="inline-flex items-center gap-1.5 text-yellow-300 font-bold" data-testid="course-landing-rating">{c.rating}<Stars value={c.rating} size="h-3.5 w-3.5" /><span className="text-cyan-300 font-normal text-xs">({c.reviews_count} ratings)</span></span>
            : <span className="text-xs font-mono text-slate-500 inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />New course</span>}
          <span className="inline-flex items-center gap-1.5 text-slate-300" data-testid="course-landing-students"><Users className="h-4 w-4" />{c.students.toLocaleString("en-IN")} students</span>
          <span className="inline-flex items-center gap-1.5 text-slate-300"><BarChart3 className="h-4 w-4" />{c.level}</span>
          <span className="inline-flex items-center gap-1.5 text-slate-300"><Clock className="h-4 w-4" />{Math.max(1, Math.round(c.minutes / 60))} h total</span>
        </div>
        <div className="text-sm mt-3">Created by <span className="text-cyan-300 font-bold" data-testid="course-landing-instructor">{c.instructor.name}</span>
          {c.updated_at && <span className="text-xs font-mono text-slate-500 ml-3">Last updated {c.updated_at.slice(0, 7)}</span>}</div>
        {!wide && <div className="mt-6">{card}</div>}
      </div>
    </div>);
}

export default function CourseLanding() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const [c, setC] = useState(null);
  const [pv, setPv] = useState({ open: false, id: null });
  const load = () => api.get(`/public/academy/courses/${id}`).then((r) => setC(r.data)).catch(() => setC(false));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  useEffect(() => { const o = sp.get("cf_order"); if (!o) return; api.get(`/payments/cashfree/${o}`).then((r) => { r.data.status === "PAID" ? toast.success("Payment confirmed — course unlocked") : toast.error(`Payment status: ${r.data.status}`); load(); }).catch(() => {}); setSp({}, { replace: true }); }, []); // eslint-disable-line
  if (c === false) return <div className="min-h-screen grid-bg"><PublicNav /><div className="py-24"><Empty text="Course not found" /></div></div>;
  if (!c) return <div className="min-h-screen grid-bg"><PublicNav /></div>;
  const preview = (lid) => setPv({ open: true, id: lid });
  return (
    <div className="min-h-screen grid-bg" data-testid="course-landing">
      <PublicNav />
      <div className="max-w-6xl mx-auto px-6 py-3"><FestivalBanner compact cta={false} /></div>
      <Hero c={c} card={<BuyCard c={c} reload={load} onPreview={() => preview(null)} />} />
      <div className="max-w-6xl mx-auto px-6">
        <div className="lg:pr-[400px] py-10 space-y-10">
          {c.outcomes?.length > 0 && <Glass className="p-6"><List title="What you'll learn" items={c.outcomes} testId="course-outcomes" /></Glass>}
          {!c.owned && <BundleOffers courseId={c.id} />}
          <Curriculum c={c} onPreview={preview} />
          <List title="Requirements" items={c.requirements} icon={false} testId="course-requirements" />
          {c.description && <section data-testid="course-description"><h2 className="text-xl font-bold mb-3">Description</h2><p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{c.description}</p></section>}
          <List title="Who this course is for" items={c.audience} icon={false} testId="course-audience" />
          <section data-testid="course-instructor"><h2 className="text-xl font-bold mb-3">Instructor</h2>
            <div className="flex gap-4 items-start"><span className="h-14 w-14 grid place-items-center bg-green-500/15 text-green-300 text-xl font-bold font-mono shrink-0">{c.instructor.name?.[0]}</span>
              <div><div className="font-bold text-cyan-300">{c.instructor.username ? <Link to={`/u/${c.instructor.username}`} className="hover:underline">{c.instructor.name}</Link> : c.instructor.name}</div>
                {c.instructor.headline && <div className="text-xs text-slate-400">{c.instructor.headline}</div>}
                {c.instructor.bio && <p className="text-sm text-slate-300 mt-2 whitespace-pre-line">{c.instructor.bio}</p>}</div></div></section>
          <Reviews c={c} reload={load} />
        </div>
      </div>
      <PreviewDialog c={c} open={pv.open} setOpen={(o) => setPv((x) => ({ ...x, open: o }))} current={pv.id} setCurrent={(lid) => setPv((x) => ({ ...x, id: lid }))} />
    </div>);
}
