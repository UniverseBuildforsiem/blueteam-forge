import { ShieldAlert, ShieldCheck, ShieldQuestion, AlertTriangle, Download, ExternalLink } from "lucide-react";
import { Glass } from "../common";
import IntelTicket from "./IntelTicket";

export const VERDICT = {
  malicious: { label: "Malicious", cls: "text-red-300 border-red-500/40 bg-red-500/10", Icon: ShieldAlert, bar: "bg-red-500" },
  suspicious: { label: "Suspicious", cls: "text-amber-300 border-amber-500/40 bg-amber-500/10", Icon: AlertTriangle, bar: "bg-amber-400" },
  clean: { label: "No threats found", cls: "text-green-300 border-green-500/40 bg-green-500/10", Icon: ShieldCheck, bar: "bg-green-500" },
  unknown: { label: "Not enough data", cls: "text-slate-300 border-white/15 bg-white/5", Icon: ShieldQuestion, bar: "bg-slate-500" },
  invalid: { label: "Invalid", cls: "text-slate-400 border-white/10 bg-white/5", Icon: ShieldQuestion, bar: "bg-slate-600" },
};
const TITLES = { geo: "IP location & network", open_ports: "Open ports & CVEs (Shodan InternetDB)", blocklists: "Threat blocklists", abuseipdb: "AbuseIPDB reputation",
  virustotal: "VirusTotal", whois: "WHOIS / RDAP", dns: "DNS records", certificates: "SSL certificates (crt.sh)", known_good: "Known-good file check (CIRCL)" };
const ORDER = ["virustotal", "abuseipdb", "blocklists", "geo", "open_ports", "known_good", "whois", "dns", "certificates"];
const ts = (v) => (typeof v === "number" ? new Date(v * 1000).toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : "—");

export const VerdictChip = ({ v, testId }) => { const c = VERDICT[v] || VERDICT.unknown; return <span data-testid={testId} className={`inline-flex items-center gap-1 text-[11px] font-mono uppercase border px-2 py-0.5 ${c.cls}`}><c.Icon className="h-3 w-3" />{c.label}</span>; };

const KV = ({ rows }) => (
  <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-xs">{rows.filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => (
    <div key={k} className="contents"><dt className="text-slate-500 font-mono truncate" title={k}>{k}</dt><dd className="text-slate-200 break-all">{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}</dd></div>))}</dl>);
const Flag = ({ on, label }) => <span className={`text-[11px] font-mono border px-2 py-0.5 ${on ? "border-red-500/40 text-red-300 bg-red-500/10" : "border-white/10 text-slate-500"}`}>{label}: {on ? "YES" : "no"}</span>;

