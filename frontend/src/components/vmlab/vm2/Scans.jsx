import { useState } from "react";
import { toast } from "sonner";
import { Sev, Panel, Btn, In, Sel, Lbl, Table, Drawer, SubTabs, Check, useForm } from "../ui";
import { ScanRun } from "./ScanRun";
import { targetHosts, findings, TYPE_CLS, yes } from "./lib";

export const profilesOf = (d, st) => [...d.profiles, ...(st.console.oprofiles || []).map((p) => p.title)];
const TYPES = ["Confirmed", "Potential", "Information gathered"];

function HostResult({ d, h }) {
  const f = findings(d, h);
  return <details className="border border-slate-700" data-testid={`vmc-result-host-${h.ip}`}><summary className="cursor-pointer px-2 py-1.5 text-xs flex gap-3 items-center"><b className="text-slate-100">{h.ip}</b><span className="text-slate-300">{h.name}</span><span className="text-slate-500">{h.os}</span>
    <span className="ml-auto flex gap-2">{TYPES.map((t) => <span key={t} className={`border px-1.5 text-[10px] ${TYPE_CLS[t]}`}>{f.filter((k) => k.type === t).length}</span>)}</span></summary>
    <div className="p-2 space-y-2">{TYPES.map((t) => <div key={t}><div className={`text-[11px] font-semibold ${TYPE_CLS[t].split(" ")[0]}`}>{t}</div>
      {f.filter((k) => k.type === t).sort((a, b) => b.severity - a.severity).map((k) => <div key={k.qid} className="flex gap-2 items-center text-[11px] py-0.5"><Sev n={k.severity} /><span className="font-mono text-slate-400 w-14">{k.qid}</span><span className="text-slate-200 truncate">{k.title}</span><span className="ml-auto font-mono text-slate-500 shrink-0">{k.cve}</span></div>)}</div>)}</div></details>;
}

function Results({ d, st, scan, onClose }) {
  const hosts = targetHosts(d, st, scan.target);
  return <Drawer title={`Scan results · ${scan.title}`} onClose={onClose} tid="vmc-results">
    <div className="text-[11px] text-slate-400">Profile {scan.profile} · Target {scan.target} · {hosts.length} hosts · <span className="text-red-300">red confirmed</span> · <span className="text-yellow-200">yellow potential</span> · <span className="text-sky-300">blue info gathered</span></div>
    <div className="space-y-1.5">{hosts.map((h) => <HostResult key={h.ip} d={d} h={h} />)}{!hosts.length && <p className="text-xs text-slate-500">No hosts responded.</p>}</div>
  </Drawer>;
}

function ScanList({ d, st, emit }) {
  const [f, on, reset] = useForm({ title: "", profile: d.profiles[0], target: "", scanner: "External scanner pool" });
  const [run, setRun] = useState(null);
  const [view, setView] = useState(null);
  const scans = st.console.scans || [];
  const launch = (e) => { e.preventDefault(); if (!f.title.trim() || !f.target.trim()) return toast.error("Title and target are required"); emit("scan.launched", { ...f, title: f.title.trim() }); setRun({ ...f, hosts: targetHosts(d, st, f.target) }); reset(); };
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] items-start gap-3">
    <Panel title="Scans" tid="vmc-scans"><div className="space-y-3">{run && <ScanRun d={d} hosts={run.hosts} title={run.title} onDone={() => { setRun(null); toast.success("Scan processed · results ready"); }} />}
      <Table rowTid="vmc-scan-row" cols={["Title", "Profile", "Target", "Status", ""]} empty="No scans yet" rows={scans.map((s, i) => { const busy = run && i === scans.length - 1;
        return [s.title, s.profile, s.target, busy ? "Running" : <span className="text-green-400">Finished · Processed</span>, <Btn disabled={busy} onClick={() => { setView(s); emit("scan.results_viewed", { title: s.title }); }} data-testid={`vmc-scan-view-${i}`}>View results</Btn>]; })} /></div></Panel>
    <Panel title="Launch vulnerability scan" tid="vmc-scan-wizard"><form onSubmit={launch} className="space-y-2">
      <Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="vmc-scan-title" /></Lbl>
      <Lbl t="Option profile"><Sel options={profilesOf(d, st)} value={f.profile} onChange={on("profile")} data-testid="vmc-scan-profile" /></Lbl>
      <Lbl t="Target IPs / ranges or asset group name"><div className="flex gap-1"><In value={f.target} onChange={on("target")} placeholder="10.50.200.243-10.50.200.250" data-testid="vmc-scan-target" /><Btn type="button" onClick={() => on("target")({ target: { value: d.m2.range } })} data-testid="vmc-scan-select-all">Select</Btn></div></Lbl>
      <Lbl t="Scanner"><Sel options={["External scanner pool", "LAB-SCANNER-01"]} value={f.scanner} onChange={on("scanner")} /></Lbl>
      <p className="text-[10px] text-yellow-200/80">Only scan targets you're approved to scan.</p><Btn primary type="submit" disabled={!!run} data-testid="vmc-scan-launch">Launch</Btn></form></Panel>
    {view && <Results d={d} st={st} scan={view} onClose={() => setView(null)} />}
  </div>;
}

