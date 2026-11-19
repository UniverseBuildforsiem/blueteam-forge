import { useState } from "react";
import { toast } from "sonner";
import { Sev, Panel, Btn, In, Sel, Lbl, Table, Drawer, CopyField, useForm } from "./ui";

const vulnSum = (a) => a.vulns.reduce((n, x) => n + x, 0);

export function Dashboard({ d, st }) {
  const sev = [1, 2, 3, 4, 5].map((s) => d.assets.reduce((n, a) => n + a.vulns[s - 1], 0)), max = Math.max(...sev);
  const kpi = [["Assets", d.assets.length], ["Active agents", d.agents.length + (st.installed ? 1 : 0)], ["Severity 5", sev[4]], ["Scans (lab)", (st.console.scans || []).length]];
  return <div className="space-y-3" data-testid="vmc-dashboard">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{kpi.map(([k, v]) => <div key={k} className="bg-[#131c27] border border-slate-700/70 p-3"><div className="text-[11px] text-slate-400">{k}</div><div className="text-2xl font-semibold text-slate-100" data-testid={`vmc-kpi-${k.toLowerCase().replace(/\s/g, "-")}`}>{v}</div></div>)}</div>
    <div className="grid xl:grid-cols-2 gap-3">
      <Panel title="Vulnerabilities by severity"><div className="space-y-1.5">{sev.map((v, i) => <div key={i} className="flex items-center gap-2 text-xs"><Sev n={i + 1} /><div className="flex-1 h-3 bg-slate-800"><div className={`h-3 ${["bg-slate-500", "bg-sky-500", "bg-yellow-500", "bg-orange-500", "bg-red-600"][i]}`} style={{ width: `${(100 * v) / max}%` }} /></div><span className="w-8 text-right text-slate-300">{v}</span></div>)}</div></Panel>
      <Panel title="Top vulnerable assets"><Table cols={["Host", "IP", "Total"]} rows={[...d.assets].sort((a, b) => vulnSum(b) - vulnSum(a)).slice(0, 5).map((a) => [a.host, a.ip, vulnSum(a)])} /></Panel>
    </div>
  </div>;
}