function Body({ k, d, type }) {
  if (k === "geo") return (<><div className="flex flex-wrap gap-2 mb-3"><Flag on={d.proxy} label="Proxy/VPN" /><Flag on={d.hosting} label="Hosting" /><Flag on={d.mobile} label="Mobile" /></div>
    <KV rows={[["Location", [d.city, d.regionName, d.country].filter(Boolean).join(", ")], ["ISP", d.isp], ["Organisation", d.org], ["ASN", d.as], ["Reverse DNS", d.reverse], ["Timezone", d.timezone], ["Coordinates", d.lat ? `${d.lat}, ${d.lon}` : null]]} /></>);
  if (k === "open_ports") return <KV rows={[["Open ports", d.ports?.length ? d.ports : "none seen"], ["CVEs", d.vulns?.slice(0, 12)], ["Tags", d.tags], ["Hostnames", d.hostnames?.slice(0, 6)], ["Software", d.cpes?.slice(0, 6)]]} />;
  if (k === "blocklists") return "phishing_army" in d
    ? <div className="flex flex-wrap gap-2"><Flag on={!!d.phishing_army} label="Phishing Army blocklist" /></div>
    : <div className="flex flex-wrap gap-2"><Flag on={d.tor_exit} label="Tor exit node" /><Flag on={d.feodo_c2} label="Feodo botnet C2" /><Flag on={!!d.spamhaus_drop} label="Spamhaus DROP" /></div>;
  if (k === "abuseipdb") return (<><div className="flex items-baseline gap-2 mb-2"><span className={`text-3xl font-bold font-mono ${d.abuseConfidenceScore >= 75 ? "text-red-400" : d.abuseConfidenceScore >= 25 ? "text-amber-300" : "text-green-400"}`}>{d.abuseConfidenceScore}%</span><span className="text-xs text-slate-500">abuse confidence</span></div>
    <KV rows={[["Reports", `${d.totalReports} from ${d.numDistinctUsers} users`], ["Last reported", ts(d.lastReportedAt)], ["Usage type", d.usageType], ["ISP", d.isp], ["Domain", d.domain], ["Tor", d.isTor], ["Whitelisted", d.isWhitelisted]]} /></>);
  if (k === "virustotal") {
    const total = d.malicious + d.suspicious + d.harmless + d.undetected;
    return (<>
      <div className="flex items-baseline gap-2 mb-3"><span className={`text-3xl font-bold font-mono ${d.malicious ? "text-red-400" : d.suspicious ? "text-amber-300" : "text-green-400"}`}>{d.malicious}/{total || 0}</span><span className="text-xs text-slate-500">engines flag malicious · {d.suspicious} suspicious</span></div>
      <KV rows={[["Threat label", d.threat_label], ["Families", d.families], ["File type", d.type], ["File names", d.names], ["Size", d.size ? `${d.size} bytes` : null], ["SHA-256", d.sha256], ["MD5", d.md5], ["First seen", d.first_seen && ts(d.first_seen)],
        ["Signature", d.signature && Object.keys(d.signature).length ? Object.entries(d.signature).map(([a, b]) => `${a}: ${b}`).join(" · ") : type === "hash" ? "not signed / no signature info" : null],
        ["Owner", d.as_owner], ["Network", d.network], ["Registrar", d.registrar], ["Categories", d.categories], ["Final URL", d.final_url], ["Page title", d.title], ["Reputation", d.reputation], ["Tags", d.tags], ["Last analysis", d.last_analysis && ts(d.last_analysis)]]} />
      {d.yara?.length > 0 && <div className="mt-3"><div className="text-[11px] font-mono uppercase text-cyan-300 mb-1">YARA matches</div>{d.yara.map((y, i) => <div key={i} className="text-xs font-mono text-slate-300">{y.rule} <span className="text-slate-500">· {y.author || y.source}</span></div>)}</div>}
      {d.sandbox_verdicts?.length > 0 && <div className="mt-3"><div className="text-[11px] font-mono uppercase text-cyan-300 mb-1">Sandbox verdicts</div>{d.sandbox_verdicts.map((s, i) => <div key={i} className="text-xs font-mono text-slate-300">{s.sandbox}: {s.category} {s.names?.join(", ")}</div>)}</div>}
      {d.engines?.length > 0 && <div className="mt-3"><div className="text-[11px] font-mono uppercase text-cyan-300 mb-1">Detections</div><div className="grid sm:grid-cols-2 gap-x-4">{d.engines.map((e) => <div key={e.engine} className="text-xs font-mono"><span className="text-slate-400">{e.engine}</span> <span className="text-red-300">{e.result}</span></div>)}</div></div>}
    </>);
  }
  if (k === "whois") return <KV rows={[["Name", d.name], ["Registered", ts(d.registered)], ["Expires", ts(d.expires)], ["Updated", ts(d.updated)], ["Range", d.range], ["Country", d.country], ["Status", d.status?.slice(0, 4)], ["Nameservers", d.nameservers], ...(d.entities || []).map((e) => [e.roles?.join("/") || "entity", e.name])]} />;
  if (k === "dns") return <KV rows={Object.entries(d).map(([t, v]) => [t, v.length ? v : "—"])} />;
  if (k === "certificates") return (<><KV rows={[["Certificates", d.certificates], ["First cert", ts(d.first_seen)], ["Subdomains", d.subdomain_count]]} />
    {d.subdomains?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{d.subdomains.slice(0, 24).map((s) => <code key={s} className="text-[10px] bg-black/40 border border-white/10 px-1.5 py-0.5 text-slate-300">{s}</code>)}</div>}</>);
  if (k === "known_good") return <KV rows={[["Known good", "yes, matches a trusted software library"], ["File name", d.file_name], ["Size", d.file_size], ["Source", d.source], ["Product", d.product], ["Trust", d.trust]]} />;
  return <pre className="text-xs">{JSON.stringify(d, null, 2)}</pre>;
}