const PORTS = "21, 22, 23, 25, 53, 80, 88, 110, 111, 135, 139, 143, 389, 443, 445, 465, 587, 993, 1433, 1521, 2049, 3306, 3389, 5432, 5900, 5985, 8080, 8443 … (~1,900 ports)";

function Profiles({ d, st, emit }) {
  const [f, on, reset] = useForm({ title: "", ports: "Standard Scan", performance: "Normal", detection: "Complete" });
  const [c, setC] = useState({ windows: false, unix: false, global: false });
  const [ports, setPorts] = useState(false);
  const save = (e) => { e.preventDefault(); if (!f.title.trim()) return toast.error("Title is required"); emit("option_profile.created", { ...f, title: f.title.trim(), windows: yes(c.windows), unix: yes(c.unix), global: yes(c.global) }); toast.success("Option profile saved"); reset(); setC({ windows: false, unix: false, global: false }); };
  const mine = st.console.oprofiles || [];
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] items-start gap-3"><Panel title="Option Profiles" tid="vmc-oprofiles"><Table cols={["Title", "Ports", "Performance", "Detection", "Auth", "Global"]} rows={[...d.profiles.map((p) => [p, "Standard Scan", "Normal", "Complete", "-", "Yes"]), ...mine.map((p) => [p.title, p.ports, p.performance, p.detection, [p.windows === "yes" && "Windows", p.unix === "yes" && "Unix"].filter(Boolean).join(", ") || "-", p.global === "yes" ? "Yes" : "No"])]} /></Panel>
    <Panel title="New option profile"><form onSubmit={save} className="space-y-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="vmc-op-title" /></Lbl>
      <Lbl t="TCP/UDP ports"><Sel options={["Standard Scan", "Light Scan", "Full", "Custom"]} value={f.ports} onChange={on("ports")} data-testid="vmc-op-ports" /></Lbl>
      <button type="button" className="text-[11px] text-sky-300 underline" onClick={() => { setPorts(!ports); if (!ports) emit("profile.ports_viewed", {}); }} data-testid="vmc-op-viewlist">View list</button>{ports && <p className="text-[10px] font-mono text-slate-400" data-testid="vmc-op-portlist">{PORTS}</p>}
      <Lbl t="Overall performance"><Sel options={["High", "Normal", "Low", "Custom"]} value={f.performance} onChange={on("performance")} data-testid="vmc-op-performance" /></Lbl>
      <Lbl t="Vulnerability detection"><Sel options={["Complete", "Custom", "Runtime"]} value={f.detection} onChange={on("detection")} data-testid="vmc-op-detection" /></Lbl>
      <Check label="Windows authentication" checked={c.windows} onChange={(v) => setC({ ...c, windows: v })} tid="vmc-op-windows" /><Check label="Unix authentication" checked={c.unix} onChange={(v) => setC({ ...c, unix: v })} tid="vmc-op-unix" />
      <Check label="Global (visible to all users)" checked={c.global} onChange={(v) => setC({ ...c, global: v })} tid="vmc-op-global" /><Btn primary type="submit" data-testid="vmc-op-save">Save profile</Btn></form></Panel></div>;
}

