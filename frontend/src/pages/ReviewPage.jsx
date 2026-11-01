import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { Star, CheckCircle2 } from "lucide-react";
import PublicNav, { Footer } from "../components/PublicNav";
import { Glass } from "../components/common";
import { api, errMsg } from "../lib/api";

export const Stars = ({ n, size = "h-4 w-4" }) => <span className="inline-flex gap-0.5" aria-label={`${n} out of 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`${size} ${i <= n ? "fill-yellow-300 text-yellow-300" : "text-slate-600"}`} />)}</span>;
const LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export default function ReviewPage() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/public/reviews/${token}`).then((r) => { setD(r.data); if (r.data.review) { setRating(r.data.review.rating); setComment(r.data.review.comment); } }).catch((e) => setErr(errMsg(e))); }, [token]);
  const submit = async () => { setBusy(true); try { await api.post(`/public/reviews/${token}`, { rating, comment }); setDone(true); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <section className="max-w-xl mx-auto px-6 py-16">
        {err ? <Glass className="p-8 text-center text-slate-300" data-testid="review-error">{err}</Glass> : !d ? null : done ? (
          <Glass className="p-8 text-center space-y-3" data-testid="review-success"><CheckCircle2 className="h-10 w-10 text-green-400 mx-auto" /><div className="text-xl font-bold">Thank you, {d.name}!</div>
            <p className="text-sm text-slate-400">Your feedback helps other learners choose with confidence.</p><Link to="/" className="ghost-btn">Back to home</Link></Glass>
        ) : (
          <Glass className="p-8 space-y-5" data-testid="review-form">
            <div className="eyebrow">// rate your consultation</div>
            <h1 className="text-2xl font-bold">How was your session, {d.name}?</h1>
            <p className="text-xs font-mono text-slate-500">{d.when} · {d.topic}</p>
            <div className="flex items-center gap-3" onMouseLeave={() => setHover(0)}>{[1, 2, 3, 4, 5].map((i) => (
              <button key={i} onMouseEnter={() => setHover(i)} onClick={() => setRating(i)} data-testid={`review-star-${i}`} className="transition-transform hover:scale-110">
                <Star className={`h-9 w-9 ${i <= (hover || rating) ? "fill-yellow-300 text-yellow-300" : "text-slate-600"}`} /></button>))}
              <span className="text-sm font-mono text-yellow-200 w-20" data-testid="review-label">{LABELS[hover || rating]}</span></div>
            <textarea className="field h-28 text-sm" maxLength={600} placeholder="What did you find most useful? (shown on our website with your first name and last initial)" value={comment} onChange={(e) => setComment(e.target.value)} data-testid="review-comment" />
            <button className="glow-btn w-full justify-center" disabled={!rating || busy} onClick={submit} data-testid="review-submit">{busy ? "Sending..." : d.review ? "Update review" : "Submit review"}</button>
          </Glass>)}
      </section>
      <Footer />
    </div>);
}
