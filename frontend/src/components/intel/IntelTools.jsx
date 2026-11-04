import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Glass, Empty } from "../common";

const TOOLS = {
  "IP & network tracing": [
    ["Shodan", "https://www.shodan.io", "Search engine for internet-exposed devices, open ports and banners."],
    ["Censys", "https://search.censys.io", "Hosts, certificates and services seen across the internet."],
    ["GreyNoise", "https://viz.greynoise.io", "Tells you if an IP is mass-scanning the internet or a benign service."],
    ["AbuseIPDB", "https://www.abuseipdb.com", "Community abuse reports and confidence scores for IPs."],
    ["IPinfo", "https://ipinfo.io", "IP geolocation, ASN, company and privacy (VPN/proxy) detection."],
    ["BGP.tools", "https://bgp.tools", "ASN ownership, prefixes and routing data."],
    ["Nmap", "https://nmap.org", "Open-source network scanner for port and service discovery."],
    ["Wireshark", "https://www.wireshark.org", "Open-source packet capture and protocol analysis."],
  ],
  "Malware, hashes & signatures": [
    ["VirusTotal", "https://www.virustotal.com", "Multi-engine scan results for files, hashes, URLs, domains and IPs."],
    ["MalwareBazaar", "https://bazaar.abuse.ch", "Free malware sample sharing with tags, YARA and signatures."],
    ["Hybrid Analysis", "https://www.hybrid-analysis.com", "Free sandbox detonation reports for files and URLs."],
    ["ANY.RUN", "https://any.run", "Interactive online sandbox to watch malware behaviour live."],
    ["YARA", "https://virustotal.github.io/yara/", "Open-source pattern-matching rules to classify malware."],
    ["CAPA", "https://github.com/mandiant/capa", "Identifies capabilities inside executables (Mandiant, open source)."],
    ["CIRCL hashlookup", "https://hashlookup.circl.lu", "Checks if a hash belongs to known-good software (NSRL)."],
    ["CyberChef", "https://gchq.github.io/CyberChef/", "Decode, deobfuscate and transform data — the analyst's Swiss army knife."],
  ],
  "Domains, URLs & phishing": [
    ["URLscan.io", "https://urlscan.io", "Safely renders a URL and shows requests, redirects and screenshots."],
    ["URLhaus", "https://urlhaus.abuse.ch", "Database of URLs distributing malware."],
    ["PhishTank", "https://phishtank.org", "Community-verified phishing URLs."],
    ["crt.sh", "https://crt.sh", "Certificate Transparency search to find subdomains and new certs."],
    ["DNSDumpster", "https://dnsdumpster.com", "DNS recon and host mapping for a domain."],
    ["SecurityTrails", "https://securitytrails.com", "Historical DNS and WHOIS records."],
    ["MXToolbox", "https://mxtoolbox.com", "Email headers, SPF/DKIM/DMARC and blacklist checks."],
    ["Google Safe Browsing", "https://transparencyreport.google.com/safe-browsing/search", "Checks if Google flags a site as unsafe."],
  ],
  "Proxy, VPN & anonymity": [
    ["Tor exit list", "https://check.torproject.org/torbulkexitlist", "Official live list of Tor exit node IPs."],
    ["Spur", "https://spur.us/context", "Identifies VPN, residential proxy and anonymiser infrastructure."],
    ["IPQualityScore", "https://www.ipqualityscore.com/free-ip-lookup-proxy-vpn-test", "Free proxy/VPN/fraud score lookup."],
    ["proxycheck.io", "https://proxycheck.io", "Proxy and VPN detection API with free tier."],
    ["ip-api", "https://ip-api.com", "Free IP geolocation with proxy/hosting flags."],
  ],
  "Threat intel platforms (open source)": [
    ["MISP", "https://www.misp-project.org", "Open-source threat sharing platform for IOCs and events."],
    ["OpenCTI", "https://github.com/OpenCTI-Platform/opencti", "Open-source CTI platform built on STIX 2.1 with graph analysis."],
    ["AlienVault OTX", "https://otx.alienvault.com", "Free community threat pulses and IOC feeds."],
    ["ThreatFox", "https://threatfox.abuse.ch", "Free IOC sharing for malware C2s and payloads."],
    ["MITRE ATT&CK Navigator", "https://mitre-attack.github.io/attack-navigator/", "Map detections and threats to ATT&CK techniques."],
    ["Yeti", "https://yeti-platform.io", "Open-source platform to organise observables, TTPs and intel."],
    ["TheHive + Cortex", "https://strangebee.com/thehive/", "Case management with automated observable analysers."],
  ],
  "Detection & response (open source)": [
    ["Wazuh", "https://wazuh.com", "Open-source SIEM/XDR: log analysis, FIM and vulnerability detection."],
    ["Security Onion", "https://securityonionsolutions.com", "Free platform for threat hunting, NSM and log management."],
    ["Zeek", "https://zeek.org", "Network security monitor that turns traffic into rich logs."],
    ["Suricata", "https://suricata.io", "Open-source IDS/IPS and network threat detection engine."],
    ["Sigma", "https://github.com/SigmaHQ/sigma", "Generic detection rule format convertible to any SIEM."],
    ["Velociraptor", "https://docs.velociraptor.app", "Open-source endpoint visibility and DFIR collection."],
    ["Sysmon", "https://learn.microsoft.com/sysinternals/downloads/sysmon", "Detailed Windows process, network and file telemetry."],
  ],
};

export default function IntelTools() {
  const [q, setQ] = useState("");
  return (
    <div data-testid="intel-tools">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tools" className="field !w-64 mb-6 text-sm" data-testid="intel-tools-search" />
      {Object.entries(TOOLS).map(([cat, list]) => {
        const rows = list.filter(([n, , d]) => !q || `${n} ${d}`.toLowerCase().includes(q.toLowerCase()));
        return rows.length ? (
          <div key={cat} className="mb-8"><h3 className="text-sm font-mono uppercase text-cyan-300 mb-3">{cat}</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{rows.map(([n, u, d]) => (
              <a key={n} href={u} target="_blank" rel="noopener noreferrer" className="group" data-testid={`intel-tool-${n.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <Glass className="p-4 h-full transition-colors group-hover:border-cyan-500/40"><div className="flex items-center gap-2 font-bold text-sm group-hover:text-cyan-300">{n}<ExternalLink className="h-3 w-3 text-slate-500 ml-auto" /></div>
                  <p className="text-xs text-slate-400 mt-1.5">{d}</p></Glass></a>))}</div></div>) : null;
      })}
      {!Object.values(TOOLS).flat().some(([n, , d]) => `${n} ${d}`.toLowerCase().includes(q.toLowerCase())) && <Empty text="no tools match your filter" />}
    </div>);
}
