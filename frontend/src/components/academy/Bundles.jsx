import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package } from "lucide-react";
import { api } from "../../lib/api";
import { Glass } from "../common";
import { inr } from "./Price";

export function BundleCard({ b }) {
  return (
    <Link to={`/bundle/${b.id}`} data-testid={`bundle-card-${b.id}`}>
      <Glass className="h-full p-5 hover:border-yellow-400/50 transition-colors flex flex-col">
        <div className="text-[11px] font-mono text-yellow-300 inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Bundle · {b.courses_count} courses</div>
        <div className="font-bold mt-2">{b.title}</div>
        <ul className="text-xs text-slate-400 mt-2 space-y-0.5 flex-1">{b.courses.map((c) => <li key={c.id} className="truncate">• {c.title}</li>)}</ul>
        <div className="mt-3 flex items-baseline gap-2 flex-wrap">
          {b.your_price ? <span className="font-mono font-bold neon-text" data-testid={`bundle-card-price-${b.id}`}>{inr(b.your_price)}</span> : <span className="font-mono text-green-400 text-sm">You own all of these</span>}
          {b.value > b.price && <span className="font-mono text-xs text-slate-500 line-through">{inr(b.value)}</span>}
          {b.off > 0 && <span className="font-mono text-[11px] text-yellow-300">save {b.off}%</span>}
        </div>
      </Glass></Link>);
}

export function BundleOffers({ courseId }) {
  const [bs, setBs] = useState([]);
  useEffect(() => { api.get("/public/academy/bundles", { params: { course_id: courseId } }).then((r) => setBs(r.data)).catch(() => {}); }, [courseId]);
  if (!bs.length) return null;
  return (
    <section data-testid="course-bundle-offers"><h2 className="text-xl font-bold mb-3">Save with a bundle</h2>
      <div className="grid sm:grid-cols-2 gap-3">{bs.map((b) => <BundleCard key={b.id} b={b} />)}</div></section>);
}
