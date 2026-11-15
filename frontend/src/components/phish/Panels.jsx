import { createContext, useContext } from "react";
import { Mail, Paperclip, Lock, Wifi, Radar, Flag, Reply, Forward, Pin as PinIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { API } from "../../lib/api";

const osint = (v) => `/app/phishing?tab=osint&value=${encodeURIComponent(v)}`;
export const PinCtx = createContext(null);

export function Pin({ id, text, children, className = "", block }) {
  const ctx = useContext(PinCtx);
  if (!ctx) return children;
  const Tag = block ? "div" : "span";
  const on = ctx.pinned.has(id);
  const go = () => ctx.onPin(id, text);
  return <Tag role="button" tabIndex={0} aria-pressed={on} aria-label={`${on ? "Pinned evidence" : "Pin as evidence"}: ${text.slice(0, 80)}`} onClick={go}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }} className={`pin-target ${on ? "pinned" : ""} ${className}`} data-testid={`pin-${id}`}>
    {children}{on && <PinIcon className="inline h-3 w-3 ml-1 text-yellow-300" />}</Tag>;
}

function LinkReveal({ label, url }) {
  return <span className="relative group inline-block" data-testid="phish-link">
    <span tabIndex={0} className="text-cyan-300 underline underline-offset-2 cursor-help outline-none focus-visible:ring-1 focus-visible:ring-cyan-300">{label}</span>
    <span role="tooltip" className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute left-0 top-full mt-1 z-20 max-w-[80vw] sm:max-w-md break-all bg-black border border-red-500/40 text-red-200 text-[11px] font-mono px-2 py-1 shadow-lg" data-testid="phish-link-real">real URL → {url}</span>
  </span>;
}

function Rich({ text }) {
  return text.split(/(\[[^\]]+\]\([^)]+\))/g).map((p, i) => { const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/); return m ? <LinkReveal key={i} label={m[1]} url={m[2]} /> : <span key={i}>{p}</span>; });
}

