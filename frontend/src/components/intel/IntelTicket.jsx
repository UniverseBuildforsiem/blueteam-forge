import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";

export const defang = (s) => s.replace(/https?/gi, (m) => m.replace(/t/gi, "x")).replace(/\./g, "[.]").replace(/@/g, "[@]").replace(/:\/\//g, "[://]");
export const refang = (s) => s.replace(/hxxp/gi, "http").replace(/\[\.\]|\(\.\)|\{\.\}/g, ".").replace(/\[@\]|\[at\]/gi, "@").replace(/\[:\/\/\]/g, "://").replace(/\[:\]/g, ":");

const LEVEL = { malicious: ["1 - High", "1 - High", "P1 - Critical"], suspicious: ["2 - Medium", "2 - Medium", "P3 - Moderate"], clean: ["3 - Low", "3 - Low", "P4 - Low"], unknown: ["3 - Low", "2 - Medium", "P4 - Low"] };
const SUB = { ip: "Suspicious IP address", domain: "Suspicious domain", url: "Malicious / phishing URL", hash: "Malware / suspicious file" };
const VLABEL = { malicious: "MALICIOUS", suspicious: "SUSPICIOUS", clean: "NO THREATS FOUND", unknown: "INCONCLUSIVE" };
const ACTIONS = {
  ip: ["Search SIEM/firewall/proxy logs for all connections to/from the IP in the last 30 days", "Identify affected hosts and user accounts", "Block the IP at the perimeter firewall / proxy if malicious", "If a login came from it, reset credentials and review MFA / sign-in history"],
  domain: ["Search DNS, proxy and email logs for the domain and its subdomains", "Identify users who resolved or visited it", "Add to DNS sinkhole / web proxy blocklist if malicious", "Purge related emails and reset credentials for anyone who submitted data"],
  url: ["Search proxy and email gateway logs for clicks on the URL", "Identify recipients and anyone who clicked or submitted credentials", "Block the URL and host on the web proxy / email gateway", "Purge the phishing emails and reset credentials of affected users"],
  hash: ["Search EDR for the hash across all endpoints (process, file and module events)", "Isolate affected hosts if execution is confirmed", "Add the hash to the EDR block list", "Collect the sample and parent process tree for deeper analysis"],
};

function fields(r) {
  const [impact, urgency, priority] = LEVEL[r.verdict] || LEVEL.unknown;
  const ioc = defang(r.ioc);
  const s = r.sources || {};
  const facts = [];
  const g = s.geo?.data; if (g) facts.push(`Geo/ASN: ${[g.city, g.country].filter(Boolean).join(", ")} | ${g.as || ""} | ISP ${g.isp || "-"} | proxy=${g.proxy ? "yes" : "no"} hosting=${g.hosting ? "yes" : "no"}`);
  const v = s.virustotal?.data; if (s.virustotal?.status === "ok") facts.push(`VirusTotal: ${v.malicious} malicious / ${v.suspicious} suspicious of ${v.malicious + v.suspicious + v.harmless + v.undetected} engines${v.threat_label ? ` | label ${v.threat_label}` : ""}`);
  const a = s.abuseipdb?.data; if (s.abuseipdb?.status === "ok") facts.push(`AbuseIPDB: ${a.abuseConfidenceScore}% confidence, ${a.totalReports} reports`);
  const b = s.blocklists?.data; if (b) facts.push("phishing_army" in b ? `Phishing Army: ${b.phishing_army ? "LISTED" : "not listed"}` : `Blocklists: Tor exit=${b.tor_exit ? "yes" : "no"}, Feodo C2=${b.feodo_c2 ? "yes" : "no"}, Spamhaus DROP=${b.spamhaus_drop || "no"}`);
  const p = s.open_ports?.data; if (p?.ports?.length) facts.push(`Open ports: ${p.ports.join(", ")}${p.vulns?.length ? ` | CVEs: ${p.vulns.slice(0, 5).join(", ")}` : ""}`);
  const w = s.whois?.data; if (w?.registered || w?.name) facts.push(`WHOIS: ${w.name || ""}${w.registered ? ` registered ${String(w.registered).slice(0, 10)}` : ""}`);
  const d = s.dns?.data; if (d?.A?.length) facts.push(`DNS A: ${d.A.slice(0, 4).map(defang).join(", ")}`);
  if (v?.yara?.length) facts.push(`YARA: ${v.yara.map((y) => y.rule).slice(0, 4).join(", ")}`);
  if (v?.names?.length) facts.push(`File names: ${v.names.slice(0, 3).join(", ")}`);
  const short = `[${VLABEL[r.verdict] || "REVIEW"}] ${SUB[r.type]} - ${ioc} (risk ${r.score}/100)`;
  const description = [
    `Summary: Threat intel enrichment of ${r.type.toUpperCase()} ${ioc} returned a verdict of ${VLABEL[r.verdict]} with a risk score of ${r.score}/100.`, "",
    "Indicators of compromise (defanged):", `- ${r.type.toUpperCase()}: ${ioc}`, ...(d?.A?.length ? d.A.slice(0, 3).map((x) => `- Resolves to: ${defang(x)}`) : []), ...(v?.sha256 && r.type === "hash" ? [`- SHA256: ${v.sha256}`] : []), "",
    "Key findings:", ...(r.reasons.length ? r.reasons.map((x) => `- ${x}`) : ["- No source reported this indicator as malicious"]), "",
    "Enrichment details:", ...facts.map((x) => `- ${x}`), "",
    "Recommended actions:", ...ACTIONS[r.type].map((x, i) => `${i + 1}. ${x}`),
  ].join("\n");
  const notes = `${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC - IOC enriched via SOCProfessionals Threat Intel (sources: ${Object.keys(s).filter((k) => s[k].status === "ok").join(", ") || "none"}). Lookup time ${String(r.at).replace("T", " ").slice(0, 16)} UTC. Indicators defanged for safe handling.`;
  return [["Short description", short], ["Category", "Security Incident"], ["Subcategory", SUB[r.type]], ["Impact", impact], ["Urgency", urgency], ["Priority", priority],
    ["Assignment group", r.verdict === "malicious" ? "SOC L2 - Incident Response" : "SOC L1 - Triage"], ["State", "New"], ["Configuration item", r.type === "hash" ? "Affected endpoint(s) - TBD" : "Network perimeter - TBD"],
    ["Description", description], ["Work notes", notes]];
}

export default function IntelTicket({ r }) {
  const [open, setOpen] = useState(false);
  const init = useMemo(() => fields(r), [r]);
  const [f, setF] = useState(init);
  const copy = async (t, l) => { try { await navigator.clipboard.writeText(t); toast.success(`${l} copied`); } catch { toast.error("Could not copy, select the text and copy manually"); } };
  const all = () => f.map(([k, v]) => (v.includes("\n") ? `${k}:\n${v}` : `${k}: ${v}`)).join("\n\n");
  const show = () => { setF(init); setOpen(true); };
  return (<>
    <button className="ghost-btn !text-xs" onClick={show} data-testid="intel-ticket-open"><ClipboardList className="h-3.5 w-3.5" />Create ticket</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl bg-[#0B0F1A] border-cyan-500/30 max-h-[90vh] overflow-y-auto" data-testid="intel-ticket">
        <DialogTitle className="font-mono">Incident ticket <span className="text-xs text-slate-500">ServiceNow-style</span></DialogTitle>
        <DialogDescription className="text-xs text-slate-400">Edit any field, then copy field by field or everything at once. Indicators are defanged.</DialogDescription>
        <div className="space-y-3 mt-2">
          {f.map(([k, v], i) => {
            const id = k.toLowerCase().replace(/\s+/g, "-");
            const set = (val) => setF(f.map((x, j) => (j === i ? [x[0], val] : x)));
            const multi = k === "Description" || k === "Work notes";
            return (
              <div key={k} className={multi ? "" : "grid sm:grid-cols-[150px_1fr_auto] gap-2 items-center"}>
                <div className="flex items-center gap-2"><span className="text-[11px] font-mono uppercase text-slate-500">{k}</span>
                  {multi && <button onClick={() => copy(v, k)} className="ml-auto text-slate-500 hover:text-cyan-300" data-testid={`intel-ticket-copy-${id}`}><Copy className="h-3.5 w-3.5" /></button>}</div>
                {multi ? <textarea value={v} onChange={(e) => set(e.target.value)} className={`field font-mono text-xs mt-1 ${k === "Description" ? "h-72" : "h-20"}`} data-testid={`intel-ticket-${id}`} />
                  : <input value={v} onChange={(e) => set(e.target.value)} className="field text-xs font-mono" data-testid={`intel-ticket-${id}`} />}
                {!multi && <button onClick={() => copy(v, k)} className="text-slate-500 hover:text-cyan-300" data-testid={`intel-ticket-copy-${id}`}><Copy className="h-3.5 w-3.5" /></button>}
              </div>);
          })}
        </div>
        <div className="flex justify-end gap-2 mt-4"><button className="ghost-btn !text-xs" onClick={() => setF(init)} data-testid="intel-ticket-reset">Reset</button>
          <button className="glow-btn !text-xs" onClick={() => copy(all(), "Ticket")} data-testid="intel-ticket-copy-all"><Copy className="h-3.5 w-3.5" />Copy full ticket</button></div>
      </DialogContent>
    </Dialog>
  </>);
}
