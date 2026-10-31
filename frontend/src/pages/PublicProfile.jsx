import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, Flame, Zap, BadgeCheck, ExternalLink, Briefcase, MapPin, Send } from "lucide-react";
import { toast } from "sonner";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { api, errMsg } from "../lib/api";
import { Glass, Stat } from "../components/common";
import PublicNav, { Footer } from "../components/PublicNav";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;

function ContactDialog({ p, open, setOpen }) {
  const blank = { recruiter_name: "", recruiter_email: "", company: "", role: "", message: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async () => {
    if (!EMAIL_RE.test(f.recruiter_email)) return toast.error("Enter a valid work email");
    setBusy(true);
    try { const { data } = await api.post(`/public/profile/${p.username}/contact`, f); toast.success(data.message); setF(blank); setOpen(false); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const ok = f.recruiter_name.length >= 2 && f.company.length >= 2 && f.message.length >= 20;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-lg" data-testid="contact-dialog">
        <DialogHeader><DialogTitle className="font-mono">Contact {p.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-400">We'll email your request to {p.name.split(" ")[0]}. Their address stays private; they'll reply to you directly if interested.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input className="field" placeholder="Your name" value={f.recruiter_name} onChange={set("recruiter_name")} data-testid="contact-name-input" />
          <input className="field" placeholder="Work email" type="email" value={f.recruiter_email} onChange={set("recruiter_email")} data-testid="contact-email-input" />
          <input className="field" placeholder="Company" value={f.company} onChange={set("company")} data-testid="contact-company-input" />
          <input className="field" placeholder="Role (optional)" value={f.role} onChange={set("role")} data-testid="contact-role-input" />
        </div>
        <textarea className="field h-32 text-sm" placeholder="Tell them about the role (min 20 characters)" value={f.message} onChange={set("message")} data-testid="contact-message-input" />
        <button className="glow-btn justify-center" disabled={!ok || busy} onClick={send} data-testid="contact-send-button"><Send className="h-4 w-4" />{busy ? "Sending..." : "Send contact request"}</button>
      </DialogContent>
    </Dialog>
  );
}

function SkillChart({ data }) {
  if (!data?.length) return null;
  return (
    <Glass className="p-5 mt-4 h-[340px]" data-testid="profile-skill-radar">
      <div className="eyebrow mb-1">skill radar · accuracy by area</div>
      {data.length >= 3 ? <ResponsiveContainer width="100%" height="92%"><RadarChart data={data}><PolarGrid stroke="rgba(0,240,255,.15)" />
        <PolarAngleAxis dataKey="topic" tick={{ fill: "#94A3B8", fontSize: 11 }} /><PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="accuracy" stroke="#00FF66" fill="#00FF66" fillOpacity={0.2} /><Tooltip contentStyle={{ background: "#0B0F1A", border: "1px solid rgba(0,240,255,.3)" }} /></RadarChart></ResponsiveContainer>
        : <div className="space-y-3 mt-4">{data.map((s) => <div key={s.topic} className="text-xs font-mono"><div className="flex justify-between text-slate-400"><span>{s.topic}</span><span>{s.accuracy}%</span></div>
          <div className="h-1.5 bg-white/5 mt-1"><div className="h-1.5 bg-green-400" style={{ width: `${s.accuracy}%` }} /></div></div>)}</div>}
    </Glass>
  );
}

export default function PublicProfile() {
  const { username } = useParams();
  const [p, setP] = useState(undefined);
  const [contact, setContact] = useState(false);
  useEffect(() => { api.get(`/public/profile/${username}`).then((r) => setP(r.data)).catch(() => setP(null)); }, [username]);
  return (
    <div className="min-h-screen grid-bg">
      <PublicNav />
      <div className="max-w-5xl mx-auto px-6 py-14">
        {p === undefined ? <p className="font-mono cursor-blink">loading profile </p> : !p ? (
          <Glass className="p-8" data-testid="profile-not-found"><h1 className="text-2xl font-bold">Profile not found</h1><p className="text-slate-400 mt-2 text-sm">This analyst profile doesn't exist or is private.</p></Glass>
        ) : (
          <div className="rise" data-testid="public-profile">
            <div className="eyebrow mb-3">// analyst profile · @{p.username}</div>
            <h1 className="text-4xl sm:text-5xl font-extrabold" data-testid="profile-name">{p.name}</h1>
            <p className="text-slate-400 mt-3 font-mono text-sm">{p.rank} · {p.goal ? `${p.goal} track · ` : ""}joined {p.joined}</p>
            {p.open_to_work && <div className="mt-5 flex flex-wrap items-center gap-3" data-testid="profile-open-to-work">
              <span className="inline-flex items-center gap-2 px-3 py-1 border border-green-400/50 bg-green-500/10 text-green-300 text-sm font-mono"><Briefcase className="h-4 w-4" />Open to SOC roles</span>
              {(p.location || p.work_mode) && <span className="text-sm text-slate-400 flex items-center gap-1"><MapPin className="h-4 w-4" />{[p.location, p.work_mode].filter(Boolean).join(" · ")}</span>}
              <button className="glow-btn !py-1.5" onClick={() => setContact(true)} data-testid="profile-contact-button"><Send className="h-4 w-4" />Contact candidate</button>
            </div>}
            <ContactDialog p={p} open={contact} setOpen={setContact} />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
              <Stat label="Rank" value={p.rank} testId="profile-rank" />
              <Stat label="XP" value={p.xp} accent="neon-green" />
              <Stat label="Drill streak" value={<span className="flex items-center gap-2 text-orange-400"><Flame className="h-5 w-5" />{p.drill.current}d</span>} testId="profile-streak" />
              <Stat label="Longest / total drills" value={`${p.drill.longest}d / ${p.drill.total}`} />
            </div>
            {p.skills?.length > 0 && <><h2 className="text-lg font-bold mt-12 mb-4">Verified skills</h2>
              <div className="flex flex-wrap gap-2" data-testid="profile-skills">{p.skills.map((s) => <span key={s} className="px-3 py-1 text-sm font-mono border border-cyan-500/30 text-cyan-300">{s}</span>)}</div>
              <p className="text-xs text-slate-500 mt-2 font-mono">70%+ accuracy on quizzes or triage verdicts in this area</p></>}
            <SkillChart data={p.skill_scores} />
            <h2 className="text-lg font-bold mt-12 mb-4 flex items-center gap-2"><Zap className="h-5 w-5 text-green-400" />Badges</h2>
            {p.badges.length ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="profile-badges">
              {p.badges.map((b) => <Glass key={b.id} className="p-4 !border-green-400/40" data-testid={`profile-badge-${b.id}`}><Zap className="h-5 w-5 text-green-400" /><div className="font-mono text-sm mt-2">{b.name}</div><div className="text-xs text-slate-500">{b.description}</div></Glass>)}
            </div> : <p className="text-sm font-mono text-slate-500">// no badges yet</p>}
            <h2 className="text-lg font-bold mt-12 mb-4 flex items-center gap-2"><Award className="h-5 w-5 text-cyan-400" />Certificates</h2>
            {p.certificates.length ? <div className="grid md:grid-cols-2 gap-3" data-testid="profile-certificates">
              {p.certificates.map((c) => <Glass key={c.id} className="p-5 flex items-center gap-4"><BadgeCheck className="h-6 w-6 text-green-400 shrink-0" />
                <div className="flex-1"><div className="font-bold">{c.path_title}</div><div className="text-xs font-mono text-slate-500">{c.id} · {c.score}% · {c.issued_at.slice(0, 10)}</div></div>
                <Link to={`/verify/${c.id}`} className="ghost-btn !py-1 !text-xs" data-testid={`profile-cert-verify-${c.id}`}><ExternalLink className="h-3.5 w-3.5" />Verify</Link></Glass>)}
            </div> : <p className="text-sm font-mono text-slate-500">// no certificates yet</p>}
            <Glass className="p-6 mt-14 flex flex-wrap items-center justify-between gap-4"><span className="text-slate-300">Train on the same alerts as {p.name.split(" ")[0]}.</span><Link to="/register" className="glow-btn" data-testid="profile-cta-signup">Join SOCForge</Link></Glass>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
