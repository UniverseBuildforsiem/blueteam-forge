import { useState } from "react";
import { toast } from "sonner";
import { Panel, Btn, In, Sel, Lbl, Table, SubTabs, useForm } from "../ui";
import { expand, inSub, subHosts, findings } from "./lib";

function Address({ d, st, emit }) {
  const [f, on, reset] = useForm({ ips: "", tracking: "IP" });
  const sub = inSub(st), track = {};
  (st.console.hosts || []).forEach((h) => expand(h.ips).forEach((ip) => { track[ip] = h.tracking; }));
  const add = (e) => {
    e.preventDefault();
    const ips = expand(f.ips);
    if (!ips.length) return toast.error("Enter a valid IP, range (a-b) or comma list");
    const lab = ips.map((ip) => d.m2.hosts.find((h) => h.ip === ip)).filter(Boolean);
    if (lab.some((h) => h.tracking !== f.tracking)) toast.warning(`Heads-up: ${lab.find((h) => h.tracking !== f.tracking).name.split(".")[0]} is best tracked by ${lab.find((h) => h.tracking !== f.tracking).tracking}`);
    emit("hosts.added", { ips: f.ips.trim(), tracking: f.tracking }); toast.success(`${ips.length} IP(s) added to the subscription`); reset();
  };
  const rows = [...sub].map((ip) => { const h = d.m2.hosts.find((x) => x.ip === ip); return [ip, h ? h.name : "no response", track[ip], h ? "Scannable" : "Scannable (no host)"]; });
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] items-start gap-3"><Panel title={`Address Management · ${sub.size} IPs`} tid="vmc-address"><Table rowTid="vmc-address-row" cols={["IP", "Name", "Tracking", "Status"]} rows={rows} empty="No hosts in the subscription yet" /></Panel>
    <Panel title="Add IPs"><form onSubmit={add} className="space-y-2"><Lbl t="IPs / ranges"><In value={f.ips} onChange={on("ips")} placeholder="10.50.200.247-10.50.200.250" data-testid="vmc-address-ips" /></Lbl>
      <Lbl t="Tracking method"><Sel options={["IP", "DNS", "NetBIOS"]} value={f.tracking} onChange={on("tracking")} data-testid="vmc-address-tracking" /></Lbl><Btn primary type="submit" data-testid="vmc-address-add">Add</Btn></form></Panel></div>;
}

function AssetSearch({ d, st, emit }) {
  const [f, on] = useForm({ os: "", port: "", ips: "", qid: "" });
  const [res, setRes] = useState(null);
  const [tag, setTag] = useState("");
  const go = (e) => {
    e.preventDefault();
    const ips = f.ips.trim() ? new Set(expand(f.ips)) : null;
    setRes(subHosts(d, st).filter((h) => (!f.os || h.os.toLowerCase().includes(f.os.toLowerCase())) && (!f.port || h.ports.includes(Number(f.port))) && (!ips || ips.has(h.ip)) && (!f.qid || h.qids.includes(Number(f.qid)))));
    emit("asset.searched", { os: f.os.trim(), port: f.port.trim(), ips: f.ips.trim(), qid: f.qid.trim() });
  };
  const mk = () => { if (!tag.trim()) return toast.error("Name the tag"); emit("tag.created", { name: tag.trim(), parent: "", engine: "Static", query: "from asset search", evaluate: "no" }); toast.success(`Tag '${tag.trim()}' applied to ${res.length} hosts`); setTag(""); };
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] items-start gap-3"><Panel title="Asset Search"><form onSubmit={go} className="space-y-2">
    <Lbl t="Operating system contains"><In value={f.os} onChange={on("os")} data-testid="vmc-asearch-os" /></Lbl><Lbl t="Open port"><In value={f.port} onChange={on("port")} data-testid="vmc-asearch-port" /></Lbl>
    <Lbl t="IPs / ranges"><In value={f.ips} onChange={on("ips")} data-testid="vmc-asearch-ips" /></Lbl><Lbl t="Vulnerability (QID)"><In value={f.qid} onChange={on("qid")} data-testid="vmc-asearch-qid" /></Lbl>
    <Btn primary type="submit" data-testid="vmc-asearch-go">Search</Btn></form></Panel>
    <Panel title={res ? `Results (${res.length})` : "Results"} tid="vmc-asearch-results">{res ? <div className="space-y-3"><Table rowTid="vmc-asearch-row" cols={["IP", "Name", "OS", "Open ports"]} rows={res.map((h) => [h.ip, h.name, h.os, h.ports.join(", ")])} empty="No matching hosts" />
      {res.length > 0 && <div className="flex gap-1.5 max-w-sm"><In placeholder="Tag name" value={tag} onChange={(e) => setTag(e.target.value)} data-testid="vmc-asearch-tagname" /><Btn onClick={mk} data-testid="vmc-asearch-createtag">Create tag from results</Btn></div>}</div> : <p className="text-xs text-slate-500">Set criteria and search.</p>}</Panel></div>;
}

