import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, Route, GitCompare, FlaskConical, Bomb, Radar, AlertTriangle } from "lucide-react";
import { api, errMsg } from "../../../lib/api";
import { Glass } from "../../common";
import { Pin } from "../Panels";

const TONE = { pass: "border-green-500/50 text-green-300 bg-green-500/5", fail: "border-red-500/50 text-red-300 bg-red-500/5", softfail: "border-yellow-400/50 text-yellow-200 bg-yellow-500/5", none: "border-slate-500/50 text-slate-300" };
const WHY = {
  spf: { pass: "Sending server is listed in the envelope domain's SPF record. Check which domain that is.", fail: "Sending server is NOT authorised by the domain's SPF record.", softfail: "Domain says this server is probably not authorised (~all).", none: "No SPF result. The sender can't be verified." },
  dkim: { pass: "Signature verified. Check the d= domain: it may not be the brand's.", fail: "Signature broken: the message was altered or forged.", none: "The message wasn't DKIM-signed." },
  dmarc: { pass: "From domain aligns with a passing SPF or DKIM.", fail: "From domain fails alignment, a strong spoofing signal.", none: "From domain publishes no DMARC policy, so spoofing isn't blocked." },
};
const domOf = (v) => { const m = (v || "").match(/@([\w.-]+)/g); return m ? m[m.length - 1].slice(1).replace(/>$/, "").toLowerCase() : ""; };
const aligned = (a, b) => !a || !b || a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

export function Lookalike({ d }) {
  const out = [];
  for (let i = 0; i < d.length; i++) {
    const two = d.slice(i, i + 2), label = d.slice(d.lastIndexOf(".", i) + 1).split(".")[0];
    if (two === "rn" || two === "vv") { out.push(<mark key={i} title={`'${two}' can pass for '${two === "rn" ? "m" : "w"}'`} className="bg-red-500/30 text-red-100 px-px">{two}</mark>); i++; continue; }
    const ch = d[i], susp = d.charCodeAt(i) > 127 || (/[01345]/.test(ch) && /[a-z]/i.test(label));
    out.push(susp ? <mark key={i} title="Possible lookalike character" className="bg-red-500/30 text-red-100 px-px" data-testid="lookalike-char">{ch}</mark> : <span key={i}>{ch}</span>);
  }
  return <span className="font-mono break-all">{out}</span>;
}

function AuthChips({ h }) {
  return <div className="grid sm:grid-cols-3 gap-2" data-testid={`auth-chips-${h.panel}`}>{["spf", "dkim", "dmarc"].map((k) => { const v = (h.auth[k] || "none").toLowerCase(), tone = TONE[v] || TONE.softfail;
    return <Pin key={k} id={`h${h.panel}${k}`} text={`${k.toUpperCase()}=${v}`} block className={`border px-3 py-2 ${tone}`}>
      <div className="font-mono text-xs font-bold" data-testid={`auth-${k}`}>{k.toUpperCase()} · {v}</div><div className="text-[11px] text-slate-300 mt-1">{(WHY[k][v] || "Neutral or temporary result. Treat it as unverified.")}</div></Pin>; })}</div>;
}

function Hops({ h }) {
  if (!h.hops.length) return null;
  return <div data-testid={`hops-${h.panel}`}><div className="text-[11px] font-mono uppercase text-slate-500 mb-2 flex items-center gap-1.5"><Route className="h-3.5 w-3.5" />Received hops (oldest first)</div>
    <ol className="relative border-l border-cyan-500/30 ml-2 space-y-3">{h.hops.map((x, i) => <li key={i} className="pl-4 relative"><span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
      <Pin id={`h${h.panel}hop${i}`} text={`Hop ${i + 1}: ${x.from} → ${x.by} [${x.ip || "?"}]`} block className="text-xs font-mono">
        <div className="text-slate-200">{x.from || "?"} <span className="text-slate-500">→</span> {x.by || "?"}</div>
        <div className="text-slate-500">{x.ip && <span className="text-cyan-300 mr-2">{x.ip}</span>}{x.time}</div></Pin></li>)}</ol></div>;
}

export function DomainCompare({ addrs, id }) {
  const rows = ["From", "Return-Path", "Reply-To", "Message-ID"].map((k) => [k, addrs[k], domOf(addrs[k])]);
  const base = rows[0][2];
  return <div data-testid={`domain-compare-${id}`}><div className="text-[11px] font-mono uppercase text-slate-500 mb-2 flex items-center gap-1.5"><GitCompare className="h-3.5 w-3.5" />Sender domains side by side</div>
    <div className="grid sm:grid-cols-4 gap-2">{rows.map(([k, v, d]) => { const bad = d && !aligned(d, base);
      return <Pin key={k} id={`${id}${k}`} text={`${k} domain: ${d || "none"}`} block className={`border px-3 py-2 ${bad ? "border-red-500/50 bg-red-500/5" : "border-white/10"}`}>
        <div className="text-[10px] font-mono uppercase text-slate-500">{k}</div><div className="text-xs mt-0.5">{d ? <Lookalike d={d} /> : <span className="text-slate-600">—</span>}</div>
        {bad && <div className="text-[10px] font-mono text-red-300 mt-1 flex items-center gap-1" data-testid="domain-mismatch"><AlertTriangle className="h-3 w-3" />mismatch</div>}</Pin>; })}</div></div>;
}

