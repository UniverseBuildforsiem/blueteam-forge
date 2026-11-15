import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { FileSearch, Link2, Copy as CopyI, QrCode, Radar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, API } from "../../lib/api";
import { Glass } from "../common";

const Box = ({ icon: I, title, sub, children, testId }) => (
  <Glass className="p-5 space-y-3" data-testid={testId}><div><div className="font-bold flex items-center gap-2"><I className="h-4 w-4 text-cyan-400" />{title}</div><p className="text-xs text-slate-400 mt-0.5">{sub}</p></div>{children}</Glass>);
const Run = ({ busy, onClick, label, testId, disabled }) => <button className="glow-btn !text-xs" disabled={busy || disabled} onClick={onClick} data-testid={testId}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{label}</button>;
const Chip = ({ v, onLookup }) => <button onClick={() => onLookup(v)} className="text-[11px] font-mono border border-cyan-500/30 text-cyan-200 px-1.5 py-0.5 hover:bg-cyan-500/10 break-all text-left" title="Check reputation">{v}</button>;

function useTool(path) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const run = async (body) => { setBusy(true); try { setOut((await api.post(path, body)).data); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  return [busy, out, run];
}

function Headers({ onLookup }) {
  const [raw, setRaw] = useState("");
  const [busy, out, run] = useTool("/phish/osint/headers");
  return <Box icon={FileSearch} title="Email header analyzer" sub="Paste raw headers: hop path, SPF/DKIM/DMARC, sender mismatches and IOCs." testId="osint-headers">
    <textarea className="field h-32 font-mono !text-xs" placeholder="Received: from ... &#10;Authentication-Results: ..." value={raw} onChange={(e) => setRaw(e.target.value)} data-testid="osint-headers-input" />
    <Run busy={busy} onClick={() => run({ raw })} disabled={raw.length < 10} label="Analyze headers" testId="osint-headers-run" />
    {out && <div className="space-y-3 text-xs font-mono" data-testid="osint-headers-result">
      <div className="flex gap-2">{Object.entries(out.auth).map(([k, v]) => <span key={k} className={`px-2 py-0.5 border ${v === "pass" ? "border-green-500/40 text-green-300" : "border-red-500/40 text-red-300"}`}>{k.toUpperCase()}: {v || "none"}</span>)}</div>
      {out.warnings.length > 0 && <ul className="space-y-1 text-yellow-300">{out.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
      <div><div className="text-slate-500 mb-1">Hop path (oldest first)</div>{out.hops.map((h, i) => <div key={i} className="text-slate-300">{i + 1}. {h.from || "?"} → {h.by || "?"} {h.ip && <Chip v={h.ip} onLookup={onLookup} />} <span className="text-slate-500">{h.time}</span></div>)}</div>
      <div className="flex flex-wrap gap-1.5">{[...out.iocs.ips, ...out.iocs.domains, ...out.iocs.urls].map((v) => <Chip key={v} v={v} onLookup={onLookup} />)}</div>
    </div>}
  </Box>;
}

function Expand({ init, onLookup }) {
  const [url, setUrl] = useState(init || "");
  const [busy, out, run] = useTool("/phish/osint/expand");
  useEffect(() => { if (init) { setUrl(init); run({ url: init }); } }, [init]); // eslint-disable-line
  return <Box icon={Link2} title="URL unshortener & redirect tracer" sub="Follows redirects safely (no page content loaded) and decodes URLs hidden in parameters." testId="osint-expand">
    <div className="flex gap-2"><input className="field font-mono !text-xs" placeholder="https://bit.ly/..." value={url} onChange={(e) => setUrl(e.target.value)} data-testid="osint-expand-input" />
      <Run busy={busy} onClick={() => run({ url })} disabled={url.length < 4} label="Trace" testId="osint-expand-run" /></div>
    {out && <div className="space-y-1.5 text-xs font-mono" data-testid="osint-expand-result">{out.chain.map((h, i) => <div key={i} className="border-l-2 border-cyan-500/40 pl-2">
      <div className="text-slate-300 break-all">{i + 1}. {h.url}</div>
      <div className="text-slate-500">{h.error ? <span className="text-red-300">{h.error}</span> : `HTTP ${h.status} · ${h.ips?.join(", ")} · ${h.server || ""}`}</div>
      {h.embedded?.map((e) => <div key={e} className="text-yellow-300 break-all">hidden URL in parameter: <Chip v={e} onLookup={onLookup} /></div>)}</div>)}
      <div className="pt-1">Final host: <Chip v={out.final_host} onLookup={onLookup} /></div></div>}
  </Box>;
}

function Lookalike({ onLookup }) {
  const [d, setD] = useState("");
  const [busy, out, run] = useTool("/phish/osint/lookalike");
  return <Box icon={CopyI} title="Lookalike-domain finder" sub="Generates typo, homoglyph, hyphen and TLD variants of a brand domain and checks which are registered." testId="osint-lookalike">
    <div className="flex gap-2"><input className="field font-mono !text-xs" placeholder="acme-corp.in" value={d} onChange={(e) => setD(e.target.value)} data-testid="osint-lookalike-input" />
      <Run busy={busy} onClick={() => run({ domain: d })} disabled={d.length < 3} label="Find lookalikes" testId="osint-lookalike-run" /></div>
    {out && <div className="text-xs font-mono space-y-2" data-testid="osint-lookalike-result">
      <div className="text-slate-400">{out.checked} variants checked · <b className="text-red-300">{out.registered.length} registered</b>{out.idn_ascii && ` · punycode: ${out.idn_ascii}`}{out.idn_unicode && ` · unicode: ${out.idn_unicode}`}</div>
      <div className="grid sm:grid-cols-2 gap-1 max-h-60 overflow-y-auto">{out.registered.map((r) => <div key={r.domain} className="flex items-center gap-2"><Chip v={r.domain} onLookup={onLookup} /><span className="text-slate-500">{r.ips.join(", ")}</span></div>)}</div></div>}
  </Box>;
}

function QrTool({ init, onExpand }) {
  const [txt, setTxt] = useState(null);
  const [img, setImg] = useState(null);
  const canvas = useRef(null);
  const decode = (src) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => { const c = canvas.current; c.width = im.width; c.height = im.height; const x = c.getContext("2d"); x.drawImage(im, 0, 0);
    const r = jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height); setTxt(r ? r.data : ""); if (!r) toast.error("No QR code found in that image"); }; im.src = src; setImg(src); };
  useEffect(() => { if (init) decode(`${API}/phish/qr?data=${encodeURIComponent(init)}`); }, [init]);
  const file = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => decode(rd.result); rd.readAsDataURL(f); };
  return <Box icon={QrCode} title="QR code decoder" sub="Decode a QR image safely here instead of scanning it with a phone." testId="osint-qr">
    <input type="file" accept="image/*" onChange={file} className="text-xs" data-testid="osint-qr-upload" />
    <canvas ref={canvas} className="hidden" />
    {img && <img src={img} alt="QR to decode" className="h-28 w-28 bg-white p-1" />}
    {txt && <div className="text-xs font-mono space-y-2" data-testid="osint-qr-result"><div className="text-slate-500">Decoded content:</div><div className="text-yellow-300 break-all">{txt}</div>
      {/^https?:/i.test(txt) && <button className="ghost-btn !text-xs" onClick={() => onExpand(txt)} data-testid="osint-qr-trace">Trace this URL</button>}</div>}
  </Box>;
}

