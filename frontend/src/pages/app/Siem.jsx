import { useEffect, useState } from "react";
import { Search, Save, Trash2, BellRing, LayoutGrid, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { api, errMsg } from "../../lib/api";
import { Glass, PageHeader, SeverityBadge, Empty } from "../../components/common";

const RANGES = { "1h": 1 / 24, "24h": 1, "3d": 3, "7d": 7, all: 0, custom: -1 };
const COLORS = ["#00F0FF", "#00FF66", "#FF9500", "#FFCC00", "#FF3B30", "#8B9DC3"];
const tip = { contentStyle: { background: "#0B0F1A", border: "1px solid rgba(0,240,255,.3)", fontSize: 12 } };
const EXAMPLES = {
  spl: [["Brute force sources", "index=windows EventCode=4625 | stats count by src_ip"], ["Kerberoasting", "index=windows EventCode=4769 ticket_encryption=0x17 | table _time user service src_ip"],
    ["Password spray", "sourcetype=azuread result_code=50126 | stats count by src_ip"], ["Web shell", "sourcetype=web uri=*help.aspx* | table _time src_ip method uri uri_query status"],
    ["DNS tunnel", "sourcetype=dns record_type=TXT | stats count by host"], ["Large egress", "sourcetype=firewall bytes_out>100000000 | sort -bytes_out"]],
  kql: [["Brute force sources", "SecurityEvent | where EventID == 4625 | summarize count() by IpAddress"], ["Kerberoasting", 'SecurityEvent | where EventID == 4769 and TicketEncryptionType == "0x17" | project TimeGenerated, Account, ServiceName']
    , ["Password spray", 'SigninLogs | where ResultType == "50126" | summarize count() by IPAddress, Location'], ["Office → PowerShell", 'DeviceProcessEvents | where InitiatingProcessFileName in~ ("winword.exe","w3wp.exe") | project TimeGenerated, DeviceName, ProcessCommandLine'],
    ["DNS tunnel", 'DnsEvents | where Name endswith "exfil-tunnel.xyz" | summarize count() by Computer'], ["Last 24h logons", "SecurityEvent | where TimeGenerated > ago(24h) and EventID == 4624 | summarize count() by Account"]],
};
const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

function Timeline({ data, onPick }) {
  const rows = (data || []).map((x) => ({ ...x, label: x.t.slice(5).replace("T", " ") + "h" }));
  return (
    <div className="h-36" data-testid="siem-histogram">
      <ResponsiveContainer><BarChart data={rows} onClick={(e) => e?.activePayload && onPick(e.activePayload[0].payload.t)}>
        <CartesianGrid stroke="rgba(255,255,255,.04)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} interval="preserveStartEnd" minTickGap={40} />
        <YAxis tick={{ fill: "#64748B", fontSize: 10 }} width={28} allowDecimals={false} />
        <Tooltip {...tip} cursor={{ fill: "rgba(0,240,255,.06)" }} formatter={(v) => [v, "events"]} />
        <Bar dataKey="c" fill="#00F0FF" radius={[2, 2, 0, 0]} className="cursor-pointer" />
      </BarChart></ResponsiveContainer>
    </div>);
}

function Row({ e, cols }) {
  const [open, setOpen] = useState(false);
  const n = cols ? cols.length : 5;
  return (<>
    <tr onClick={() => setOpen(!open)} className="border-b border-white/5 hover:bg-cyan-500/5 cursor-pointer font-mono text-xs" data-testid={`siem-event-${e.id}`}>
      {cols ? cols.map((c) => <td key={c} className="px-3 py-2 text-slate-300 break-all">{c === "_time" ? e._time.slice(0, 19).replace("T", " ") : String(e[c] ?? "")}</td>) : <>
        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{e._time.slice(0, 19).replace("T", " ")}</td>
        <td className="px-3 py-2 text-cyan-300">{e.sourcetype}</td><td className="px-3 py-2">{e.host}</td>
        <td className={`px-3 py-2 ${e.action === "failure" ? "text-red-400" : "text-slate-400"}`}>{e.event_id || e.action}</td>
        <td className="px-3 py-2 text-slate-300 truncate max-w-[420px]">{e.message}{e.command_line ? ` ${e.command_line}` : ""}{e.url ? ` ${e.url}` : ""}{e.query ? ` ${e.query}` : ""}{e.uri ? ` ${e.method} ${e.uri} ${e.uri_query || ""}` : ""}</td></>}
    </tr>
    {open && <tr className="bg-black/40"><td colSpan={n} className="px-3 py-3 font-mono text-xs"><pre className="whitespace-pre-wrap text-green-300">{JSON.stringify(e, null, 2)}</pre></td></tr>}
  </>);
}

function TimeRange({ range, setRange, custom, setCustom }) {
  return (<>
    <Select value={range} onValueChange={setRange}><SelectTrigger className="w-36 font-mono" data-testid="siem-time-range"><SelectValue /></SelectTrigger>
      <SelectContent>{Object.keys(RANGES).map((r) => <SelectItem key={r} value={r} data-testid={`siem-range-${r}`}>{r === "all" ? "All time" : r === "custom" ? "Custom range" : `Last ${r}`}</SelectItem>)}</SelectContent></Select>
    {range === "custom" && <div className="w-full flex flex-wrap items-center gap-2 font-mono text-xs text-slate-400" data-testid="siem-custom-range">
      from <input type="datetime-local" className="field !w-auto !py-1.5" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} data-testid="siem-start-input" />
      to <input type="datetime-local" className="field !w-auto !py-1.5" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} data-testid="siem-end-input" /></div>}
  </>);
}

