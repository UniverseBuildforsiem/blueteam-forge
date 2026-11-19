import { useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Save } from "lucide-react";
import { Sev, Panel, Btn, In, Sel, Lbl, Table, Drawer, CopyField } from "./ui";

const MODS = [["AI", "Asset Inventory"], ["VM", "Vulnerability Management"], ["PC", "Policy Compliance"], ["FIM", "File Integrity Monitoring"], ["EDR", "Endpoint Detection & Response"], ["PM", "Patch Management"]];
const OSES = ["Windows (.exe)", "Windows (.msi)", "Linux (.rpm)", "Linux (.deb)", "macOS (.pkg)"];

function cmdFor(os, k) {
  const ids = `CustomerId={${k.customer_id}} ActivationId={${k.activation_id}} WebServiceUri=${k.uri}`;
  const nix = `ActivationId=${k.activation_id} CustomerId=${k.customer_id} ServerUri=${k.uri}`;
  return {
    "Windows (.exe)": [`SOCPCloudAgent.exe`, `SOCPCloudAgent.exe ${ids}`],
    "Windows (.msi)": [`SOCPCloudAgent.msi`, `msiexec /i SOCPCloudAgent.msi ${ids} /qn`],
    "Linux (.rpm)": [`socp-cloud-agent-x86_64.rpm`, `sudo rpm -ivh socp-cloud-agent-x86_64.rpm && sudo /usr/local/socp/cloud-agent/bin/socp-cloud-agent.sh ${nix}`],
    "Linux (.deb)": [`socp-cloud-agent_amd64.deb`, `sudo dpkg --install socp-cloud-agent_amd64.deb && sudo /usr/local/socp/cloud-agent/bin/socp-cloud-agent.sh ${nix}`],
    "macOS (.pkg)": [`SOCPCloudAgent.pkg`, `sudo installer -pkg SOCPCloudAgent.pkg -target / && sudo /Applications/SOCPCloudAgent.app/Contents/MacOS/socp-cloud-agent.sh ${nix}`],
  }[os];
}

function KeyDrawer({ k, emit, onClose }) {
  const [os, setOs] = useState(null);
  const pick = (o) => { setOs(o); emit("install_instructions.viewed", { os: o, key: k.name }); };
  const c = os && cmdFor(os, k);
  return <Drawer title={`Activation key · ${k.name}`} onClose={onClose} tid="vmc-key-drawer">
    {k.status !== "Active" && <div className="text-xs text-red-300 border border-red-500/40 p-2">This key is revoked. Agents can't activate with it.</div>}
    <div className="text-xs text-slate-400">Modules: <span className="text-slate-200">{k.modules.join(", ")}</span> · Used {k.used}/{k.limit}{k.tag && <> · Tag <span className="text-sky-300">{k.tag}</span></>}</div>
    <CopyField label="CustomerId" value={k.customer_id} tid="vmc-key-customer" /><CopyField label="ActivationId" value={k.activation_id} tid="vmc-key-activation" /><CopyField label="WebServiceUri" value={k.uri} tid="vmc-key-uri" />
    <CopyField label="Installer SHA256 (SOCPCloudAgent.exe)" value={k.sha256} tid="vmc-key-sha" />
    <div className="border-t border-slate-700 pt-3"><div className="text-xs font-semibold text-slate-100 mb-2">Install Agent</div>
      <div className="flex flex-wrap gap-1">{OSES.map((o) => <Btn key={o} primary={os === o} onClick={() => pick(o)} data-testid={`vmc-install-os-${o.replace(/\W+/g, "-").toLowerCase()}`}>{o}</Btn>)}</div>
      {c && <div className="mt-3 space-y-2" data-testid="vmc-install-panel"><Btn primary onClick={() => { emit("installer.downloaded", { os }); toast.success(`${c[0]} downloaded to the lab host`); }} data-testid="vmc-install-download"><Download className="inline h-3.5 w-3.5 mr-1" />Download {c[0]}</Btn>
        <CopyField label={`Install command · ${os}`} value={c[1]} tid="vmc-key-command" /><p className="text-[11px] text-slate-500">Run from an elevated prompt (Windows) or with sudo (Linux/macOS). Requires outbound TCP 443 with TLS 1.2+.</p></div>}
    </div>
  </Drawer>;
}

function NewKey({ emit, onClose }) {
  const [f, setF] = useState({ title: "", tag: "", limit: "", expiry: "", mods: ["AI"] });
  const tog = (m) => setF({ ...f, mods: f.mods.includes(m) ? f.mods.filter((x) => x !== m) : [...f.mods, m] });
  const save = () => { if (!f.title.trim()) return toast.error("Title is required"); emit("key.created", { title: f.title, tag: f.tag, limit: f.limit, expiry: f.expiry, modules: MODS.map((m) => m[0]).filter((m) => f.mods.includes(m)).join(",") }); toast.success("Activation key created"); onClose(); };
  return <Drawer title="New activation key" onClose={onClose} tid="vmc-newkey-drawer">
    <Lbl t="Title"><In value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="vmc-newkey-title" /></Lbl>
    <Lbl t="Static tag (applied to every agent using this key)"><In value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} data-testid="vmc-newkey-tag" /></Lbl>
    <div><div className="text-[11px] text-slate-400 mb-1">Provision applications</div>{MODS.map(([m, l]) => <label key={m} className="flex items-center gap-2 text-xs py-0.5"><input type="checkbox" checked={f.mods.includes(m)} disabled={m === "AI"} onChange={() => tog(m)} data-testid={`vmc-newkey-mod-${m}`} />{l} ({m}){m === "AI" && <span className="text-slate-500">· always on</span>}{["FIM", "EDR", "PM"].includes(m) && <span className="text-sky-300 text-[10px]">agent-only</span>}</label>)}</div>
    <div className="grid grid-cols-2 gap-2"><Lbl t="Agent limit"><In type="number" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} data-testid="vmc-newkey-limit" /></Lbl><Lbl t="Expires"><In type="date" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} /></Lbl></div>
    <Btn primary onClick={save} data-testid="vmc-newkey-save">Generate key</Btn>
  </Drawer>;
}

