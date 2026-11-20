import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, BarChart, Bar, Cell } from "recharts";

const tip = { contentStyle: { background: "#0B0F1A", border: "1px solid rgba(0,240,255,.3)", fontSize: 12 }, labelStyle: { color: "#94a3b8" } };
export const READY = { "Exam ready": "text-green-300 border-green-500/50 bg-green-500/10", "Almost ready": "text-yellow-300 border-yellow-500/50 bg-yellow-500/10", "Not ready": "text-red-300 border-red-500/50 bg-red-500/10" };
export const fmtTime = (s) => (s == null ? "—" : `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}h ` : ""}${Math.floor((s % 3600) / 60)}m ${s % 60}s`);
const short = (s) => (s.length > 22 ? `${s.slice(0, 20)}…` : s);

export function TrendChart({ attempts, passMark }) {
  const data = attempts.filter((a) => !a.domain).map((a, i) => ({ n: `#${i + 1}`, percent: a.percent, mode: a.mode }));
  if (!data.length) return <div className="h-56 grid place-items-center text-xs font-mono text-slate-500">complete a full-length attempt to see your trend</div>;
  return (
    <div className="h-56" data-testid="trend-chart"><ResponsiveContainer>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,.05)" /><XAxis dataKey="n" stroke="#64748b" fontSize={11} /><YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} />
        <Tooltip {...tip} formatter={(v, k, p) => [`${v}% (${p.payload.mode})`, "Score"]} />
        <ReferenceLine y={passMark} stroke="#facc15" strokeDasharray="4 4" label={{ value: `pass ${passMark}%`, fill: "#facc15", fontSize: 10, position: "insideTopRight" }} />
        <Line type="monotone" dataKey="percent" stroke="#00F0FF" strokeWidth={2} dot={{ r: 4, fill: "#00FF66", stroke: "#00F0FF" }} />
      </LineChart></ResponsiveContainer></div>);
}

export function DomainChart({ domains, passMark = 70 }) {
  if (!domains?.length) return <div className="h-56 grid place-items-center text-xs font-mono text-slate-500">no domain data yet</div>;
  const data = domains.map((d) => ({ name: short(d.domain), full: d.domain, percent: d.percent }));
  if (data.length >= 3) return (
    <div className="h-64" data-testid="domain-chart"><ResponsiveContainer>
      <RadarChart data={data} outerRadius="70%"><PolarGrid stroke="rgba(0,240,255,.15)" /><PolarAngleAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} /><PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="percent" stroke="#00FF66" fill="#00FF66" fillOpacity={0.25} /><Tooltip {...tip} formatter={(v) => [`${v}%`, "Score"]} labelFormatter={(l, p) => p?.[0]?.payload.full || l} /></RadarChart></ResponsiveContainer></div>);
  return (
    <div className="h-56" data-testid="domain-chart"><ResponsiveContainer>
      <BarChart data={data} margin={{ left: -20 }}><XAxis dataKey="name" stroke="#64748b" fontSize={10} /><YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} /><Tooltip {...tip} />
        <Bar dataKey="percent">{data.map((d, i) => <Cell key={i} fill={d.percent >= passMark ? "#00FF66" : "#f87171"} />)}</Bar></BarChart></ResponsiveContainer></div>);
}

export function DomainBars({ domains, passMark = 70 }) {
  return <div className="space-y-2" data-testid="domain-bars">{domains.map((d, i) => <div key={d.domain} data-testid={`domain-row-${i}`}>
    <div className="flex justify-between text-xs"><span>{d.domain}</span><span className={`font-mono ${d.percent >= passMark ? "text-green-300" : "text-red-300"}`}>{d.correct}/{d.total} · {d.percent}%</span></div>
    <div className="h-1.5 bg-white/5 mt-1"><div className={`h-full ${d.percent >= passMark ? "bg-green-400" : "bg-red-400"}`} style={{ width: `${d.percent}%` }} /></div></div>)}</div>;
}
