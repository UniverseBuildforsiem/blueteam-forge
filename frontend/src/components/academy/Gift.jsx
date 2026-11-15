import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { Checkout } from "./BuyCard";
import { inr } from "./Price";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

function GiftForm({ g, setG }) {
  const up = (k) => (e) => setG({ ...g, [k]: e.target.value });
  return (
    <div className="space-y-2" data-testid="gift-form">
      <input className="field !text-xs" placeholder="Recipient's name" value={g.to_name} onChange={up("to_name")} data-testid="gift-to-name" />
      <input className="field !text-xs" type="email" placeholder="Recipient's email" value={g.to_email} onChange={up("to_email")} data-testid="gift-to-email" />
      <textarea className="field !text-xs h-16" maxLength={500} placeholder="Personal message (optional)" value={g.message} onChange={up("message")} data-testid="gift-message" />
      <label className="block text-[11px] font-mono text-slate-400">Deliver on (leave empty to send right after payment)
        <input type="date" min={today()} className="field !text-xs mt-1" value={g.date} onChange={up("date")} data-testid="gift-send-on" /></label>
    </div>);
}

export function GiftBox({ c, item, label, price, coupons = true }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [g, setG] = useState({ to_name: "", to_email: "", message: "", date: "" });
  if (!c.signed_in) return <button className="ghost-btn w-full justify-center !text-xs" data-testid="gift-signin"
    onClick={() => { localStorage.setItem("pending_course", JSON.stringify({ id: c.id, kind: item.split(":")[0], at: Date.now() })); nav("/login"); }}><Gift className="h-3.5 w-3.5" />Buy as a gift</button>;
  if (!open) return <button className="ghost-btn w-full justify-center !text-xs" onClick={() => setOpen(true)} data-testid="gift-open"><Gift className="h-3.5 w-3.5" />Buy as a gift</button>;
  const gift = { to_name: g.to_name.trim(), to_email: g.to_email.trim(), message: g.message.trim(), send_on: g.date && g.date > today() ? new Date(`${g.date}T08:00`).toISOString() : null };
  return (
    <div className="border border-pink-400/30 bg-pink-500/5 p-3 space-y-3" data-testid="gift-box">
      <div className="flex items-center text-xs font-bold"><Gift className="h-4 w-4 text-pink-300 mr-1.5" /><span className="flex-1">Gift this {item.startsWith("bundle") ? "bundle" : "course"} · {inr(price)}</span>
        <button className="text-[11px] font-mono text-slate-400 hover:text-slate-200" onClick={() => setOpen(false)} data-testid="gift-cancel">cancel</button></div>
      <GiftForm g={g} setG={setG} />
      <Checkout c={c} item={item} label={label} coupons={coupons} gift={gift} giftOk={!!gift.to_name && EMAIL.test(gift.to_email)}
        onPaid={() => { toast.success(gift.send_on ? `Gift scheduled for ${g.date}` : `Gift sent to ${gift.to_email}`); setOpen(false); nav("/app/courses?tab=gifts"); }} />
    </div>);
}