function AgentDrawer({ a, st, emit, onClose }) {
  const mods = st.console.modules || {};
  const gone = a.host === "WIN-LAB-01" && !st.installed;
  const on = (m) => mods[m] !== false;
  const rows = [["Status", gone ? "Uninstalled" : st.console.uninstall_requested && a.host === "WIN-LAB-01" ? "Uninstall pending (next check-in)" : a.status], ["IP", a.ip], ["OS", a.os], ["Version", a.version], ["Activation key", a.key], ["Last check-in", a.last_checkin],
    ...(a.software ? [["Software inventory", `${a.software} items`], ["Open ports", a.ports], ["Tags", a.tags.join(", ")], ["Config profile", a.profile]] : []), ["Host ID", "see the host registry"]];
  return <Drawer title={`Asset details · ${a.host}`} onClose={onClose} tid="vmc-agent-drawer">
    {rows.map(([k, v]) => <div key={k} className="flex text-xs border-b border-slate-700/60 py-1.5"><span className="w-36 text-slate-400 shrink-0">{k}</span><span className="text-slate-100 break-all" data-testid={`vmc-agent-${k.toLowerCase().replace(/\s/g, "-")}`}>{v}</span></div>)}
    {a.vulns && <div className="flex gap-2 items-center text-xs">{[...a.vulns].map((n, i) => [n, i + 1]).reverse().map(([n, s]) => <span key={s} className="flex items-center gap-1"><Sev n={s} />{n}</span>)}</div>}
    {!gone && <div className="border-t border-slate-700 pt-3 space-y-2"><div className="text-xs font-semibold text-slate-100">Quick actions</div>
      {["VM", "PC"].map((m) => <div key={m} className="flex items-center gap-2 text-xs"><span className="w-40">{m === "VM" ? "Vulnerability Mgmt" : "Policy Compliance"}: <b className={on(m) ? "text-green-400" : "text-slate-500"}>{on(m) ? "Active" : "Inactive"}</b></span>
        <Btn onClick={() => emit(on(m) ? "console.module_deactivated" : "console.module_activated", { module: m, host: a.host })} data-testid={`vmc-agent-${on(m) ? "deactivate" : "activate"}-${m}`}>{on(m) ? "Deactivate" : "Activate"} {m}</Btn></div>)}
      <Btn className="!border-red-500/60 !text-red-300" onClick={() => { emit("console.agent_uninstall_requested", { host: a.host }); toast.success("Uninstall queued for next check-in"); }} data-testid="vmc-agent-uninstall">Uninstall agent</Btn>
    </div>}
  </Drawer>;
}

function Profiles({ st, emit }) {
  const [open, setOpen] = useState(null);
  const [sp, setSp] = useState(!!st.selfprot);
  const [cpu, setCpu] = useState("Normal (CPU limit 20%)");
  const save = () => { emit("profile.saved", { name: open }); if (open.startsWith("Default")) emit(sp ? "selfprot.enabled" : "selfprot.disabled", { name: open }); toast.success("Profile saved · agents pick it up at next check-in"); setOpen(null); };
  return <><Panel title="Configuration Profiles"><Table rowTid="vmc-profile-row" cols={["Profile", "Default", "Assigned", "Self protection"]} rows={[["Default Windows Profile", "Yes", "Tag: Windows Servers", st.selfprot ? "On" : "Off"], ["Linux Low Impact", "No", "Tag: Linux Servers", "n/a"]]} onRow={(i) => setOpen(["Default Windows Profile", "Linux Low Impact"][i])} /></Panel>
    {open && <Drawer title={`Profile · ${open}`} onClose={() => setOpen(null)} tid="vmc-profile-drawer">
      <Lbl t="Performance"><Sel options={["Low (CPU limit 5%)", "Normal (CPU limit 20%)", "High (CPU limit 40%)"]} value={cpu} onChange={(e) => setCpu(e.target.value)} /></Lbl>
      <Lbl t="VM scan interval"><Sel options={["Every 4 hours (minimum)", "Every 12 hours", "Every 24 hours"]} value="Every 4 hours (minimum)" onChange={() => {}} /></Lbl>
      <Lbl t="Blackout window"><Sel options={["None", "Weekdays 09:00–17:00"]} value="None" onChange={() => {}} /></Lbl>
      {open.startsWith("Default") && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={sp} onChange={(e) => setSp(e.target.checked)} data-testid="vmc-profile-selfprot" />Self Protection (block stop, kill and uninstall from the host)</label>}
      <Btn primary onClick={save} data-testid="vmc-profile-save"><Save className="inline h-3.5 w-3.5 mr-1" />Save profile</Btn></Drawer>}</>;
}

