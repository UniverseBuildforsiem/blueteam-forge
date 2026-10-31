import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Flame, Award, Users, Briefcase, MapPin } from "lucide-react";
import { Switch } from "../components/ui/switch";
import { api } from "../lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Glass } from "../components/common";
import { RankAvatar } from "../components/RankAvatar";
import PublicNav, { Footer } from "../components/PublicNav";

const RANK_COLOR = { Recruit: "text-slate-300", Analyst: "text-cyan-300", Hunter: "text-orange-300", Elite: "neon-green" };

const Pick = ({ label, value, set, options, testId }) => (
  <Select value={value || "any"} onValueChange={(v) => set(v === "any" ? "" : v)}>
    <SelectTrigger className="w-[190px] font-mono text-xs bg-black/40 border-cyan-500/20" data-testid={testId}><SelectValue /></SelectTrigger>
    <SelectContent className="bg-[#0B0F1A] border-cyan-500/30">
      <SelectItem value="any">{label}</SelectItem>
      {options.map((o) => <SelectItem key={o} value={o} data-testid={`${testId}-option-${o.toLowerCase().replace(/\s+/g, "-")}`}>{o}</SelectItem>)}
    </SelectContent>
  </Select>
);

function Candidate({ c }) {
  return (
    <Link to={`/u/${c.username}`} className="glass rounded-sm p-5 flex flex-col hover:!border-cyan-400/60 transition-colors" data-testid={`talent-card-${c.username}`}>
      <div className="flex justify-between items-start gap-3"><RankAvatar rank={c.rank} size="md" testId={`talent-avatar-${c.username}`} /><div className="flex-1 min-w-0"><div className="font-bold text-lg truncate">{c.name}</div><div className="text-xs font-mono text-slate-500">@{c.username}{c.goal ? ` · ${c.goal}` : ""}</div></div>
        <span className={`font-mono text-sm ${RANK_COLOR[c.rank]}`}>{c.rank}</span></div>
      <div className="flex gap-4 mt-3 text-xs font-mono text-slate-400"><span className="text-green-400">{c.xp} XP</span><span className="flex items-center gap-1 text-orange-400"><Flame className="h-3 w-3" />{c.drill.longest}d best</span><span>{c.badge_count} badges</span></div>
      {c.open_to_work && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" data-testid={`talent-open-${c.username}`}><span className="inline-flex items-center gap-1 px-2 py-0.5 border border-green-400/50 bg-green-500/10 text-green-300 font-mono"><Briefcase className="h-3 w-3" />Open to work</span>
        {(c.location || c.work_mode) && <span className="text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" />{[c.location, c.work_mode].filter(Boolean).join(" · ")}</span>}</div>}
      <div className="flex flex-wrap gap-1.5 mt-4">{c.skills.length ? c.skills.map((s) => <span key={s} className="px-2 py-0.5 text-[11px] font-mono border border-cyan-500/30 text-cyan-300">{s}</span>) : <span className="text-[11px] font-mono text-slate-600">no verified skills yet</span>}</div>
      <div className="mt-4 space-y-1">{c.certificates.map((t) => <div key={t} className="text-xs flex items-center gap-1.5 text-slate-300"><Award className="h-3.5 w-3.5 text-green-400" />{t}</div>)}</div>
    </Link>
  );
}

export default function Talent() {
  const [f, setF] = useState({ q: "", rank: "", cert: "", skill: "", open: false, location: "" });
  const [d, setD] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => api.get("/public/talent", { params: f }).then((r) => setD(r.data)), 250);
    return () => clearTimeout(t);
  }, [f]);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  return (
    <div className="min-h-screen grid-bg">
      <PublicNav />
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="eyebrow mb-3">// recruiter view</div>
        <h1 className="text-4xl sm:text-5xl font-extrabold">Find SOC analysts who've <span className="neon-text">done the work.</span></h1>
        <p className="text-slate-400 mt-4 max-w-2xl">Every skill below is earned: 70%+ accuracy on quizzes or correct verdicts on real-world triage cases. Only students with public profiles appear.</p>
        <Glass className="p-4 mt-10 flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-black/40 border border-cyan-500/20 px-3"><Search className="h-4 w-4 text-cyan-400" />
            <input className="flex-1 bg-transparent py-2 outline-none text-sm" placeholder="Search by name or username" value={f.q} onChange={(e) => set("q")(e.target.value)} data-testid="talent-search-input" /></div>
          {d && <><Pick label="Any rank" value={f.rank} set={set("rank")} options={d.options.ranks} testId="talent-rank-filter" />
            <Pick label="Any certificate" value={f.cert} set={set("cert")} options={d.options.certificates} testId="talent-cert-filter" />
            <Pick label="Any skill" value={f.skill} set={set("skill")} options={d.options.skills} testId="talent-skill-filter" /></>}
          <input className="field !w-44 text-xs" placeholder="Location or 'remote'" value={f.location} onChange={(e) => set("location")(e.target.value)} data-testid="talent-location-input" />
          <label className="flex items-center gap-2 text-xs font-mono text-slate-300"><Switch checked={f.open} onCheckedChange={set("open")} data-testid="talent-open-toggle" />Open to work only</label>
          {(f.q || f.rank || f.cert || f.skill || f.open || f.location) && <button className="text-xs font-mono text-slate-400 hover:text-cyan-300" onClick={() => setF({ q: "", rank: "", cert: "", skill: "", open: false, location: "" })} data-testid="talent-clear-filters">clear</button>}
        </Glass>
        <div className="text-xs font-mono text-slate-500 mt-6 mb-3 flex items-center gap-2" data-testid="talent-count"><Users className="h-3.5 w-3.5" />{d ? `${d.total} candidate${d.total === 1 ? "" : "s"}` : "searching..."}</div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="talent-results">{d?.results.map((c) => <Candidate key={c.username} c={c} />)}</div>
        {d && !d.total && <p className="text-sm font-mono text-slate-500 py-10 text-center">// no candidates match these filters</p>}
      </div>
      <Footer />
    </div>
  );
}
