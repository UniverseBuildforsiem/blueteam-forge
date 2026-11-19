import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, CalendarClock } from "lucide-react";
import { Sev, Panel, Btn, In, Sel, Lbl, Table, Drawer, SubTabs, Check, Radio, useForm } from "../ui";
import { targetHosts, findings, allLists, listMatch, groupsOf, yes } from "./lib";

const tplsOf = (d, st) => [...d.m2.templates.map((t) => t.title), ...(st.console.templates || []).map((t) => t.title)];
const targetsOf = (st) => ["All lab hosts", ...groupsOf(st).map((g) => g.name)];

function ReportView({ d, st, r, emit, onClose }) {
  const rem = /remediation/i.test(r.template);
  const tpl = (st.console.templates || []).find((t) => t.title === r.template);
  const pred = /high severity/i.test(r.template) ? (k) => k.severity >= 4 : tpl?.filter === "Custom" ? listMatch(d, st, tpl.searchlist) : () => true;
  const rows = targetHosts(d, st, r.target).flatMap((h) => findings(d, h).filter((k) => k.type !== "Information gathered" && pred(k)).map((k) => [h.ip, h.name.split(".")[0], <Sev n={k.severity} />, k.qid, k.title, k.cve, "Active"]));
  const dl = (format) => { emit("report.downloaded", { title: r.title, format }); toast.success(`${r.title}.${format.toLowerCase()} downloaded`); };
  return <Drawer title={`Report · ${r.title}`} onClose={onClose} tid="vmc-report-view">
    <div className="text-[11px] text-slate-400">Template {r.template} · Target {r.target} · Generated just now · Active for 7 days</div>
    <div className="flex gap-1">{["PDF", "CSV", "HTML"].map((f) => <Btn key={f} onClick={() => dl(f)} data-testid={`vmc-report-dl-${f.toLowerCase()}`}><Download className="inline h-3 w-3 mr-1" />{f}</Btn>)}</div>
    {rem ? <Table tid="vmc-report-remediation" cols={["User", "Login", "Open", "Overdue", "Closed", "Ignored"]} rows={d.m2.remediation.map((x) => [x.name, x.login, x.open, <b className={x.overdue ? "text-red-300" : ""}>{x.overdue}</b>, x.closed, x.ignored])} />
      : <Table tid="vmc-report-findings" cols={["IP", "Host", "Sev", "QID", "Title", "CVE", "Status"]} rows={rows} empty="No findings match this template. Have the hosts been scanned?" />}
  </Drawer>;
}

function ScheduleForm({ r, emit, onClose }) {
  const [f, on] = useForm({ frequency: "Weekly", start: "2026-06-15T09:00", email: "" });
  const save = () => { emit("report.scheduled", { title: r.title, template: r.template, ...f, email: f.email.trim() }); toast.success("Report scheduled"); onClose(); };
  return <Drawer title={`Schedule · ${r.title}`} onClose={onClose} tid="vmc-rsched-drawer"><Lbl t="Occurs"><Sel options={["Daily", "Weekly", "Monthly"]} value={f.frequency} onChange={on("frequency")} data-testid="vmc-rsched-frequency" /></Lbl>
    <Lbl t="Start"><In type="datetime-local" value={f.start} onChange={on("start")} data-testid="vmc-rsched-start" /></Lbl><Lbl t="Distribution (email)"><In value={f.email} onChange={on("email")} placeholder="manager@example.com" data-testid="vmc-rsched-email" /></Lbl>
    <Btn primary onClick={save} data-testid="vmc-rsched-save">Save schedule</Btn></Drawer>;
}

function ReportList({ d, st, emit }) {
  const [f, on, reset] = useForm({ title: "", template: d.m2.templates[0].title, format: "PDF", target: "All lab hosts" });
  const [open, setOpen] = useState(null);
  const reports = st.console.reports || [];
  const run = (e) => { e.preventDefault(); emit("report.generated", { ...f, title: f.title.trim() || f.template }); toast.success("Report generated"); reset(); };
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] items-start gap-3"><Panel title="Reports" tid="vmc-reports"><Table rowTid="vmc-report-row" empty="No reports" cols={["Title", "Template", "Format", "Status", ""]} rows={reports.map((r, i) => [r.title, r.template, r.format, "Finished", <span className="flex gap-1">
    <Btn onClick={() => { setOpen({ t: "view", r }); emit("report.viewed", { title: r.title, template: r.template }); }} data-testid={`vmc-report-view-${i}`}>View</Btn><Btn onClick={() => setOpen({ t: "sched", r })} data-testid={`vmc-report-schedule-${i}`}><CalendarClock className="inline h-3 w-3" /> Schedule</Btn></span>])} /></Panel>
    <Panel title="Report builder"><form onSubmit={run} className="space-y-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="vmc-report-title" /></Lbl><Lbl t="Template"><Sel options={tplsOf(d, st)} value={f.template} onChange={on("template")} data-testid="vmc-report-template" /></Lbl>
      <Lbl t="Format"><Sel options={["PDF", "CSV", "HTML"]} value={f.format} onChange={on("format")} data-testid="vmc-report-format" /></Lbl><Lbl t="Asset target"><Sel options={targetsOf(st)} value={f.target} onChange={on("target")} data-testid="vmc-report-target" /></Lbl><Btn primary type="submit" data-testid="vmc-report-run">Run report</Btn></form></Panel>
    {open?.t === "view" && <ReportView d={d} st={st} r={open.r} emit={emit} onClose={() => setOpen(null)} />}
    {open?.t === "sched" && <ScheduleForm r={open.r} emit={emit} onClose={() => setOpen(null)} />}</div>;
}