function SourceCard({ k, s, type }) {
  const msg = { guest: "Create a free account to add VirusTotal and AbuseIPDB results.", no_key: "Not connected yet — admin can add a free API key to enable this source.", not_found: "No record found for this indicator.", skipped: s.error, error: `Source unavailable: ${s.error}` }[s.status];
  return (
    <Glass className="p-4" data-testid={`intel-source-${k}`}>
      <div className="flex items-center gap-2 mb-3"><h4 className="text-sm font-bold">{TITLES[k] || k}</h4>{s.cached && <span className="text-[10px] font-mono text-slate-500">cached</span>}
        <span className={`ml-auto text-[10px] font-mono uppercase ${s.status === "ok" ? "text-green-400" : "text-slate-500"}`}>{s.status.replace("_", " ")}</span></div>
      {s.status === "ok" ? <Body k={k} d={s.data} type={type} /> : <div className="text-xs text-slate-500">{msg}</div>}
    </Glass>);
}

export function reportText(r) {
  const lines = [`THREAT INTEL REPORT — SOCProfessionals Academy`, `Indicator: ${r.ioc} (${r.type})`, `Checked: ${r.at}`, `Verdict: ${(VERDICT[r.verdict] || {}).label} — risk score ${r.score}/100`, "", "Findings:", ...(r.reasons.length ? r.reasons.map((x) => `- ${x}`) : ["- No negative findings"]), ""];
  Object.entries(r.sources || {}).forEach(([k, s]) => { lines.push(`## ${TITLES[k] || k} [${s.status}]`); if (s.status === "ok") lines.push(JSON.stringify(s.data, null, 2)); else if (s.error) lines.push(s.error); lines.push(""); });
  return lines.join("\n");
}
export const download = (name, text, type = "text/plain") => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };

export default function IntelReport({ r }) {
  const c = VERDICT[r.verdict] || VERDICT.unknown;
  const keys = ORDER.filter((k) => r.sources?.[k]);
  const ext = { ip: `https://www.virustotal.com/gui/ip-address/${r.ioc}`, domain: `https://www.virustotal.com/gui/domain/${r.ioc}`, hash: `https://www.virustotal.com/gui/file/${r.ioc}`, url: `https://www.virustotal.com/gui/search/${encodeURIComponent(r.ioc)}` }[r.type];
  return (
    <div className="space-y-4" data-testid="intel-report">
      <Glass className={`p-5 border ${c.cls.split(" ").filter((x) => x.startsWith("border")).join(" ")}`}>
        <div className="flex flex-wrap items-center gap-4">
          <c.Icon className={`h-10 w-10 ${c.cls.split(" ")[0]}`} />
          <div className="flex-1 min-w-0"><div className="text-[11px] font-mono uppercase text-slate-500">{r.type} indicator</div>
            <div className="font-mono text-lg break-all" data-testid="intel-report-ioc">{r.ioc}</div></div>
          <div className="text-right"><VerdictChip v={r.verdict} testId="intel-report-verdict" />
            <div className="mt-2 w-40 h-1.5 bg-white/10 rounded-full overflow-hidden ml-auto"><div className={`h-full ${c.bar}`} style={{ width: `${Math.max(4, r.score)}%` }} /></div>
            <div className="text-[11px] font-mono text-slate-500 mt-1" data-testid="intel-report-score">risk score {r.score}/100</div></div>
        </div>
        <ul className="mt-4 space-y-1" data-testid="intel-report-reasons">{r.reasons.length ? r.reasons.map((x) => <li key={x} className="text-sm text-slate-300 flex gap-2"><span className="text-cyan-400">›</span>{x}</li>)
          : <li className="text-sm text-slate-400">No source reported this indicator as bad. Absence of evidence is not proof it is safe — check context in your logs.</li>}</ul>
        <div className="flex flex-wrap gap-2 mt-4">
          <button className="ghost-btn !text-xs" onClick={() => download(`intel-${r.ioc.replace(/[^a-z0-9.]/gi, "_").slice(0, 60)}.txt`, reportText(r))} data-testid="intel-report-download"><Download className="h-3.5 w-3.5" />Download report</button>
          {r.type && <IntelTicket r={r} />}
          {ext && <a className="ghost-btn !text-xs" href={ext} target="_blank" rel="noreferrer" data-testid="intel-report-vt-link"><ExternalLink className="h-3.5 w-3.5" />Open on VirusTotal</a>}
        </div>
      </Glass>
      <div className="grid lg:grid-cols-2 gap-4">{keys.map((k) => <SourceCard key={k} k={k} s={r.sources[k]} type={r.type} />)}</div>
    </div>);
}
