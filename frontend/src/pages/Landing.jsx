import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Search, Flag, FlaskConical, Award, CalendarClock, ArrowRight, Check, Quote } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { api } from "../lib/api";
import { Glass, SeverityBadge } from "../components/common";
import PublicNav, { Footer } from "../components/PublicNav";

const FEED = [
  ["Critical", "SOC145", "Ransomware behavior on FS-01", "svch0st.exe"],
  ["High", "SOC112", "Brute force: 240 x 4625 from 45.155.205.12", "VPN-GW-01"],
  ["Medium", "SOC201", "Beacon to newly registered domain", "FIN-WS-07"],
  ["High", "SOC151", "PSEXESVC installed on domain controller", "DC-01"],
  ["Low", "SOC134", "Scheduled task created by service account", "IT-SRV-02"],
  ["Critical", "SOC101", "Macro spawned encoded PowerShell", "FIN-WS-07"],
  ["Medium", "SOC177", "DMARC fail + lookalike sender domain", "MAIL-GW"],
];

function AlertFeed() {
  const [items, setItems] = useState(FEED.slice(0, 4).map((f, i) => ({ f, k: i })));
  useEffect(() => {
    let n = 4;
    const t = setInterval(() => { setItems((s) => [{ f: FEED[n % FEED.length], k: n }, ...s].slice(0, 5)); n++; }, 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <Glass className="relative scanlines overflow-hidden" data-testid="hero-alert-feed">
      <div className="flex items-center justify-between px-4 py-2 border-b border-cyan-500/15 font-mono text-xs text-slate-400">
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> LIVE ALERT QUEUE</span>
        <span>siem://socforge/queue</span>
      </div>
      <div className="p-3 space-y-2 min-h-[330px]">
        <AnimatePresence initial={false}>
          {items.map(({ f: [sev, id, title, host], k }) => (
            <motion.div key={k} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 px-3 py-2.5 bg-black/30 border-l-2 border-cyan-500/40 font-mono text-xs">
              <SeverityBadge level={sev} />
              <span className="text-cyan-400">{id}</span>
              <span className="text-slate-200 truncate flex-1">{title}</span>
              <span className="text-slate-500 hidden sm:block">{host}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="px-4 py-3 border-t border-cyan-500/15 font-mono text-xs text-green-400 cursor-blink">analyst@socforge:~$ triage --next </div>
    </Glass>
  );
}

const FEATURES = [
  [Terminal, "Kali terminal simulator", "A scripted in-browser shell with seeded evidence. grep, strings, base64, nmap, tshark, john — safe and offline."],
  [Search, "SIEM you can break", "Search 300+ realistic Windows, firewall, proxy, DNS and auth events. Histograms, field filters, saved searches, alerts."],
  [Flag, "Jeopardy CTF arena", "Log analysis, forensics, network, malware and web flags with hint economy and a live scoreboard."],
  [FlaskConical, "Scenario labs", "Multi-step incidents like Phishing to Ransomware. Investigate, answer, write the final report."],
  [CalendarClock, "Live sessions", "RSVP to instructor-led triage nights, join links, reminders and recordings."],
  [Award, "Verifiable certificates", "Finish a path, pass the exam at 70%, get a branded PDF with QR verification."],
];

const TESTIMONIALS = [
  ["Ananya R.", "Now SOC L1 @ MSSP", "The triage cases felt exactly like my first week on shift. I walked into the interview with real stories to tell."],
  ["Daniel K.", "Career switcher", "Breaking the SIEM simulator at 2am taught me more than three video courses combined."],
  ["Fatima Z.", "L2 Analyst", "The Phishing to Ransomware lab is the best kill-chain exercise I have used to train juniors."],
];

const PLANS = [
  ["Recruit", "Free", "Start learning", ["SOC Fundamentals path", "Weekly CTF flags", "Community leaderboard"]],
  ["Pro Monthly", "₹999/mo", "Most popular", ["All 5 learning paths", "All labs, SIEM & Kali simulators", "Live sessions + recordings", "Certificates with verification"]],
  ["Pro Yearly", "₹7,999/yr", "Save 33%", ["Everything in Pro", "Interview prep sessions", "Priority report grading"]],
];

const FAQ = [
  ["Do I need any prior security experience?", "No. SOC Fundamentals starts from how a SOC works and the core logs you will read every day."],
  ["Are the labs safe?", "Yes. Every terminal, SIEM and intel tool is a simulator driven by seeded data. No real network access, no real malware."],
  ["How do certificates work?", "Complete every lesson in a path and score at least 70% on its final exam. A PDF with a unique ID and QR code is generated instantly."],
  ["Can I pay with UPI?", "Yes, Pro plans support UPI, cards and netbanking through Indian payment gateways."],
];

export default function Landing() {
  const [paths, setPaths] = useState([]);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/public/paths").then((r) => setPaths(r.data)).catch(() => {});
    api.get("/public/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-[1.1fr_1fr] gap-14 items-center">
        <div className="rise">
          <div className="eyebrow mb-5">// blue team training ground</div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05]">Train on the alerts<br />real analysts <span className="neon-text">triage.</span></h1>
          <p className="mt-6 text-slate-400 text-base max-w-xl">SOCForge drops you into a working SOC: a live alert queue, a SIEM full of noisy logs, a Kali shell with evidence and incidents that escalate. Learn by investigating.</p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link to="/register" data-testid="hero-signup-button" className="glow-btn">Start free <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/catalog" data-testid="hero-catalog-button" className="ghost-btn">Browse paths</Link>
          </div>
        </div>
        <AlertFeed />
      </section>

      <section className="border-y border-cyan-500/10 bg-black/30">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6" data-testid="landing-stats">
          {[["Learners", stats?.learners], ["Hands-on labs", stats?.labs], ["Challenges & flags", stats?.challenges], ["Certificates issued", stats?.certificates]].map(([l, v]) => (
            <div key={l}><div className="text-3xl font-mono font-bold neon-green">{v ? v.toLocaleString() + "+" : "—"}</div><div className="text-xs text-slate-400 mt-1 font-mono uppercase">{l}</div></div>
          ))}
        </div>
      </section>

      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="eyebrow mb-3">// capabilities</div>
        <h2 className="text-3xl font-bold mb-12 max-w-xl">A full SOC, rendered in your browser.</h2>
        <div className="grid md:grid-cols-3 gap-px bg-cyan-500/10">
          {FEATURES.map(([I, t, d]) => (
            <div key={t} className="bg-[#0B0F1A] p-7 group hover:bg-[#0E1424] transition-colors">
              <I className="h-6 w-6 text-cyan-400 group-hover:text-green-400 transition-colors" />
              <h3 className="mt-5 font-bold">{t}</h3>
              <p className="mt-2 text-sm text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="paths" className="max-w-7xl mx-auto px-6 pb-24">
        <div className="flex items-end justify-between mb-10">
          <div><div className="eyebrow mb-3">// learning paths</div><h2 className="text-3xl font-bold">From recruit to elite.</h2></div>
          <Link to="/catalog" className="ghost-btn hidden sm:inline-flex" data-testid="paths-view-catalog">Full catalog</Link>
        </div>
        <div className="space-y-2">
          {paths.map((p, i) => (
            <div key={p.id} data-testid={`landing-path-${p.id}`} className="flex items-center gap-6 border-b border-cyan-500/10 py-5 group">
              <span className="font-mono text-slate-600 text-sm w-8">0{i + 1}</span>
              <span className="font-mono text-lg sm:text-xl font-bold group-hover:text-cyan-300 transition-colors flex-1">{p.title}</span>
              <span className="text-xs font-mono text-slate-500 hidden sm:block">{p.level}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-5">
        {TESTIMONIALS.map(([n, r, t]) => (
          <Glass key={n} className="p-6"><Quote className="h-5 w-5 text-green-400" /><p className="mt-4 text-sm text-slate-300">{t}</p>
            <div className="mt-5 font-mono text-sm">{n}</div><div className="text-xs text-slate-500">{r}</div></Glass>
        ))}
      </section>

      <section id="pricing" className="max-w-7xl mx-auto px-6 pb-24">
        <div className="eyebrow mb-3">// pricing</div>
        <h2 className="text-3xl font-bold mb-10">Pick your clearance level.</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map(([n, p, tag, f], i) => (
            <Glass key={n} className={`p-7 ${i === 1 ? "border-cyan-400/60 shadow-[0_0_40px_rgba(0,240,255,.12)]" : ""}`} data-testid={`pricing-plan-${i}`}>
              <div className="flex justify-between"><span className="font-mono font-bold">{n}</span><span className="text-[10px] font-mono uppercase text-green-400">{tag}</span></div>
              <div className="text-3xl font-mono font-bold mt-4 neon-text">{p}</div>
              <ul className="mt-6 space-y-2">{f.map((x) => <li key={x} className="text-sm text-slate-300 flex gap-2"><Check className="h-4 w-4 text-green-400 mt-0.5" />{x}</li>)}</ul>
              <Link to="/register" className={`${i === 1 ? "glow-btn" : "ghost-btn"} mt-8 w-full justify-center`} data-testid={`pricing-cta-${i}`}>Get started</Link>
            </Glass>
          ))}
        </div>
      </section>

      <section id="faq" className="max-w-3xl mx-auto px-6 pb-24">
        <div className="eyebrow mb-3">// faq</div>
        <Accordion type="single" collapsible>
          {FAQ.map(([q, a], i) => (
            <AccordionItem key={q} value={`f${i}`} className="border-cyan-500/15">
              <AccordionTrigger data-testid={`faq-item-${i}`} className="font-mono text-left">{q}</AccordionTrigger>
              <AccordionContent className="text-slate-400">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <Glass className="p-10 sm:p-14 flex flex-wrap items-center justify-between gap-6">
          <div><h2 className="text-2xl sm:text-3xl font-bold">Your first alert is waiting.</h2><p className="text-slate-400 mt-2">Create an account and triage it in under five minutes.</p></div>
          <Link to="/register" className="glow-btn" data-testid="footer-cta-signup">Create free account <ArrowRight className="h-4 w-4" /></Link>
        </Glass>
      </section>
      <Footer />
    </div>
  );
}