function NewTemplate({ d, st, emit, onClose }) {
  const [f, on] = useForm({ title: "", findings: "Host Based", filter: "Default", searchlist: allLists(d, st)[0].title, exclude: "" });
  const [set, setSet] = useState({ trending: false, graphics: true });
  const pick = (k) => (v) => on(k)({ target: { value: v } });
  const save = () => { if (!f.title.trim()) return toast.error("Title is required"); emit("template.created", { ...f, title: f.title.trim(), searchlist: f.filter === "Custom" ? f.searchlist : "", trending: yes(set.trending && f.findings === "Host Based"), graphics: yes(set.graphics) }); toast.success("Template saved"); onClose(); };
  return <Drawer title="New scan report template" onClose={onClose} tid="vmc-tpl-drawer"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="vmc-tpl-title" /></Lbl>
    <div className="text-xs font-semibold text-slate-100">Findings</div><Radio options={["Host Based", "Scan Based"]} value={f.findings} onChange={pick("findings")} tid="vmc-tpl-findings" />
    <Check label="Include trending (host based only)" checked={set.trending} disabled={f.findings !== "Host Based"} onChange={(v) => setSet({ ...set, trending: v })} tid="vmc-tpl-trending" />
    <div className="text-xs font-semibold text-slate-100">Display</div><Check label="Graphics: severity and status charts" checked={set.graphics} onChange={(v) => setSet({ ...set, graphics: v })} tid="vmc-tpl-graphics" />
    <div className="text-xs font-semibold text-slate-100">Filter</div><Radio options={["Default", "Custom"]} value={f.filter} onChange={pick("filter")} tid="vmc-tpl-filter" />
    {f.filter === "Custom" && <Lbl t="Search list"><Sel options={allLists(d, st).map((l) => l.title)} value={f.searchlist} onChange={on("searchlist")} data-testid="vmc-tpl-searchlist" /></Lbl>}
    <Lbl t="Exclude QIDs (optional)"><In value={f.exclude} onChange={on("exclude")} /></Lbl><Btn primary onClick={save} data-testid="vmc-tpl-save">Save template</Btn></Drawer>;
}

function Templates({ d, st, emit }) {
  const [open, setOpen] = useState(null);
  const mine = st.console.templates || [];
  const imp = (t) => { emit("template.imported", { title: t }); toast.success(`'${t}' imported`); };
  return <div className="min-h-[420px] space-y-3"><Panel title="Report Templates" tid="vmc-templates" actions={<div className="flex gap-1"><Btn onClick={() => setOpen(open === "lib" ? null : "lib")} data-testid="vmc-tpl-library">Library</Btn><Btn primary onClick={() => setOpen("new")} data-testid="vmc-tpl-new">New template</Btn></div>}>
    <Table cols={["Title", "Type", "Findings", "Filter"]} rows={[...d.m2.templates.map((t) => [t.title, t.kind, "Host Based", "Default"]), ...mine.map((t) => [t.title, t.findings ? "Scan" : "Library", t.findings || "Host Based", t.searchlist || t.filter || "Default"])]} /></Panel>
    {open === "lib" && <Panel title="Template Library" tid="vmc-tpl-library-panel"><div className="space-y-1">{d.m2.tpl_library.map((t) => <div key={t} className="flex items-center text-xs border-b border-slate-800 py-1"><span className="flex-1">{t}</span>
      {mine.some((m) => m.title === t) ? <span className="text-green-400">Imported</span> : <Btn onClick={() => imp(t)} data-testid={`vmc-tpl-import-${t.replace(/\W+/g, "-").toLowerCase()}`}>Import</Btn>}</div>)}</div></Panel>}
    {open === "new" && <NewTemplate d={d} st={st} emit={emit} onClose={() => setOpen(null)} />}</div>;
}

function RSchedules({ st, emit }) {
  useEffect(() => { emit("report.schedules_viewed", {}); }, []); // eslint-disable-line
  return <Panel title="Report schedules" tid="vmc-rschedules"><Table cols={["Report", "Occurs", "Start", "Distribution"]} empty="No scheduled reports" rows={(st.console.report_schedules || []).map((s) => [s.title, s.frequency, (s.start || "").replace("T", " "), s.email || "-"])} /></Panel>;
}

export function Reports2(p) {
  const [t, setT] = useState("reports");
  const V = { reports: ReportList, templates: Templates, schedules: RSchedules }[t];
  return <div className="space-y-3"><SubTabs tid="vmc-reports-tab" cur={t} set={setT} tabs={[["reports", "Reports"], ["templates", "Templates"], ["schedules", "Schedules"]]} /><V {...p} /></div>;
}
