import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Gift, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import PublicNav from "../components/PublicNav";
import { Glass, Empty } from "../components/common";

export default function GiftPage() {
  const { code } = useParams();
  const nav = useNavigate();
  const [g, setG] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/public/gifts/${code}`).then((r) => setG(r.data)).catch(() => setG(false)); }, [code]);
  if (g === false) return <div className="min-h-screen grid-bg"><PublicNav /><div className="py-24"><Empty text="Gift not found" /></div></div>;
  if (!g) return <div className="min-h-screen grid-bg"><PublicNav /></div>;
  const redeem = async () => { setBusy(true); try { const { data } = await api.post(`/gifts/${code}/redeem`); toast.success("Gift redeemed — enjoy your course!"); nav(data.go); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const signin = () => { localStorage.setItem("pending_course", JSON.stringify({ id: code, kind: "gift", at: Date.now() })); nav("/login"); };
  const copy = () => navigator.clipboard.writeText(window.location.href).then(() => toast.success("Gift link copied"));
  return (
    <div className="min-h-screen grid-bg" data-testid="gift-page">
      <PublicNav />
      <div className="max-w-xl mx-auto px-6 py-16">
        <Glass className="p-8 text-center space-y-4 border-pink-400/30">
          <Gift className="h-12 w-12 text-pink-300 mx-auto" />
          <div className="eyebrow">a gift for {g.to_name}</div>
          <h1 className="text-3xl font-bold" data-testid="gift-title">{g.title}</h1>
          <p className="text-sm text-slate-400" data-testid="gift-from">from <b className="text-slate-200">{g.from_name}</b></p>
          {g.message && <blockquote className="text-sm text-slate-200 border-l-2 border-pink-400/60 pl-3 text-left whitespace-pre-line" data-testid="gift-message-view">“{g.message}”</blockquote>}
          {g.courses.length > 1 && <ul className="text-left text-sm text-slate-300 space-y-1" data-testid="gift-courses">{g.courses.map((t) => <li key={t}>• {t}</li>)}</ul>}
          {g.redeemed ? <div className="text-sm font-mono text-green-400 inline-flex items-center gap-2" data-testid="gift-redeemed"><CheckCircle2 className="h-4 w-4" />{g.redeemed_by_you ? <>Redeemed — <Link to="/app/courses" className="underline">go to your courses</Link></> : "This gift has already been redeemed."}</div>
            : g.owns_all ? <div className="space-y-3" data-testid="gift-owned"><p className="text-sm text-yellow-300">You already own this. Forward the gift link to a friend so they can redeem it.</p>
              <button className="glow-btn" onClick={copy} data-testid="gift-copy-link"><Copy className="h-4 w-4" />Copy gift link</button></div>
            : g.signed_in ? <button className="glow-btn w-full justify-center" disabled={busy} onClick={redeem} data-testid="gift-redeem">Redeem gift</button>
            : <button className="glow-btn w-full justify-center" onClick={signin} data-testid="gift-signin-to-redeem">Sign in or sign up to redeem</button>}
          <Link to={`/${g.kind}/${g.item_id}`} className="block text-xs font-mono text-cyan-300 hover:underline" data-testid="gift-view-item">See what's inside →</Link>
        </Glass>
      </div>
    </div>);
}
