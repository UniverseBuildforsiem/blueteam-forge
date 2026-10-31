import { useEffect, useMemo, useState } from "react";
import { Search, Save, Trash2, BellRing, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { api, errMsg } from "../../lib/api";
import { Glass, PageHeader, SeverityBadge, Empty } from "../../components/common";

const RANGES = { "24h": 1, "3d": 3, "7d": 7, all: 0 };
const COLORS = ["#00F0FF", "#00FF66", "#FF9500", "#FFCC00", "#FF3B30", "#8B9DC3"];
const tip = { contentStyle: { background: "#0B0F1A", border: "1px solid rgba(0,240,255,.3)", fontSize: 12 } };

function Histogram({ events }) {
  const data = useMemo(() => {
    const m = {};
    events.forEach((e) => { const k = e._time.slice(5, 13).replace("T", " ") + "h"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort().map(([t, c]) => ({ t, c }));
  }, [events]);
  return <div className="h-28" data-testid="siem-histogram"><ResponsiveContainer><BarChart data={data}><XAxis dataKey="t" hide /><YAxis hide /><Tooltip {...tip} cursor={{ fill: "rgba(0,240,255,.05)" }} /><Bar dataKey="c" fill="#00F0FF" /></BarChart></ResponsiveContainer></div>;
}

function Row({ e }) {
  const [open, setOpen] = useState(false);
  return (<>
    <tr onClick={() => setOpen(!open)} className="border-b border-white/5 hover:bg-cyan-500/5 cursor-pointer font-mono text-xs" data-testid={`siem-event-${e.id}`}>
      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{e._time.slice(0, 19).replace("T", " ")}</td>
      <td className="px-3 py-2 text-cyan-300">{e.sourcetype}</td><td className="px-3 py-2">{e.host}</td>
      <td className={`px-3 py-2 ${e.action === "failure" ? "text-red-400" : "text-slate-400"}`}>{e.event_id || e.action}</td>
      <td className="px-3 py-2 text-slate-300 truncate max-w-[420px]">{e.message}{e.url ? ` ${e.url}` : ""}{e.query ? ` ${e.query}` : ""}</td>
    </tr>
    {open && <tr className="bg-black/40"><td colSpan={5} className="px-3 py-3 font-mono text-xs"><pre className="whitespace-pre-wrap text-green-300">{JSON.stringify(e, null, 2)}</pre></td></tr>}
  </>);
}

function SearchTab() {
  const [q, setQ] = useState("");
  const [range, setRange] = useState("all");
  const [res, setRes] = useState(null);
  const [saved, setSaved] = useState([]);
  const run = async (query = q) => {
    const d = RANGES[range];
    const start = d ? new Date(Date.now() - d * 864e5).toISOString() : "";
    try { const { data } = await api.get("/siem/search", { params: { q: query, start } }); setRes(data); } catch (e) { toast.error(errMsg(e)); }
  };
  const loadSaved = () => api.get("/siem/saved").then((r) => setSaved(r.data));
  useEffect(() => { run(""); loadSaved(); }, []); // eslint-disable-line
  useEffect(() => { run(); }, [range]); // eslint-disable-line
  const save = async () => {
    const name = window.prompt("Name this search");
    if (!name) return;
    await api.post("/siem/saved", { name, query: q }); toast.success("Search saved"); loadSaved();
  };
  const addField = (f, v) => { const nq = `${q} ${f}=${v.includes(" ") ? `"${v}"` : v}`.trim(); setQ(nq); run(nq); };
  return (
    <div className="space-y-4">
      <Glass className="p-3 flex flex-wrap gap-2">
        <div className="flex-1 min-w-[260px] flex items-center gap-2 bg-black/40 border border-cyan-500/20 px-3 font-mono text-sm">
          <Search className="h-4 w-4 text-cyan-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder='event_id=4625 src_ip=45.* | stats count by user' className="flex-1 bg-transparent py-2.5 outline-none" data-testid="siem-query-input" />
        </div>
        <Select value={range} onValueChange={setRange}><SelectTrigger className="w-32 font-mono" data-testid="siem-time-range"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.keys(RANGES).map((r) => <SelectItem key={r} value={r}>{r === "all" ? "All time" : `Last ${r}`}</SelectItem>)}</SelectContent></Select>
        <button className="glow-btn" onClick={() => run()} data-testid="siem-search-button">Search</button>
        <button className="ghost-btn" onClick={save} data-testid="siem-save-button"><Save className="h-4 w-4" /></button>
      </Glass>
      <div className="grid lg:grid-cols-[240px_1fr] gap-4">
        <div className="space-y-4">
          <Glass className="p-3"><div className="eyebrow mb-2">saved searches</div>
            {saved.map((s) => <div key={s.id} className="flex items-center gap-1 group"><button onClick={() => { setQ(s.query); run(s.query); }} className="flex-1 text-left text-xs py-1.5 hover:text-cyan-300 truncate" data-testid={`siem-saved-${s.id}`}>{s.name}</button>
              {s.user_id !== "system" && <button onClick={async () => { await api.delete(`/siem/saved/${s.id}`); loadSaved(); }} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>}</div>)}</Glass>
          <Glass className="p-3" data-testid="siem-fields"><div className="eyebrow mb-2">fields</div>
            {res && Object.entries(res.fields).map(([f, vals]) => <div key={f} className="mb-3"><div className="text-xs font-mono text-cyan-400 mb-1">{f}</div>
              {vals.map((v) => <button key={v.value} onClick={() => addField(f, v.value)} className="w-full flex justify-between text-[11px] font-mono text-slate-400 hover:text-slate-100 py-0.5"><span className="truncate">{v.value}</span><span>{v.count}</span></button>)}</div>)}</Glass>
        </div>
        <Glass className="p-3 min-w-0">
          <div className="flex justify-between text-xs font-mono text-slate-400 mb-2"><span data-testid="siem-result-count">{res?.total ?? 0} events</span><span>showing latest {Math.min(res?.total || 0, 300)}</span></div>
          {res && <Histogram events={res.events} />}
          {res?.stats && <table className="w-full text-xs font-mono my-3" data-testid="siem-stats-table"><thead><tr className="text-slate-500 text-left"><th className="py-1">{res.stats.field}</th><th>count</th></tr></thead>
            <tbody>{res.stats.rows.map((r) => <tr key={r.value} className="border-t border-white/5"><td className="py-1.5 text-cyan-300">{r.value}</td><td>{r.count}</td></tr>)}</tbody></table>}
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full"><tbody>{res?.events.map((e) => <Row key={e.id} e={e} />)}</tbody></table>
            {res && !res.total && <Empty text="no events match" />}
          </div>
        </Glass>
      </div>
    </div>
  );
}

function DashTab() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/siem/dashboard").then((r) => setD(r.data)); }, []);
  if (!d) return null;
  const P = ({ title, data }) => (
    <Glass className="p-4 h-72"><div className="font-bold text-sm mb-2">{title}</div>
      <ResponsiveContainer height="88%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} stroke="none">{data.map((_, i) => <Cell key={i} fill={COLORS[i % 6]} />)}</Pie><Tooltip {...tip} /></PieChart></ResponsiveContainer></Glass>);
  return (
    <div className="grid md:grid-cols-3 gap-4" data-testid="siem-dashboard">
      <P title="Events by sourcetype" data={d.by_sourcetype} /><P title="Events by action" data={d.by_action} />
      <Glass className="p-4 h-72"><div className="font-bold text-sm mb-2">Top hosts</div><ResponsiveContainer height="88%"><BarChart data={d.by_host} layout="vertical"><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={90} tick={{ fill: "#94A3B8", fontSize: 10 }} /><Tooltip {...tip} /><Bar dataKey="value" fill="#00FF66" /></BarChart></ResponsiveContainer></Glass>
      <Glass className="p-4"><div className="eyebrow">total events</div><div className="text-3xl font-mono neon-text mt-1">{d.total}</div></Glass>
      <Glass className="p-4"><div className="eyebrow">failed logons (4625)</div><div className="text-3xl font-mono text-red-400 mt-1">{d.failed_logons}</div></Glass>
    </div>
  );
}

function AlertsTab() {
  const [a, setA] = useState([]);
  useEffect(() => { api.get("/siem/alerts").then((r) => setA(r.data)); }, []);
  return (
    <Glass className="divide-y divide-white/5" data-testid="siem-alerts">
      {a.map((x) => <div key={x.id} className="p-4 flex flex-wrap items-center gap-4">
        <SeverityBadge level={x.severity} /><div className="flex-1"><div className="text-sm">{x.name}</div><div className="font-mono text-xs text-slate-500">{x.query} · threshold ≥ {x.threshold}</div></div>
        <span className={`font-mono text-xs ${x.triggered ? "text-red-400" : "text-slate-500"}`}>{x.triggered ? `TRIGGERED (${x.matches})` : `ok (${x.matches})`}</span></div>)}
    </Glass>
  );
}

export default function Siem() {
  return (
    <div>
      <PageHeader eyebrow="// siem simulator" title="Search & detect" sub="Syntax: field=value (wildcards *), field!=value, free text, quoted phrases, and '| stats count by field'." />
      <Tabs defaultValue="search">
        <TabsList className="bg-black/40 mb-4"><TabsTrigger value="search" data-testid="siem-tab-search"><Search className="h-4 w-4 mr-1" />Search</TabsTrigger><TabsTrigger value="dash" data-testid="siem-tab-dashboards"><LayoutGrid className="h-4 w-4 mr-1" />Dashboards</TabsTrigger><TabsTrigger value="alerts" data-testid="siem-tab-alerts"><BellRing className="h-4 w-4 mr-1" />Alerts</TabsTrigger></TabsList>
        <TabsContent value="search"><SearchTab /></TabsContent><TabsContent value="dash"><DashTab /></TabsContent><TabsContent value="alerts"><AlertsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
