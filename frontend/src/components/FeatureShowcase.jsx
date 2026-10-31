import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Search, Flag, FlaskConical, Award, CalendarClock, Flame, Wrench, Radar, Users, ArrowRight, Check, Linkedin, QrCode, MapPin } from "lucide-react";
import { Glass } from "./common";

const Row = ({ c = "text-slate-300", children }) => <div className={`font-mono text-xs ${c}`}>{children}</div>;

const KaliPreview = () => (
  <div className="space-y-1.5">
    <Row c="text-green-400">analyst@kali:~/case-145$ grep -i "vssadmin" evidence/sysmon.log | head -2</Row>
    <Row>2026-06-14 02:13:07 FS-01 vssadmin.exe delete shadows /all /quiet</Row>
    <Row>2026-06-14 02:13:09 FS-01 svch0st.exe → \\FS-01\share\*.lockd</Row>
    <Row c="text-green-400">analyst@kali:~/case-145$ echo "aHR0cDovL3BheTJ1bmxvY2sudG9w" | base64 -d</Row>
    <Row c="text-yellow-300">http://pay2unlock.top</Row>
    <Row c="text-green-400 cursor-blink">analyst@kali:~/case-145$ </Row>
  </div>
);

const SiemPreview = () => (
  <div>
    <Row c="text-cyan-300 border border-cyan-500/30 bg-black/40 px-2 py-1.5">index=win EventCode=4625 | stats count by src_ip</Row>
    <div className="flex items-end gap-1 h-20 mt-4">{[3, 5, 4, 8, 6, 14, 22, 30, 18, 9, 6, 4, 3, 5].map((h, i) => <div key={i} className={`flex-1 ${h > 15 ? "bg-red-400/70" : "bg-cyan-400/50"}`} style={{ height: `${h * 3}%` }} />)}</div>
    <div className="mt-3 space-y-1">{[["45.155.205.12", 240, "text-red-400"], ["10.0.4.18", 6, "text-slate-300"], ["10.0.2.77", 3, "text-slate-300"]].map(([ip, n, c]) => <Row key={ip} c={`flex justify-between ${c}`}><span>{ip}</span><span>{n}</span></Row>)}</div>
  </div>
);

