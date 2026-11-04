import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Trash2, Wand2, Globe2, Loader2 } from "lucide-react";
import { api, errMsg } from "../../lib/api";
import { Glass, Empty } from "../common";
import IntelReport, { VerdictChip, download } from "./IntelReport";

export { defang, refang } from "./IntelTicket";
import { defang, refang } from "./IntelTicket";

export function OpenReport({ id, onClose }) {
  const [r, setR] = useState(null);
  useEffect(() => { api.get(`/intel/history/${id}`).then((x) => setR(x.data)).catch((e) => toast.error(errMsg(e))); }, [id]);
  return (<div className="mt-6"><button className="text-xs font-mono text-slate-400 hover:text-cyan-300 mb-3" onClick={onClose} data-testid="intel-report-close">← back to list</button>{r ? <IntelReport r={r} /> : <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />}</div>);
}

const csvOf = (rows) => ["indicator,type,verdict,risk_score,findings", ...rows.map((r) => [r.ioc, r.type || "", r.verdict, r.score, `"${(r.reasons || []).join(" | ").replace(/"/g, "'")}"`].join(","))].join("\n");

export function BulkPanel() {
  const [text, setText] = useState("");
  const [iocs, setIocs] = useState(null);
  const [pick, setPick] = useState({});
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const extract = async () => {
    try { const { data } = await api.post("/intel/extract", { text }); setIocs(data.iocs); setPick(Object.fromEntries(data.iocs.slice(0, 25).map((x) => [x.ioc, true]))); setRes(null); if (!data.count) toast.message("No IPs, domains, URLs or hashes found"); } catch (e) { toast.error(errMsg(e)); }
  };
  const chosen = Object.keys(pick).filter((k) => pick[k]);
  const check = async () => {
    setBusy(true);
    try { const { data } = await api.post("/intel/bulk", { iocs: chosen }); setRes(data.results); toast.success(`Checked ${data.results.length} indicators`); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (open) return <OpenReport id={open} onClose={() => setOpen(null)} />;
  return (
    <div className="space-y-4" data-testid="intel-bulk">
      <Glass className="p-4">
        <div className="text-xs text-slate-400 mb-2">Paste an email, alert, log or threat report. Defanged indicators (hxxp, [.]) are handled automatically. Private IPs are ignored.</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} className="field h-40 font-mono text-xs" placeholder={"Received: from mail.evil-login[.]xyz (45.95.147.236)\nhxxp://bad-update[.]top/invoice.exe\nSHA256: 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f"} data-testid="intel-bulk-text" />
        <button className="glow-btn !text-xs mt-3" onClick={extract} disabled={!text.trim()} data-testid="intel-bulk-extract"><Wand2 className="h-3.5 w-3.5" />Extract indicators</button>
      </Glass>
      {iocs && !res && iocs.length > 0 && <Glass className="p-4" data-testid="intel-bulk-list">
        <div className="flex items-center gap-3 mb-3 text-sm"><span>{iocs.length} found · {chosen.length} selected (max 25)</span>
          <button className="glow-btn !text-xs ml-auto" onClick={check} disabled={busy || !chosen.length || chosen.length > 25} data-testid="intel-bulk-check">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{busy ? "Checking..." : `Check ${chosen.length}`}</button></div>
        <div className="grid sm:grid-cols-2 gap-1">{iocs.map((x) => <label key={x.ioc} className="flex items-center gap-2 text-xs font-mono py-1"><input type="checkbox" checked={!!pick[x.ioc]} onChange={(e) => setPick({ ...pick, [x.ioc]: e.target.checked })} className="accent-cyan-400" />
          <span className="text-cyan-300 w-14 uppercase">{x.type}</span><span className="break-all text-slate-300">{x.ioc}</span></label>)}</div>
      </Glass>}
      {res && <Glass className="overflow-hidden" data-testid="intel-bulk-results">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 text-sm"><span>{res.filter((r) => r.verdict === "malicious").length} malicious · {res.filter((r) => r.verdict === "suspicious").length} suspicious · {res.length} total</span>
          <button className="ghost-btn !text-xs ml-auto" onClick={() => download("bulk-ioc-results.csv", csvOf(res), "text/csv")} data-testid="intel-bulk-export"><Download className="h-3.5 w-3.5" />Export CSV</button>
          <button className="ghost-btn !text-xs" onClick={() => setRes(null)} data-testid="intel-bulk-back">Back</button></div>
        {[...res].sort((a, b) => b.score - a.score).map((r) => (
          <button key={r.ioc} disabled={!r.id} onClick={() => setOpen(r.id)} className="w-full text-left flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-white/5 hover:bg-white/[0.03]" data-testid={`intel-bulk-row-${r.ioc}`}>
            <span className="text-[11px] font-mono uppercase text-cyan-300 w-14">{r.type || "—"}</span><span className="font-mono text-xs flex-1 min-w-[200px] break-all">{r.ioc}</span>
            <span className="text-xs text-slate-400 flex-[2] min-w-[200px] truncate">{r.reasons?.[0] || "No negative findings"}</span><VerdictChip v={r.verdict} /></button>))}
        <div className="px-4 py-2 text-[11px] text-slate-500">Bulk checks use VirusTotal only within its free limit of 4 a minute; open a row for full details.</div>
      </Glass>}
    </div>);
}

export function ProxyPanel({ onLookup }) {
  const [me, setMe] = useState(null);
  const [ip, setIp] = useState("");
  useEffect(() => { api.get("/intel/myip").then((r) => setMe(r.data)).catch(() => {}); }, []);
  const g = me?.geo?.data || {};
  const b = me?.blocklists?.data || {};
  return (
    <div className="grid lg:grid-cols-2 gap-4" data-testid="intel-proxy">
      <Glass className="p-5"><div className="flex items-center gap-2 mb-3"><Globe2 className="h-4 w-4 text-cyan-400" /><h3 className="font-bold text-sm">Your public IP</h3></div>
        {!me ? <Loader2 className="h-4 w-4 animate-spin text-cyan-400" /> : <>
          <div className="font-mono text-2xl text-cyan-300" data-testid="intel-myip">{me.ip}</div>
          {me.public && <div className="text-xs text-slate-400 mt-1">{[g.city, g.country].filter(Boolean).join(", ")} · {g.isp}</div>}
          {me.public && <div className="flex flex-wrap gap-2 mt-3">{[["Proxy/VPN", g.proxy], ["Hosting", g.hosting], ["Tor exit", b.tor_exit]].map(([l, on]) => <span key={l} className={`text-[11px] font-mono border px-2 py-0.5 ${on ? "border-amber-500/40 text-amber-300" : "border-white/10 text-slate-500"}`}>{l}: {on ? "YES" : "no"}</span>)}</div>}
        </>}</Glass>
      <Glass className="p-5"><h3 className="font-bold text-sm mb-1">Proxy / VPN / Tor finder</h3>
        <p className="text-xs text-slate-400 mb-3">Check whether a suspicious login or connection came through an anonymiser, data centre or Tor exit.</p>
        <div className="flex gap-2"><input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="185.220.101.1" className="field font-mono text-sm" data-testid="intel-proxy-input" />
          <button className="glow-btn !text-xs" disabled={!ip.trim()} onClick={() => onLookup(ip)} data-testid="intel-proxy-check">Check</button></div></Glass>
    </div>);
}

export function DefangPanel() {
  const [t, setT] = useState("");
  const copy = async () => { try { await navigator.clipboard.writeText(t); toast.success("Copied"); } catch { toast.error("Could not copy, select the text and copy manually"); } };
  return (
    <Glass className="p-4" data-testid="intel-defang">
      <div className="text-xs text-slate-400 mb-2">Defang indicators before pasting them into tickets, chat or email so nobody clicks them by accident. Refang to turn them back.</div>
      <textarea value={t} onChange={(e) => setT(e.target.value)} className="field h-48 font-mono text-xs" placeholder="https://evil.example.com/payload.exe  attacker@phish.io  45.95.147.236" data-testid="intel-defang-text" />
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="glow-btn !text-xs" onClick={() => setT(defang(t))} data-testid="intel-defang-btn">Defang</button>
        <button className="ghost-btn !text-xs" onClick={() => setT(refang(t))} data-testid="intel-refang-btn">Refang</button>
        <button className="ghost-btn !text-xs" onClick={copy} disabled={!t} data-testid="intel-defang-copy"><Copy className="h-3.5 w-3.5" />Copy</button>
      </div>
    </Glass>);
}

export function HistoryPanel() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => api.get("/intel/history").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  const exportCsv = async () => { try { const r = await api.get("/intel/history/export", { responseType: "blob" }); download("threat-intel-history.csv", r.data, "text/csv"); } catch (e) { toast.error(errMsg(e)); } };
  const clear = async () => { if (!window.confirm("Clear your lookup history?")) return; try { await api.delete("/intel/history"); load(); toast.success("History cleared"); } catch (e) { toast.error(errMsg(e)); } };
  if (open) return <OpenReport id={open} onClose={() => setOpen(null)} />;
  if (!d) return null;
  return (
    <Glass className="overflow-hidden" data-testid="intel-history">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/10 text-sm"><span data-testid="intel-history-usage">{d.used_today}/{d.limit} lookups used in the last 24h</span>
        <button className="ghost-btn !text-xs ml-auto" onClick={exportCsv} disabled={!d.items.length} data-testid="intel-history-export"><Download className="h-3.5 w-3.5" />Export CSV</button>
        <button className="ghost-btn !text-xs" onClick={clear} disabled={!d.items.length} data-testid="intel-history-clear"><Trash2 className="h-3.5 w-3.5" />Clear</button></div>
      {d.items.map((h) => (
        <button key={h.id} onClick={() => setOpen(h.id)} className="w-full text-left flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-white/5 hover:bg-white/[0.03]" data-testid={`intel-history-row-${h.id}`}>
          <span className="text-[11px] font-mono text-slate-500 w-32">{new Date(h.at).toLocaleString()}</span><span className="text-[11px] font-mono uppercase text-cyan-300 w-14">{h.type}</span>
          <span className="font-mono text-xs flex-1 min-w-[200px] break-all">{h.ioc}</span><VerdictChip v={h.verdict} /></button>))}
      {!d.items.length && <Empty text="no lookups yet" />}
    </Glass>);
}