export function HeaderAnalysis({ c }) {
  const emails = c.panels.map((p, i) => [p, i]).filter(([p]) => p.type === "email");
  if (!c.headers.length && !emails.length) return <Glass className="p-4 text-xs text-slate-400" data-testid="header-analysis-none">No email headers in this case. Focus on the logs, messages and URLs in the evidence.</Glass>;
  return <Glass className="p-4 space-y-5" data-testid="header-analysis">
    <div className="font-bold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-400" />Header analysis</div>
    {c.headers.map((h) => <div key={h.panel} className="space-y-4"><AuthChips h={h} /><DomainCompare addrs={h.addresses} id={`h${h.panel}`} /><Hops h={h} />
      {h.warnings.length > 0 && <ul className="text-[11px] font-mono text-yellow-300 space-y-0.5">{h.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}</div>)}
    {!c.headers.length && emails.map(([p, i]) => <DomainCompare key={i} id={`e${i}`} addrs={{ From: p.from, "Reply-To": p.reply_to }} />)}
  </Glass>;
}

function Detonation({ runId, art, onDone }) {
  const [st, setSt] = useState(null);
  const go = async () => {
    setSt({ busy: true });
    try {
      const [r] = await Promise.all([api.post(`/phish/runs/${runId}/detonate`, { artifact: art }), new Promise((ok) => setTimeout(ok, 1800))]);
      setSt({ res: r.data }); onDone?.();
    } catch (e) { toast.error(errMsg(e)); setSt(null); }
  };
  const r = st?.res, tone = r?.verdict === "malicious" ? "border-red-500/50 text-red-300" : "border-green-500/50 text-green-300";
  return <li className="border border-white/10 p-3 space-y-2" data-testid="sandbox-item">
    <div className="flex items-center gap-3"><span className="flex-1 min-w-0 text-xs font-mono break-all text-slate-200">{art}</span>
      <button className="ghost-btn !text-xs !py-1 shrink-0" disabled={!!st} onClick={go} data-testid="sandbox-detonate"><Bomb className="h-3.5 w-3.5" />{st?.busy ? "Detonating…" : r ? "Done" : "Detonate"}</button></div>
    {st?.busy && <div className="h-1 bg-white/5 overflow-hidden" role="progressbar" aria-label="Detonating in sandbox"><div className="detonate-bar h-full bg-gradient-to-r from-cyan-400 to-red-400" /></div>}
    {r && <div className="text-xs space-y-1.5" data-testid="sandbox-result"><div className="flex items-center gap-2"><span className={`font-mono border px-1.5 py-0.5 uppercase ${tone}`} data-testid="sandbox-verdict">{r.verdict}</span><span className="font-mono text-slate-400">risk {r.score}/100</span></div>
      <ul className="text-slate-300 space-y-0.5">{r.behaviours.map((b) => <li key={b}>• {b}</li>)}</ul>{r.network.length > 0 && <div className="font-mono text-[11px] text-slate-500">network: {r.network.join(", ")}</div>}</div>}
  </li>;
}

export function Sandbox({ c, runId }) {
  return <Glass className="p-4 space-y-3" data-testid="sandbox-panel">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-bold flex items-center gap-2"><FlaskConical className="h-4 w-4 text-cyan-400" />URL & attachment sandbox</div><span className="text-[10px] font-mono uppercase border border-yellow-400/40 text-yellow-200 px-1.5 py-0.5">simulated · no real network calls</span></div>
    {!c.artifacts.length ? <p className="text-xs text-slate-500">No URLs or attachments in this case.</p> : <ul className="space-y-2">{c.artifacts.map((a) => <Detonation key={a} art={a} runId={runId} />)}</ul>}
  </Glass>;
}

export function IocBox({ value, onChange, count, disabled }) {
  return <Glass className="p-4 space-y-2" data-testid="ioc-box">
    <div className="eyebrow">indicators of compromise ({count} expected)</div>
    <textarea className="field h-24 font-mono !text-xs" disabled={disabled} placeholder="One per line: domains, URLs, IPs, emails, phone numbers" value={value} onChange={(e) => onChange(e.target.value)} data-testid="phish-iocs" />
    <Link to="/app/phishing?tab=osint" target="_blank" className="text-[11px] font-mono text-cyan-300 hover:underline inline-flex items-center gap-1" data-testid="phish-open-osint"><Radar className="h-3 w-3" />Open the OSINT toolkit in a new tab →</Link>
  </Glass>;
}
