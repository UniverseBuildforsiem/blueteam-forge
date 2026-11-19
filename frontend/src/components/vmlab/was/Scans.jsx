import { useState } from "react";
import { toast } from "sonner";
import { Sev, Panel, Btn, In, Sel, Lbl, Table, Drawer, useForm } from "../ui";
import { ScanRun } from "../vm2/ScanRun";
import { SitemapDrawer } from "./Apps";
import { apps, authOf, assigned, profilesOf, findings, runItems } from "./lib";

function FindingDrawer({ k, emit, onClose }) {
  const [why, setWhy] = useState("False positive");
  return <Drawer title={`QID ${k.qid}`} onClose={onClose} tid="wasc-finding-drawer"><div className="text-sm font-semibold text-slate-100">{k.title}</div>
    {[["Severity", <Sev n={k.severity} />], ["OWASP", k.owasp], ["CWE", k.cwe], ["URL", k.path], ["Payload / evidence", <code className="text-yellow-200">{k.payload}</code>], ["Status", k.ignored ? "Ignored" : "Active"]].map(([a, b]) =>
      <div key={a} className="flex text-xs border-b border-slate-700/60 py-1.5"><span className="w-36 text-slate-400 shrink-0">{a}</span><span className="text-slate-100" data-testid={`wasc-finding-${a.toLowerCase().replace(/\W+/g, "-")}`}>{b}</span></div>)}
    {!k.ignored && <div className="flex gap-2 items-end pt-2"><Lbl t="Ignore reason"><Sel options={["False positive", "Risk accepted", "Not applicable"]} value={why} onChange={(e) => setWhy(e.target.value)} data-testid="wasc-ignore-reason" /></Lbl>
      <Btn onClick={() => { emit("was.finding_ignored", { qid: String(k.qid), reason: why }); toast.success("Finding ignored"); onClose(); }} data-testid="wasc-ignore">Ignore</Btn></div>}</Drawer>;
}

function FindingsDrawer({ d, st, scan, emit, onClose }) {
  const [open, setOpen] = useState(null);
  const rows = findings(d, st, scan).sort((a, b) => b.severity - a.severity);
  if (open) return <FindingDrawer k={rows.find((r) => r.qid === open) || {}} emit={emit} onClose={() => setOpen(null)} />;
  return <Drawer title={`Findings · ${scan.title}`} onClose={onClose} tid="wasc-findings"><div className="text-[11px] text-slate-400">{rows.length} findings · auth {scan.auth || "None"} · profile {scan.profile}</div>
    <Table rowTid="wasc-finding-row" cols={["Sev", "QID", "Title", "OWASP", "URL", "Status"]} rows={rows.map((k) => [<Sev n={k.severity} />, k.qid, k.title, k.owasp.split(" ")[0], <span className="font-mono">{k.path}</span>, k.ignored ? "Ignored" : "Active"])}
      onRow={(i) => { setOpen(rows[i].qid); emit("was.finding_viewed", { qid: String(rows[i].qid) }); }} /></Drawer>;
}

function useScanForm(st, extra) {
  const app0 = apps(st)[0]?.name || "";
  return useForm({ title: "", app: app0, type: "Vulnerability", auth: assigned(st, app0) || "None", profile: "Initial WAS Options", ...extra });
}

function ScanFields({ f, on, st }) {
  return <><Lbl t="Web application"><Sel options={apps(st).map((a) => a.name)} value={f.app} onChange={on("app")} data-testid="wasc-scan-app" /></Lbl><Lbl t="Scan type"><Sel options={["Discovery", "Vulnerability"]} value={f.type} onChange={on("type")} data-testid="wasc-scan-type" /></Lbl>
    <Lbl t="Authentication"><Sel options={["None", ...authOf(st)]} value={f.auth} onChange={on("auth")} data-testid="wasc-scan-auth" /></Lbl><Lbl t="Option profile"><Sel options={profilesOf(st)} value={f.profile} onChange={on("profile")} data-testid="wasc-scan-profile" /></Lbl></>;
}

