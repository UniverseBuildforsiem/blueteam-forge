import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Trophy, Zap, CalendarClock, Award } from "lucide-react";
import { BadgeTile } from "../../components/BadgeTile";
import { RankAvatar } from "../../components/RankAvatar";
import ShareCardButton from "../../components/ShareCardButton";
import LevelUpReveal, { badgeReveal, rankReveal } from "../../components/LevelUpReveal";
import { api, fmtDate } from "../../lib/api";
import RecommendedCourse from "../../components/RecommendedCourse";
import InvestigatorBoard from "../../components/InvestigatorBoard";
import NextBadge, { EbookCard } from "../../components/NextBadge";
import { toast } from "sonner";
import { Glass, PageHeader, ProgressRing, Empty, Stat, SeverityBadge, ProfileLink } from "../../components/common";

const RANK_COLORS = { Recruit: "text-slate-300", Analyst: "text-cyan-300", Hunter: "text-orange-300", Elite: "neon-green" };

function DrillBanner() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/drill/today").then((r) => setD(r.data)).catch(() => {}); }, []);
  if (!d) return null;
  const done = !!d.submission;
  return (
    <Link to="/app/drill" data-testid="dashboard-drill-banner" className={`glass rounded-sm p-4 mb-4 flex flex-wrap items-center gap-4 transition-colors ${done ? "!border-green-400/40" : "!border-orange-400/50 hover:bg-orange-500/5"}`}>
      <Zap className={`h-6 w-6 ${done ? "text-green-400" : "text-orange-400"}`} />
      <div className="flex-1 min-w-[200px]">
        <div className="eyebrow">daily alert drill · {d.drill_streak} day streak</div>
        <div className="font-bold mt-0.5">{done ? `Done for today · ${d.submission.auto_score}/100 · +${d.submission.xp} XP` : d.title}</div>
      </div>
      {!done && <SeverityBadge level={d.severity} />}
      <span className={done ? "ghost-btn" : "glow-btn"}>{done ? "Review" : `Triage now · +${d.bonus_xp} XP bonus`}</span>
    </Link>
  );
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [queue, setQueue] = useState([]);
  const shown = useRef(false);
  useEffect(() => {
    const load = () => api.get("/dashboard").then((r) => {
      setD(r.data);
      if (!shown.current && (r.data.level_up || r.data.rank_up)) {
        shown.current = true;
        setQueue([r.data.level_up && badgeReveal(r.data.level_up), r.data.rank_up && rankReveal(r.data.rank_up)].filter(Boolean));
      }
      r.data.course_bonus.forEach((t) => toast.success(`+${r.data.bonus_xp} XP course bonus: ${t}`));
    }).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);
  if (!d) return <div className="font-mono text-cyan-400 cursor-blink">loading telemetry </div>;
  const xpPct = d.next_rank_xp ? Math.round((100 * d.xp) / d.next_rank_xp) : 100;
  return (
    <div>
      {queue[0] && <LevelUpReveal key={queue[0].seen} r={queue[0]} onDone={() => setQueue((q) => q.slice(1))} />}
      <PageHeader eyebrow={`// shift start · ${d.user.goal || "SOC L1"} track`} title={`Welcome back, ${d.user.name.split(" ")[0]}`}
        right={<Link to={`/app/paths/${d.current_path?.id}`} className="glow-btn" data-testid="dashboard-continue-button">Continue path</Link>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label="Rank" value={<span className={RANK_COLORS[d.rank]}>{d.rank}</span>} testId="dashboard-rank" />
        <Stat label="XP" value={d.xp} accent="neon-green" testId="dashboard-xp" />
        <Stat label="Streak" value={<span className="flex items-center gap-2 text-orange-400"><Flame className="h-5 w-5" />{d.streak}d</span>} testId="dashboard-streak" />
        <Stat label="Flags / Cases / Quizzes" value={`${d.counts.ctf} / ${d.counts.challenges} / ${d.counts.quizzes}`} testId="dashboard-counts" />
      </div>
      <DrillBanner />
      <EbookCard badges={d.badges} />
      <NextBadge badges={d.badges} />
      <RecommendedCourse />
      <div className="grid lg:grid-cols-3 gap-4">
        <Glass className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6"><h3 className="font-bold">Path progress</h3>
            <span className="text-xs font-mono text-slate-400">current: <span className="text-cyan-300">{d.current_path?.title}</span></span></div>
          <div className="flex flex-wrap gap-6 justify-around">
            {d.paths.map((p) => <Link key={p.id} to={`/app/paths/${p.id}`} data-testid={`dashboard-ring-${p.id}`}><ProgressRing value={p.percent} label={p.title} color={p.id === d.current_path?.id ? "#00FF66" : "#00F0FF"} /></Link>)}
          </div>
          <div className="mt-8">
            <div className="flex justify-between text-xs font-mono text-slate-400 mb-2"><span>{d.rank}</span><span>{d.next_rank_xp ? `${d.xp} / ${d.next_rank_xp} XP to next rank` : "Max rank"}</span></div>
            <div className="h-2 bg-white/5"><div className="h-2 bg-gradient-to-r from-cyan-400 to-green-400" style={{ width: `${xpPct}%`, transition: "width 1s" }} /></div>
          </div>
        </Glass>
        <Glass className="p-6">
          <h3 className="font-bold flex items-center gap-2 mb-4"><Trophy className="h-4 w-4 text-yellow-300" />Leaderboard</h3>
          <ol className="space-y-2" data-testid="dashboard-leaderboard">
            {d.leaderboard.map((u, i) => (
              <li key={u.id} className={`flex items-center gap-3 text-sm px-2 py-1.5 ${u.id === d.user.id ? "bg-cyan-500/10" : ""}`}>
                <span className="font-mono text-slate-500 w-5">{i + 1}</span><RankAvatar rank={u.rank} frame={u.frame} size="xs" testId={`leaderboard-avatar-${u.username}`} /><ProfileLink username={u.username} isPublic={u.public} className="flex-1 truncate" testId={`leaderboard-profile-${u.username}`}>{u.name}</ProfileLink>
                <span className="text-[10px] font-mono text-slate-400">{u.rank}</span><span className="font-mono text-green-400">{u.xp}</span>
              </li>))}
          </ol>
        </Glass>
        <InvestigatorBoard meId={d.user.id} />
        <Glass className="p-6">
          <h3 className="font-bold flex items-center gap-2 mb-4"><Award className="h-4 w-4 text-cyan-300" />Badges</h3>
          <div className="grid grid-cols-3 gap-2">
            {d.badges.map((b) => (
              <div key={b.id} className="flex flex-col">
                <BadgeTile b={b} size="sm" testId={`badge-${b.id}`} />
                {b.earned && b.kind !== "course" && <div className="mt-1 [&_button]:w-full [&_button]:justify-center"><ShareCardButton endpoint={`/me/badges/${b.id}/share-card`} title={`Share your ${b.name} badge`} testId={`badge-share-${b.id}`} /></div>}
              </div>))}
          </div>
        </Glass>
        <Glass className="p-6">
          <h3 className="font-bold flex items-center gap-2 mb-4"><CalendarClock className="h-4 w-4 text-cyan-300" />Upcoming live sessions</h3>
          {d.upcoming_sessions.length ? d.upcoming_sessions.map((s) => (
            <Link to="/app/sessions" key={s.id} className="block border-l-2 border-cyan-500/40 pl-3 py-2 mb-2 hover:bg-white/5">
              <div className="text-sm">{s.title}</div><div className="text-xs font-mono text-slate-500">{fmtDate(s.start)} · {s.instructor}</div>
            </Link>)) : <Empty text="no sessions scheduled" />}
        </Glass>
        <Glass className="p-6">
          <h3 className="font-bold mb-4">Recent activity</h3>
          <div className="space-y-2 font-mono text-xs" data-testid="dashboard-activity">
            {d.activity.length ? d.activity.map((a) => (
              <div key={a.id} className="flex gap-2"><span className="text-green-400">+{a.xp}</span><span className="text-slate-300 flex-1">{a.text}</span></div>
            )) : <Empty text="no activity yet — start a lesson" />}
          </div>
        </Glass>
      </div>
    </div>
  );
}
