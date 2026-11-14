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

function Includes({ c }) {
  const rows = [[PlayCircle, `${c.video_minutes >= 60 ? `${(c.video_minutes / 60).toFixed(1)} hours` : `${c.video_minutes} min`} on-demand video`, c.videos], [FileText, `${c.lessons_count} lessons in ${c.modules_count} modules`, c.lessons_count],
    [ListChecks, `${c.quizzes} quizzes`, c.quizzes], [Terminal, `${c.labs + c.challenges} hands-on labs & SOC scenarios`, c.labs + c.challenges], [Flag, `${c.ctfs} CTF challenges`, c.ctfs],
    [BookMarked, `${c.sops} SOP walkthroughs`, c.sops], [Download, `${c.resources} downloadable resources`, c.resources], [FileText, "Final exam", c.final_exam],
    [Inf, "Full lifetime access", 1], [Award, "Verifiable certificate of completion", 1]];
  return <div data-testid="course-includes"><div className="text-sm font-bold mb-2">This course includes:</div>
    <ul className="space-y-1.5">{rows.filter((r) => r[2]).map(([I, t]) => <li key={t} className="text-xs text-slate-300 flex items-center gap-2"><I className="h-3.5 w-3.5 text-cyan-400 shrink-0" />{t}</li>)}</ul></div>;
}

function Coupon({ c, deal, setDeal }) {
  const [code, setCode] = useState("");
  const apply = async () => { try { const r = await api.post("/academy/coupons/check", { code: code.trim(), course_id: c.id }); setDeal(r.data); toast.success(`Coupon applied — you save ${inr(r.data.off)}`); } catch (e) { setDeal(null); toast.error(errMsg(e)); } };
  return <div>
    <div className="flex gap-2"><input className="field font-mono uppercase !text-xs" placeholder="Coupon code" value={code} onChange={(e) => { setCode(e.target.value); setDeal(null); }} data-testid="academy-coupon-input" />
      <button className="ghost-btn !text-xs shrink-0" disabled={!code.trim()} onClick={apply} data-testid="academy-coupon-apply">Apply</button></div>
    {deal && <div className="text-[11px] font-mono text-green-400 mt-1" data-testid="academy-coupon-applied">{deal.code} applied · −{inr(deal.off)}</div>}</div>;
}

function Checkout({ c, onPaid }) {
  const [cfg, setCfg] = useState(null);
  const [phone, setPhone] = useState("");
  const [deal, setDeal] = useState(null);
  useEffect(() => { api.get("/payments/config").then((r) => setCfg(r.data)).catch(() => {}); }, []);
  if (!cfg) return null;
  const item = `course:${c.id}`;
  const rzp = () => payRazorpay(item, `Course: ${c.title}`, onPaid, (e) => toast.error(errMsg(e)), undefined, undefined, deal?.code).catch((e) => toast.error(errMsg(e)));
  const cf = () => (/^\d{10}$/.test(phone) ? payCashfree(item, phone, cfg.cashfree_mode, undefined, deal?.code).catch((e) => toast.error(errMsg(e))) : toast.error("Enter a 10-digit mobile number for Cashfree"));
  return <div className="space-y-2.5">
    {deal && <div className="text-xs font-mono">Pay now: <b className="text-green-400 text-base" data-testid="academy-final-price">{inr(deal.amount)}</b></div>}
    <Coupon c={c} deal={deal} setDeal={setDeal} />
    {!cfg.razorpay && !cfg.cashfree && <div className="text-xs font-mono text-yellow-300 border border-yellow-500/30 p-2" data-testid="academy-pay-not-configured">Payments open soon.</div>}
    <button className="glow-btn w-full justify-center" disabled={!cfg.razorpay} onClick={rzp} data-testid="academy-buy-razorpay">Buy now</button>
    {cfg.cashfree && <><input className="field" placeholder="Mobile number (for Cashfree)" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="academy-phone" />
      <button className="ghost-btn w-full justify-center" onClick={cf} data-testid="academy-buy-cashfree">Pay with Cashfree / UPI</button></>}
  </div>;
}

function Action({ c, reload }) {
  const nav = useNavigate();
  if (c.owned) return <Link to={`/app/courses/${c.id}`} className="glow-btn w-full justify-center" data-testid="course-go-to-course">Go to course</Link>;
  if (!c.signed_in) return <button className="glow-btn w-full justify-center" data-testid="course-signin-to-enroll"
    onClick={() => { localStorage.setItem("pending_course", JSON.stringify({ id: c.id, at: Date.now() })); nav("/login"); }}>{c.price ? "Sign in to buy" : "Sign in to enroll free"}</button>;
  return <Checkout c={c} onPaid={() => { toast.success("Payment confirmed — course unlocked"); reload(); }} />;
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
        {c.previews > 0 && <button className="ghost-btn w-full justify-center !text-xs" onClick={onPreview} data-testid="course-open-previews"><PlayCircle className="h-3.5 w-3.5" />Watch {c.previews} free preview{c.previews > 1 ? "s" : ""}</button>}
        <Includes c={c} />
      </div>
    </Glass>);
}
