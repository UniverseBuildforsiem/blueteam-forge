import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, Quote, Volume2, VolumeX } from "lucide-react";
import FeatureShowcase from "../components/FeatureShowcase";
import { CourseGrid } from "../components/CourseGrid";
import { useCourses } from "../lib/courses";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { api } from "../lib/api";
import { Glass, SeverityBadge } from "../components/common";
import PublicNav, { Footer } from "../components/PublicNav";

const FEED = [
  ["Critical", "SOC145", "Ransomware behavior on FS-01", "svch0st.exe", "12,000 files renamed to .lockd in 3 minutes and shadow copies deleted. Is the file server being encrypted?"],
  ["Medium", "SOC112", "Brute force: 240 x 4625 from 45.155.205.12", "VPN-GW-01", "240 failed VPN logins, then one success, from a hosting provider IP. Did the attacker get in?"],
  ["Medium", "SOC201", "Beacon to newly registered domain", "FIN-WS-07", "A finance workstation calls out to a 2-day-old domain every 60 seconds. C2 or harmless update check?"],
  ["High", "SOC151", "PSEXESVC installed on domain controller", "DC-01", "A marketing user installed a remote service on the domain controller. Lateral movement in progress?"],
  ["Low", "SOC134", "Scheduled task created by service account", "IT-SRV-02", "A patch service account created a daily task. Persistence, or approved IT change?"],
  ["High", "SOC101", "Macro spawned encoded PowerShell", "FIN-WS-07", "An invoice attachment launched hidden, encoded PowerShell. Trace the payload before it spreads."],
  ["Medium", "SOC177", "DMARC fail + lookalike sender domain", "MAIL-GW", "An 'overdue invoice' from a lookalike domain failed every email check. Phishing or false alarm?"],
];
const SEV_ORDER = ["Critical", "High", "Medium", "Low"];
const SEV_TEXT = { Critical: "text-red-400", High: "text-orange-400", Medium: "text-yellow-300", Low: "text-green-400" };

const CASE_FOR = { SOC145: "ch-rw-01", SOC112: "ch-bf-01", SOC201: "ch-phish-01", SOC151: "ch-lat-01", SOC134: "ch-mal-01", SOC101: "ch-phish-01", SOC177: "ch-phish-01" };

function ping() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(880, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.25);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.45);
  o.onended = () => ctx.close();
}

function SeverityCounters({ items, filter, setFilter }) {
  const counts = SEV_ORDER.map((s) => [s, items.filter((i) => i.f[0] === s).length]);
  return (
    <div className="grid grid-cols-4 border-b border-cyan-500/15" data-testid="alert-severity-counters">
      {counts.map(([s, c]) => (
        <button key={s} onClick={() => setFilter(filter === s ? null : s)} data-testid={`alert-filter-${s.toLowerCase()}`}
          className={`text-left px-3 py-2 border-r last:border-r-0 border-cyan-500/10 transition-colors ${filter === s ? "bg-cyan-500/10 shadow-[inset_0_-2px_0_#00F0FF]" : filter ? "opacity-60 hover:opacity-90" : "hover:bg-white/5"}`}>
          <div className={`text-lg font-mono font-bold ${SEV_TEXT[s]}`} data-testid={`alert-count-${s.toLowerCase()}`}>{c}</div>
          <div className="text-[10px] font-mono uppercase text-slate-500">{s}</div>
        </button>))}
    </div>
  );
}

