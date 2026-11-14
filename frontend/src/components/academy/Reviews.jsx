import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { Glass } from "../common";

export function Stars({ value, size = "h-4 w-4", onPick, testId }) {
  return <span className="inline-flex gap-0.5" data-testid={testId}>{[1, 2, 3, 4, 5].map((i) => {
    const s = <Star className={`${size} ${i <= Math.round(value || 0) ? "fill-yellow-300 text-yellow-300" : "text-slate-600"}`} />;
    return onPick ? <button key={i} type="button" onClick={() => onPick(i)} data-testid={`${testId}-${i}`}>{s}</button> : <span key={i}>{s}</span>;
  })}</span>;
}

function ReviewForm({ c, onSaved }) {
  const [r, setR] = useState(c.my_review?.rating || 0);
  const [t, setT] = useState(c.my_review?.text || "");
  const save = async () => { try { await api.post(`/academy/courses/${c.id}/reviews`, { rating: r, text: t }); toast.success("Thanks for your review!"); onSaved(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Glass className="p-4 space-y-2" data-testid="review-form">
      <div className="text-sm font-bold">{c.my_review ? "Update your review" : "Rate this course"}</div>
      <Stars value={r} size="h-6 w-6" onPick={setR} testId="review-star" />
      <textarea className="field h-20 text-sm" placeholder="What did you think? (optional)" value={t} onChange={(e) => setT(e.target.value)} data-testid="review-text" />
      <button className="glow-btn !text-xs" disabled={!r} onClick={save} data-testid="review-submit">{c.my_review ? "Update review" : "Post review"}</button>
    </Glass>);
}

export function Reviews({ c, reload }) {
  return (
    <section data-testid="course-reviews">
      <h2 className="text-xl font-bold mb-3 flex items-center gap-3">Student reviews
        {c.rating && <span className="text-base font-mono text-yellow-300 inline-flex items-center gap-2" data-testid="reviews-avg"><Star className="h-4 w-4 fill-yellow-300" />{c.rating} course rating · {c.reviews_count} reviews</span>}</h2>
      {c.can_review && <div className="mb-4"><ReviewForm c={c} onSaved={reload} /></div>}
      {!c.reviews.length && <p className="text-sm text-slate-500" data-testid="reviews-empty">No reviews yet{c.owned ? " — be the first after your first lesson." : "."}</p>}
      <div className="grid md:grid-cols-2 gap-3">{c.reviews.map((r, i) => (
        <Glass key={i} className="p-4" data-testid={`review-${i}`}>
          <div className="flex items-center gap-3"><span className="h-9 w-9 grid place-items-center bg-cyan-500/15 text-cyan-300 font-bold font-mono">{r.name?.[0]}</span>
            <div><div className="text-sm font-bold">{r.name}</div><div className="flex items-center gap-2"><Stars value={r.rating} size="h-3 w-3" /><span className="text-[11px] font-mono text-slate-500">{r.at.slice(0, 10)}</span></div></div></div>
          {r.text && <p className="text-sm text-slate-300 mt-3 whitespace-pre-line">{r.text}</p>}
        </Glass>))}</div>
    </section>);
}
