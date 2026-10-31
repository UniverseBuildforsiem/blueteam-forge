import { useEffect, useState } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { api } from "../../lib/api";
import { Glass, PageHeader, Stat, Empty } from "../../components/common";

export default function Progress() {
  const [a, setA] = useState(null);
  useEffect(() => {
    const load = () => api.get("/me/analytics").then((r) => setA(r.data));
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  if (!a) return null;
  return (
    <div>
      <PageHeader eyebrow="// real-time telemetry" title="Progress analytics"
        right={<span className="text-xs font-mono text-green-400 flex items-center gap-2" data-testid="progress-live-indicator"><span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />live · {new Date(a.updated_at).toLocaleTimeString()}</span>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label="Completion" value={`${a.completion}%`} testId="progress-completion" />
        <Stat label="Avg quiz score" value={`${a.avg_score}%`} accent="neon-green" testId="progress-avg-score" />
        <Stat label="Quiz attempts" value={a.attempts} testId="progress-attempts" />
        <Stat label="Time spent" value={`${a.time_spent_min} min`} testId="progress-time" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Glass className="p-6 h-[360px]" data-testid="progress-radar">
          <h3 className="font-bold mb-2">Accuracy by topic</h3>
          {a.accuracy.length >= 3 ? <ResponsiveContainer width="100%" height="90%"><RadarChart data={a.accuracy}><PolarGrid stroke="rgba(0,240,255,.15)" />
            <PolarAngleAxis dataKey="topic" tick={{ fill: "#94A3B8", fontSize: 11 }} /><Radar dataKey="accuracy" stroke="#00F0FF" fill="#00F0FF" fillOpacity={0.25} /></RadarChart></ResponsiveContainer>
            : <Empty text="complete quizzes in 3+ topics to unlock the radar" />}
        </Glass>
        <Glass className="p-6 h-[360px]">
          <h3 className="font-bold mb-2">Quiz score history</h3>
          {a.quiz_scores.length ? <ResponsiveContainer width="100%" height="90%"><LineChart data={a.quiz_scores}><CartesianGrid stroke="rgba(255,255,255,.05)" />
            <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fill: "#64748B", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#0B0F1A", border: "1px solid rgba(0,240,255,.3)" }} /><Line dataKey="score" stroke="#00FF66" strokeWidth={2} dot={{ fill: "#00FF66" }} /></LineChart></ResponsiveContainer>
            : <Empty text="no quiz attempts yet" />}
        </Glass>
        <Glass className="p-6 lg:col-span-2">
          <h3 className="font-bold mb-3">Weak topics</h3>
          <div className="flex flex-wrap gap-2" data-testid="progress-weak-topics">
            {a.weak_topics.length ? a.weak_topics.map((t) => <span key={t} className="px-3 py-1 border border-orange-400/40 text-orange-300 text-sm font-mono">{t}</span>) : <span className="text-sm text-slate-500">No weak topics detected — keep it up.</span>}
          </div>
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {a.accuracy.map((t) => <div key={t.topic} className="text-xs font-mono"><div className="flex justify-between text-slate-400"><span>{t.topic}</span><span>{t.accuracy}%</span></div>
              <div className="h-1 bg-white/5 mt-1"><div className={`h-1 ${t.accuracy < 70 ? "bg-orange-400" : "bg-green-400"}`} style={{ width: `${t.accuracy}%` }} /></div></div>)}
          </div>
        </Glass>
      </div>
    </div>
  );
}
