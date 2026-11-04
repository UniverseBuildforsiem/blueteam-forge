import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Radar, Loader2, Info } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { Glass } from "../components/common";
import IntelReport from "../components/intel/IntelReport";
import IntelTools from "../components/intel/IntelTools";
import { BulkPanel, ProxyPanel, DefangPanel, HistoryPanel } from "../components/intel/IntelPanels";

const TABS = [["lookup", "IOC lookup"], ["bulk", "Bulk extractor"], ["proxy", "Proxy & IP finder"], ["defang", "Defang / refang"], ["tools", "Open-source tools"], ["history", "History"]];
const EXAMPLES = [["Tor exit IP", "185.220.101.1"], ["Cloudflare DNS", "1.1.1.1"], ["Domain", "microsoft.com"], ["EICAR test hash", "44d88612fea8a8f36de82e1278abb02f"], ["Defanged URL", "hxxps://example[.]com/login"]];
const kindOf = (v) => { const s = v.trim().replace(/\[\.\]/g, "."); if (/^h(xx|tt)ps?:\/\//i.test(s)) return "URL"; if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s) || /^[0-9a-f:]+:[0-9a-f:]*$/i.test(s)) return "IP"; if (/^([a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/i.test(s)) return "HASH"; if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return "DOMAIN"; return null; };

export default function ThreatIntel() {
  const [tab, setTab] = useState("lookup");
  const [ioc, setIoc] = useState("");
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (v = ioc) => {
    setTab("lookup"); setIoc(v); setBusy(true); setR(null);
    try { const { data } = await api.post("/intel/lookup", { ioc: v }); setR(data); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const k = kindOf(ioc);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const q = params.get("q");
    if (q) { setParams({}, { replace: true }); run(q); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="p-6 lg:p-10 max-w-7xl" data-testid="threat-intel-page">
      <div className="eyebrow mb-2">// threat intel platform</div>
      <h1 className="text-3xl sm:text-4xl font-extrabold">Threat Intel Lookup</h1>
      <p className="text-sm text-slate-400 mt-2 max-w-3xl">Trace IPs, check malware hashes and signatures, investigate domains and URLs, and spot proxies, VPNs and Tor — using live open-source intel feeds, VirusTotal and AbuseIPDB in one place.</p>
      <div className="flex flex-wrap gap-1 mt-6 border-b border-white/10" data-testid="intel-tabs">
        {TABS.map(([id, l]) => <button key={id} onClick={() => setTab(id)} data-testid={`intel-tab-${id}`} className={`px-4 py-2 text-xs font-mono border-b-2 -mb-px transition-colors ${tab === id ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}>{l}</button>)}
      </div>
      <div className="mt-6">
        {tab === "lookup" && <>
          <Glass className="p-4">
            <form onSubmit={(e) => { e.preventDefault(); if (ioc.trim()) run(); }} className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[260px] flex items-center gap-2 bg-black/40 border border-white/10 focus-within:border-cyan-400 px-3 rounded-sm">
                <Radar className="h-4 w-4 text-cyan-400" />
                <input value={ioc} onChange={(e) => setIoc(e.target.value)} placeholder="IP, domain, URL or MD5 / SHA-1 / SHA-256 hash" className="bg-transparent py-3 text-sm font-mono outline-none flex-1" data-testid="intel-input" />
                {k && <span className="text-[10px] font-mono text-green-400 border border-green-500/30 px-1.5 py-0.5" data-testid="intel-detected">{k}</span>}
              </div>
              <button className="glow-btn" disabled={busy || !ioc.trim()} data-testid="intel-submit">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy ? "Checking sources..." : "Investigate"}</button>
            </form>
            <div className="flex flex-wrap items-center gap-2 mt-3 text-xs"><span className="text-slate-500 font-mono">try:</span>
              {EXAMPLES.map(([l, v]) => <button key={v} onClick={() => run(v)} className="font-mono border border-white/10 px-2 py-1 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300" data-testid={`intel-example-${l.toLowerCase().replace(/\s+/g, "-")}`}>{l}</button>)}</div>
            <div className="flex items-start gap-2 mt-3 text-[11px] text-slate-500"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />Don't paste confidential company data: indicators sent to VirusTotal may become visible to its community.</div>
          </Glass>
          <div className="mt-6">{busy && <div className="text-xs font-mono text-cyan-400 cursor-blink">// querying geo, blocklists, Shodan, WHOIS, DNS, VirusTotal, AbuseIPDB </div>}{r && <IntelReport r={r} />}</div>
        </>}
        {tab === "bulk" && <BulkPanel />}
        {tab === "proxy" && <ProxyPanel onLookup={run} />}
        {tab === "defang" && <DefangPanel />}
        {tab === "tools" && <IntelTools />}
        {tab === "history" && <HistoryPanel />}
      </div>
    </div>);
}
