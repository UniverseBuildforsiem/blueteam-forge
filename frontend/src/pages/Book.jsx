import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Download, PlayCircle, Lock, BookOpen, UserCheck } from "lucide-react";
import PublicNav, { Footer } from "../components/PublicNav";
import { Glass } from "../components/common";
import AnimatedBook, { LEARN, AUDIENCE, UDEMY_URL } from "../components/AnimatedBook";
import { useAuth } from "../context/AuthContext";
import { api, errMsg } from "../lib/api";
import { payRazorpay, payCashfree } from "../lib/pay";

const ITEM = "soc-interview-ebook";
const FILE = `${process.env.REACT_APP_BACKEND_URL}/api/me/book/file`;

function BuyBox({ cfg, onPaid }) {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  if (!user) return <Link to="/login" state={{ from: "/book" }} className="glow-btn w-full justify-center" data-testid="book-login-to-buy">Log in to buy</Link>;
  if (!cfg) return null;
  const none = !cfg.razorpay && !cfg.cashfree;
  const rzp = () => payRazorpay(ITEM, "SOC Interview Preparation - Ebook", onPaid, (e) => toast.error(errMsg(e))).catch((e) => toast.error(errMsg(e)));
  const cf = () => (/^\d{10}$/.test(phone) ? payCashfree(ITEM, phone, cfg.cashfree_mode).catch((e) => toast.error(errMsg(e))) : toast.error("Enter a 10-digit mobile number for Cashfree"));
  return (
    <div className="space-y-2.5">
      {none && <div className="text-xs font-mono text-yellow-300 border border-yellow-500/30 p-2" data-testid="book-pay-not-configured">Payments open soon. The store is waiting on its payment keys.</div>}
      <button className="glow-btn w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed" disabled={!cfg.razorpay} onClick={rzp} data-testid="book-pay-razorpay">Pay ₹973 with Razorpay</button>
      {cfg.cashfree && <input className="field w-full" placeholder="Mobile number (for Cashfree)" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="book-phone-input" />}
      <button className="ghost-btn w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed" disabled={!cfg.cashfree} onClick={cf} data-testid="book-pay-cashfree">Pay ₹973 with Cashfree</button>
      <p className="text-[11px] font-mono text-slate-500">Card, UPI and netbanking. Read online and download the PDF right after payment.</p>
    </div>
  );
}

const Reader = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => { api.get("/me/book").finally(() => setReady(true)); }, []);
  const go = async (q, tab) => { await api.get("/me/book").catch(() => {}); tab ? window.open(`${FILE}${q}`, "_blank", "noopener") : (window.location.href = `${FILE}${q}`); };
  return (
    <section className="max-w-7xl mx-auto px-6 pb-16" data-testid="book-reader">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-5 w-5 text-green-400" />Your ebook</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => go("", true)} className="ghost-btn" data-testid="book-open-tab">Open in new tab</button>
          <button onClick={() => go("?download=true")} className="glow-btn" data-testid="book-download"><Download className="h-4 w-4" />Download PDF</button>
        </div>
      </div>
      <p className="text-xs font-mono text-slate-500 mb-3 sm:hidden">On phones, tap "Open in new tab" to read the full book.</p>
      {ready && <iframe title="SOC Interview Preparation Ebook" src={FILE} className="w-full h-[80vh] border border-cyan-500/20 bg-white" data-testid="book-reader-frame" />}
    </section>
  );
};

const SampleBox = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <section className="max-w-7xl mx-auto px-6 pb-16" data-testid="book-sample">
      <Glass className="p-6 flex flex-wrap items-center gap-5">
        <img src="/book/page1.jpg" alt="Sample page" className="h-24 w-auto border border-white/10 shadow-lg" />
        <div className="flex-1 min-w-[220px]">
          <div className="eyebrow">// free sample</div>
          <h2 className="text-xl font-bold mt-1">Read the first 10 pages free</h2>
          <p className="text-sm text-slate-400">{user ? "See how the questions and answers are laid out before you buy." : "Create a free account to read the sample. No payment needed."}</p>
        </div>
        {user ? <button className="ghost-btn" onClick={async () => { if (!open) await api.get("/me/book").catch(() => {}); setOpen(!open); }} data-testid="book-sample-toggle">{open ? "Hide sample" : "Read free sample"}</button>
          : <div className="flex gap-2"><Link to="/register" className="glow-btn" data-testid="book-sample-signup">Sign up free</Link><Link to="/login" state={{ from: "/book" }} className="ghost-btn" data-testid="book-sample-login">Log in</Link></div>}
      </Glass>
      {user && open && <SampleViewer />}
    </section>
  );
};