function AlertPrompt({ alert, onClose }) {
  if (!alert) return null;
  const [sev, id, title, host, teaser] = alert;
  const remember = () => localStorage.setItem("pending_case", JSON.stringify({ id: CASE_FOR[id], at: Date.now() }));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-lg" data-testid="alert-signup-prompt">
        <DialogHeader>
          <div className="flex items-center gap-2"><SeverityBadge level={sev} /><span className="font-mono text-xs text-cyan-400">{id} · {host}</span></div>
          <DialogTitle className="font-mono text-xl mt-2">{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-300">{teaser}</p>
        <div className="bg-black/40 border-l-2 border-green-500/50 px-3 py-2 font-mono text-xs text-green-300">evidence locked · logs, sandbox report and intel waiting for an analyst</div>
        <div className="flex flex-wrap gap-3 mt-2">
          <Link to="/register" onClick={remember} className="glow-btn" data-testid="alert-prompt-signup">Investigate this alert <ArrowRight className="h-4 w-4" /></Link>
          <Link to="/login" onClick={remember} className="ghost-btn" data-testid="alert-prompt-login">I have an account</Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AlertFeed() {
  const [items, setItems] = useState(FEED.slice(0, 4).map((f, i) => ({ f, k: i })));
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState(null);
  const [sound, setSound] = useState(() => localStorage.getItem("alert_sound") === "on");
  const soundRef = useRef(sound);
  const n = useRef(4);
  const hold = paused || !!open;
  useEffect(() => { soundRef.current = sound; localStorage.setItem("alert_sound", sound ? "on" : "off"); }, [sound]);
  useEffect(() => {
    if (hold) return;
    const t = setInterval(() => {
      const f = FEED[n.current % FEED.length];
      setItems((s) => [{ f, k: n.current }, ...s].slice(0, 50));
      if (f[0] === "Critical" && soundRef.current) ping();
      n.current++;
    }, 2200);
    return () => clearInterval(t);
  }, [hold]);
  const shown = filter ? items.filter((i) => i.f[0] === filter) : items;
  return (
    <>
      <Glass className="relative scanlines overflow-hidden" data-testid="hero-alert-feed" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-cyan-500/15 font-mono text-xs text-slate-400">
          <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${hold ? "bg-yellow-400" : "bg-red-500 animate-pulse"}`} /> {hold ? "QUEUE PAUSED" : "LIVE ALERT QUEUE"}</span>
          <span className="flex items-center gap-3">
            <span data-testid="alert-feed-status" className="hidden sm:inline">{filter ? `filter: ${filter.toLowerCase()} · click again to clear` : hold ? "hover to read · click to investigate" : "siem://socpro-academy/queue"}</span>
            <button onClick={() => { setSound(!sound); if (!sound) ping(); }} title={sound ? "Mute critical alert ping" : "Ping on critical alerts"} data-testid="alert-sound-toggle"
              className={`flex items-center gap-1 px-2 py-0.5 border rounded-sm transition-colors ${sound ? "border-red-400/50 text-red-300" : "border-white/10 text-slate-500 hover:text-slate-300"}`}>
              {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}{sound ? "ON" : "MUTED"}
            </button>
          </span>
        </div>
        <SeverityCounters items={items} filter={filter} setFilter={setFilter} />
        <div className="p-3 space-y-2 min-h-[330px] max-h-[516px] overflow-y-auto" data-testid="hero-alert-feed-list">
          <AnimatePresence initial={false}>
            {shown.length === 0 && <div key="empty" className="text-center text-xs font-mono text-slate-500 py-10" data-testid="alert-filter-empty">// no {filter?.toLowerCase()} alerts yet — waiting for the next one</div>}
            {shown.map(({ f, k }) => (
              <motion.button key={k} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} onClick={() => setOpen(f)}
                data-testid={`hero-alert-${k}`}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 bg-black/30 border-l-2 border-cyan-500/40 font-mono text-xs hover:bg-cyan-500/10 hover:border-cyan-300 transition-colors cursor-pointer">
                <SeverityBadge level={f[0]} />
                <span className="text-cyan-400">{f[1]}</span>
                <span className="text-slate-200 truncate flex-1">{f[2]}</span>
                <span className="text-slate-500 hidden sm:block">{f[3]}</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
        <div className="px-4 py-3 border-t border-cyan-500/15 font-mono text-xs text-green-400 cursor-blink">analyst@socpro:~$ triage --next </div>
      </Glass>
      <AlertPrompt alert={open} onClose={() => setOpen(null)} />
    </>
  );
}

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
  const { courses } = useCourses();
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
          <p className="mt-6 text-slate-400 text-base max-w-xl">SOCProfessionals Academy drops you into a working SOC: a live alert queue, a SIEM full of noisy logs, a Kali shell with evidence and incidents that escalate. Learn by investigating.</p>
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
        <FeatureShowcase />
      </section>

      <section id="courses" className="max-w-7xl mx-auto px-6 pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div><div className="eyebrow mb-3">// self-paced courses · soc professionals</div><h2 className="text-3xl font-bold">Learn at your own pace.</h2>
            <p className="text-slate-400 text-sm mt-2 max-w-xl">Recorded courses, exam prep and ebooks. Then practise each skill in SOCProfessionals Academy labs.</p></div>
          <Link to="/courses" className="ghost-btn" data-testid="landing-courses-see-all">See all {courses.length} courses <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <CourseGrid courses={courses.slice(0, 8)} testId="landing-course-grid" />
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
