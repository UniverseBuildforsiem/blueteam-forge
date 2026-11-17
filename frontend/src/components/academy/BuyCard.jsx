import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PlayCircle, FileText, ListChecks, Terminal, Flag, Download, Award, Infinity as Inf, BookMarked } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { payRazorpay, payCashfree } from "../../lib/pay";
import { Glass } from "../common";
import { VideoFrame } from "../VideoField";
import { embedSrc } from "../../lib/video";
import { PriceTag, Countdown, inr } from "./Price";
import { WishlistButton } from "./Wishlist";
import { GiftBox } from "./Gift";
import { useCampaign } from "../../lib/campaign";

function Includes({ c }) {
  const rows = [[PlayCircle, `${c.video_minutes >= 60 ? `${(c.video_minutes / 60).toFixed(1)} hours` : `${c.video_minutes} min`} on-demand video`, c.videos], [FileText, `${c.lessons_count} lessons in ${c.modules_count} modules`, c.lessons_count],
    [ListChecks, `${c.quizzes} quizzes`, c.quizzes], [Terminal, `${c.labs + c.challenges} hands-on labs & SOC scenarios`, c.labs + c.challenges], [Flag, `${c.ctfs} CTF challenges`, c.ctfs],
    [BookMarked, `${c.sops} SOP walkthroughs`, c.sops], [Download, `${c.resources} downloadable resources`, c.resources], [FileText, "Final exam", c.final_exam],
    [Inf, "Full lifetime access", 1], [Award, "Verifiable certificate of completion", 1]];
  return <div data-testid="course-includes"><div className="text-sm font-bold mb-2">This course includes:</div>
    <ul className="space-y-1.5">{rows.filter((r) => r[2]).map(([I, t]) => <li key={t} className="text-xs text-slate-300 flex items-center gap-2"><I className="h-3.5 w-3.5 text-cyan-400 shrink-0" />{t}</li>)}</ul></div>;
}

function Coupon({ deal, setDeal, tid = "academy", item, gift }) {
  const camp = useCampaign();
  const [code, setCode] = useState("");
  useEffect(() => { if (camp && !code) setCode(camp.coupon_code); }, [camp]); // eslint-disable-line
  const apply = async () => { try { const r = await api.post("/academy/coupons/check", { code: code.trim(), plan: item, gift: !!gift }); setDeal(r.data); toast.success(`Coupon applied — you save ${inr(r.data.off)}`); } catch (e) { setDeal(null); toast.error(errMsg(e)); } };
  return <div>
    <div className="flex gap-2"><input className="field font-mono uppercase !text-xs" placeholder="Coupon code" value={code} onChange={(e) => { setCode(e.target.value); setDeal(null); }} data-testid={`${tid}-coupon-input`} />
      <button className="ghost-btn !text-xs shrink-0" disabled={!code.trim()} onClick={apply} data-testid={`${tid}-coupon-apply`}>Apply</button></div>
    {deal && <div className="text-[11px] font-mono text-green-400 mt-1" data-testid={`${tid}-coupon-applied`}>{deal.code} applied · −{inr(deal.off)}</div>}</div>;
}