function Reputation({ value, setValue }) {
  const [busy, out, run] = useTool("/intel/lookup");
  useEffect(() => { if (value) run({ ioc: value }); }, [value]); // eslint-disable-line
  const [v, setV] = useState(value || "");
  useEffect(() => setV(value || ""), [value]);
  const tone = { malicious: "text-red-400", suspicious: "text-yellow-300", clean: "text-green-400" }[out?.verdict] || "text-slate-300";
  return <Box icon={Radar} title="Reputation lookup (IP, domain, URL, hash)" sub="Live VirusTotal, AbuseIPDB, WHOIS, DNS, certificates and blocklists — uses your Threat Intel quota." testId="osint-reputation">
    <div className="flex gap-2"><input className="field font-mono !text-xs" placeholder="185.234.219.12 or evil-domain.com" value={v} onChange={(e) => setV(e.target.value)} data-testid="osint-reputation-input" />
      <Run busy={busy} onClick={() => (v === value ? run({ ioc: v }) : setValue(v))} disabled={!v.trim()} label="Look up" testId="osint-reputation-run" /></div>
    {out && <div className="text-xs font-mono space-y-1" data-testid="osint-reputation-result"><div>Verdict: <b className={`uppercase ${tone}`}>{out.verdict}</b> · score {out.score}/100 · {out.type}</div>
      <ul className="text-slate-400 space-y-0.5">{out.reasons.slice(0, 8).map((r) => <li key={r}>• {r}</li>)}</ul></div>}
  </Box>;
}

export function OsintToolkit({ initValue, initQr }) {
  const [rep, setRep] = useState(initValue && !/^https?:/i.test(initValue) ? initValue : "");
  const [trace, setTrace] = useState(initValue && /^https?:/i.test(initValue) ? initValue : "");
  const look = (v) => { setRep(v); document.querySelector("[data-testid=osint-reputation]")?.scrollIntoView({ behavior: "smooth" }); };
  return <div className="grid lg:grid-cols-2 gap-4" data-testid="osint-toolkit">
    <Reputation value={rep} setValue={setRep} />
    <Expand init={trace} onLookup={look} />
    <Headers onLookup={look} />
    <QrTool init={initQr} onExpand={setTrace} />
    <div className="lg:col-span-2"><Lookalike onLookup={look} /></div>
  </div>;
}
