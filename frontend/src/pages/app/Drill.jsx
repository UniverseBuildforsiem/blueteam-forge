import { useEffect, useState } from "react";
import { Flame, CalendarCheck, CheckCircle2, XCircle, ChevronLeft, RotateCcw, Trophy, History, Mail } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Switch } from "../../components/ui/switch";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { Glass, PageHeader, SeverityBadge } from "../../components/common";
import { Investigate } from "./Challenges";

function Done({ d }) {
  const s = d.submission;
  return (
    <Glass className="p-6" data-testid="drill-completed">
      <div className="flex items-center gap-2 font-mono font-bold text-lg">{s.verdict_correct ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <XCircle className="h-5 w-5 text-red-400" />}Today's drill complete · {s.auto_score}/100</div>
      <div className="text-sm text-slate-400 mt-2">You earned <span className="text-green-400 font-mono">+{s.xp} XP</span> (including the {d.bonus_xp} XP daily bonus). A fresh alert lands tomorrow (UTC).</div>
      <div className="mt-4 space-y-1 text-xs font-mono">
        <div className="text-slate-400">Your verdict: <span className="text-slate-200">{s.verdict}</span>{s.expected_verdict && <> · expected: <span className="text-slate-200">{s.expected_verdict}</span></>}</div>
        <div className="text-slate-400">Covered: <span className="text-green-300">{s.keywords_hit.join(", ") || "—"}</span></div>
        {s.missed_keywords && <div className="text-slate-400" data-testid="drill-missed">Missed: <span className="text-orange-300">{s.missed_keywords.join(", ") || "—"}</span></div>}
      </div>
    </Glass>
  );
}

function Archive() {
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const load = () => api.get("/drill/archive").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  const open = async (date) => setSel((await api.get(`/drill/day/${date}`)).data);
  if (sel) return (
    <Glass className="p-6" data-testid="drill-practice-case">
      <button className="ghost-btn !py-1 !text-xs mb-4" onClick={() => { setSel(null); load(); }} data-testid="drill-archive-back"><ChevronLeft className="h-3.5 w-3.5" />Archive</button>
      <div className="flex flex-wrap items-center gap-3"><SeverityBadge level={sel.severity} /><span className="font-mono text-xs text-cyan-400">{sel.alert.rule}</span>
        <span className="font-mono text-[10px] uppercase px-2 py-0.5 border border-yellow-400/40 text-yellow-300">practice · no XP</span></div>
      <h2 className="text-xl font-bold mt-3">{sel.title} <span className="text-sm font-mono text-slate-500">· {sel.date}</span></h2>
      {sel.practice && <div className="text-xs font-mono text-slate-500 mt-1">best practice score: {sel.practice.best}/100 · {sel.practice.attempts} attempts</div>}
      <Investigate key={sel.date} c={sel} submitUrl={`/drill/day/${sel.date}/practice`} onDone={() => {}} />
    </Glass>
  );
  return (
    <Glass className="divide-y divide-white/5" data-testid="drill-archive">
      {list.map((d) => (
        <button key={d.date} onClick={() => open(d.date)} className="w-full text-left p-4 flex flex-wrap items-center gap-4 hover:bg-cyan-500/5 transition-colors" data-testid={`drill-archive-${d.date}`}>
          <span className="font-mono text-xs text-slate-500 w-24">{d.date}</span><SeverityBadge level={d.severity} />
          <span className="flex-1 text-sm">{d.title}<span className="text-xs text-slate-500"> · {d.category}</span></span>
          <span className="font-mono text-xs text-slate-400">{d.live_score != null ? `live ${d.live_score}` : "missed"}{d.practice_best != null && ` · best ${d.practice_best}`}</span>
          <span className="ghost-btn !py-1 !text-xs"><RotateCcw className="h-3.5 w-3.5" />Replay</span>
        </button>))}
    </Glass>
  );
}

