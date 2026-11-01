import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const IMG = "https://static.prod-images.emergentagent.com/jobs/19e1c124-b2d9-4563-9c5a-30ef0e507345/images/";
const ART = {
  "soc-fundamentals": "e5d3f9d7c0048857712fb5de16695ba7a7e5aefe7ff081ce52368adf4a9953f7.jpeg",
  "soc-l1": "e2cbfc2ac8d848e545da708ac87632b29006621b6809ca7353dcc08bc9278d24.jpeg",
  "soc-l2": "2836df60f7f04f044db858b2649587bbcfc1f5da5759e6c048134424c8419723.jpeg",
  "incident-response": "fdcdf963d001528a790d8d939e7c6a9f9a59c705393c56c53917af449fea88f5.jpeg",
  "interview-prep": "e976bc0122931f326c310dd9790a03fd0ba283d7f416a1c0133bb3a0beb93dea.jpeg",
};
const FALLBACK = ART["soc-fundamentals"];

function PathCard({ p, i }) {
  const big = i < 2;
  return (
    <motion.div initial={{ opacity: 0, y: 40, x: i % 2 ? 24 : -24 }} whileInView={{ opacity: 1, y: 0, x: 0 }} viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }} className={big ? "md:col-span-3" : "md:col-span-2"}>
      <Link to="/catalog" data-testid={`landing-path-${p.id}`} className={`path-card group relative block overflow-hidden rounded-sm border border-cyan-500/15 ${big ? "h-80" : "h-72"}`}>
        <img src={IMG + (ART[p.id] || FALLBACK)} alt={p.title} loading="lazy" className="path-img absolute inset-0 h-full w-full object-cover" style={{ animationDelay: `${-i * 3}s` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F1A] via-[#0B0F1A]/70 to-transparent" />
        <div className="path-scan pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-transparent via-cyan-400/15 to-transparent" />
        <span className="absolute top-4 left-4 font-mono text-xs bg-black/60 border border-cyan-500/30 text-cyan-300 px-2 py-0.5">0{i + 1}</span>
        <span className="absolute top-4 right-4 font-mono text-[11px] bg-black/60 border border-green-500/30 text-green-300 px-2 py-0.5" data-testid={`landing-path-level-${p.id}`}>{p.level}</span>
        <div className="absolute inset-x-0 bottom-0 p-6">
          <h3 className={`font-mono font-bold group-hover:text-cyan-300 transition-colors ${big ? "text-2xl" : "text-xl"}`}>{p.title}</h3>
          <p className="text-sm text-slate-300 mt-2 line-clamp-2 max-w-xl">{p.description}</p>
          <span className="inline-flex items-center gap-2 mt-3 text-xs font-mono text-green-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-300">Explore path <ArrowRight className="h-3.5 w-3.5" /></span>
        </div>
      </Link>
    </motion.div>);
}

export default function LandingPaths({ paths }) {
  return <div className="grid md:grid-cols-6 gap-5" data-testid="landing-paths-grid">{paths.map((p, i) => <PathCard key={p.id} p={p} i={i} />)}</div>;
}
