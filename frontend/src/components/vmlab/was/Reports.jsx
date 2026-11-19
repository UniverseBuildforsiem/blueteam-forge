import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Sev, Panel, Btn, In, Sel, Lbl, Table, Drawer, Radio, useForm } from "../ui";
import { apps, findings, lastScan, listsOf, listMatch } from "./lib";

export const blobDownload = (name, body, type = "text/plain") => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };

function WasReportView({ d, st, r, emit, onClose }) {
  const scan = lastScan(st, r.app, "Vulnerability");
  const rows = scan ? findings(d, st, scan).filter((k) => !k.ignored && k.severity >= Number(r.severity)) : [];
  const owasp = /owasp/i.test(r.template), groups = {};
  rows.forEach((k) => { groups[k.owasp] = (groups[k.owasp] || 0) + 1; });
  const dl = (format) => { blobDownload(`${r.title.replace(/\W+/g, "_")}.${format === "CSV" ? "csv" : "pdf.txt"}`, [`# ${r.title} - SIMULATED ${format}`, "QID,Severity,Title,OWASP,URL", ...rows.map((k) => `${k.qid},${k.severity},"${k.title}","${k.owasp}",${k.path}`)].join("\n")); emit("was.report_downloaded", { template: r.template, format }); toast.success(`Simulated ${format} downloaded`); };
  return <Drawer title={`Report · ${r.title}`} onClose={onClose} tid="wasc-report-view"><div className="text-[11px] text-slate-400">{r.template} · {r.app} · severity {r.severity}+ · {scan ? `from scan '${scan.title}'` : "no vulnerability scan yet"}</div>
    <div className="flex gap-1">{["PDF", "CSV"].map((x) => <Btn key={x} onClick={() => dl(x)} data-testid={`wasc-report-dl-${x.toLowerCase()}`}><Download className="inline h-3 w-3 mr-1" />{x}</Btn>)}</div>
    {owasp ? <Table tid="wasc-report-owasp" cols={["OWASP 2021 category", "Findings"]} rows={Object.entries(groups).sort((a, b) => b[1] - a[1])} empty="No findings" />
      : <Table tid="wasc-report-findings" rowTid="wasc-report-row" cols={["Sev", "QID", "Title", "URL", "CWE"]} rows={rows.map((k) => [<Sev n={k.severity} />, k.qid, k.title, k.path, k.cwe])} empty="No findings" />}</Drawer>;
}

export function WasReports({ d, st, emit }) {
  const [f, on, reset] = useForm({ title: "", template: d.m3.was.templates[0], app: apps(st)[0]?.name || "", severity: "1", format: "PDF" });
  const [open, setOpen] = useState(null);
  const run = (e) => { e.preventDefault(); if (!f.app) return toast.error("Add a web application first"); emit("was.report_generated", { ...f, title: f.title.trim() || f.template }); toast.success("Report generated"); reset(); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="WAS Reports" tid="wasc-reports"><Table rowTid="wasc-report-row-list" empty="No reports" cols={["Title", "Template", "App", "Min severity", ""]} rows={(st.console.was_reports || []).map((r, i) => [r.title, r.template, r.app, r.severity,
    <Btn onClick={() => { setOpen(r); emit("was.report_viewed", { template: r.template }); }} data-testid={`wasc-report-view-${i}`}>View</Btn>])} /></Panel>
    <Panel title="New report"><form onSubmit={run} className="grid sm:grid-cols-2 gap-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="wasc-report-title" /></Lbl><Lbl t="Template"><Sel options={d.m3.was.templates} value={f.template} onChange={on("template")} data-testid="wasc-report-template" /></Lbl>
      <Lbl t="Web application"><Sel options={apps(st).map((a) => a.name)} value={f.app} onChange={on("app")} data-testid="wasc-report-app" /></Lbl><Lbl t="Minimum severity"><Sel options={["1", "2", "3", "4", "5"]} value={f.severity} onChange={on("severity")} data-testid="wasc-report-severity" /></Lbl>
      <div className="self-end"><Btn primary type="submit" data-testid="wasc-report-run">Run report</Btn></div></form></Panel>
    {open && <WasReportView d={d} st={st} r={open} emit={emit} onClose={() => setOpen(null)} />}</div>;
}

export function WasLists({ d, st, emit }) {
  const owasp = ["Any", ...new Set(d.m3.was.kb.map((k) => k.owasp))];
  const [f, on, reset] = useForm({ title: "", kind: "Dynamic", owasp: "Any", severity: "Any", qids: "" });
  const [lib, setLib] = useState(false);
  const lists = listsOf(st);
  const save = (e) => { e.preventDefault(); if (!f.title.trim()) return toast.error("Title is required"); if (f.kind === "Static" && !f.qids.trim()) return toast.error("Add QIDs");
    emit("was.searchlist_created", f.kind === "Static" ? { title: f.title.trim(), kind: "Static", qids: f.qids.trim() } : { title: f.title.trim(), kind: "Dynamic", owasp: f.owasp, severity: f.severity }); toast.success("Search list saved"); reset(); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="WAS Search Lists" tid="wasc-lists" actions={<Btn onClick={() => setLib(!lib)} data-testid="wasc-sl-library">Library</Btn>}>
    <Table rowTid="wasc-sl-row" empty="No search lists" cols={["Title", "Type", "Criteria", "QIDs"]} rows={lists.map((l) => [l.title, l.kind || "Library", l.kind === "Static" ? l.qids : l.kind ? `${l.owasp} · sev ${l.severity}` : "library", d.m3.was.kb.filter(listMatch(st, l.title)).length])} /></Panel>
    {lib && <Panel title="Library" tid="wasc-sl-library-panel">{d.m3.was.sl_library.map((t) => <div key={t} className="flex items-center text-xs border-b border-slate-800 py-1"><span className="flex-1">{t}</span>{lists.some((l) => l.title === t) ? <span className="text-green-400">Imported</span>
      : <Btn onClick={() => { emit("was.searchlist_imported", { title: t }); toast.success("Imported"); }} data-testid={`wasc-sl-import-${t.replace(/\W+/g, "-").toLowerCase()}`}>Import</Btn>}</div>)}</Panel>}
    <Panel title="New search list"><form onSubmit={save} className="space-y-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="wasc-sl-title" /></Lbl><Radio options={["Dynamic", "Static"]} value={f.kind} onChange={(v) => on("kind")({ target: { value: v } })} tid="wasc-sl-kind" />
      {f.kind === "Dynamic" ? <div className="grid sm:grid-cols-2 gap-2"><Lbl t="OWASP category"><Sel options={owasp} value={f.owasp} onChange={on("owasp")} data-testid="wasc-sl-owasp" /></Lbl><Lbl t="Severity"><Sel options={["Any", "5", "4", "3", "2", "1"]} value={f.severity} onChange={on("severity")} data-testid="wasc-sl-severity" /></Lbl></div>
        : <Lbl t="QIDs (comma separated)"><In value={f.qids} onChange={on("qids")} data-testid="wasc-sl-qids" /></Lbl>}<Btn primary type="submit" data-testid="wasc-sl-save">Save list</Btn></form></Panel></div>;
}