function Leaderboard() {
  const [d, setD] = useState(null);
  const { user } = useAuth();
  useEffect(() => { api.get("/drill/leaderboard").then((r) => setD(r.data)); }, []);
  if (!d) return null;
  return (
    <Glass className="p-5" data-testid="drill-leaderboard">
      <div className="flex justify-between items-center mb-4"><h3 className="font-bold flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-300" />Longest streaks this week</h3><span className="text-xs font-mono text-slate-500">since {d.week_start}</span></div>
      {d.rows.length ? <table className="w-full text-sm"><thead><tr className="text-left text-xs font-mono text-slate-500 border-b border-cyan-500/15">{["#", "Analyst", "Streak", "Drills this week", "Drill XP"].map((h) => <th key={h} className="py-2 font-normal">{h}</th>)}</tr></thead>
        <tbody>{d.rows.map((r, i) => <tr key={r.user_id} className={`border-b border-white/5 ${r.user_id === user.id ? "bg-cyan-500/10" : ""}`} data-testid={`drill-lb-row-${r.username}`}>
          <td className="py-2.5 font-mono text-slate-500">{i + 1}</td><td>{r.name}</td><td className="font-mono text-orange-400"><span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5" />{r.streak}</span></td>
          <td className="font-mono">{r.week_drills}/7</td><td className="font-mono text-green-400">{r.week_xp}</td></tr>)}</tbody></table>
        : <div className="text-sm font-mono text-slate-500 py-6 text-center">// nobody has completed a drill this week — be first</div>}
    </Glass>
  );
}

function StreakEmailToggle({ on }) {
  const [v, setV] = useState(on);
  const flip = async () => { const { data } = await api.patch("/me/preferences", { streak_emails: !v }); setV(data.streak_emails); toast.success(data.streak_emails ? "Streak reminder emails on" : "Streak reminder emails off"); };
  return (
    <label className="flex items-center gap-2 text-xs font-mono text-slate-400 cursor-pointer" data-testid="drill-email-toggle-label">
      <Switch checked={v} onCheckedChange={flip} data-testid="drill-email-toggle" /><Mail className="h-3.5 w-3.5" />evening streak reminder
    </label>
  );
}

export default function Drill() {
  const [d, setD] = useState(null);
  const load = () => api.get("/drill/today").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  if (!d) return null;
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow={`// daily alert drill · ${d.date}`} title="Daily Alert Drill"
        sub={`One fresh triage case every day. Finish it for a +${d.bonus_xp} XP bonus on top of your score, and keep your streak alive.`}
        right={<div className="flex flex-col items-end gap-2"><div className="flex items-center gap-2 font-mono text-orange-400 text-lg" data-testid="drill-streak"><Flame className="h-5 w-5" />{d.drill_streak} day drill streak</div><StreakEmailToggle on={d.streak_emails} /></div>} />
      <Tabs defaultValue="today">
        <TabsList className="bg-black/40 mb-4"><TabsTrigger value="today" data-testid="drill-tab-today">Today</TabsTrigger><TabsTrigger value="archive" data-testid="drill-tab-archive"><History className="h-4 w-4 mr-1" />Archive</TabsTrigger><TabsTrigger value="leaderboard" data-testid="drill-tab-leaderboard"><Trophy className="h-4 w-4 mr-1" />Leaderboard</TabsTrigger></TabsList>
        <TabsContent value="today">
          {d.submission ? <Done d={d} /> : (
            <Glass className="p-6" data-testid="drill-case">
              <div className="flex flex-wrap items-center gap-3"><SeverityBadge level={d.severity} /><span className="font-mono text-xs text-cyan-400">{d.alert.rule}</span>
                <span className="font-mono text-xs text-slate-500 flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5" />{d.category}</span></div>
              <h2 className="text-xl font-bold mt-3" data-testid="drill-title">{d.title}</h2>
              <Investigate c={d} submitUrl="/drill/today/submit" onDone={load} />
            </Glass>
          )}
        </TabsContent>
        <TabsContent value="archive"><Archive /></TabsContent>
        <TabsContent value="leaderboard"><Leaderboard /></TabsContent>
      </Tabs>
    </div>
  );
}
