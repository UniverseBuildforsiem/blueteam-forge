import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Unlock } from "lucide-react";
import { api, errMsg } from "../../lib/api";
import { payRazorpay, payCashfree } from "../../lib/pay";
import { Glass } from "../common";

const ITEM = "phish-sim";

export function PhishUnlock({ price, total, onPaid }) {
  const [sp, setSp] = useSearchParams();
  const [cfg, setCfg] = useState(null);
  const [phone, setPhone] = useState("");
  useEffect(() => { api.get("/payments/config").then((r) => setCfg(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    const cf = sp.get("cf_order");
    if (!cf) return;
    api.get(`/payments/cashfree/${cf}`).then((r) => { r.data.status === "PAID" ? toast.success("Payment confirmed. Every phishing case is unlocked!") : toast.error(`Payment status: ${r.data.status}`); onPaid(); });
    setSp({}, { replace: true });
  }, []); // eslint-disable-line
  const rzp = () => payRazorpay(ITEM, "Phishing Simulator - All Cases", () => { toast.success("Unlocked! Every phishing case is yours."); onPaid(); }, (e) => toast.error(errMsg(e))).catch((e) => toast.error(errMsg(e)));
  const cf = () => (/^\d{10}$/.test(phone) ? payCashfree(ITEM, phone, cfg.cashfree_mode).catch((e) => toast.error(errMsg(e))) : toast.error("Enter a 10-digit mobile number for Cashfree"));
  return <Glass className={`p-5 mb-6 grid md:grid-cols-[1fr_auto] gap-4 items-center ${sp.get("unlock") ? "border-cyan-400/60" : ""}`} data-testid="phish-unlock">
    <div><div className="font-bold flex items-center gap-2"><Unlock className="h-4 w-4 text-cyan-300" />Unlock all {total} investigation cases for <span className="text-cyan-300 font-mono">₹{price}</span></div>
      <p className="text-xs text-slate-400 mt-1">Learning pages and the OSINT toolkit stay free. The first 3 cases are free. One-time payment · lifetime access · included with Pro.</p></div>
    {!cfg ? <div className="h-10 w-48 bg-white/5 animate-pulse" /> : <div className="flex flex-wrap gap-2 items-center">
      {!cfg.razorpay && !cfg.cashfree && <span className="text-[11px] font-mono text-yellow-300" data-testid="phish-pay-not-configured">Payments open soon</span>}
      <button className="glow-btn !text-xs disabled:opacity-40" disabled={!cfg.razorpay} onClick={rzp} data-testid="phish-pay-razorpay">Unlock for ₹{price}</button>
      {cfg.cashfree && <><input className="field !w-40 !py-1.5 !text-xs" placeholder="Mobile (Cashfree)" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="phish-phone-input" />
        <button className="ghost-btn !text-xs" onClick={cf} data-testid="phish-pay-cashfree">Cashfree</button></>}
    </div>}
  </Glass>;
}
