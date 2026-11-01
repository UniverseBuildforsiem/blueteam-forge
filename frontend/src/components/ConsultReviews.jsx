import { useEffect, useState } from "react";
import { Quote } from "lucide-react";
import { api } from "../lib/api";
import { Stars } from "../pages/ReviewPage";

export default function ConsultReviews() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/public/reviews").then((r) => setD(r.data)).catch(() => {}); }, []);
  if (!d?.reviews.length) return null;
  return (
    <section className="max-w-7xl mx-auto px-6 pb-24 -mt-12" data-testid="consult-reviews">
      <div className="flex flex-wrap items-baseline gap-3 mb-5"><div className="eyebrow !mb-0">// what learners say</div>
        <span className="text-sm font-mono text-yellow-200 inline-flex items-center gap-2" data-testid="consult-reviews-average"><Stars n={Math.round(d.average)} /> {d.average}/5 · {d.count} {d.count === 1 ? "review" : "reviews"}</span></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{d.reviews.map((r, i) => (
        <figure key={r.id} className="glass rounded-sm p-5 space-y-3 rise" style={{ animationDelay: `${i * 60}ms` }} data-testid={`consult-review-${i}`}>
          <div className="flex items-center justify-between"><Stars n={r.rating} /><Quote className="h-4 w-4 text-green-400/50" /></div>
          <blockquote className="text-sm text-slate-300 leading-relaxed">{r.comment}</blockquote>
          <figcaption className="text-xs font-mono text-slate-500"><span className="text-slate-200">{r.display_name}</span> · {r.topic}</figcaption>
        </figure>))}</div>
    </section>);
}
