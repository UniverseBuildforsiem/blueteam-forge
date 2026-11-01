import { useEffect, useState } from "react";
import { ShieldAlert, Mail, Box, Binary, Radio, FolderKanban, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, PageHeader, SeverityBadge, Empty } from "../../components/common";
import { IntelReport, SandboxReport } from "../../components/InvestigationKit";

function Intel() {
  const [q, setQ] = useState("");
  const [r, setR] = useState(null);
  const go = async (v = q) => { try { const { data } = await api.get("/tools/intel", { params: { q: v } }); setR(data); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-4">
      <div className="flex gap-2"><input className="field font-mono" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="IP, domain, URL or file hash" data-testid="intel-input" />
        <button className="glow-btn" onClick={() => go()} data-testid="intel-lookup-button">Lookup</button></div>
      <div className="flex flex-wrap gap-2 text-xs font-mono">{["185.220.101.45", "cdn-update.top", "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "8.8.8.8"].map((x) => <button key={x} onClick={() => { setQ(x); go(x); }} className="text-slate-500 hover:text-cyan-300 truncate max-w-[220px]">{x}</button>)}</div>
      {r && <IntelReport r={r} onPivot={(v) => { setQ(v); go(v); }} />}
    </div>
  );
}

const SAMPLE_HDR = `Return-Path: <bounce@mail-paypa1.com>
Received: from mx.mail-paypa1.com (91.243.44.10) by mx.acme-corp.local
From: "Accounts" <billing@paypa1-invoices.com>
Reply-To: payments@secure-billing.ru
To: j.morris@acme-corp.local
Subject: Invoice #88213 overdue
Authentication-Results: spf=fail dkim=none dmarc=fail`;

function Header() {
  const [raw, setRaw] = useState(SAMPLE_HDR);
  const [r, setR] = useState(null);
  const go = async () => { try { const { data } = await api.post("/tools/email-header", { raw }); setR(data); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div><textarea className="field h-72 font-mono text-xs" value={raw} onChange={(e) => setRaw(e.target.value)} data-testid="header-input" />
        <button className="glow-btn mt-2" onClick={go} data-testid="header-analyze-button">Analyze headers</button></div>
      {r ? <Glass className="p-5 space-y-3 text-sm" data-testid="header-result">
        <div className={`font-mono font-bold uppercase ${r.findings.length ? "text-orange-300" : "text-green-400"}`}>{r.verdict}</div>
        {[["From", r.from], ["Return-Path", r.return_path], ["Reply-To", r.reply_to], ["Subject", r.subject], ["IPs", r.ips.join(", ")]].map(([k, v]) => v ? <div key={k}><span className="text-xs font-mono text-slate-500">{k}: </span>{v}</div> : null)}
        <div className="space-y-1.5 pt-2">{r.findings.map((f, i) => <div key={i} className="flex items-center gap-2"><SeverityBadge level={f.severity} /><span>{f.text}</span></div>)}</div>
      </Glass> : <Empty text="paste headers and analyze" />}
    </div>
  );
}

function Sandbox() {
  const [s, setS] = useState([]);
  useEffect(() => { api.get("/tools/sandbox").then((r) => setS(r.data)); }, []);
  return <div className="grid lg:grid-cols-2 gap-4">{s.map((x) => <SandboxReport key={x.id} x={x} />)}</div>;
}

const OPS = {
  "From Base64": (s) => atob(s.trim()), "To Base64": (s) => btoa(s), "URL Decode": decodeURIComponent, "URL Encode": encodeURIComponent,
  "From Hex": (s) => s.replace(/[^0-9a-f]/gi, "").match(/.{2}/g)?.map((h) => String.fromCharCode(parseInt(h, 16))).join("") || "",
  "To Hex": (s) => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" "),
  ROT13: (s) => s.replace(/[a-z]/gi, (c) => String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)),
  Defang: (s) => s.replace(/\./g, "[.]").replace(/http/gi, "hxxp"), Refang: (s) => s.replace(/\[\.\]/g, ".").replace(/hxxp/gi, "http"),
  Reverse: (s) => [...s].reverse().join(""), "Remove whitespace": (s) => s.replace(/\s+/g, ""),
};

function Decoder() {
  const [input, setInput] = useState("U09DRntkM2MwZDNkX2wwMHR9");
  const [recipe, setRecipe] = useState(["From Base64"]);
  let out = input, err = null;
  try { recipe.forEach((r) => { out = OPS[r](out); }); } catch (e) { err = `${e.message}`; }
  return (
    <div className="grid lg:grid-cols-[200px_1fr] gap-4">
      <Glass className="p-3"><div className="eyebrow mb-2">operations</div>{Object.keys(OPS).map((o) => <button key={o} onClick={() => setRecipe([...recipe, o])} className="block w-full text-left text-xs font-mono py-1.5 hover:text-cyan-300" data-testid={`decoder-op-${o.replace(/\s+/g, "-").toLowerCase()}`}>+ {o}</button>)}</Glass>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 min-h-[34px]" data-testid="decoder-recipe">{recipe.map((r, i) => <span key={i} className="flex items-center gap-1 px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono">{r}<button onClick={() => setRecipe(recipe.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button></span>)}</div>
        <textarea className="field h-36 font-mono text-xs" value={input} onChange={(e) => setInput(e.target.value)} data-testid="decoder-input" />
        <pre className={`bg-black/50 border border-green-500/30 p-3 min-h-[120px] whitespace-pre-wrap break-all text-xs font-mono ${err ? "text-red-400" : "text-green-300"}`} data-testid="decoder-output">{err || out}</pre>
      </div>
    </div>
  );
}

function Feed() {
  const [f, setF] = useState([]);
  useEffect(() => { api.get("/tools/feed").then((r) => setF(r.data)); }, []);
  return <Glass className="divide-y divide-white/5" data-testid="threat-feed">{f.map((x) => <div key={x.title} className="p-4 flex items-center gap-4"><SeverityBadge level={x.severity} /><div className="flex-1 text-sm">{x.title}</div><span className="text-xs font-mono text-slate-500">{x.date}</span></div>)}</Glass>;
}

function Cases() {
  const [cs, setCs] = useState([]);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ title: "", severity: "High", description: "" });
  const [note, setNote] = useState("");
  const load = () => api.get("/cases").then((r) => { setCs(r.data); setSel((s) => (s ? r.data.find((c) => c.id === s.id) : s)); });
  useEffect(() => { load(); }, []);
  const create = async () => { try { const { data } = await api.post("/cases", form); setForm({ title: "", severity: "High", description: "" }); setSel(data); load(); } catch (e) { toast.error(errMsg(e)); } };
  const update = async (body) => { await api.patch(`/cases/${sel.id}`, body); setNote(""); load(); };
  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4">
      <div className="space-y-3">
        <Glass className="p-4 space-y-2"><div className="eyebrow">new case</div>
          <input className="field" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="case-title-input" />
          <select className="field" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} data-testid="case-severity-select">{["Critical", "High", "Medium", "Low"].map((s) => <option key={s}>{s}</option>)}</select>
          <textarea className="field h-20" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="case-description-input" />
          <button className="glow-btn w-full justify-center" onClick={create} disabled={form.title.length < 3} data-testid="case-create-button"><Plus className="h-4 w-4" />Open case</button></Glass>
        {cs.map((c) => <button key={c.id} onClick={() => setSel(c)} className={`w-full text-left glass rounded-sm p-3 ${sel?.id === c.id ? "!border-cyan-400" : ""}`} data-testid={`case-item-${c.id}`}>
          <div className="flex justify-between"><span className="font-mono text-xs text-cyan-400">{c.id}</span><SeverityBadge level={c.severity} /></div><div className="text-sm mt-1">{c.title}</div><div className="text-xs text-slate-500 font-mono">{c.status}</div></button>)}
      </div>
      {sel ? <Glass className="p-5" data-testid="case-detail">
        <div className="flex flex-wrap justify-between gap-3"><div><div className="font-mono text-xs text-cyan-400">{sel.id}</div><h3 className="text-lg font-bold">{sel.title}</h3></div>
          <select className="field !w-40" value={sel.status} onChange={(e) => update({ status: e.target.value })} data-testid="case-status-select">{["Open", "In Progress", "Escalated", "Closed"].map((s) => <option key={s}>{s}</option>)}</select></div>
        <p className="text-sm text-slate-400 mt-3">{sel.description}</p>
        <div className="eyebrow mt-6 mb-3">timeline</div>
        <div className="space-y-3 border-l border-cyan-500/30 pl-4">{sel.timeline.map((t, i) => <div key={i} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 bg-cyan-400 rounded-full" /><div className="text-xs font-mono text-slate-500">{fmtDate(t.at)}</div><div className="text-sm">{t.text}</div></div>)}</div>
        <div className="flex gap-2 mt-5"><input className="field" placeholder="Add investigation note..." value={note} onChange={(e) => setNote(e.target.value)} data-testid="case-note-input" /><button className="ghost-btn" disabled={!note} onClick={() => update({ note })} data-testid="case-note-add">Add</button></div>
      </Glass> : <Empty text="select or open a case" />}
    </div>
  );
}

const TABS = [["intel", "Intel Lookup", ShieldAlert, Intel], ["header", "Email Headers", Mail, Header], ["sandbox", "Sandbox", Box, Sandbox], ["decoder", "Decoder", Binary, Decoder], ["feed", "Threat Feed", Radio, Feed], ["cases", "Cases", FolderKanban, Cases]];

export default function Tools() {
  return (
    <div>
      <PageHeader eyebrow="// investigation toolkit" title="Investigation tools" sub="Simulated reputation lookups, header analysis, sandbox reports, a recipe decoder, threat intel and case management." />
      <Tabs defaultValue="intel">
        <TabsList className="bg-black/40 mb-4 flex-wrap h-auto">{TABS.map(([v, l, I]) => <TabsTrigger key={v} value={v} data-testid={`tools-tab-${v}`}><I className="h-4 w-4 mr-1" />{l}</TabsTrigger>)}</TabsList>
        {TABS.map(([v, , , C]) => <TabsContent key={v} value={v}><C /></TabsContent>)}
      </Tabs>
    </div>
  );
}
