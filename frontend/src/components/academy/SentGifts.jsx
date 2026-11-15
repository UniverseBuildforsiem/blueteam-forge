import { useEffect, useState } from "react";
import { Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, Empty } from "../common";
import { inr } from "./Price";

const TONE = { scheduled: "text-yellow-300", sending: "text-yellow-300", sent: "text-cyan-300", redeemed: "text-green-400" };

export function SentGifts() {
  const [gs, setGs] = useState(null);
  const load = () => api.get("/gifts/sent").then((r) => setGs(r.data));
  useEffect(() => { load(); }, []);
  const copy = (g) => navigator.clipboard.writeText(g.link).then(() => toast.success("Gift link copied"));
  const send = async (g) => { try { await api.post(`/gifts/${g.id}/send-now`); toast.success(`Emailed ${g.to_email}`); load(); } catch (e) { toast.error(errMsg(e)); } };
  if (!gs) return <div className="font-mono text-xs text-cyan-400 cursor-blink" data-testid="sent-gifts-loading">loading gifts </div>;
  if (!gs.length) return <Empty text="No gifts yet — use 'Buy as a gift' on any paid course or bundle" />;
  return (
    <Glass className="divide-y divide-white/5" data-testid="sent-gifts">{gs.map((g) => (
      <div key={g.id} className="p-4 flex flex-wrap items-center gap-3 text-sm" data-testid={`gift-row-${g.id}`}>
        <div className="flex-1 min-w-[220px]"><div className="font-bold">{g.title}</div>
          <div className="text-[11px] font-mono text-slate-500">to {g.to_name} · {g.to_email} · {inr(g.amount)} · bought {fmtDate(g.created_at)}{g.send_on && g.status === "scheduled" ? ` · delivers ${fmtDate(g.send_on)}` : ""}</div>
          {g.last_error && g.status === "scheduled" && <div className="text-[11px] font-mono text-red-300">{g.last_error} — copy the link and share it yourself</div>}</div>
        <span className={`text-[11px] font-mono uppercase ${TONE[g.status]}`} data-testid={`gift-status-${g.id}`}>{g.status}</span>
        <button className="ghost-btn !text-xs" onClick={() => copy(g)} data-testid={`gift-copy-${g.id}`}><Copy className="h-3.5 w-3.5" />Copy link</button>
        {g.status !== "redeemed" && <button className="ghost-btn !text-xs" onClick={() => send(g)} data-testid={`gift-send-${g.id}`}><Send className="h-3.5 w-3.5" />{g.status === "sent" ? "Resend" : "Send now"}</button>}
      </div>))}</Glass>);
}
