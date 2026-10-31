import { useEffect, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { api } from "../lib/api";
import { Glass, Empty } from "./common";

const tip = { contentStyle: { background: "#0B0F1A", border: "1px solid rgba(0,240,255,.3)", fontSize: 12 } };
const ax = { tick: { fill: "#64748B", fontSize: 10 } };
const inr = (n) => `₹${(n || 0).toLocaleString("en-IN")}`;

function Kpi({ label, k, fmt = (v) => v, testId }) {
  const ch = k?.change;
  return (
    <Glass className="p-4" data-testid={testId}>
      <div className="eyebrow">{label}</div>
      <div className="text-2xl font-mono neon-text mt-1">{fmt(k?.value ?? 0)}</div>
      {ch != null && <div className={`text-[11px] font-mono mt-1 flex items-center gap-1 ${ch >= 0 ? "text-green-400" : "text-red-400"}`}>{ch >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{ch >= 0 ? "+" : ""}{ch}% vs previous</div>}
    </Glass>);
}

const Rank = ({ title, rows, testId }) => (
  <Glass className="p-4" data-testid={testId}><div className="font-bold text-sm mb-3">{title}</div>
    {rows.length ? rows.map((r, i) => <div key={i} className="flex justify-between text-xs py-1.5 border-b border-white/5"><span className="truncate pr-2"><span className="text-slate-500 font-mono mr-2">{i + 1}</span>{r.title || r.name}</span><span className="font-mono text-cyan-300">{r.count ?? `${r.xp} XP`}</span></div>) : <Empty text="no data yet" />}
  </Glass>);

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const [a, setA] = useState(null);
  useEffect(() => { setA(null); api.get("/admin/analytics/full", { params: { days } }).then((r) => setA(r.data)); }, [days]);
  return (
    <div className="space-y-4" data-testid="admin-analytics">
      <div className="flex gap-2">{[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} data-testid={`analytics-range-${d}`}
        className={`px-3 py-1.5 text-xs font-mono border rounded-sm ${days === d ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-slate-400"}`}>Last {d} days</button>)}</div>
      {!a ? <div className="h-64 bg-white/5 animate-pulse" /> : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label={`signups (${days}d)`} k={a.kpis.signups} testId="kpi-signups" /><Kpi label={`active users (${days}d)`} k={a.kpis.active_users} testId="kpi-active" />
          <Kpi label={`revenue (${days}d)`} k={a.kpis.revenue} fmt={inr} testId="kpi-revenue" /><Kpi label="avg daily active" k={a.kpis.avg_daily_active} testId="kpi-dau" />
          <Kpi label="total users" k={a.kpis.total_users} testId="admin-total-users" /><Kpi label="paying users" k={a.kpis.paying_users} testId="kpi-paying" />
          <Kpi label="paid conversion" k={a.kpis.conversion} fmt={(v) => `${v}%`} testId="kpi-conversion" /><Kpi label="pro plans" k={a.kpis.pro_users} testId="kpi-pro" />
        </div>
        <Glass className="p-5 h-80" data-testid="analytics-series"><div className="font-bold mb-2 text-sm">Signups, active users & revenue</div>
          <ResponsiveContainer height="88%"><AreaChart data={a.series}><CartesianGrid stroke="rgba(255,255,255,.04)" /><XAxis dataKey="day" {...ax} minTickGap={20} /><YAxis yAxisId="l" {...ax} width={30} allowDecimals={false} /><YAxis yAxisId="r" orientation="right" {...ax} width={50} />
            <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /><Area yAxisId="l" dataKey="signups" stroke="#00F0FF" fill="#00F0FF" fillOpacity={0.12} /><Area yAxisId="l" dataKey="active" stroke="#FFCC00" fill="#FFCC00" fillOpacity={0.08} />
            <Area yAxisId="r" dataKey="revenue" stroke="#00FF66" fill="#00FF66" fillOpacity={0.1} /></AreaChart></ResponsiveContainer></Glass>
        <div className="grid lg:grid-cols-2 gap-4">
          <Glass className="p-5" data-testid="analytics-funnel"><div className="font-bold text-sm mb-4">Student funnel (all time)</div>
            {a.funnel.map((f, i) => <div key={f.stage} className="mb-3"><div className="flex justify-between text-xs mb-1"><span>{i + 1}. {f.stage}</span><span className="font-mono text-slate-400">{f.users} · {f.pct}%</span></div>
              <div className="h-2 bg-white/5"><div className="h-2 bg-gradient-to-r from-cyan-400 to-green-400 transition-all duration-700" style={{ width: `${f.pct}%` }} /></div></div>)}</Glass>
          <Glass className="p-5 h-80" data-testid="analytics-engagement"><div className="font-bold text-sm mb-2">Content engagement ({days}d)</div>
            <ResponsiveContainer height="88%"><BarChart data={a.engagement} layout="vertical"><XAxis type="number" {...ax} allowDecimals={false} /><YAxis type="category" dataKey="name" width={120} tick={{ fill: "#94A3B8", fontSize: 10 }} /><Tooltip {...tip} /><Bar dataKey="count" fill="#00F0FF" radius={[0, 2, 2, 0]} /></BarChart></ResponsiveContainer></Glass>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <Glass className="p-4" data-testid="analytics-revenue-products"><div className="font-bold text-sm mb-3">Revenue by product ({days}d)</div>
            {a.revenue_by_product.length ? a.revenue_by_product.map((p) => <div key={p.product} className="flex justify-between text-xs py-1.5 border-b border-white/5"><span>{p.product}</span><span className="font-mono text-green-400">{inr(p.revenue)} · {p.orders}</span></div>) : <Empty text="no paid orders in this period" />}</Glass>
          <Rank title={`Top performers (${days}d XP)`} rows={a.top_performers} testId="analytics-top-performers" />
          <Rank title="Most started labs" rows={a.popular.labs} testId="analytics-popular-labs" />
          <Rank title="Most attempted challenges" rows={a.popular.challenges} testId="analytics-popular-challenges" />
          <Rank title="Most taken quizzes" rows={a.popular.quizzes} testId="analytics-popular-quizzes" />
          <Glass className="p-4"><div className="font-bold text-sm mb-3">Users by role</div>{Object.entries(a.roles).map(([k, v]) => <div key={k} className="flex justify-between text-xs py-1.5 border-b border-white/5"><span className="capitalize">{k}</span><span className="font-mono">{v}</span></div>)}</Glass>
        </div>
      </>}
    </div>);
}
