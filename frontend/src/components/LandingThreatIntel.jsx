import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Radar, Globe2, Fingerprint, ShieldAlert, Network, ClipboardList, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, errMsg } from "../lib/api";
import { Glass } from "./common";
import IntelReport from "./intel/IntelReport";

const FEATURES = [
  [Network, "IP tracing", "Location, ISP, ASN, open ports, CVEs and ownership for any public IP."],
  [Fingerprint, "Malware hash & signatures", "VirusTotal detections, YARA matches, sandbox verdicts and code-signing info."],
  [Globe2, "Domain & URL checks", "DNS, WHOIS age, SSL certificates, subdomains and phishing blocklists."],
  [ShieldAlert, "Proxy, VPN & Tor finder", "Spot anonymised logins from proxies, data centres and Tor exit nodes."],
  [ClipboardList, "Bulk IOCs to tickets", "Paste an email or log, extract every indicator and turn findings into a ticket."],
];
const EXAMPLES = ["185.220.101.1", "microsoft.com", "44d88612fea8a8f36de82e1278abb02f"];

export default function LandingThreatIntel() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState(false);
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(null);
  const gid = () => { let g = localStorage.getItem("guest_id"); if (!g) { g = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem("guest_id", g); } return g; };
  useEffect(() => { if (user === false) api.get("/public/intel/guest", { params: { guest_id: gid() } }).then((x) => setLeft(x.data.remaining)).catch(() => {}); }, [user]);
  const go = async (v = q) => {
    const ioc = v.trim();
    if (!ioc || user === null) return;
    setQ(ioc);
    if (user) return nav(`/app/threat-intel?q=${encodeURIComponent(ioc)}`);
    localStorage.setItem("pending_intel", JSON.stringify({ q: ioc, at: Date.now() }));
    if (left === 0) return setAsk(true);
    setBusy(true); setR(null);
    try {
      const { data } = await api.post("/public/intel/lookup", { ioc, guest_id: gid() });
      setR(data); setLeft(data.remaining); localStorage.removeItem("pending_intel");
    } catch (e) {
      if (e.response?.status === 402) { setLeft(0); setAsk(true); } else { localStorage.removeItem("pending_intel"); toast.error(errMsg(e)); }
    } finally { setBusy(false); }
  };
  return (
    <section id="threat-intel" className="max-w-7xl mx-auto px-6 pb-24" data-testid="landing-threat-intel">
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 items-start">
        <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <div className="eyebrow mb-3">// threat intel platform</div>
          <h2 className="text-3xl font-bold max-w-xl">Investigate any IOC <span className="neon-text">in seconds.</span></h2>
          <p className="text-slate-400 mt-3 max-w-xl text-sm md:text-base">Live open-source intel feeds, VirusTotal, Shodan, WHOIS and blocklists in one search, scored and explained the way a SOC analyst needs it.</p>
          <Glass className="p-4 mt-6">
            <form onSubmit={(e) => { e.preventDefault(); go(); }} className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-black/40 border border-white/10 focus-within:border-cyan-400 px-3 rounded-sm">
                <Radar className="h-4 w-4 text-cyan-400" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setAsk(false); }} placeholder="IP, domain, URL or file hash" className="bg-transparent py-3 text-sm font-mono outline-none flex-1" data-testid="landing-intel-input" />
              </div>
              <button className="glow-btn" disabled={!q.trim() || busy} data-testid="landing-intel-submit">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy ? "Checking..." : "Investigate"} {!busy && <ArrowRight className="h-4 w-4" />}</button>
            </form>
            {user === false && left !== null && <div className="mt-3 text-[11px] font-mono" data-testid="landing-intel-left"><span className={left ? "text-green-400" : "text-amber-300"}>{left} of 3 free lookups left</span><span className="text-slate-500"> · no sign-up needed</span></div>}
            <div className="flex flex-wrap items-center gap-2 mt-3 text-xs"><span className="text-slate-500 font-mono">try:</span>
              {EXAMPLES.map((x) => <button key={x} onClick={() => go(x)} className="font-mono border border-white/10 px-2 py-1 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300 truncate max-w-[220px]" data-testid={`landing-intel-example-${x.slice(0, 12)}`}>{x}</button>)}</div>
            {ask && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 border-t border-white/10 pt-4 flex flex-wrap items-center gap-3" data-testid="landing-intel-auth">
              <span className="text-sm text-slate-300 flex-1">You've used your 3 free lookups. Log in or create a free account and your lookup for <code className="text-cyan-300">{q}</code> runs automatically.</span>
              <button className="ghost-btn !text-xs" onClick={() => nav("/login")} data-testid="landing-intel-login">Log in</button>
              <button className="glow-btn !text-xs" onClick={() => nav("/register")} data-testid="landing-intel-register">Sign up free</button>
            </motion.div>}
          </Glass>
        </motion.div>
        <div className="grid sm:grid-cols-2 gap-3">
          {FEATURES.map(([I, t, d], i) => (
            <motion.div key={t} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }} className={i === 4 ? "sm:col-span-2" : ""}>
              <Glass className="p-4 h-full transition-colors hover:border-cyan-500/40" data-testid={`landing-intel-feature-${i}`}>
                <I className="h-5 w-5 text-cyan-400" /><div className="font-bold text-sm mt-2">{t}</div><p className="text-xs text-slate-400 mt-1">{d}</p>
              </Glass>
            </motion.div>))}
        </div>
      </div>
      {r && <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-8" data-testid="landing-intel-result"><IntelReport r={r} />
        {left === 0 && <Glass className="p-4 mt-4 flex flex-wrap items-center gap-3 border-green-500/30"><span className="text-sm flex-1">That was your last free lookup. Sign up free for 150 lookups a day, VirusTotal results, bulk checks and history.</span>
          <button className="glow-btn !text-xs" onClick={() => nav("/register")} data-testid="landing-intel-result-register">Sign up free</button></Glass>}
      </motion.div>}
    </section>);
}