export function Checkout({ c, onPaid, item = `course:${c.id}`, label = `Course: ${c.title}`, coupons = true, gift, giftOk = true }) {
  const [cfg, setCfg] = useState(null);
  const [phone, setPhone] = useState("");
  const [deal, setDeal] = useState(null);
  useEffect(() => { api.get("/payments/config").then((r) => setCfg(r.data)).catch(() => {}); }, []);
  if (!cfg) return null;
  const extra = { ...(deal ? { coupon: deal.code } : {}), ...(gift ? { gift } : {}) };
  const ready = () => giftOk || (toast.error("Add the recipient's name and a valid email"), false);
  const rzp = () => ready() && payRazorpay(item, label, onPaid, (e) => toast.error(errMsg(e)), undefined, undefined, extra).catch((e) => toast.error(errMsg(e)));
  const cf = () => ready() && (/^\d{10}$/.test(phone) ? payCashfree(item, phone, cfg.cashfree_mode, undefined, extra).catch((e) => toast.error(errMsg(e))) : toast.error("Enter a 10-digit mobile number for Cashfree"));
  return <div className="space-y-2.5">
    {deal && <div className="text-xs font-mono">Pay now: <b className="text-green-400 text-base" data-testid="academy-final-price">{inr(deal.amount)}</b></div>}
    {coupons && <Coupon deal={deal} setDeal={setDeal} tid={gift ? "gift" : "academy"} item={item} gift={gift} />}
    {!cfg.razorpay && !cfg.cashfree && <div className="text-xs font-mono text-yellow-300 border border-yellow-500/30 p-2" data-testid="academy-pay-not-configured">Payments open soon.</div>}
    <button className="glow-btn w-full justify-center" disabled={!cfg.razorpay} onClick={rzp} data-testid={gift ? "gift-buy-razorpay" : "academy-buy-razorpay"}>{gift ? "Buy gift" : "Buy now"}</button>
    {cfg.cashfree && <><input className="field" placeholder="Mobile number (for Cashfree)" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="academy-phone" />
      <button className="ghost-btn w-full justify-center" onClick={cf} data-testid="academy-buy-cashfree">Pay with Cashfree / UPI</button></>}
  </div>;
}

export function EnrollButton({ c, className = "", testId, onDone }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); e.stopPropagation(); setBusy(true);
    try { await api.post(`/academy/courses/${c.id}/enroll`); toast.success("Enrolled! The course is now in My courses"); onDone ? onDone() : nav("/app/courses?tab=my"); } catch (er) { toast.error(errMsg(er)); setBusy(false); }
  };
  return <button className={`glow-btn ${className}`} disabled={busy} onClick={go} data-testid={testId}>{busy ? "Enrolling…" : "Enroll for free"}</button>;
}

function Action({ c, reload }) {
  const nav = useNavigate();
  if (c.owned) return <Link to={`/app/courses/${c.id}`} className="glow-btn w-full justify-center" data-testid="course-go-to-course">Go to course</Link>;
  if (!c.signed_in) return <button className="glow-btn w-full justify-center" data-testid="course-signin-to-enroll"
    onClick={() => { localStorage.setItem("pending_course", JSON.stringify({ id: c.id, at: Date.now() })); nav("/login"); }}>{c.price ? "Sign in to buy" : "Sign in to enroll free"}</button>;
  if (!c.price) return <EnrollButton c={c} className="w-full justify-center" testId="course-enroll-free" />;
  return <Checkout c={c} onPaid={() => { toast.success("Payment confirmed — find it in My courses"); nav("/app/courses?tab=my"); }} />;
}

export function BuyCard({ c, reload, onPreview }) {
  const src = embedSrc(c.promo_video);
  return (
    <Glass className="overflow-hidden lg:sticky lg:top-6" data-testid="course-buy-card">
      {src ? <div className="aspect-video border-b border-cyan-500/20"><VideoFrame src={src} title={`${c.title} — preview`} testId="course-promo-video" /></div>
        : c.cover ? <img src={c.cover} alt="" className="aspect-video w-full object-cover" /> : null}
      <div className="p-5 space-y-3">
        <PriceTag c={c} size="lg" testId="course-landing-price" />
        {c.sale_ends_at && <Countdown ends={c.sale_ends_at} onEnd={reload} />}
        <Action c={c} reload={reload} />
        {c.price > 0 && <GiftBox c={c} item={`course:${c.id}`} label={`Gift: ${c.title}`} price={c.price} />}
        <WishlistButton kind="course" id={c.id} on={c.wishlisted} signedIn={c.signed_in} hidden={c.owned} />
        {c.previews > 0 && <button className="ghost-btn w-full justify-center !text-xs" onClick={onPreview} data-testid="course-open-previews"><PlayCircle className="h-3.5 w-3.5" />Watch {c.previews} free preview{c.previews > 1 ? "s" : ""}</button>}
        <Includes c={c} />
      </div>
    </Glass>);
}