function SampleViewer() {
  const [n, setN] = useState(1);
  const [srcs, setSrcs] = useState({});
  const [nudge, setNudge] = useState(false);
  useEffect(() => { const t = setTimeout(() => setNudge(true), 180000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (n === 10) setNudge(true);
    [n, n + 1].filter((p) => p <= 10 && !srcs[p]).forEach((p) =>
      api.get(`/me/book/sample/${p}.jpg`, { responseType: "blob" }).then((r) => setSrcs((s) => ({ ...s, [p]: URL.createObjectURL(r.data) }))).catch(() => {}));
  }, [n]); // eslint-disable-line
  return (
    <div className="mt-4" data-testid="book-sample-viewer">
      <div className="flex items-center justify-center gap-4 mb-3 font-mono text-sm">
        <button className="ghost-btn !py-1.5" disabled={n === 1} onClick={() => setN(n - 1)} data-testid="sample-prev">Previous</button>
        <span data-testid="sample-page">Page {n} of 10</span>
        <button className="ghost-btn !py-1.5" disabled={n === 10} onClick={() => setN(n + 1)} data-testid="sample-next">Next</button>
      </div>
      <div className="grid place-items-center">
        {srcs[n] ? <img src={srcs[n]} alt={`Sample page ${n}`} className="max-h-[78vh] w-auto border border-white/10 shadow-2xl bg-white" data-testid="sample-page-image" />
          : <div className="h-[60vh] grid place-items-center font-mono text-cyan-400 cursor-blink">loading page </div>}
      </div>
      {nudge && (
        <div className="sticky bottom-4 mt-6 glass border border-orange-400/50 p-5 flex flex-wrap items-center gap-4 shadow-[0_0_40px_rgba(251,146,60,.2)]" data-testid="sample-nudge">
          <img src="/book/cover.jpg" alt="" className="h-16 w-auto" />
          <div className="flex-1 min-w-[200px]"><div className="font-bold text-lg">Keep reading, unlock the other 158 pages</div>
            <p className="text-sm text-slate-400">Get the full book plus unlimited AI mock interviews for ₹973 <span className="line-through">₹2,999</span>.</p></div>
          <button className="glow-btn" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} data-testid="sample-nudge-buy">Unlock the full book</button>
          <button className="text-slate-500 text-xs font-mono hover:text-slate-300" onClick={() => setNudge(false)} data-testid="sample-nudge-dismiss">later</button>
        </div>)}
    </div>
  );
}


export default function Book() {
  const { user } = useAuth();
  const [owned, setOwned] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [sp] = useSearchParams();
  const check = () => user && api.get("/me/book").then((r) => setOwned(r.data.owned)).catch(() => {});
  useEffect(() => {
    api.get("/payments/config").then((r) => setCfg(r.data)).catch(() => {});
    check();
    const cf = sp.get("cf_order");
    if (cf && user) api.get(`/payments/cashfree/${cf}`).then((r) => { r.data.status === "PAID" ? toast.success("Payment confirmed. Enjoy the book!") : toast.error(`Payment status: ${r.data.status}`); check(); });
  }, [user]); // eslint-disable-line
  const paid = () => { toast.success("Payment verified. Enjoy the book!"); check(); };
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <section className="max-w-7xl mx-auto px-6 pt-10 pb-16 grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
        <AnimatedBook size="lg" />
        <div className="rise">
          <div className="eyebrow mb-4">// ebook · 168 pages · pdf</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold" data-testid="book-title">SOC Interview Preparation - Ebook</h1>
          <p className="mt-4 text-slate-300 text-lg">SOC Interview preparation with 100+ Questions and Answers from 200+ interviews experience.</p>
          <p className="mt-2 text-sm text-cyan-300 font-mono" data-testid="book-interview-included">+ Includes unlimited 30-question AI-marked mock interviews</p>
          <div className="mt-6 flex flex-wrap items-baseline gap-3 font-mono">
            <span className="text-4xl font-bold neon-green" data-testid="book-price">₹973</span><span className="text-slate-500 line-through" data-testid="book-mrp">₹2,999</span>
            <span className="text-xs bg-green-500 text-black font-bold px-2 py-0.5">67% OFF</span>
          </div>
          <Glass className="p-5 mt-6 max-w-md">
            {owned ? <div className="space-y-3"><div className="flex items-center gap-2 text-green-300 font-mono text-sm" data-testid="book-owned"><Check className="h-4 w-4" />You own this ebook. Read or download it below.</div>
              <Link to="/app/interview" className="ghost-btn" data-testid="book-start-interview">Start an AI mock interview</Link></div>
              : <><div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-3"><Lock className="h-3.5 w-3.5" />Reading and download unlock after payment</div><BuyBox cfg={cfg} onPaid={paid} /></>}
          </Glass>
          <a href={UDEMY_URL} target="_blank" rel="noopener noreferrer" className="ghost-btn mt-4" data-testid="book-udemy-link"><PlayCircle className="h-4 w-4" />Prefer video? Get the same course on Udemy</a>
        </div>
      </section>
      {owned ? <Reader /> : <SampleBox />}
      <section className="max-w-7xl mx-auto px-6 pb-16 grid lg:grid-cols-[1.4fr_1fr] gap-8">
        <Glass className="p-7" data-testid="book-learn">
          <h2 className="text-xl font-bold mb-5">What You'll Learn</h2>
          <ul className="grid sm:grid-cols-2 gap-3">{LEARN.map((t) => <li key={t} className="flex gap-2 text-sm text-slate-300"><Check className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />{t}</li>)}</ul>
        </Glass>
        <div className="space-y-6">
          <Glass className="p-7" data-testid="book-audience">
            <h2 className="text-xl font-bold mb-5">Who This Course Is For</h2>
            <ul className="space-y-3">{AUDIENCE.map((t) => <li key={t} className="flex gap-2 text-sm text-slate-300"><UserCheck className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />{t}</li>)}</ul>
          </Glass>
          <Glass className="p-7" data-testid="book-author">
            <p className="text-sm text-slate-300">This course is not just theory. It's designed from the ground up by <span className="font-bold text-white">Gopi Pakanati</span>, a seasoned SOC professional with 10+ years of experience handling real-time threats, incidents, and investigations across global enterprises.</p>
            <p className="text-sm text-slate-400 mt-3">Get ready to ace your interview and walk into your next role with confidence. Enroll now and start mastering the real SOC world.</p>
          </Glass>
        </div>
      </section>
      <Footer />
    </div>
  );
}
