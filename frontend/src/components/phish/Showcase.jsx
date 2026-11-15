import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Fingerprint, FlaskConical, ListChecks, Radar } from "lucide-react";
import { RadarScope, Legend, GROUP_COLOR } from "./Radar";
import { api } from "../../lib/api";

const DOTS = [[30, 38, "email"], [64, 28, "mobile"], [72, 66, "web"], [40, 72, "social"], [54, 46, "email"], [22, 58, "web"]];

export function PhishShowcase() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/public/phish").then((r) => setD(r.data)).catch(() => {}); }, []);
  if (!d) return null;
  return <section className="relative max-w-7xl mx-auto px-6 pb-24" data-testid="landing-phish">
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
      <div>
        <div className="eyebrow mb-3">// phishing simulator</div>
        <h2 className="text-3xl font-bold">Investigate phishing like a <span className="neon-text">Tier-1 analyst</span>.</h2>
        <p className="text-slate-400 mt-4 text-sm md:text-base">{d.types.length} phishing techniques and {d.total_cases} hands-on cases. Read the headers, pin evidence, run links and attachments in a safe sandbox, choose a verdict and respond against an SLA.</p>
        <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
          {[[Fingerprint, "SPF, DKIM and DMARC chips, Received-hop timelines and lookalike-domain highlighting"], [FlaskConical, "Simulated URL and attachment sandbox, with no live network calls"], [ListChecks, "Response actions with real consequences, then a scored debrief"], [Radar, "Real OSINT toolkit: header analyser, URL expander, QR decoder, lookalike finder"]].map(([I, t]) => <li key={t} className="flex gap-2.5"><I className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />{t}</li>)}
        </ul>
        <div className="flex flex-wrap items-center gap-4 mt-8">
          <Link to="/app/phishing" className="glow-btn" data-testid="landing-phish-cta">Open the simulator <ArrowRight className="h-4 w-4" /></Link>
          <span className="text-sm font-mono text-slate-400" data-testid="landing-phish-offer"><span className="text-green-400">{d.free_count} free cases</span> · all {d.total_cases} for <span className="text-cyan-300 text-lg">₹{d.price}</span></span>
        </div>
      </div>
      <div className="space-y-4">
        <div className="max-w-sm mx-auto"><RadarScope>{DOTS.map(([x, y, g], i) => <span key={i} className="absolute h-2.5 w-2.5 rounded-full -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%`, background: GROUP_COLOR[g], boxShadow: `0 0 10px ${GROUP_COLOR[g]}` }} />)}</RadarScope></div>
        <Legend groups={d.groups} className="justify-center" />
        <div className="flex flex-wrap justify-center gap-1.5" data-testid="landing-phish-types">{d.types.map((t) => <span key={t.id} className="text-[11px] font-mono border px-2 py-0.5 text-slate-300" style={{ borderColor: `${GROUP_COLOR[t.group]}55` }}>{t.name}</span>)}</div>
      </div>
    </div>
  </section>;
}