const TOK = { operatingsystem: (h, v) => h.os.toLowerCase().includes(v), port: (h, v) => h.ports.includes(Number(v)), name: (h, v) => h.name.toLowerCase().includes(v), ip: (h, v) => expand(v).includes(h.ip), qid: (h, v) => h.qids.includes(Number(v)) };

export function runQuery(q, hosts) {
  const parts = q.trim().split(/\s+(and|or)\s+/i);
  const term = (t) => { const neg = /^not\s+/i.test(t); const m = t.replace(/^not\s+/i, "").match(/^(\w+)\s*:\s*["'`]?(.+?)["'`]?$/); if (!m || !TOK[m[1].toLowerCase()]) throw new Error(`Unknown token in '${t}'`); const fn = (h) => TOK[m[1].toLowerCase()](h, m[2].toLowerCase()); return neg ? (h) => !fn(h) : fn; };
  let pred = term(parts[0]);
  for (let i = 1; i < parts.length; i += 2) { const a = pred, b = term(parts[i + 1]); pred = parts[i].toLowerCase() === "and" ? (h) => a(h) && b(h) : (h) => a(h) || b(h); }
  return hosts.filter(pred);
}

function Inventory({ d, st, emit }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const go = (e) => { e.preventDefault(); try { setRes(runQuery(q, subHosts(d, st))); emit("inventory.queried", { q: q.trim() }); } catch (er) { toast.error(er.message); } };
  return <Panel title="Inventory query" tid="vmc-inventory" actions={<form onSubmit={go} className="w-80"><In value={q} onChange={(e) => setQ(e.target.value)} placeholder="operatingSystem: Windows and port: 445 — Enter" data-testid="vmc-inventory-q" /></form>}>
    <p className="text-[11px] text-slate-500 mb-2">Tokens: operatingSystem, port, name, ip, qid · operators: and, or, not · e.g. <code className="text-sky-300">operatingSystem: Linux and not port: 443</code></p>
    {res && <Table rowTid="vmc-inventory-row" cols={["IP", "Name", "OS", "Ports", "Vulns"]} rows={res.map((h) => [h.ip, h.name, h.os, h.ports.join(", "), findings(d, h).filter((k) => k.type !== "Information gathered").length])} empty="No matching assets" />}</Panel>;
}

export function Assets2(p) {
  const [t, setT] = useState("address");
  const V = { address: Address, search: AssetSearch, inventory: Inventory }[t];
  return <div className="space-y-3"><SubTabs tid="vmc-assets-tab" cur={t} set={setT} tabs={[["address", "Address Management"], ["search", "Asset Search"], ["inventory", "Inventory"]]} /><V {...p} /></div>;
}

const W = { Critical: 5, High: 4, Medium: 3, Minor: 2, Low: 1 };

export function Groups2({ d, st, emit }) {
  const [f, on, reset] = useForm({ name: "", ips: "", domains: "", impact: "High" });
  const add = (e) => { e.preventDefault(); if (!f.name.trim() || !f.ips.trim()) return toast.error("Title and IPs are required"); emit("asset_group.created", { ...f, name: f.name.trim() }); toast.success("Asset group saved"); reset(); };
  const rows = (st.console.groups || []).map((g) => { const ips = new Set(expand(g.ips)); const hs = subHosts(d, st).filter((h) => ips.has(h.ip));
    const risk = hs.length ? hs.reduce((n, h) => n + Math.max(...findings(d, h).map((k) => k.severity)), 0) / hs.length : 0;
    return [g.name, g.ips, hs.length, g.impact, (risk * W[g.impact] * 4).toFixed(0)]; });
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] items-start gap-3"><Panel title="Asset Groups" tid="vmc-groups"><Table rowTid="vmc-group-row" cols={["Title", "IPs", "Hosts", "Business impact", "Business risk"]} rows={rows} empty="No asset groups" /></Panel>
    <Panel title="New asset group"><form onSubmit={add} className="space-y-2"><Lbl t="Title (prefix with AG:)"><In value={f.name} onChange={on("name")} placeholder="AG: San Jose" data-testid="vmc-group-name" /></Lbl>
      <Lbl t="IPs / ranges"><In value={f.ips} onChange={on("ips")} data-testid="vmc-group-ips" /></Lbl><Lbl t="Domains (optional)"><In value={f.domains} onChange={on("domains")} /></Lbl>
      <Lbl t="Business impact"><Sel options={Object.keys(W)} value={f.impact} onChange={on("impact")} data-testid="vmc-group-impact" /></Lbl><Btn primary type="submit" data-testid="vmc-group-create">Save</Btn></form></Panel></div>;
}
