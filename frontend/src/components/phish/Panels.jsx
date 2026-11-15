import { Mail, Paperclip, Lock, Wifi, Radar } from "lucide-react";
import { Link } from "react-router-dom";
import { API } from "../../lib/api";

const osint = (v) => `/app/phishing?tab=osint&value=${encodeURIComponent(v)}`;

function Body({ text }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return <div className="whitespace-pre-line text-sm text-slate-200 leading-relaxed">{parts.map((p, i) => {
    const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return m ? <span key={i} title={m[2]} className="text-cyan-300 underline underline-offset-2 cursor-help" data-testid="phish-link">{m[1]}<span className="ml-1 text-[10px] font-mono text-red-300 no-underline">→ {m[2]}</span></span> : <span key={i}>{p}</span>;
  })}</div>;
}

const Head = ({ icon: I, title }) => <div className="px-4 py-2 border-b border-white/10 text-[11px] font-mono uppercase text-slate-400 flex items-center gap-2 bg-white/[0.03]"><I className="h-3.5 w-3.5 text-cyan-400" />{title}</div>;

function Email({ p }) {
  const rows = [["From", p.from], ["Reply-To", p.reply_to], ["To", p.to], ["Date", p.date]].filter((r) => r[1]);
  return <>
    <Head icon={Mail} title="Email" />
    <div className="p-4 space-y-3">
      <div className="font-bold text-base">{p.subject}</div>
      <div className="text-xs font-mono space-y-0.5">{rows.map(([k, v]) => <div key={k}><span className="text-slate-500 w-20 inline-block">{k}:</span><span className={k === "Reply-To" ? "text-yellow-300" : "text-slate-300"}>{v}</span></div>)}</div>
      <div className="border-t border-white/10 pt-3"><Body text={p.body || ""} /></div>
      {p.attachments?.length > 0 && <div className="flex flex-wrap gap-2">{p.attachments.map((a) => <span key={a} className="text-xs font-mono border border-white/15 px-2 py-1 inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{a}</span>)}</div>}
    </div></>;
}

function Chat({ p }) {
  return <>
    <Head icon={Mail} title={p.title} />
    <div className="p-4 space-y-2">{p.messages.map((m, i) => {
      const mine = /^(user|you)$/i.test(m.from);
      return <div key={i} className={`max-w-[85%] ${mine ? "ml-auto text-right" : ""}`}>
        <div className="text-[10px] font-mono text-slate-500">{m.from} · {m.time}</div>
        <div className={`inline-block text-sm px-3 py-2 mt-0.5 text-left ${mine ? "bg-cyan-500/15 border border-cyan-500/30" : "bg-white/5 border border-white/10"}`}><Body text={m.text} /></div></div>;
    })}</div></>;
}

const Code = ({ p }) => <><Head icon={Radar} title={p.title} /><pre className="p-4 text-xs font-mono text-green-300/90 whitespace-pre-wrap break-all max-h-80 overflow-auto" data-testid="phish-code">{p.text}</pre></>;

const Table = ({ p }) => <>{p.title && <Head icon={Radar} title={p.title} />}<div className="overflow-x-auto"><table className="w-full text-xs font-mono"><thead><tr>{p.columns.map((c) => <th key={c} className="text-left px-3 py-2 text-slate-500 border-b border-white/10">{c}</th>)}</tr></thead>
  <tbody>{p.rows.map((r, i) => <tr key={i} className="border-b border-white/5">{r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-300 align-top">{String(c)}</td>)}</tr>)}</tbody></table></div></>;

const Browser = ({ p }) => <><Head icon={Lock} title={p.title} />
  <div className="p-3"><div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 text-xs font-mono"><Lock className="h-3 w-3 text-slate-500" /><span className="text-slate-200 break-all">{p.url}</span></div>
    {p.cert && <div className="text-[11px] font-mono text-yellow-300/90 mt-1">certificate: {p.cert}</div>}
    <div className="mt-3 bg-white/[0.03] border border-white/10 p-4"><Body text={p.body || ""} /></div></div></>;

const Qr = ({ p }) => <><Head icon={Radar} title={p.title} />
  <div className="p-4 flex flex-wrap items-center gap-4"><img src={`${API}/phish/qr?data=${encodeURIComponent(p.payload)}`} alt="QR code evidence" className="h-40 w-40 bg-white p-1" data-testid="phish-qr-image" />
    <div className="text-xs text-slate-400 space-y-2 max-w-xs"><p>{p.caption}</p><Link to={`/app/phishing?tab=osint&qr=${encodeURIComponent(p.payload)}`} className="ghost-btn !text-xs" data-testid="phish-qr-decode">Decode in OSINT toolkit</Link></div></div></>;

const WifiP = ({ p }) => <><Head icon={Wifi} title={p.title} /><Table p={{ title: "", columns: ["SSID", "BSSID", "Vendor (OUI)", "Security", "Signal", "Ch"], rows: p.networks.map((n) => [n.ssid, n.bssid, n.vendor, n.security, n.signal, n.channel]) }} /></>;

const KINDS = { email: Email, chat: Chat, code: Code, table: Table, browser: Browser, qr: Qr, wifi: WifiP };

export function Panels({ panels }) {
  return <div className="space-y-4" data-testid="phish-evidence">{panels.map((p, i) => { const K = KINDS[p.type] || Code;
    return <div key={i} className="glass border border-white/10" data-testid={`phish-panel-${i}`}><K p={p} /></div>; })}</div>;
}

export { osint };
