import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Award, Download, ExternalLink, Check, Linkedin, UserRound, Copy, Briefcase } from "lucide-react";
import { Switch } from "../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { toast } from "sonner";
import { api, API, errMsg, fmtDate } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Glass, PageHeader, Empty } from "../../components/common";
import ChangePasswordCard from "../../components/ChangePasswordCard";

export function AccountSettings() {
  const { user } = useAuth();
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="// account" title="Account settings" sub={`Signed in as ${user.email} · ${user.role}`} />
      <ChangePasswordCard />
    </div>);
}

const linkedInUrl = (c) => {
  const d = new Date(c.issued_at);
  const q = new URLSearchParams({ startTask: "CERTIFICATION_NAME", name: `SOCProfessionals Academy — ${c.path_title}`, organizationName: "SOCProfessionals Academy", issueYear: d.getUTCFullYear(), issueMonth: d.getUTCMonth() + 1,
    certUrl: `${window.location.origin}/verify/${c.id}`, certId: c.id });
  return `https://www.linkedin.com/profile/add?${q.toString()}`;
};

function ProfileCard() {
  const { user, setUser } = useAuth();
  const on = user.public_profile !== false;
  const url = `${window.location.origin}/u/${user.username}`;
  const flip = async () => { const { data } = await api.patch("/me/profile-visibility", { public_profile: !on }); setUser({ ...user, ...data }); toast.success(data.public_profile ? "Profile is public" : "Profile is private"); };
  return (
    <Glass className="p-5 mb-6 flex flex-wrap items-center gap-4" data-testid="public-profile-card">
      <UserRound className="h-6 w-6 text-cyan-400" />
      <div className="flex-1 min-w-[220px]"><div className="font-bold">Public badge showcase</div>
        <div className="text-xs font-mono text-slate-400 break-all">{on ? url : "Private — only you can see your badges and certificates"}</div></div>
      <label className="flex items-center gap-2 text-xs font-mono text-slate-400"><Switch checked={on} onCheckedChange={flip} data-testid="public-profile-toggle" />{on ? "public" : "private"}</label>
      {on && <>
        <Link to={`/u/${user.username}`} className="ghost-btn !py-1.5 !text-xs" data-testid="public-profile-view"><ExternalLink className="h-3.5 w-3.5" />View</Link>
        <button className="ghost-btn !py-1.5 !text-xs" onClick={() => { navigator.clipboard.writeText(url); toast.success("Profile link copied"); }} data-testid="public-profile-copy"><Copy className="h-3.5 w-3.5" />Copy link</button></>}
    </Glass>
  );
}

function JobPrefsCard() {
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ open_to_work: !!user.open_to_work, location: user.location || "", work_mode: user.work_mode || "" });
  const save = async (next = f) => {
    try { const { data } = await api.patch("/me/job-prefs", next); setUser({ ...user, ...data }); toast.success(data.open_to_work ? "You're open to SOC roles — recruiters can contact you" : "Job preferences saved"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Glass className="p-5 mb-6 space-y-4" data-testid="job-prefs-card">
      <div className="flex flex-wrap items-center gap-4">
        <Briefcase className="h-6 w-6 text-green-400" />
        <div className="flex-1 min-w-[220px]"><div className="font-bold">Open to SOC roles</div>
          <div className="text-xs text-slate-400">Recruiters on the talent page can filter for you and send a contact request. Your email stays hidden; requests arrive in your inbox.</div></div>
        <Switch checked={f.open_to_work} onCheckedChange={(v) => { const n = { ...f, open_to_work: v }; setF(n); save(n); }} data-testid="job-open-toggle" />
      </div>
      {f.open_to_work && <div className="flex flex-wrap gap-2">
        <input className="field max-w-xs" placeholder="Preferred location, e.g. Bengaluru" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} data-testid="job-location-input" />
        <Select value={f.work_mode || "any"} onValueChange={(v) => setF({ ...f, work_mode: v === "any" ? "" : v })}>
          <SelectTrigger className="w-40 bg-black/40 border-cyan-500/20 text-sm" data-testid="job-mode-select"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#0B0F1A] border-cyan-500/30"><SelectItem value="any">Any work mode</SelectItem>{["Remote", "Hybrid", "On-site"].map((m) => <SelectItem key={m} value={m} data-testid={`job-mode-option-${m.toLowerCase()}`}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <button className="ghost-btn" onClick={() => save()} data-testid="job-prefs-save">Save</button>
      </div>}
      {f.open_to_work && user.public_profile === false && <div className="text-xs text-yellow-300 font-mono">Your profile is private, so recruiters can't find you. Make it public above.</div>}
    </Glass>
  );
}

export function Certificates() {
  const [cs, setCs] = useState([]);
  useEffect(() => { api.get("/certificates/mine").then((r) => setCs(r.data)); }, []);
  return (
    <div>
      <PageHeader eyebrow="// credentials" title="Certificates" sub="Complete every lesson in a path and pass its final exam (70%+) to earn a certificate." />
      <ProfileCard />
      <JobPrefsCard />
      {cs.length ? <div className="grid md:grid-cols-2 gap-4">{cs.map((c) => (
        <Glass key={c.id} className="p-6" data-testid={`certificate-${c.id}`}>
          <Award className="h-7 w-7 text-green-400" /><div className="font-bold text-lg mt-3">{c.path_title}</div>
          <div className="text-xs font-mono text-slate-400 mt-1">{c.id} · {c.score}% · {c.issued_at.slice(0, 10)} · <span className={c.status === "valid" ? "text-green-400" : "text-red-400"}>{c.status}</span></div>
          <div className="flex flex-wrap gap-2 mt-5"><a href={`${API}/public/certificates/${c.id}/pdf`} target="_blank" rel="noreferrer" className="glow-btn" data-testid={`certificate-pdf-${c.id}`}><Download className="h-4 w-4" />PDF</a>
            <Link to={`/verify/${c.id}`} className="ghost-btn" data-testid={`certificate-verify-${c.id}`}><ExternalLink className="h-4 w-4" />Verify page</Link>
            {c.status === "valid" && <a href={linkedInUrl(c)} target="_blank" rel="noreferrer" className="ghost-btn ghost-linkedin !text-[#7FB8F0] hover:!bg-[#0A66C2]/15" data-testid={`certificate-linkedin-${c.id}`}><Linkedin className="h-4 w-4" />Add to LinkedIn profile</a>}</div>
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
      new window.Razorpay({ key: data.key_id, amount: data.amount, currency: "INR", order_id: data.order_id, name: "SOCProfessionals Academy", description: cfg.plans[plan].name,
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
