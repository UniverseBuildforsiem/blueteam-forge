import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, MessageCircle, CalendarDays } from "lucide-react";
import PublicNav, { Footer } from "../components/PublicNav";
import { Glass } from "../components/common";
import { CONSULT_POINTS, CONSULT_EXTRAS } from "../components/ConsultationPromo";
import { useAuth } from "../context/AuthContext";
import { api, errMsg } from "../lib/api";
import { payRazorpay, payCashfree, waLink } from "../lib/pay";

const IST = { timeZone: "Asia/Kolkata" };
const dayLbl = (d) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { ...IST, weekday: "short", day: "numeric", month: "short" });
const tLbl = (iso) => new Date(iso).toLocaleTimeString("en-IN", { ...IST, hour: "numeric", minute: "2-digit" });

function SlotPicker({ days, slot, setSlot }) {
  const [day, setDay] = useState(days[0]?.date);
  const cur = days.find((d) => d.date === day) || days[0];
  if (!cur) return <div className="text-sm text-slate-400" data-testid="consult-no-slots">No slots available right now — please check back soon.</div>;
  return (<div className="space-y-4">
    <div className="flex gap-2 overflow-x-auto pb-1" data-testid="consult-days">{days.map((d, i) => <button key={d.date} onClick={() => setDay(d.date)} data-testid={`consult-day-${i}`}
      className={`shrink-0 px-3 py-2 text-xs font-mono border rounded-sm transition-colors ${d.date === cur.date ? "border-green-400 text-green-300 bg-green-500/10" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{dayLbl(d.date)}<div className="text-[10px] text-slate-500">{d.slots.filter((s) => s.free).length} free</div></button>)}</div>
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" data-testid="consult-slots">{cur.slots.map((s, i) => <button key={s.at} disabled={!s.free} onClick={() => setSlot(s.at)} data-testid={`consult-slot-${i}`}
      className={`px-2 py-2 text-sm font-mono border rounded-sm transition-colors ${slot === s.at ? "border-green-400 bg-green-500/15 text-green-200" : s.free ? "border-white/10 hover:border-green-400/50" : "border-white/5 text-slate-600 line-through cursor-not-allowed"}`}>{tLbl(s.at)}</button>)}</div>
  </div>);
}

function Booking({ info, cfg, onDone }) {
  const { user } = useAuth();
  const [slot, setSlot] = useState(null);
  const [f, setF] = useState({ topic: info.topics[0], phone: "", notes: "" });
  const [busy, setBusy] = useState("");
  const ready = slot && /^\d{10}$/.test(f.phone.replace(/\D/g, "").slice(-10)) && f.phone.replace(/\D/g, "").length >= 10;
  const pay = async (via) => {
    setBusy(via);
    try {
      const { data } = await api.post("/consultations/hold", { slot_at: slot, ...f });
      if (via === "razorpay") await payRazorpay("soc-consultation", `Consultation · ${data.when}`, () => onDone(data.when), (e) => toast.error(errMsg(e)), data.id);
      else await payCashfree("soc-consultation", f.phone.replace(/\D/g, "").slice(-10), cfg.cashfree_mode, data.id);
    } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  return (
    <Glass className="p-6 space-y-5" data-testid="consult-booking">
      <div className="font-bold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-green-400" />1 · Pick a 30-minute slot <span className="text-xs font-mono text-slate-500 font-normal">(IST)</span></div>
      <SlotPicker days={info.days} slot={slot} setSlot={setSlot} />
      <div className="font-bold">2 · Tell us about you</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <select className="field" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} data-testid="consult-topic">{info.topics.map((t) => <option key={t}>{t}</option>)}</select>
        <input className="field" type="tel" placeholder="Mobile / WhatsApp number" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="consult-phone" /></div>
      <textarea className="field h-20 text-sm" maxLength={1000} placeholder="What would you like to discuss? (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="consult-notes" />
      <div className="font-bold">3 · Pay ₹{info.price} <span className="text-slate-500 line-through font-mono text-sm ml-1">₹{info.mrp}</span></div>
      {!user ? <Link to="/login" state={{ from: "/consultation" }} className="glow-btn w-full justify-center" data-testid="consult-login">Log in or sign up to book</Link> : <>
        {cfg && !cfg.razorpay && !cfg.cashfree && <div className="text-xs font-mono text-yellow-300 border border-yellow-500/30 p-2" data-testid="consult-pay-not-configured">Online payments open soon. Message us on WhatsApp to book in the meantime.</div>}
        <div className="grid sm:grid-cols-2 gap-2">
          <button className="glow-btn justify-center disabled:opacity-40" disabled={!ready || !cfg?.razorpay || !!busy} onClick={() => pay("razorpay")} data-testid="consult-pay-razorpay">{busy === "razorpay" ? "Opening..." : `Pay ₹${info.price} with Razorpay`}</button>
          <button className="ghost-btn justify-center disabled:opacity-40" disabled={!ready || !cfg?.cashfree || !!busy} onClick={() => pay("cashfree")} data-testid="consult-pay-cashfree">{busy === "cashfree" ? "Opening..." : `Pay ₹${info.price} with Cashfree`}</button></div>
        {!ready && <p className="text-[11px] font-mono text-slate-500" data-testid="consult-ready-hint">pick a slot and enter a 10-digit mobile number to continue</p>}</>}
      <a href={waLink(info.whatsapp, "Hi SOCProfessionals, I'd like to book a Cyber & SOC consultation session.")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-green-300 hover:underline" data-testid="consult-whatsapp"><MessageCircle className="h-3.5 w-3.5" />Questions? Chat with us on WhatsApp</a>
    </Glass>);
}

export default function Consultation() {
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [done, setDone] = useState(null);
  const [sp] = useSearchParams();
  const load = () => api.get("/public/consultation").then((r) => setInfo(r.data));
  useEffect(() => {
    load(); api.get("/payments/config").then((r) => setCfg(r.data)).catch(() => {});
    const cf = sp.get("cf_order");
    if (cf && user) api.get(`/payments/cashfree/${cf}`).then((r) => (r.data.status === "PAID" ? setDone("your chosen slot") : toast.error(`Payment status: ${r.data.status}`))).catch(() => {});
  }, [user]); // eslint-disable-line
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <section className="max-w-7xl mx-auto px-6 pt-10 pb-20 grid lg:grid-cols-[1fr_1.15fr] gap-10">
        <div className="rise">
          <div className="eyebrow mb-4">// 1:1 expert consultation · 30 min</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold" data-testid="consult-title">Book a Cyber & SOC Consultation with Our Experts</h1>
          <div className="mt-5 flex items-baseline gap-3 font-mono"><span className="text-4xl font-bold neon-green">₹99</span><span className="text-slate-500 line-through">₹999</span><span className="text-xs bg-green-500 text-black font-bold px-2 py-0.5">90% OFF</span></div>
          <div className="space-y-5 mt-8">{CONSULT_POINTS.map(([I, t, d]) => <div key={t} className="flex gap-3"><I className="h-5 w-5 text-green-400 shrink-0 mt-0.5" /><div><div className="font-bold">{t}</div><p className="text-sm text-slate-400">{d}</p></div></div>)}</div>
          <div className="grid grid-cols-2 gap-3 mt-8 text-xs font-mono text-slate-300">{CONSULT_EXTRAS.map(([I, t]) => <span key={t} className="inline-flex items-center gap-1.5"><I className="h-3.5 w-3.5 text-cyan-400" />{t}</span>)}</div>
        </div>
        {done ? <Glass className="p-8 text-center space-y-3" data-testid="consult-success"><CheckCircle2 className="h-10 w-10 text-green-400 mx-auto" /><div className="text-xl font-bold">You're booked!</div>
          <p className="text-sm text-slate-300">Your consultation for {done} is confirmed. A confirmation email is on its way, and our expert will share the meeting link before the session.</p>
          <a href={waLink(info?.whatsapp || "919381203090", `Hi SOCProfessionals, I've booked a consultation for ${done}.`)} target="_blank" rel="noopener noreferrer" className="ghost-btn" data-testid="consult-success-whatsapp"><MessageCircle className="h-4 w-4" />Message us on WhatsApp</a></Glass>
          : info && <Booking info={info} cfg={cfg} onDone={(w) => { setDone(w); load(); }} />}
      </section>
      <Footer />
    </div>);
}
