import { useState } from "react";
import { toast } from "sonner";
import { Panel, Btn, In, Sel, Lbl, Table, Drawer, SubTabs, useForm } from "../ui";
import { ScanRun } from "../vm2/ScanRun";
import { expand } from "../vm2/lib";

const inScope = (d, st) => { const s = new Set((st.console.pci_scope || []).flatMap((x) => expand(x.ips))); return d.m3.pci.hosts.filter((h) => s.has(h.ip)); };
const disputes = (st) => Object.fromEntries((st.console.pci_disputes || []).map((x) => [x.qid, x]));
const hostPass = (d, ip) => d.m3.pci.vulns.filter((v) => v.ip === ip).every((v) => v.cvss < 4);
const Verdict = ({ ok }) => <span className={ok ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>{ok ? "PASS" : "FAIL"}</span>;

function Scope({ d, st, emit }) {
  const [ips, setIps] = useState("");
  const add = (e) => { e.preventDefault(); if (!expand(ips).length) return toast.error("Enter valid IPs or a range"); emit("pci.scope_added", { ips: ips.trim() }); toast.success("Scope updated"); setIps(""); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="PCI external scope" tid="pcc-scope"><Table rowTid="pcc-scope-row" empty="No IPs in scope" cols={["IP", "Name", "Role"]} rows={inScope(d, st).map((h) => [h.ip, h.name, h.role])} /></Panel>
    <Panel title="Add IPs"><form onSubmit={add} className="flex gap-2 items-end"><Lbl t="IPs / range"><In value={ips} onChange={(e) => setIps(e.target.value)} placeholder={d.m3.pci.range} data-testid="pcc-scope-ips" /></Lbl><Btn primary type="submit" data-testid="pcc-scope-add">Add</Btn></form></Panel></div>;
}

function Results({ d, st, onClose }) {
  const hs = inScope(d, st), ok = hs.length > 0 && hs.every((h) => hostPass(d, h.ip));
  return <Drawer title="PCI scan results" onClose={onClose} tid="pcc-results"><div className="text-sm">Overall merchant status: <span data-testid="pcc-overall"><Verdict ok={ok} /></span> <span className="text-[11px] text-slate-400">(any vulnerability with CVSS 4.0 or higher fails the host)</span></div>
    <Table rowTid="pcc-result-row" cols={["IP", "Host", "Status", "Vulnerability", "CVSS", "CVE"]} rows={hs.flatMap((h) => d.m3.pci.vulns.filter((v) => v.ip === h.ip).map((v) => [h.ip, h.name, <Verdict ok={v.cvss < 4} />, v.title, v.cvss.toFixed(1), v.cve]))} /></Drawer>;
}

function Scans({ d, st, emit }) {
  const [f, on, reset] = useForm({ title: "", profile: "PCI External (ASV)", target: "" });
  const [run, setRun] = useState(null);
  const [open, setOpen] = useState(false);
  const launch = (e) => { e.preventDefault(); if (!f.title.trim() || !f.target.trim()) return toast.error("Title and target are required");
    const tgt = new Set(expand(f.target)), hs = inScope(d, st).filter((h) => tgt.has(h.ip));
    emit("pci.scan_launched", { ...f, title: f.title.trim() });
    setRun({ title: f.title.trim(), tiles: hs.map((h) => ({ ip: h.ip, name: h.name })), items: d.m3.pci.vulns.filter((v) => tgt.has(v.ip) && hs.some((h) => h.ip === v.ip)).map((v) => ({ h: { ip: v.ip }, k: { qid: v.qid, title: v.title, cve: v.cve, severity: v.cvss >= 9 ? 5 : v.cvss >= 7 ? 4 : v.cvss >= 4 ? 3 : 1 } })) }); reset(); };
  const scans = st.console.pci_scans || [];
  return <div className="grid grid-cols-1 gap-3"><Panel title="PCI scans" tid="pcc-scans"><div className="space-y-3">{run && <ScanRun d={d} hosts={run.tiles} items={run.items} title={run.title} onDone={() => { setRun(null); toast.success("PCI scan processed"); }} />}
    <Table rowTid="pcc-scan-row" empty="No PCI scans" cols={["Title", "Profile", "Target", "Status", ""]} rows={scans.map((s, i) => [s.title, s.profile, s.target, run && i === scans.length - 1 ? "Running" : "Finished", <Btn disabled={run && i === scans.length - 1} onClick={() => { setOpen(true); emit("pci.results_viewed", {}); }} data-testid={`pcc-scan-results-${i}`}>Results</Btn>])} /></div></Panel>
    <Panel title="Launch PCI scan"><form onSubmit={launch} className="grid sm:grid-cols-2 gap-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="pcc-scan-title" /></Lbl><Lbl t="Option profile"><Sel options={["PCI External (ASV)", "Internal PCI (non-ASV)"]} value={f.profile} onChange={on("profile")} data-testid="pcc-scan-profile" /></Lbl>
      <Lbl t="Target"><div className="flex gap-1"><In value={f.target} onChange={on("target")} data-testid="pcc-scan-target" /><Btn type="button" onClick={() => on("target")({ target: { value: d.m3.pci.range } })} data-testid="pcc-scan-select">Select</Btn></div></Lbl>
      <div className="self-end"><Btn primary type="submit" disabled={!!run} data-testid="pcc-scan-launch">Launch</Btn></div></form></Panel>
    {open && <Results d={d} st={st} onClose={() => setOpen(false)} />}</div>;
}

function Vulns({ d, st, emit }) {
  const [open, setOpen] = useState(null);
  const [f, on, reset] = useForm({ category: "False Positive", reason: "" });
  const dis = disputes(st), hs = new Set(inScope(d, st).map((h) => h.ip)), scanned = (st.console.pci_scans || []).length > 0;
  const rows = scanned ? d.m3.pci.vulns.filter((v) => hs.has(v.ip)) : [];
  const submit = () => { if (f.reason.trim().length < 30) return toast.error("Justification must be at least 30 characters"); emit("pci.dispute_submitted", { qid: String(open.qid), ip: open.ip, ...f, reason: f.reason.trim() }); toast.success("Dispute submitted for ASV review"); reset(); setOpen(null); };
  return <><Panel title="PCI vulnerabilities" tid="pcc-vulns"><Table rowTid="pcc-vuln-row" empty="Run a PCI scan first" cols={["IP", "QID", "Title", "CVSS", "PCI", "Dispute", ""]} rows={rows.map((v, i) => [v.ip, v.qid, v.title, v.cvss.toFixed(1), <Verdict ok={v.cvss < 4} />, dis[String(v.qid)] ? <span className="text-yellow-200">Pending ASV review</span> : "-",
    v.cvss >= 4 && !dis[String(v.qid)] ? <Btn onClick={() => setOpen(v)} data-testid={`pcc-vuln-dispute-${i}`}>Dispute</Btn> : ""])} /></Panel>
    {open && <Drawer title={`Dispute QID ${open.qid}`} onClose={() => setOpen(null)} tid="pcc-dispute"><div className="text-xs text-slate-300">{open.title} on {open.ip} (CVSS {open.cvss})</div>
      <Lbl t="Dispute type"><Sel options={["False Positive", "Compensating Control", "Not in scope"]} value={f.category} onChange={on("category")} data-testid="pcc-dispute-category" /></Lbl>
      <Lbl t="Justification and evidence"><textarea rows={5} value={f.reason} onChange={on("reason")} className="w-full bg-[#0b121a] border border-slate-600 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-400" data-testid="pcc-dispute-reason" /></Lbl>
      <div className="text-[10px] text-slate-500">{f.reason.trim().length}/30 characters minimum</div><Btn primary onClick={submit} data-testid="pcc-dispute-submit">Submit dispute</Btn></Drawer>}</>;
}

export function Pci(p) {
  const [t, setT] = useState("scope");
  const V = { scope: Scope, scans: Scans, vulns: Vulns }[t];
  return <div className="space-y-3"><SubTabs tid="pcc-pci-tab" cur={t} set={setT} tabs={[["scope", "Scope"], ["scans", "Scans"], ["vulns", "Vulnerabilities"]]} /><V {...p} /></div>;
}