function AuthForm({ kind, d, emit, onClose }) {
  const [f, on] = useForm({ title: "", type: "Domain", domain: "", user: "", password: "", protocol: "NTLMv2", delegation: "Sudo", ips: "" });
  const save = () => {
    if (!f.title.trim() || !f.user.trim() || !f.password) return toast.error("Title, user name and password are required");
    if (kind === "Unix" && f.user.trim().toLowerCase() === "root") return toast.error("Avoid the root account: use a standard user with root delegation");
    if ((kind === "Unix" || f.type === "Local") && !f.ips.trim()) return toast.error("IPs are required for this record type");
    const base = { kind, title: f.title.trim(), user: f.user.trim() };
    emit("auth.created", kind === "Windows" ? { ...base, type: f.type, domain: f.domain.trim(), protocol: f.protocol, ...(f.type === "Local" ? { ips: f.ips } : {}) } : { ...base, delegation: f.delegation, ips: f.ips });
    toast.success("Authentication record created"); onClose();
  };
  return <Drawer title={`New ${kind} record`} onClose={onClose} tid="vmc-auth-drawer"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="vmc-auth-title" /></Lbl>
    {kind === "Windows" && <><Lbl t="Authentication"><Sel options={["Domain", "Local"]} value={f.type} onChange={on("type")} data-testid="vmc-auth-type" /></Lbl>{f.type === "Domain" && <Lbl t="Domain (Active Directory)"><In value={f.domain} onChange={on("domain")} placeholder={d.m2.domain} data-testid="vmc-auth-domain" /></Lbl>}</>}
    <Lbl t="User name"><In value={f.user} onChange={on("user")} data-testid="vmc-auth-user" /></Lbl><Lbl t="Password"><In type="password" value={f.password} onChange={on("password")} data-testid="vmc-auth-password" /></Lbl>
    {kind === "Windows" ? <Lbl t="Protocol"><Sel options={["NTLMv2", "Kerberos", "NTLMv1"]} value={f.protocol} onChange={on("protocol")} /></Lbl> : <Lbl t="Root delegation"><Sel options={["None", "Sudo", "PowerBroker", "Pimsu"]} value={f.delegation} onChange={on("delegation")} data-testid="vmc-auth-delegation" /></Lbl>}
    {(kind === "Unix" || f.type === "Local") && <Lbl t="IPs (required)"><In value={f.ips} onChange={on("ips")} data-testid="vmc-auth-ips" /></Lbl>}
    {kind === "Windows" && f.type === "Domain" && <p className="text-[11px] text-slate-500">IPs aren't needed: they're collected from the domain at scan time.</p>}
    <Btn primary onClick={save} data-testid="vmc-auth-create">Create</Btn></Drawer>;
}

function Auth({ d, st, emit }) {
  const [open, setOpen] = useState(null);
  return <div className="min-h-[380px]"><Panel title="Authentication Records" tid="vmc-auth" actions={<div className="flex gap-1"><Btn onClick={() => setOpen("Windows")} data-testid="vmc-auth-new-windows">New Windows</Btn><Btn onClick={() => setOpen("Unix")} data-testid="vmc-auth-new-unix">New Unix</Btn></div>}>
    <Table cols={["Title", "Type", "User", "Domain / delegation", "IPs"]} empty="No records" rows={(st.console.auth || []).map((a) => [a.title, a.kind === "Windows" ? `Windows · ${a.type}` : "Unix", a.user, a.domain || a.delegation || "-", a.ips || "from domain"])} /></Panel>
    {open && <AuthForm kind={open} d={d} emit={emit} onClose={() => setOpen(null)} />}</div>;
}

function Setup({ st, emit }) {
  const [m, setM] = useState(st.console.storage || "6");
  return <Panel title="Setup · Storage" tid="vmc-storage"><div className="space-y-2 max-w-xs"><p className="text-[11px] text-slate-400">Scan and map results are auto-deleted after this many months.</p>
    <Lbl t="Auto delete after (months)"><Sel options={Array.from({ length: 13 }, (_, i) => String(i + 1))} value={m} onChange={(e) => setM(e.target.value)} data-testid="vmc-storage-months" /></Lbl>
    <Btn primary onClick={() => { emit("storage.saved", { months: m }); toast.success("Storage saved"); }} data-testid="vmc-storage-save">Save</Btn></div></Panel>;
}

export function Scans2(p) {
  const [t, setT] = useState("scans");
  const V = { scans: ScanList, profiles: Profiles, auth: Auth, setup: Setup }[t];
  return <div className="space-y-3"><SubTabs tid="vmc-scans-tab" cur={t} set={setT} tabs={[["scans", "Scans"], ["profiles", "Option Profiles"], ["auth", "Authentication"], ["setup", "Setup"]]} /><V {...p} /></div>;
}
