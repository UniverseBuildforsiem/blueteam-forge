import { Link } from "react-router-dom";
import { Compass, Award, Clock, Video, FileText, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";

export const CONSULT_POINTS = [
  [Compass, "Find the right course", "Our experts help you pick the course that best fits your background and leads to your dream SOC job."],
  [Award, "Plan your certifications", "Clear guidance on EC-Council, CompTIA, OSCP, incident response and SIEM tool certifications — which to take first and why."],
  [Clock, "30 minutes, all your doubts", "A focused one-to-one session to clear every question about careers, skills and interviews."],
];
export const CONSULT_EXTRAS = [[Video, "1:1 live video call"], [FileText, "Personalised career roadmap"], [Sparkles, "Resume & interview tips"], [ShieldCheck, "Secure payment · instant confirmation"]];

export default function ConsultationPromo() {
  return (
    <section className="max-w-7xl mx-auto px-6 pb-24" data-testid="consultation-promo">
      <div className="glass rounded-sm p-8 sm:p-10 relative overflow-hidden border-l-2 border-l-green-400/70">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-green-500/10 blur-3xl pointer-events-none" />
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-10 items-center relative">
          <div>
            <div className="eyebrow mb-3">// 1:1 expert consultation</div>
            <h2 className="text-3xl font-bold">Book a Cyber & SOC Consultation with Our Experts</h2>
            <div className="grid sm:grid-cols-3 gap-4 mt-7">{CONSULT_POINTS.map(([I, t, d]) => (
              <div key={t} className="space-y-2"><I className="h-5 w-5 text-green-400" /><div className="font-bold text-sm">{t}</div><p className="text-xs text-slate-400 leading-relaxed">{d}</p></div>))}</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-7 text-xs font-mono text-slate-300">{CONSULT_EXTRAS.map(([I, t]) => <span key={t} className="inline-flex items-center gap-1.5"><I className="h-3.5 w-3.5 text-cyan-400" />{t}</span>)}</div>
          </div>
          <div className="text-center lg:text-left border border-green-500/25 bg-black/20 p-7 rounded-sm">
            <div className="text-xs font-mono uppercase text-slate-400">30-minute session</div>
            <div className="flex items-baseline gap-3 justify-center lg:justify-start mt-2 font-mono">
              <span className="text-5xl font-extrabold neon-green" data-testid="consult-price">₹99</span><span className="text-slate-500 line-through text-lg" data-testid="consult-mrp">₹999</span>
              <span className="text-xs bg-green-500 text-black font-bold px-2 py-0.5">90% OFF</span></div>
            <p className="text-xs text-slate-400 mt-3">Daily slots from 4 PM to 11 PM IST. Limited-time introductory price.</p>
            <Link to="/consultation" className="glow-btn mt-5 w-full justify-center" data-testid="consult-book-cta">Book your session <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </div>
    </section>);
}