export function Assets({ d, emit }) {
  const [q, setQ] = useState("");
  const rows = d.assets.filter((a) => !q || `${a.host} ${a.ip} ${a.os} ${a.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return <Panel title={`Asset Inventory (${rows.length})`} tid="vmc-assets" actions={<form onSubmit={(e) => { e.preventDefault(); emit("asset.searched", { q }); }} className="w-56"><In placeholder="Search host, IP, OS, tag — Enter" value={q} onChange={(e) => setQ(e.target.value)} data-testid="vmc-asset-search" /></form>}>
    <Table cols={["Host", "IP", "Operating system", "Tags", "Agent", "Last scan", "Vulns (1-5)"]} rows={rows.map((a) => [a.host, a.ip, a.os, a.tags.join(", "), a.agent, a.last_scan, <span className="flex gap-0.5">{a.vulns.map((v, i) => <span key={i} className="w-5 text-center text-[10px] text-slate-300">{v}</span>)}</span>])} />
  </Panel>;
}

export function Tags({ d, st, emit }) {
  const [f, on, reset] = useForm({ name: "", rule: "Static", color: "Blue" });
  const mine = st.console.tags || [];
  const add = (e) => { e.preventDefault(); if (!f.name.trim()) return; emit("tag.created", f); toast.success(`Tag '${f.name}' created`); reset(); };
  return <div className="grid xl:grid-cols-[1fr_280px] gap-3"><Panel title="Tags" tid="vmc-tags"><Table cols={["Name", "Type", "Assets"]} rows={[...d.tags.map((t) => [t, "Static", d.assets.filter((a) => a.tags.includes(t)).length]), ...mine.map((t) => [t.name, t.rule, 0])]} /></Panel>
    <Panel title="Create tag"><form onSubmit={add} className="space-y-2"><Lbl t="Tag name"><In value={f.name} onChange={on("name")} data-testid="vmc-tag-name" /></Lbl><Lbl t="Rule engine"><Sel options={["Static", "Asset Name Contains", "OS Regular Expression", "IP Address In Range(s)"]} value={f.rule} onChange={on("rule")} /></Lbl><Lbl t="Color"><Sel options={["Blue", "Red", "Green", "Orange"]} value={f.color} onChange={on("color")} /></Lbl><Btn primary type="submit" data-testid="vmc-tag-create">Create</Btn></form></Panel></div>;
}

export function Groups({ d, st, emit }) {
  const [f, on, reset] = useForm({ name: "", tag: d.tags[0] });
  const add = (e) => { e.preventDefault(); if (!f.name.trim()) return; emit("asset_group.created", f); toast.success("Asset group saved"); reset(); };
  return <div className="grid xl:grid-cols-[1fr_280px] gap-3"><Panel title="Asset Groups" tid="vmc-groups"><Table cols={["Name", "Built from tag", "Assets"]} rows={[["All", "—", d.assets.length], ...(st.console.groups || []).map((g) => [g.name, g.tag, d.assets.filter((a) => a.tags.includes(g.tag)).length])]} /></Panel>
    <Panel title="New asset group"><form onSubmit={add} className="space-y-2"><Lbl t="Title"><In value={f.name} onChange={on("name")} data-testid="vmc-group-name" /></Lbl><Lbl t="Add assets with tag"><Sel options={d.tags} value={f.tag} onChange={on("tag")} /></Lbl><Btn primary type="submit" data-testid="vmc-group-create">Save</Btn></form></Panel></div>;
}

export function Scans({ d, st, emit }) {
  const [step, setStep] = useState(0);
  const [f, on, reset] = useForm({ title: "", profile: d.profiles[0], target: "All", scanner: "External (cloud)" });
  const targets = ["All", ...d.tags, ...(st.console.groups || []).map((g) => g.name)];
  const launch = () => { emit("scan.launched", f); toast.success("Scan launched"); reset(); setStep(0); };
  const steps = [<Lbl t="Scan title"><In value={f.title} onChange={on("title")} data-testid="vmc-scan-title" /></Lbl>, <Lbl t="Option profile"><Sel options={d.profiles} value={f.profile} onChange={on("profile")} data-testid="vmc-scan-profile" /></Lbl>,
    <div className="space-y-2"><Lbl t="Target (tag or asset group)"><Sel options={targets} value={f.target} onChange={on("target")} data-testid="vmc-scan-target" /></Lbl><Lbl t="Scanner appliance"><Sel options={["External (cloud)", "LAB-SCANNER-01"]} value={f.scanner} onChange={on("scanner")} /></Lbl></div>];
  return <div className="grid xl:grid-cols-[1fr_320px] gap-3"><Panel title="Scans" tid="vmc-scans"><Table cols={["Title", "Profile", "Target", "Status"]} rows={(st.console.scans || []).map((s) => [s.title, s.profile, s.target, "Finished"])} empty="No scans yet — use the wizard" /></Panel>
    <Panel title={`Launch scan · step ${step + 1} of 3`} tid="vmc-scan-wizard"><div className="space-y-3">{steps[step]}<div className="flex gap-2">{step > 0 && <Btn onClick={() => setStep(step - 1)}>Back</Btn>}
      {step < 2 ? <Btn primary disabled={step === 0 && !f.title.trim()} onClick={() => setStep(step + 1)} data-testid="vmc-scan-next">Next</Btn> : <Btn primary onClick={launch} data-testid="vmc-scan-launch">Launch</Btn>}</div></div></Panel></div>;
}

export function Schedules({ d, st, emit }) {
  const [f, on, reset] = useForm({ title: "", profile: d.profiles[0], target: "All", frequency: "Weekly", start: "2026-06-15T02:00" });
  const add = (e) => { e.preventDefault(); if (!f.title.trim()) return; emit("scan.scheduled", f); toast.success("Schedule saved"); reset(); };
  return <div className="grid xl:grid-cols-[1fr_300px] gap-3"><Panel title="Scheduled scans" tid="vmc-schedules"><Table cols={["Title", "Frequency", "Next run", "Target"]} rows={(st.console.schedules || []).map((s) => [s.title, s.frequency, s.start.replace("T", " "), s.target])} empty="No schedules" /></Panel>
    <Panel title="New schedule"><form onSubmit={add} className="space-y-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="vmc-sched-title" /></Lbl><Lbl t="Option profile"><Sel options={d.profiles} value={f.profile} onChange={on("profile")} /></Lbl>
      <Lbl t="Target"><Sel options={["All", ...d.tags]} value={f.target} onChange={on("target")} /></Lbl><Lbl t="Frequency"><Sel options={["Daily", "Weekly", "Monthly"]} value={f.frequency} onChange={on("frequency")} data-testid="vmc-sched-frequency" /></Lbl>
      <Lbl t="Start"><In type="datetime-local" value={f.start} onChange={on("start")} /></Lbl><Btn primary type="submit" data-testid="vmc-sched-save">Save schedule</Btn></form></Panel></div>;
}

export function Reports({ d, st, emit }) {
  const [f, on, reset] = useForm({ title: "", template: d.templates[0], format: "PDF", target: "All" });
  const add = (e) => { e.preventDefault(); emit("report.generated", { ...f, title: f.title || f.template }); toast.success("Report generated"); reset(); };
  return <div className="grid xl:grid-cols-[1fr_300px] gap-3"><Panel title="Reports" tid="vmc-reports"><Table cols={["Title", "Template", "Format", "Status"]} rows={(st.console.reports || []).map((r) => [r.title, r.template, r.format, "Finished · 1.2 MB"])} empty="No reports" /></Panel>
    <Panel title="Report builder"><form onSubmit={add} className="space-y-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="vmc-report-title" /></Lbl><Lbl t="Template"><Sel options={d.templates} value={f.template} onChange={on("template")} data-testid="vmc-report-template" /></Lbl>
      <Lbl t="Format"><Sel options={["PDF", "CSV", "HTML"]} value={f.format} onChange={on("format")} data-testid="vmc-report-format" /></Lbl><Lbl t="Asset target"><Sel options={["All", ...d.tags]} value={f.target} onChange={on("target")} /></Lbl><Btn primary type="submit" data-testid="vmc-report-run">Run report</Btn></form></Panel></div>;
}

export function Users({ d, st, emit }) {
  const [f, on, reset] = useForm({ name: "", role: "Reader" });
  const add = (e) => { e.preventDefault(); if (!f.name.trim()) return; emit("user.created", f); toast.success("User added"); reset(); };
  return <div className="grid xl:grid-cols-[1fr_280px] gap-3"><Panel title="Users" tid="vmc-users"><Table cols={["Name", "Login", "Role", "Status"]} rows={[...d.users.map((u) => [u.name, u.login, u.role, u.status]), ...(st.console.users || []).map((u, i) => [u.name, `socp_new${i + 1}`, u.role, "Pending activation"])]} /></Panel>
    <Panel title="Add user"><form onSubmit={add} className="space-y-2"><Lbl t="Full name"><In value={f.name} onChange={on("name")} data-testid="vmc-user-name" /></Lbl><Lbl t="User role"><Sel options={["Manager", "Unit Manager", "Scanner", "Reader", "Remediation User"]} value={f.role} onChange={on("role")} data-testid="vmc-user-role" /></Lbl><Btn primary type="submit" data-testid="vmc-user-add">Add user</Btn></form></Panel></div>;
}

export function KB({ d, emit }) {
  const [q, setQ] = useState("");
  const [sev, setSev] = useState("Any");
  const rows = d.kb.filter((k) => (!q || `${k.qid} ${k.title} ${k.cve} ${k.category}`.toLowerCase().includes(q.toLowerCase())) && (sev === "Any" || String(k.severity) === sev));
  return <Panel title={`KnowledgeBase (${rows.length})`} tid="vmc-kb" actions={<div className="flex gap-2"><form onSubmit={(e) => { e.preventDefault(); emit("kb.searched", { q }); }} className="w-56"><In placeholder="QID, title or ID — Enter" value={q} onChange={(e) => setQ(e.target.value)} data-testid="vmc-kb-search" /></form><div className="w-20"><Sel options={["Any", "5", "4", "3", "2", "1"]} value={sev} onChange={(e) => setSev(e.target.value)} /></div></div>}>
    <Table cols={["QID", "Title", "Sev", "Category", "Reference (fake)", "Patch"]} rows={rows.map((k) => [k.qid, k.title, <Sev n={k.severity} />, k.category, k.cve, k.patch ? "Yes" : "No"])} />
  </Panel>;
}

export function Agents({ d, st, emit }) {
  const [view, setView] = useState("agents");
  const [open, setOpen] = useState(null);
  const agents = [...(st.installed ? [d.new_agent] : []), ...d.agents];
  const openAgent = (a) => { setOpen({ t: "agent", a }); emit("console.agent_viewed", { host: a.host }); };
  const openKey = (k) => { setOpen({ t: "key", k }); emit("console.activation_key_viewed", { name: k.name }); };
  return <div className="relative min-h-[420px]" data-testid="vmc-agents">
    <div className="flex gap-1 mb-3">{[["agents", "Agents"], ["keys", "Activation Keys"]].map(([k, l]) => <Btn key={k} primary={view === k} onClick={() => setView(k)} data-testid={`vmc-agent-tab-${k}`}>{l}</Btn>)}</div>
    {view === "agents" ? <Panel title={`Agents (${agents.length})`}><Table tid="vmc-agent-table" rowTid="vmc-agent-row" cols={["Host", "IP", "OS", "Status", "Version", "Last check-in"]} rows={agents.map((a) => [a.host, a.ip, a.os, <span className="text-green-400">{a.status}</span>, a.version, a.last_checkin])} onRow={(i) => openAgent(agents[i])} /></Panel>
      : <Panel title="Activation Keys"><Table tid="vmc-key-table" rowTid="vmc-key-row" cols={["Title", "Status", "Used / Limit", "Modules"]} rows={d.keys.map((k) => [<span className="text-sky-300 underline">{k.name}</span>, <span className={k.status === "Active" ? "text-green-400" : "text-red-400"}>{k.status}</span>, `${k.used} / ${k.limit}`, k.modules.join(", ")])} onRow={(i) => openKey(d.keys[i])} /></Panel>}
    {open?.t === "agent" && <Drawer title={`Agent · ${open.a.host}`} onClose={() => setOpen(null)} tid="vmc-agent-drawer">
      {[["Status", open.a.status], ["IP", open.a.ip], ["OS", open.a.os], ["Version", open.a.version], ["Activation key", open.a.key], ["Last check-in", open.a.last_checkin], ["Agent ID", open.a.agent_id || "hidden in training data"]].map(([k, v]) => <div key={k} className="flex text-xs border-b border-slate-700/60 py-1.5"><span className="w-32 text-slate-400">{k}</span><span className="text-slate-100 break-all">{v}</span></div>)}</Drawer>}
    {open?.t === "key" && <Drawer title={`Activation key · ${open.k.name}`} onClose={() => setOpen(null)} tid="vmc-key-drawer">
      {open.k.status !== "Active" && <div className="text-xs text-red-300 border border-red-500/40 p-2">This key is revoked. Agents can't activate with it.</div>}
      <CopyField label="CustomerId" value={open.k.customer_id} tid="vmc-key-customer" /><CopyField label="ActivationId" value={open.k.activation_id} tid="vmc-key-activation" /><CopyField label="WebServiceUri" value={open.k.uri} tid="vmc-key-uri" />
      <CopyField label="Installer SHA256 (SOCPCloudAgent.exe)" value={open.k.sha256} tid="vmc-key-sha" />
      <CopyField label="Install command" value={`SOCPCloudAgent.exe CustomerId={${open.k.customer_id}} ActivationId={${open.k.activation_id}} WebServiceUri=${open.k.uri}`} tid="vmc-key-command" /></Drawer>}
  </div>;
}