function Body({ text, pid }) {
  return <div className="text-sm text-slate-200 leading-relaxed space-y-0.5">{text.split("\n").map((l, i) => l.trim()
    ? <Pin key={i} id={`${pid}b${i}`} text={l.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")} block className="px-1 -mx-1"><Rich text={l} /></Pin> : <div key={i} className="h-2" />)}</div>;
}

const Head = ({ icon: I, title }) => <div className="px-4 py-2 border-b border-white/10 text-[11px] font-mono uppercase text-slate-400 flex items-center gap-2 bg-white/[0.03]"><I className="h-3.5 w-3.5 text-cyan-400" />{title}</div>;

function Email({ p, pid }) {
  const ctx = useContext(PinCtx);
  const rows = [["From", p.from], ["Reply-To", p.reply_to], ["To", p.to], ["Date", p.date]].filter((r) => r[1]);
  return <>
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/10 bg-white/[0.04] text-[11px] font-mono text-slate-400" data-testid="phish-mail-toolbar">
      <Mail className="h-3.5 w-3.5 text-cyan-400 mr-1" /><span className="mr-auto">Inbox</span>
      <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-slate-600" aria-hidden="true"><Reply className="h-3 w-3" />Reply</span>
      <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-slate-600" aria-hidden="true"><Forward className="h-3 w-3" />Forward</span>
      {ctx?.onReport && <button onClick={ctx.onReport} disabled={ctx.reported} className={`inline-flex items-center gap-1 px-2 py-1 border transition-colors ${ctx.reported ? "border-green-500/40 text-green-300" : "border-red-500/40 text-red-300 hover:bg-red-500/10"}`} data-testid={`phish-report-btn-${pid}`}>
        <Flag className="h-3 w-3" />{ctx.reported ? "Reported" : "Report phishing"}</button>}
    </div>
    <div className="p-4 space-y-3">
      <Pin id={`${pid}subj`} text={`Subject: ${p.subject}`} block><div className="font-bold text-base">{p.subject}</div></Pin>
      <div className="flex gap-3"><span className="h-9 w-9 shrink-0 grid place-items-center bg-cyan-500/15 border border-cyan-500/30 font-bold text-cyan-200">{(p.from || "?").replace(/[^A-Za-z]/g, "").charAt(0) || "?"}</span>
        <div className="text-xs font-mono space-y-0.5 min-w-0 flex-1">{rows.map(([k, v]) => <Pin key={k} id={`${pid}${k}`} text={`${k}: ${v}`} block><span className="text-slate-500 w-20 inline-block">{k}:</span><span className={`break-all ${k === "Reply-To" ? "text-yellow-300" : "text-slate-300"}`}>{v}</span></Pin>)}</div></div>
      <div className="border-t border-white/10 pt-3"><Body text={p.body || ""} pid={pid} /></div>
      {p.attachments?.length > 0 && <div className="flex flex-wrap gap-2">{p.attachments.map((a, j) => <Pin key={a} id={`${pid}att${j}`} text={`Attachment: ${a}`}><span className="text-xs font-mono border border-white/15 px-2 py-1 inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{a}</span></Pin>)}</div>}
    </div></>;
}

function Chat({ p, pid }) {
  return <>
    <Head icon={Mail} title={p.title} />
    <div className="p-4 space-y-2">{p.messages.map((m, i) => {
      const mine = /^(user|you)$/i.test(m.from);
      return <div key={i} className={`max-w-[85%] ${mine ? "ml-auto text-right" : ""}`}>
        <div className="text-[10px] font-mono text-slate-500">{m.from} · {m.time}</div>
        <Pin id={`${pid}m${i}`} text={`${m.from} (${m.time}): ${m.text}`} className={`inline-block text-sm px-3 py-2 mt-0.5 text-left ${mine ? "bg-cyan-500/15 border border-cyan-500/30" : "bg-white/5 border border-white/10"}`}><Rich text={m.text} /></Pin></div>;
    })}</div></>;
}

const Code = ({ p, pid }) => <><Head icon={Radar} title={p.title} /><div className="p-4 text-xs font-mono text-green-300/90 max-h-96 overflow-auto" data-testid="phish-code">
  {p.text.split("\n").map((l, i) => <Pin key={i} id={`${pid}l${i}`} text={l} block className="whitespace-pre-wrap break-all px-1 -mx-1">{l || " "}</Pin>)}</div></>;

const Table = ({ p, pid }) => <>{p.title && <Head icon={Radar} title={p.title} />}<div className="overflow-x-auto"><table className="w-full text-xs font-mono"><thead><tr>{p.columns.map((c) => <th key={c} className="text-left px-3 py-2 text-slate-500 border-b border-white/10">{c}</th>)}</tr></thead>
  <tbody>{p.rows.map((r, i) => <tr key={i} className="border-b border-white/5">{r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-300 align-top">{j === 0 ? <Pin id={`${pid}r${i}`} text={r.map(String).join(" · ")}>{String(c)}</Pin> : String(c)}</td>)}</tr>)}</tbody></table></div></>;

const Browser = ({ p, pid }) => <><Head icon={Lock} title={p.title} />
  <div className="p-3"><Pin id={`${pid}url`} text={`URL: ${p.url}`} block className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 text-xs font-mono"><Lock className="h-3 w-3 text-slate-500" /><span className="text-slate-200 break-all">{p.url}</span></Pin>
    {p.cert && <Pin id={`${pid}cert`} text={`Certificate: ${p.cert}`} block className="text-[11px] font-mono text-yellow-300/90 mt-1">certificate: {p.cert}</Pin>}
    <div className="mt-3 bg-white/[0.03] border border-white/10 p-4"><Body text={p.body || ""} pid={pid} /></div></div></>;

const Qr = ({ p, pid }) => <><Head icon={Radar} title={p.title} />
  <div className="p-4 flex flex-wrap items-center gap-4"><Pin id={`${pid}qr`} text={`QR code image: ${p.title}`}><img src={`${API}/phish/qr?data=${encodeURIComponent(p.payload)}`} alt="QR code evidence" className="h-40 w-40 bg-white p-1" data-testid="phish-qr-image" /></Pin>
    <div className="text-xs text-slate-400 space-y-2 max-w-xs"><p>{p.caption}</p><Link to={`/app/phishing?tab=osint&qr=${encodeURIComponent(p.payload)}`} target="_blank" className="ghost-btn !text-xs" data-testid="phish-qr-decode">Decode in OSINT toolkit</Link></div></div></>;

const WifiP = ({ p, pid }) => <><Head icon={Wifi} title={p.title} /><Table pid={pid} p={{ title: "", columns: ["SSID", "BSSID", "Vendor (OUI)", "Security", "Signal", "Ch"], rows: p.networks.map((n) => [n.ssid, n.bssid, n.vendor, n.security, n.signal, n.channel]) }} /></>;

const KINDS = { email: Email, chat: Chat, code: Code, table: Table, browser: Browser, qr: Qr, wifi: WifiP };

export function Panels({ panels }) {
  return <div className="space-y-4" data-testid="phish-evidence">{panels.map((p, i) => { const K = KINDS[p.type] || Code;
    return <div key={i} className="glass border border-white/10" data-testid={`phish-panel-${i}`}><K p={p} pid={`p${i}`} /></div>; })}</div>;
}

export { osint };