function Sidebar({ saved, run, setQ, setLang, loadSaved, res, addField }) {
  return (
    <div className="space-y-4">
      <Glass className="p-3"><div className="eyebrow mb-2">saved searches</div>
        {saved.map((s) => <div key={s.id} className="flex items-center gap-1 group"><button onClick={() => { const l = s.lang || "spl"; setLang(l); setQ(s.query); run(s.query, l); }} className="flex-1 text-left text-xs py-1.5 hover:text-cyan-300 truncate" data-testid={`siem-saved-${s.id}`}><span className="text-slate-500 mr-1">{(s.lang || "spl").toUpperCase()}</span>{s.name}</button>
          {s.user_id !== "system" && <button onClick={async () => { await api.delete(`/siem/saved/${s.id}`); loadSaved(); }} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400" data-testid={`siem-saved-delete-${s.id}`}><Trash2 className="h-3 w-3" /></button>}</div>)}</Glass>
      <Glass className="p-3" data-testid="siem-fields"><div className="eyebrow mb-2">interesting fields</div>
        {res && Object.entries(res.fields).map(([f, vals]) => <div key={f} className="mb-3"><div className="text-xs font-mono text-cyan-400 mb-1">{f}</div>
          {vals.map((v) => <button key={v.value} onClick={() => addField(f, v.value)} className="w-full flex justify-between gap-2 text-[11px] font-mono text-slate-400 hover:text-slate-100 py-0.5"><span className="truncate">{v.value}</span><span>{v.count}</span></button>)}</div>)}</Glass>
    </div>);
}

function SearchTab() {
  const [lang, setLang] = useState("spl");
  const [q, setQ] = useState("");
  const [range, setRange] = useState("all");
  const [custom, setCustom] = useState(() => ({ start: local(new Date(Date.now() - 864e5)), end: local(new Date()) }));
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState([]);
  const [naming, setNaming] = useState(false);
  const [sname, setSname] = useState("");
  const window_ = () => {
    if (range === "custom") return { start: custom.start ? new Date(custom.start).toISOString() : "", end: custom.end ? new Date(custom.end).toISOString() : "" };
    const d = RANGES[range];
    return { start: d ? new Date(Date.now() - d * 864e5).toISOString() : "", end: "" };
  };
  const run = async (query = q, l = lang) => {
    try { const { data } = await api.get("/siem/search", { params: { q: query, lang: l, ...window_() } }); setRes(data); setErr(""); } catch (e) { setErr(errMsg(e)); }
  };
  const loadSaved = () => api.get("/siem/saved").then((r) => setSaved(r.data));
  useEffect(() => { run(""); loadSaved(); }, []); // eslint-disable-line
  useEffect(() => { run(); }, [range, custom]); // eslint-disable-line
  const switchLang = (l) => { setLang(l); setQ(""); run("", l); };
  const save = async () => {
    if (!sname.trim()) return;
    await api.post("/siem/saved", { name: sname.trim(), query: q, lang }); toast.success("Search saved"); setNaming(false); setSname(""); loadSaved();
  };
  const addField = (f, v) => {
    const nq = lang === "kql" ? `${q.trim() || "*"} | where ${f} == "${v}"`
      : (() => { const [main, ...pipe] = q.split("|"); return [`${main.trim()} ${f}=${v.includes(" ") ? `"${v}"` : v}`.trim(), ...pipe.map((x) => x.trim())].join(" | "); })();
    setQ(nq); run(nq);
  };
  const pickHour = (t) => { setCustom({ start: local(new Date(`${t}:00:00Z`)), end: local(new Date(`${t}:59:59Z`)) }); setRange("custom"); };
  return (
    <div className="space-y-4">
      <Glass className="p-3 flex flex-wrap gap-2">
        <div className="flex border border-white/10 rounded-sm overflow-hidden font-mono text-xs" data-testid="siem-lang-toggle">
          {[["spl", "Splunk SPL"], ["kql", "Sentinel KQL"]].map(([l, n]) => <button key={l} onClick={() => switchLang(l)} data-testid={`siem-lang-${l}`}
            className={`px-3 py-2 transition-colors ${lang === l ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>{n}</button>)}
        </div>
        <div className="flex-1 min-w-[260px] flex items-center gap-2 bg-black/40 border border-cyan-500/20 px-3 font-mono text-sm">
          <Search className="h-4 w-4 text-cyan-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder={lang === "kql" ? "SecurityEvent | where EventID == 4625 | summarize count() by IpAddress" : "index=windows EventCode=4625 | stats count by src_ip"} className="flex-1 bg-transparent py-2.5 outline-none" data-testid="siem-query-input" />
        </div>
        <TimeRange range={range} setRange={setRange} custom={custom} setCustom={setCustom} />
        <button className="glow-btn" onClick={() => run()} data-testid="siem-search-button">Search</button>
        <button className="ghost-btn" onClick={() => setNaming(!naming)} data-testid="siem-save-button"><Save className="h-4 w-4" /></button>
        {naming && <div className="w-full flex gap-2"><input autoFocus className="field font-mono" placeholder="Name this search" value={sname} onChange={(e) => setSname(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} data-testid="siem-save-name-input" />
          <button className="glow-btn" onClick={save} disabled={!sname.trim()} data-testid="siem-save-confirm">Save</button></div>}
        <div className="w-full flex flex-wrap items-center gap-1.5" data-testid="siem-examples"><Sparkles className="h-3.5 w-3.5 text-yellow-300" />
          {EXAMPLES[lang].map(([n, x], i) => <button key={n} onClick={() => { setQ(x); run(x); }} className="text-[11px] font-mono border border-white/10 px-2 py-1 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors" data-testid={`siem-example-${i}`}>{n}</button>)}</div>
      </Glass>
      {err && <div className="flex items-center gap-2 text-sm font-mono text-red-300 border border-red-500/30 bg-red-500/5 px-3 py-2" data-testid="siem-error"><AlertCircle className="h-4 w-4" />{err}</div>}
      <div className="grid lg:grid-cols-[240px_1fr] gap-4">
        <Sidebar saved={saved} run={run} setQ={setQ} setLang={setLang} loadSaved={loadSaved} res={res} addField={addField} />
        <Glass className="p-3 min-w-0">
          <div className="flex justify-between text-xs font-mono text-slate-400 mb-2"><span data-testid="siem-result-count">{res?.total ?? 0} events</span><span>timeline · click a bar to zoom into that hour</span></div>
          {res && <Timeline data={res.timeline} onPick={pickHour} />}
          {res?.stats && <table className="w-full text-xs font-mono my-3" data-testid="siem-stats-table"><thead><tr className="text-slate-500 text-left"><th className="py-1">{res.stats.field}</th><th>count</th></tr></thead>
            <tbody>{res.stats.rows.map((r) => <tr key={r.value} className="border-t border-white/5"><td className="py-1.5 text-cyan-300">{r.value}</td><td>{r.count}</td></tr>)}</tbody></table>}
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full" data-testid="siem-events-table">
              <thead><tr className="text-left text-[11px] font-mono text-slate-500 border-b border-white/10">{(res?.columns || ["_time", "sourcetype", "host", "event", "details"]).map((c) => <th key={c} className="px-3 py-2 font-normal">{c}</th>)}</tr></thead>
              <tbody>{res?.events.map((e) => <Row key={e.id} e={e} cols={res.columns} />)}</tbody></table>
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
      <Glass className="p-4 md:col-span-3 h-56"><div className="font-bold text-sm mb-2">Event volume over time</div>
        <ResponsiveContainer height="85%"><BarChart data={d.timeline}><XAxis dataKey="t" tick={{ fill: "#64748B", fontSize: 10 }} minTickGap={40} /><YAxis tick={{ fill: "#64748B", fontSize: 10 }} width={28} /><Tooltip {...tip} /><Bar dataKey="c" fill="#00F0FF" /></BarChart></ResponsiveContainer></Glass>
      <P title="Events by sourcetype" data={d.by_sourcetype} /><P title="Events by action" data={d.by_action} />
      <Glass className="p-4 h-72"><div className="font-bold text-sm mb-2">Top hosts</div><ResponsiveContainer height="88%"><BarChart data={d.by_host} layout="vertical"><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={90} tick={{ fill: "#94A3B8", fontSize: 10 }} /><Tooltip {...tip} /><Bar dataKey="value" fill="#00FF66" /></BarChart></ResponsiveContainer></Glass>
      <Glass className="p-4"><div className="eyebrow">total events</div><div className="text-3xl font-mono neon-text mt-1" data-testid="siem-total-events">{d.total}</div></Glass>
      <Glass className="p-4"><div className="eyebrow">failed logons (4625 + cloud)</div><div className="text-3xl font-mono text-red-400 mt-1">{d.failed_logons}</div></Glass>
      {d.by_country?.length > 0 && <P title="Sign-ins by country" data={d.by_country} />}
    </div>
  );
}

function AlertsTab() {
  const [a, setA] = useState([]);
  useEffect(() => { api.get("/siem/alerts").then((r) => setA(r.data)); }, []);
  return (
    <Glass className="divide-y divide-white/5" data-testid="siem-alerts">
      {a.map((x) => <div key={x.id} className="p-4 flex flex-wrap items-center gap-4" data-testid={`siem-alert-${x.id}`}>
        <SeverityBadge level={x.severity} /><div className="flex-1"><div className="text-sm">{x.name}</div><div className="font-mono text-xs text-slate-500">{x.query} · threshold ≥ {x.threshold}</div></div>
        <span className={`font-mono text-xs ${x.triggered ? "text-red-400" : "text-slate-500"}`}>{x.triggered ? `TRIGGERED (${x.matches})` : `ok (${x.matches})`}</span></div>)}
    </Glass>
  );
}

export default function Siem() {
  return (
    <div>
      <PageHeader eyebrow="// siem simulator" title="Search & detect" sub="Query a week of realistic attack logs in Splunk SPL or Microsoft Sentinel KQL. SPL: field=value, wildcards, OR/NOT, | stats count by, table, sort, head, dedup. KQL: Table | where, summarize count() by, project, take, sort by." />
      <Tabs defaultValue="search">
        <TabsList className="bg-black/40 mb-4"><TabsTrigger value="search" data-testid="siem-tab-search"><Search className="h-4 w-4 mr-1" />Search</TabsTrigger><TabsTrigger value="dash" data-testid="siem-tab-dashboards"><LayoutGrid className="h-4 w-4 mr-1" />Dashboards</TabsTrigger><TabsTrigger value="alerts" data-testid="siem-tab-alerts"><BellRing className="h-4 w-4 mr-1" />Alerts</TabsTrigger></TabsList>
        <TabsContent value="search"><SearchTab /></TabsContent><TabsContent value="dash"><DashTab /></TabsContent><TabsContent value="alerts"><AlertsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
