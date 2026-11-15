import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Package, CheckCircle2, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import PublicNav from "../components/PublicNav";
import { Glass, Empty } from "../components/common";
import { Checkout } from "../components/academy/BuyCard";
import { WishlistButton } from "../components/academy/Wishlist";
import { GiftBox } from "../components/academy/Gift";
import { FestivalBanner } from "../components/FestivalBanner";
import { Countdown, PriceTag, inr } from "../components/academy/Price";

function BundleBuy({ b, reload }) {
  const nav = useNavigate();
  return (
    <Glass className="p-5 space-y-3 lg:sticky lg:top-6" data-testid="bundle-buy-card">
      {b.your_price ? <div><span className="text-3xl font-mono font-bold neon-text" data-testid="bundle-your-price">{inr(b.your_price)}</span>
        <span className="text-lg font-mono text-slate-500 line-through ml-2" data-testid="bundle-value">{inr(b.your_value)}</span>
        {b.your_off > 0 && <span className="text-yellow-300 font-mono ml-2" data-testid="bundle-off">{b.your_off}% off</span>}</div>
        : <div className="text-green-400 font-mono" data-testid="bundle-owned-all">You already own every course in this bundle.</div>}
      {b.regular && b.your_price > 0 && <div className="text-[11px] font-mono text-slate-400">Bundle price after the sale: {inr(b.owned_courses.length ? Math.max(1, Math.round((b.regular * b.your_value) / b.value)) : b.regular)}</div>}
      {b.owned_courses.length > 0 && b.your_price > 0 && <div className="text-[11px] font-mono text-green-400" data-testid="bundle-owned-note">Price lowered — you already own {b.owned_courses.length} of these courses, so you only pay for the rest (full bundle {inr(b.price)}).</div>}
      {b.sale_ends_at && <Countdown ends={b.sale_ends_at} onEnd={reload} />}
      {b.your_price > 0 && (b.signed_in ? <Checkout c={b} item={`bundle:${b.id}`} label={`Bundle: ${b.title}`} onPaid={() => { toast.success("Payment confirmed — all courses unlocked"); reload(); }} />
        : <button className="glow-btn w-full justify-center" onClick={() => { localStorage.setItem("pending_course", JSON.stringify({ id: b.id, kind: "bundle", at: Date.now() })); nav("/login"); }} data-testid="bundle-signin-to-buy">Sign in to buy</button>)}
      <GiftBox c={b} item={`bundle:${b.id}`} label={`Gift: ${b.title}`} price={b.price} />
      <WishlistButton kind="bundle" id={b.id} on={b.wishlisted} signedIn={b.signed_in} hidden={!b.your_price} />
    </Glass>);
}

export default function BundlePage() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const [b, setB] = useState(null);
  const load = () => api.get(`/public/academy/bundles/${id}`).then((r) => setB(r.data)).catch(() => setB(false));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  useEffect(() => { const o = sp.get("cf_order"); if (!o) return; api.get(`/payments/cashfree/${o}`).then((r) => { r.data.status === "PAID" ? toast.success("Payment confirmed — all courses unlocked") : toast.error(`Payment status: ${r.data.status}`); load(); }).catch(() => {}); setSp({}, { replace: true }); }, []); // eslint-disable-line
  if (b === false) return <div className="min-h-screen grid-bg"><PublicNav /><div className="py-24"><Empty text="Bundle not found" /></div></div>;
  if (!b) return <div className="min-h-screen grid-bg"><PublicNav /></div>;
  return (
    <div className="min-h-screen grid-bg" data-testid="bundle-page">
      <PublicNav />
      <div className="max-w-6xl mx-auto px-6 pt-4"><FestivalBanner compact cta={false} /></div>
      <div className="max-w-6xl mx-auto px-6 py-12 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
        <div>
          <div className="text-xs font-mono text-yellow-300 inline-flex items-center gap-1.5"><Package className="h-4 w-4" />Course bundle · {b.courses.length} courses</div>
          <h1 className="text-3xl sm:text-4xl font-bold mt-3" data-testid="bundle-title">{b.title}</h1>
          {b.subtitle && <p className="text-base md:text-lg text-slate-300 mt-3">{b.subtitle}</p>}
          {b.description && <p className="text-sm text-slate-400 mt-4 whitespace-pre-line">{b.description}</p>}
          <h2 className="text-xl font-bold mt-10 mb-3">Courses included</h2>
          <div className="space-y-3" data-testid="bundle-courses">{b.courses.map((c) => { const own = b.owned_courses.includes(c.id);
            return <Link key={c.id} to={`/course/${c.id}`} data-testid={`bundle-course-${c.id}`}>
              <Glass className="p-4 flex flex-wrap items-center gap-4 hover:border-cyan-400/50 transition-colors mb-3">
                {c.cover ? <img src={c.cover} alt="" className="h-16 w-28 object-cover" /> : <div className="h-16 w-28 bg-cyan-500/10 grid place-items-center"><Package className="h-6 w-6 text-cyan-400/60" /></div>}
                <div className="flex-1 min-w-[180px]"><div className="font-bold">{c.title}</div><div className="text-[11px] font-mono text-slate-500">{c.level} · {c.lessons_count} lessons · {c.instructor_name}</div>
                  <div className="text-[11px] font-mono text-slate-400 inline-flex items-center gap-1 mt-0.5"><Users className="h-3 w-3" />{c.reviews_count ? `${c.rating}★ (${c.reviews_count})` : "new"}</div></div>
                {own ? <span className="text-xs font-mono text-green-400 inline-flex items-center gap-1" data-testid={`bundle-course-owned-${c.id}`}><CheckCircle2 className="h-4 w-4" />Owned</span> : <PriceTag c={c} testId={`bundle-course-price-${c.id}`} />}
              </Glass></Link>; })}</div>
        </div>
        <BundleBuy b={b} reload={load} />
      </div>
    </div>);
}