export function WasScans({ d, st, emit }) {
  const [f, on, reset] = useScanForm(st, {});
  const [run, setRun] = useState(null);
  const [open, setOpen] = useState(null);
  const scans = st.console.was_scans || [];
  const launch = (e) => { e.preventDefault(); if (!f.title.trim() || !f.app) return toast.error("Title and web application are required"); emit("was.scan_launched", { ...f, title: f.title.trim() }); setRun({ title: f.title.trim(), ...runItems(d, st, f) }); reset(); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="Web Application Scans" tid="wasc-scans"><div className="space-y-3">{run && <ScanRun d={d} hosts={run.tiles} items={run.items} title={run.title} onDone={() => { setRun(null); toast.success("Scan processed"); }} />}
    <Table rowTid="wasc-scan-row" empty="No scans yet" cols={["Title", "App", "Type", "Auth", "Profile", "Status", ""]} rows={scans.map((s, i) => { const busy = run && i === scans.length - 1;
      return [s.title, s.app, s.type, s.auth || "None", s.profile, busy ? "Running" : <span className="text-green-400">Finished</span>, <span className="flex gap-1"><Btn disabled={busy} onClick={() => { setOpen({ t: "map", s }); emit("was.sitemap_viewed", { app: s.app }); }} data-testid={`wasc-scan-sitemap-${i}`}>Sitemap</Btn>
        {s.type === "Vulnerability" && <Btn disabled={busy} onClick={() => { setOpen({ t: "find", s }); emit("was.findings_viewed", { title: s.title }); }} data-testid={`wasc-scan-findings-${i}`}>Findings</Btn>}</span>]; })} /></div></Panel>
    <Panel title="New scan"><form onSubmit={launch} className="grid sm:grid-cols-2 gap-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="wasc-scan-title" /></Lbl><ScanFields f={f} on={on} st={st} /><div className="self-end"><Btn primary type="submit" disabled={!!run} data-testid="wasc-scan-launch">Launch</Btn></div></form></Panel>
    {open?.t === "map" && <SitemapDrawer d={d} st={st} scan={open.s} emit={emit} onClose={() => setOpen(null)} />}
    {open?.t === "find" && <FindingsDrawer d={d} st={st} scan={open.s} emit={emit} onClose={() => setOpen(null)} />}</div>;
}

export function WasSchedules({ d, st, emit }) {
  const [f, on, reset] = useScanForm(st, { frequency: "Daily", start: "2026-06-14T23:00", tz: "" });
  const [run, setRun] = useState(null);
  const save = (e) => { e.preventDefault(); if (!f.title.trim()) return toast.error("Title is required"); if (!f.tz) return toast.error("Time zone is required"); emit("was.scan_scheduled", { ...f, title: f.title.trim() }); toast.success("Schedule saved"); reset(); };
  const now = (s) => { emit("was.schedule_run_now", { title: s.title }); setRun({ title: `${s.title} (run now)`, ...runItems(d, st, s) }); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="Scheduled web app scans" tid="wasc-schedules"><div className="space-y-3">{run && <ScanRun d={d} hosts={run.tiles} items={run.items} title={run.title} onDone={() => { setRun(null); toast.success("Scheduled scan test processed"); }} />}
    <Table rowTid="wasc-sched-row" empty="No schedules" cols={["Title", "App", "Type", "Occurs", "Next run", "Time zone", ""]} rows={(st.console.was_schedules || []).map((s, i) => [s.title, s.app, s.type, s.frequency, (s.start || "").replace("T", " "), s.tz, <Btn disabled={!!run} onClick={() => now(s)} data-testid={`wasc-sched-runnow-${i}`}>Run now</Btn>])} /></div></Panel>
    <Panel title="New schedule"><form onSubmit={save} className="grid sm:grid-cols-2 gap-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="wasc-sched-title" /></Lbl><ScanFields f={f} on={on} st={st} />
      <Lbl t="Occurs"><Sel options={["Daily", "Weekly", "Monthly"]} value={f.frequency} onChange={on("frequency")} data-testid="wasc-sched-frequency" /></Lbl><Lbl t="Start"><In type="datetime-local" value={f.start} onChange={on("start")} data-testid="wasc-sched-start" /></Lbl>
      <Lbl t="Time zone (required)"><Sel options={["", "Asia/Kolkata", "UTC", "America/New_York", "Europe/London"]} value={f.tz} onChange={on("tz")} data-testid="wasc-sched-tz" /></Lbl><div className="self-end"><Btn primary type="submit" data-testid="wasc-sched-save">Save schedule</Btn></div></form></Panel></div>;
}