const CtfPreview = () => (
  <div>
    {[["1", "n0ctis", 2450], ["2", "blueowl", 2210], ["3", "you", 1980]].map(([r, n, p]) => <Row key={n} c={`flex justify-between py-1.5 border-b border-white/5 ${n === "you" ? "text-green-400" : ""}`}><span>#{r} {n}</span><span>{p} pts</span></Row>)}
    <Row c="mt-4 border border-green-500/40 bg-green-500/10 text-green-300 px-2 py-1.5">flag&#123;dns_tunnel_exfil&#125; · correct · +300</Row>
  </div>
);

const LabPreview = () => (
  <div className="space-y-2">
    {[["Identify the phishing sender", 1], ["Find the dropped payload hash", 1], ["Trace lateral movement to DC-01", 0], ["Write the final incident report", 0]].map(([t, d], i) => (
      <Row key={t} c={`flex items-center gap-2 ${d ? "text-green-300" : "text-slate-400"}`}><span className={`h-4 w-4 grid place-items-center border ${d ? "border-green-400 bg-green-400/20" : "border-white/20"}`}>{d ? <Check className="h-3 w-3" /> : i + 1}</span>{t}</Row>))}
    <div className="h-1.5 bg-white/5 mt-4"><div className="h-full w-1/2 bg-gradient-to-r from-cyan-400 to-green-400" /></div>
  </div>
);

const DrillPreview = () => (
  <div>
    <div className="flex items-center gap-3"><Flame className="h-8 w-8 text-orange-400" /><div><div className="text-2xl font-mono font-bold">12 days</div><Row c="text-slate-500">drill streak · 1 freeze held</Row></div></div>
    <div className="grid grid-cols-7 gap-1.5 mt-4">{Array.from({ length: 14 }).map((_, i) => <div key={i} className={`h-6 rounded-sm ${i === 5 ? "bg-cyan-400/40" : i < 12 ? "bg-green-500/60" : "bg-white/5"}`} />)}</div>
    <Row c="mt-3 text-green-400">+50 XP daily bonus · Week Watch badge unlocked</Row>
  </div>
);

const ToolsPreview = () => (
  <div className="space-y-3">
    <div className="border border-white/10 p-2"><Row c="text-slate-500">intel lookup</Row><Row c="flex justify-between"><span>45.155.205.12</span><span className="text-red-400">62/90 malicious</span></Row></div>
    <div className="border border-white/10 p-2"><Row c="text-slate-500">decoder · from base64 → url decode</Row><Row c="text-yellow-300">powershell -nop -w hidden -enc ...</Row></div>
    <div className="border border-white/10 p-2"><Row c="text-slate-500">sandbox · invoice_0614.docm</Row><Row c="text-orange-400">spawns powershell.exe · contacts 2 C2 hosts</Row></div>
  </div>
);

const RadarPreview = () => {
  const vals = [0.9, 0.7, 0.8, 0.55, 0.75, 0.6];
  const pt = (v, i) => `${50 + 40 * v * Math.sin((i * Math.PI) / 3)},${50 - 40 * v * Math.cos((i * Math.PI) / 3)}`;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-40 w-40 shrink-0">
        {[1, 0.66, 0.33].map((s) => <polygon key={s} points={vals.map((_, i) => pt(s, i)).join(" ")} fill="none" stroke="rgba(0,240,255,.15)" />)}
        <polygon points={vals.map(pt).join(" ")} fill="rgba(0,255,102,.2)" stroke="#00FF66" />
      </svg>
      <div className="space-y-1">{["Phishing 90%", "Malware 70%", "Network 80%", "Forensics 55%", "SIEM 75%", "Cloud 60%"].map((t) => <Row key={t}>{t}</Row>)}</div>
    </div>
  );
};

const CertPreview = () => (
  <div className="border border-cyan-500/40 p-4 bg-black/40">
    <Row c="text-cyan-400 uppercase tracking-widest">certificate of completion</Row>
    <div className="mt-2 text-lg font-bold">SOC Analyst L1</div>
    <Row c="text-slate-500">ID SF-8A21-C0DE · verified</Row>
    <div className="mt-4 flex items-center justify-between"><QrCode className="h-10 w-10 text-slate-300" />
      <span className="inline-flex items-center gap-1 text-[11px] font-mono bg-[#0A66C2] text-white px-2 py-1 rounded-sm"><Linkedin className="h-3 w-3" />Add to profile</span></div>
  </div>
);

const TalentPreview = () => (
  <div className="space-y-2">
    {[["Ananya R.", "Analyst II", "Bengaluru"], ["Daniel K.", "Analyst I", "Remote"], ["Fatima Z.", "Senior", "Pune"]].map(([n, r, l]) => (
      <div key={n} className="flex items-center gap-3 border border-white/10 px-3 py-2">
        <div className="h-7 w-7 rounded-full bg-cyan-500/20 grid place-items-center font-mono text-xs">{n[0]}</div>
        <div className="flex-1"><div className="text-sm font-bold">{n}</div><Row c="text-slate-500 flex items-center gap-1">{r} · <MapPin className="h-3 w-3" />{l}</Row></div>
        <span className="text-[10px] font-mono text-green-300 border border-green-500/40 px-1.5 py-0.5">OPEN TO WORK</span>
      </div>))}
  </div>
);

const SessionsPreview = () => (
  <div className="space-y-2">
    {[["THU 19:00", "Ransomware triage night", "RSVP'd"], ["SAT 11:00", "Splunk SPL deep dive", "RSVP"], ["MON 20:00", "Mock SOC interview", "RSVP"]].map(([d, t, s]) => (
      <div key={t} className="flex items-center gap-3 border border-white/10 px-3 py-2">
        <Row c="text-cyan-300 w-20">{d}</Row><span className="text-sm flex-1">{t}</span>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 border ${s === "RSVP'd" ? "border-green-500/50 text-green-300" : "border-white/15 text-slate-400"}`}>{s}</span>
      </div>))}
    <Row c="text-slate-500 mt-2">email reminder 1 hour before · recordings after</Row>
  </div>
);

export const SHOWCASE = [
  ["kali", Terminal, "Kali terminal simulator", "Scripted in-browser shell with seeded evidence: grep, strings, base64, nmap, tshark, john.", KaliPreview],
  ["siem", Search, "SIEM you can break", "Query 300+ realistic events with histograms, field filters, saved searches and alerts.", SiemPreview],
  ["drill", Flame, "Daily alert drill", "One fresh case a day, streaks, freezes, badges and a shareable streak card.", DrillPreview],
  ["ctf", Flag, "CTF arena", "Log, forensics, network and malware flags with hints and a live scoreboard.", CtfPreview],
  ["labs", FlaskConical, "Scenario labs", "Multi-step incidents from phishing to ransomware, ending in a final report.", LabPreview],
  ["tools", Wrench, "Investigation toolkit", "Threat intel lookup, decoder recipes, sandbox reports, email headers and cases.", ToolsPreview],
  ["progress", Radar, "Skill radar & quizzes", "Timed quizzes with instant feedback and accuracy tracked by topic.", RadarPreview],
  ["certs", Award, "Verifiable certificates", "PDF with QR verification, one-click LinkedIn add and a public badge showcase.", CertPreview],
  ["sessions", CalendarClock, "Live sessions", "RSVP to instructor-led nights with reminders, join links and recordings.", SessionsPreview],
  ["talent", Users, "Get hired", "Recruiters search verified skills and contact Open-to-Work analysts privately.", TalentPreview],
];

export default function FeatureShowcase() {
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % SHOWCASE.length), 5000);
    return () => clearInterval(t);
  }, [hover]);
  const [key, , title, desc, Preview] = SHOWCASE[idx];
  return (
    <div className="grid lg:grid-cols-[1fr_1.25fr] gap-6" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} data-testid="feature-showcase">
      <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-1">
        {SHOWCASE.map(([k, I, t], i) => (
          <button key={k} onClick={() => setIdx(i)} data-testid={`feature-tab-${k}`}
            className={`relative text-left flex items-center gap-3 px-4 py-2.5 border-l-2 transition-colors ${i === idx ? "border-green-400 bg-cyan-500/10 text-white" : "border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/5"}`}>
            <I className={`h-4 w-4 ${i === idx ? "text-green-400" : "text-cyan-500"}`} />
            <span className="font-mono text-sm">{t}</span>
            {i === idx && !hover && <motion.span key={idx} className="absolute bottom-0 left-0 h-px bg-green-400" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 5, ease: "linear" }} />}
          </button>))}
      </div>
      <Glass className="relative scanlines overflow-hidden p-6 sm:p-8 min-h-[420px] flex flex-col" data-testid="feature-preview">
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 mb-5"><span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />preview://socpro-academy/{key}</div>
        <AnimatePresence mode="wait">
          <motion.div key={key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="flex-1 flex flex-col">
            <h3 className="text-xl font-bold" data-testid="feature-preview-title">{title}</h3>
            <p className="text-sm text-slate-400 mt-1 mb-6">{desc}</p>
            <div className="bg-black/40 border border-white/5 p-4 flex-1"><Preview /></div>
          </motion.div>
        </AnimatePresence>
        <Link to="/register" className="glow-btn mt-6 self-start" data-testid="feature-preview-cta">Try it free <ArrowRight className="h-4 w-4" /></Link>
      </Glass>
    </div>
  );
}
