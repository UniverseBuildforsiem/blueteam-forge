import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Award, Download, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";
import { api, API, errMsg, fmtDate } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Glass, PageHeader, Empty } from "../../components/common";

export function Certificates() {
  const [cs, setCs] = useState([]);
  useEffect(() => { api.get("/certificates/mine").then((r) => setCs(r.data)); }, []);
  return (
    <div>
      <PageHeader eyebrow="// credentials" title="Certificates" sub="Complete every lesson in a path and pass its final exam (70%+) to earn a certificate." />
      {cs.length ? <div className="grid md:grid-cols-2 gap-4">{cs.map((c) => (
        <Glass key={c.id} className="p-6" data-testid={`certificate-${c.id}`}>
          <Award className="h-7 w-7 text-green-400" /><div className="font-bold text-lg mt-3">{c.path_title}</div>
          <div className="text-xs font-mono text-slate-400 mt-1">{c.id} · {c.score}% · {c.issued_at.slice(0, 10)} · <span className={c.status === "valid" ? "text-green-400" : "text-red-400"}>{c.status}</span></div>
          <div className="flex gap-2 mt-5"><a href={`${API}/public/certificates/${c.id}/pdf`} target="_blank" rel="noreferrer" className="glow-btn" data-testid={`certificate-pdf-${c.id}`}><Download className="h-4 w-4" />PDF</a>
            <Link to={`/verify/${c.id}`} className="ghost-btn" data-testid={`certificate-verify-${c.id}`}><ExternalLink className="h-4 w-4" />Verify page</Link></div>
        </Glass>))}</div> : <Empty text="no certificates yet — finish a path to earn one" />}
    </div>
  );
}

const loadScript = (src) => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s); });

export function Billing() {
  const { user, refresh } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [pays, setPays] = useState([]);
  const [phone, setPhone] = useState("");
  const [sp] = useSearchParams();
  const load = () => { api.get("/payments/config").then((r) => setCfg(r.data)); api.get("/payments/mine").then((r) => setPays(r.data)); };
  useEffect(() => {
    load();
    const cf = sp.get("cf_order");
    if (cf) api.get(`/payments/cashfree/${cf}`).then((r) => { r.data.status === "PAID" ? toast.success("Payment confirmed — Pro unlocked") : toast.error(`Payment status: ${r.data.status}`); refresh(); load(); });
  }, []); // eslint-disable-line

  const payRazorpay = async (plan) => {
    try {
      await loadScript("https://checkout.razorpay.com/v1/checkout.js");
      const { data } = await api.post("/payments/razorpay/order", { plan });
      new window.Razorpay({ key: data.key_id, amount: data.amount, currency: "INR", order_id: data.order_id, name: "SOCForge", description: cfg.plans[plan].name,
        prefill: { name: data.name, email: data.email }, theme: { color: "#00F0FF" },
        handler: async (r) => { try { await api.post("/payments/razorpay/verify", r); toast.success("Payment verified — Pro unlocked"); refresh(); load(); } catch (e) { toast.error(errMsg(e)); } } }).open();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const payCashfree = async (plan) => {
    if (!/^\d{10}$/.test(phone)) return toast.error("Enter a 10-digit mobile number for Cashfree");
    try {
      const { data } = await api.post("/payments/cashfree/order", { plan, phone });
      const { load: loadCf } = await import("@cashfreepayments/cashfree-js");
      const cf = await loadCf({ mode: cfg.cashfree_mode });
      await cf.checkout({ paymentSessionId: data.payment_session_id, redirectTarget: "_self" });
    } catch (e) { toast.error(errMsg(e)); }
  };
  if (!cfg) return null;
  return (
    <div>
      <PageHeader eyebrow="// subscription" title="Billing" sub={`Current plan: ${user.plan === "pro" ? user.plan_name || "Pro" : "Free"}`} />
      {!cfg.razorpay && !cfg.cashfree && <Glass className="p-4 mb-4 text-sm text-yellow-300 font-mono" data-testid="billing-not-configured">Payments are not configured yet — the platform owner needs to add Razorpay or Cashfree keys.</Glass>}
      <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
        {Object.entries(cfg.plans).map(([k, p]) => (
          <Glass key={k} className="p-6" data-testid={`billing-plan-${k}`}>
            <div className="font-mono font-bold">{p.name}</div><div className="text-3xl font-mono neon-text mt-2">₹{p.amount.toLocaleString("en-IN")}</div>
            <ul className="mt-4 space-y-1 text-sm text-slate-300">{["All paths & labs", "Live sessions + recordings", "Priority grading"].map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-green-400" />{f}</li>)}</ul>
            {user.plan === "pro" ? <div className="mt-6 text-green-400 font-mono text-sm">✓ Active</div> : <div className="mt-6 space-y-2">
              <button className="glow-btn w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none" disabled={!cfg.razorpay} onClick={() => payRazorpay(k)} data-testid={`billing-razorpay-${k}`}>Pay with Razorpay</button>
              <button className="ghost-btn w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed" disabled={!cfg.cashfree} onClick={() => payCashfree(k)} data-testid={`billing-cashfree-${k}`}>Pay with Cashfree</button></div>}
          </Glass>))}
      </div>
      {user.plan !== "pro" && cfg.cashfree && <input className="field mt-4 max-w-xs" placeholder="Mobile (for Cashfree)" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="billing-phone-input" />}
      <div className="eyebrow mt-10 mb-3">payment history</div>
      <Glass className="divide-y divide-white/5 max-w-4xl">{pays.length ? pays.map((p) => <div key={p.id} className="p-3 flex justify-between text-sm font-mono"><span>{p.plan_name} · {p.provider}</span><span>₹{p.amount}</span><span className={p.status === "paid" ? "text-green-400" : "text-slate-500"}>{p.status}</span><span className="text-slate-500">{fmtDate(p.created_at)}</span></div>) : <Empty text="no payments" />}</Glass>
    </div>
  );
}