export function Agents({ d, st, emit }) {
  const [view, setView] = useState("agents");
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const all = [...(st.installed ? [d.new_agent] : []), ...d.agents];
  const agents = all.filter((a) => !applied || `${a.host} ${a.ip} ${a.os} ${a.key} ${(a.tags || []).join(" ")}`.toLowerCase().includes(applied.toLowerCase()));
  const keys = [...(st.console.keys || []).map((k) => ({ name: k.title, tag: k.tag, customer_id: d.keys[0].customer_id, activation_id: "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a", uri: d.keys[0].uri, sha256: d.keys[0].sha256, used: 0, limit: k.limit || "∞", status: "Active", modules: (k.modules || "AI").split(",") })), ...d.keys];
  const openKey = (k) => { setOpen({ t: "key", k }); emit("console.activation_key_viewed", { name: k.name }); };
  const search = (e) => { e.preventDefault(); setApplied(q); emit("agent.searched", { q }); };
  const saveQ = () => { const name = window.prompt("Save this query as", "All Windows Servers"); if (name) { emit("query.saved", { name, q: applied }); toast.success("Query saved"); } };
  return <div className="relative min-h-[460px]" data-testid="vmc-agents">
    <div className="flex gap-1 mb-3 flex-wrap">{[["agents", "Agents"], ["keys", "Activation Keys"], ["profiles", "Config Profiles"]].map(([k, l]) => <Btn key={k} primary={view === k} onClick={() => setView(k)} data-testid={`vmc-agent-tab-${k}`}>{l}</Btn>)}</div>
    {view === "agents" && <Panel title={`Agents (${agents.length})`} actions={<div className="flex gap-1.5 items-center"><form onSubmit={search} className="w-52"><In placeholder="Search host, tag, OS — Enter" value={q} onChange={(e) => setQ(e.target.value)} data-testid="vmc-agent-search" /></form><Btn onClick={saveQ} disabled={!applied} data-testid="vmc-agent-save-query">Save query</Btn></div>}>
      {(st.console.queries || []).length > 0 && <div className="flex gap-1 mb-2 flex-wrap">{st.console.queries.map((s, i) => <button key={i} onClick={() => { setQ(s.q); setApplied(s.q); }} className="text-[10px] border border-sky-700 text-sky-200 px-1.5 py-0.5">{s.name}</button>)}</div>}
      <Table tid="vmc-agent-table" rowTid="vmc-agent-row" cols={["Host", "IP", "OS", "Status", "Version", "Last check-in"]} rows={agents.map((a) => [a.host, a.ip, a.os, <span className="text-green-400">{a.status}</span>, a.version, a.last_checkin])} onRow={(i) => { setOpen({ t: "agent", a: agents[i] }); emit("console.agent_viewed", { host: agents[i].host }); }} /></Panel>}
    {view === "keys" && <Panel title="Activation Keys" actions={<Btn primary onClick={() => setOpen({ t: "new" })} data-testid="vmc-newkey"><Plus className="inline h-3.5 w-3.5 mr-1" />New key</Btn>}>
      <Table tid="vmc-key-table" rowTid="vmc-key-row" cols={["Title", "Status", "Used / Limit", "Modules"]} rows={keys.map((k) => [<span className="text-sky-300 underline">{k.name}</span>, <span className={k.status === "Active" ? "text-green-400" : "text-red-400"}>{k.status}</span>, `${k.used} / ${k.limit}`, k.modules.join(", ")])} onRow={(i) => openKey(keys[i])} /></Panel>}
    {view === "profiles" && <Profiles st={st} emit={emit} />}
    {open?.t === "agent" && <AgentDrawer a={open.a} st={st} emit={emit} onClose={() => setOpen(null)} />}
    {open?.t === "key" && <KeyDrawer k={open.k} emit={emit} onClose={() => setOpen(null)} />}
    {open?.t === "new" && <NewKey emit={emit} onClose={() => setOpen(null)} />}
  </div>;
}
