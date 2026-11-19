import { useState } from "react";
import { toast } from "sonner";
import { Sev, Panel, Btn, In, Sel, Lbl, Table, Drawer, SubTabs, Check, Radio, useForm } from "../ui";
import { allLists, listMatch, TYPE_CLS, yes } from "./lib";

function KbList({ d, emit }) {
  const [q, setQ] = useState("");
  const [fl, setFl] = useState({ severity: "Any", type: "Any" });
  const [open, setOpen] = useState(null);
  const rows = d.m2.kb.filter((k) => (!q || `${k.qid} ${k.title} ${k.cve} ${k.category}`.toLowerCase().includes(q.trim().toLowerCase())) && (fl.severity === "Any" || String(k.severity) === fl.severity) && (fl.type === "Any" || k.type === fl.type));
  const filt = (k) => (e) => { const n = { ...fl, [k]: e.target.value }; setFl(n); emit("kb.filtered", n); };
  return <div className="min-h-[420px]"><Panel title={`KnowledgeBase (${rows.length})`} tid="vmc-kb" actions={<div className="flex gap-2 items-center"><form onSubmit={(e) => { e.preventDefault(); emit("kb.searched", { q: q.trim() }); }} className="w-52"><In placeholder="QID, CVE or title — Enter" value={q} onChange={(e) => setQ(e.target.value)} data-testid="vmc-kb-search" /></form>
    <div className="w-20"><Sel options={["Any", "5", "4", "3", "2", "1"]} value={fl.severity} onChange={filt("severity")} data-testid="vmc-kb-severity" /></div><div className="w-40"><Sel options={["Any", "Confirmed", "Potential", "Information gathered"]} value={fl.type} onChange={filt("type")} data-testid="vmc-kb-type" /></div></div>}>
    <div className="flex gap-3 text-[10px] mb-2">{Object.entries(TYPE_CLS).map(([t, c]) => <span key={t} className={`border px-1.5 ${c}`}>{t}</span>)}<span className="text-slate-500">Severity 5 = most urgent</span></div>
    <Table rowTid="vmc-kb-row" cols={["QID", "Title", "Sev", "Type", "CVE", "CVSS", "Category"]} rows={rows.map((k) => [k.qid, k.title, <Sev n={k.severity} />, <span className={TYPE_CLS[k.type].split(" ")[0]}>{k.type}</span>, k.cve, k.cvss.toFixed(1), k.category])}
      onRow={(i) => { setOpen(rows[i]); emit("kb.viewed", { qid: String(rows[i].qid) }); }} /></Panel>
    {open && <Drawer title={`QID ${open.qid}`} onClose={() => setOpen(null)} tid="vmc-kb-drawer"><div className="text-sm font-semibold text-slate-100">{open.title}</div>
      {[["Severity", <Sev n={open.severity} />], ["Type", open.type], ["CVE", open.cve], ["CVSS v3", open.cvss.toFixed(1)], ["Category", open.category], ["Remotely exploitable", open.remote ? "Yes" : "No"], ["Patch available", open.patch ? "Yes" : "No"], ["Threat", open.threat], ["Impact", open.impact], ["Solution", open.solution]].map(([k, v]) =>
        <div key={k} className="flex text-xs border-b border-slate-700/60 py-1.5"><span className="w-36 text-slate-400 shrink-0">{k}</span><span className="text-slate-100" data-testid={`vmc-kb-${k.toLowerCase().replace(/\W+/g, "-")}`}>{v}</span></div>)}</Drawer>}</div>;
}

function Lists({ d, st, emit }) {
  const [f, on, reset] = useForm({ title: "", kind: "Dynamic", severity: "Any", category: "Any", qids: "" });
  const [glob, setGlob] = useState(false);
  const [lib, setLib] = useState(false);
  const lists = allLists(d, st);
  const save = (e) => { e.preventDefault(); if (!f.title.trim()) return toast.error("Title is required"); if (f.kind === "Static" && !f.qids.trim()) return toast.error("Add at least one QID");
    const body = f.kind === "Static" ? { title: f.title.trim(), kind: "Static", qids: f.qids.trim() } : { title: f.title.trim(), kind: "Dynamic", severity: f.severity, category: f.category };
    emit("searchlist.created", { ...body, global: yes(glob), criteria: f.kind === "Static" ? `QIDs ${f.qids}` : `Severity ${f.severity} · ${f.category}` }); toast.success("Search list saved"); reset(); setGlob(false); };
  const count = (l) => d.m2.kb.filter(listMatch(d, st, l.title)).length;
  return <div className="grid grid-cols-1 gap-3"><div className="space-y-3"><Panel title="Search Lists" tid="vmc-searchlists" actions={<Btn onClick={() => setLib(!lib)} data-testid="vmc-sl-library">Library</Btn>}>
    <Table rowTid="vmc-sl-row" cols={["Title", "Type", "Criteria", "QIDs", "Global"]} rows={lists.map((l) => [l.title, l.kind || "Library", l.criteria || "Imported from library", l.kind ? count(l) : "-", l.global === "yes" ? "Yes" : "No"])} /></Panel>
    {lib && <Panel title="Search List Library" tid="vmc-sl-library-panel">{d.m2.sl_library.map((t) => <div key={t} className="flex items-center text-xs border-b border-slate-800 py-1"><span className="flex-1">{t}</span>
      {lists.some((l) => l.title === t) ? <span className="text-green-400">Imported</span> : <Btn onClick={() => { emit("searchlist.imported", { title: t, global: "no" }); toast.success(`'${t}' imported`); }} data-testid={`vmc-sl-import-${t.replace(/\W+/g, "-").toLowerCase()}`}>Import</Btn>}</div>)}</Panel>}</div>
    <Panel title="New search list"><form onSubmit={save} className="space-y-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="vmc-sl-title" /></Lbl>
      <Radio options={["Dynamic", "Static"]} value={f.kind} onChange={(v) => on("kind")({ target: { value: v } })} tid="vmc-sl-kind" />
      {f.kind === "Dynamic" ? <><Lbl t="Severity"><Sel options={["Any", "5", "4", "3", "2", "1"]} value={f.severity} onChange={on("severity")} data-testid="vmc-sl-severity" /></Lbl>
        <Lbl t="Category"><Sel options={["Any", "Windows", "Linux", "General", "Network", "Web Application"]} value={f.category} onChange={on("category")} data-testid="vmc-sl-category" /></Lbl></>
        : <Lbl t="QIDs (comma separated)"><In value={f.qids} onChange={on("qids")} data-testid="vmc-sl-qids" /></Lbl>}
      <Check label="Global (visible to other users)" checked={glob} onChange={setGlob} tid="vmc-sl-global" /><Btn primary type="submit" data-testid="vmc-sl-save">Save list</Btn></form></Panel></div>;
}

export function KB2(p) {
  const [t, setT] = useState("kb");
  const V = t === "kb" ? KbList : Lists;
  return <div className="space-y-3"><SubTabs tid="vmc-kb-tab" cur={t} set={setT} tabs={[["kb", "KnowledgeBase"], ["lists", "Search Lists"]]} /><V {...p} /></div>;
}
