import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CalendarDays, MessageCircle, EyeOff, Eye } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { waLink } from "../lib/pay";
import { Glass, Empty } from "./common";
import { Stars } from "../pages/ReviewPage";

const DAY = 864e5;
const istParts = (iso) => { const d = new Date(new Date(iso).getTime() + 330 * 6e4); return { date: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16) }; };
const todayIst = () => istParts(new Date().toISOString()).date;
const monday = (ds) => { const d = new Date(`${ds}T00:00:00Z`); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10); };
const addDays = (ds, n) => new Date(new Date(`${ds}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
const label = (ds) => new Date(`${ds}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const SCOL = { paid: "border-green-400/60 bg-green-500/10 text-green-100", completed: "border-cyan-400/50 bg-cyan-500/10 text-cyan-100", needs_reschedule: "border-orange-400/60 bg-orange-500/10 text-orange-100", cancelled: "border-white/10 text-slate-500 line-through" };
const waNum = (p) => { const d = (p || "").replace(/\D/g, ""); return d.length === 10 ? `91${d}` : d; };

function times(start, end) {
  const out = []; let [h, m] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number);
  while (h * 60 + m + 30 <= eh * 60 + em) { out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`); m += 30; if (m >= 60) { h += 1; m -= 60; } }
  return out;
}

export function ConsultCalendar() {
  const [cs, setCs] = useState([]);
  const [cfg, setCfg] = useState({ consult_start: "16:00", consult_end: "23:00" });
  const [week, setWeek] = useState(monday(todayIst()));
  const [sel, setSel] = useState(null);
  useEffect(() => { api.get("/admin/consultations").then((r) => setCs(r.data)); api.get("/admin/live-classes/settings").then((r) => setCfg(r.data)); }, []);
  const days = [...Array(7)].map((_, i) => addDays(week, i));
  const map = useMemo(() => { const m = {}; [...cs].sort((a, b) => (a.status === "cancelled") - (b.status === "cancelled")).forEach((c) => { const p = istParts(c.slot_at); (m[`${p.date} ${p.hm}`] ||= []).push(c); }); return m; }, [cs]);
  const slots = useMemo(() => { const extra = cs.map((c) => istParts(c.slot_at)).filter((p) => days.includes(p.date)).map((p) => p.hm);
    return [...new Set([...times(cfg.consult_start, cfg.consult_end), ...extra])].sort(); }, [cs, cfg, week]); // eslint-disable-line
  const inWeek = cs.filter((c) => days.includes(istParts(c.slot_at).date) && c.status !== "cancelled").length;
  const today = todayIst();
  return (
    <Glass className="p-5" data-testid="consult-calendar">
      <div className="flex flex-wrap items-center gap-2 mb-4"><CalendarDays className="h-4 w-4 text-green-400" /><div className="font-bold flex-1">Consultation calendar <span className="text-xs font-mono text-slate-500 ml-2" data-testid="consult-calendar-count">{inWeek} this week · IST</span></div>
        <button className="ghost-btn !text-xs !py-1" onClick={() => setWeek(addDays(week, -7))} data-testid="consult-calendar-prev"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <button className="ghost-btn !text-xs !py-1" onClick={() => setWeek(monday(today))} data-testid="consult-calendar-today">This week</button>
        <button className="ghost-btn !text-xs !py-1" onClick={() => setWeek(addDays(week, 7))} data-testid="consult-calendar-next"><ChevronRight className="h-3.5 w-3.5" /></button></div>
      <div className="overflow-x-auto"><div className="grid min-w-[900px]" style={{ gridTemplateColumns: "64px repeat(7, minmax(0,1fr))" }} data-testid="consult-calendar-grid">
        <div />{days.map((d) => <div key={d} className={`text-xs font-mono text-center pb-2 ${d === today ? "text-green-300" : "text-slate-400"}`} data-testid={`consult-calendar-day-${d}`}>{label(d)}</div>)}
        {slots.map((t) => [<div key={t} className="text-[10px] font-mono text-slate-500 pr-2 text-right py-1 border-t border-white/5">{t}</div>,
          ...days.map((d) => { const evs = map[`${d} ${t}`] || []; return (
            <div key={d + t} className={`border-t border-l border-white/5 min-h-[36px] p-0.5 flex gap-0.5 ${d === today ? "bg-green-500/[0.03]" : ""}`}>
              {evs.map((c) => <button key={c.id} onClick={() => setSel(c)} title={`${c.name} · ${c.status}`} className={`flex-1 min-w-0 h-8 text-left text-[11px] px-1.5 border rounded-sm truncate transition-transform hover:scale-[1.02] ${SCOL[c.status] || ""}`} data-testid={`consult-calendar-event-${c.id}`}>{evs.length > 1 ? c.name.split(" ")[0] : `${c.name} · ${c.topic}`}</button>)}
            </div>); })])}
      </div></div>
      {sel && <div className="mt-4 border border-white/10 p-4 rounded-sm text-sm space-y-1" data-testid="consult-calendar-detail">
        <div className="flex justify-between"><span className="font-bold">{sel.name}</span><button className="text-xs text-slate-500 hover:text-slate-200" onClick={() => setSel(null)}>close</button></div>
        <div className="text-xs font-mono text-slate-400">{new Date(sel.slot_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" })} IST · {sel.status}</div>
        <div className="text-xs">{sel.topic}{sel.notes && <span className="text-slate-400"> — {sel.notes}</span>}</div>
        <div className="flex gap-4 text-xs pt-1"><a href={`mailto:${sel.email}`} className="text-cyan-300 hover:underline">{sel.email}</a>
          <a href={waLink(waNum(sel.phone), `Hi ${sel.name}, this is SOCProfessionals about your consultation.`)} target="_blank" rel="noopener noreferrer" className="text-green-300 hover:underline inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{sel.phone}</a></div>
      </div>}
      {!cs.length && <div className="mt-3"><Empty text="no paid consultations yet" /></div>}
    </Glass>);
}

export function ReviewModeration() {
  const [rs, setRs] = useState(null);
  useEffect(() => { api.get("/admin/consult-reviews").then((r) => setRs(r.data)); }, []);
  const [busy, setBusy] = useState(null);
  const toggle = async (r) => {
    setBusy(r.id);
    try { await api.patch(`/admin/consult-reviews/${r.id}`, { hidden: !r.hidden }); setRs((cur) => cur.map((x) => (x.id === r.id ? { ...x, hidden: !r.hidden } : x))); } catch (e) { toast.error(errMsg(e)); }
    setBusy(null);
  };
  return (
    <Glass className="p-5" data-testid="review-moderation">
      <div className="font-bold mb-1">Consultation reviews</div>
      <p className="text-xs text-slate-500 mb-3">4★ and 5★ reviews with a comment appear on the landing page automatically. Hide any you don't want shown.</p>
      {!rs ? null : !rs.length ? <Empty text="no reviews yet" /> : <div className="space-y-2">{rs.map((r, i) => (
        <div key={r.id} className={`flex items-start gap-3 border border-white/5 p-3 rounded-sm ${r.hidden ? "opacity-50" : ""}`} data-testid={`review-row-${i}`}>
          <Stars n={r.rating} size="h-3.5 w-3.5" /><div className="flex-1 text-sm"><div className="text-slate-300">{r.comment || <span className="text-slate-500">no comment</span>}</div>
            <div className="text-[11px] font-mono text-slate-500 mt-1">{r.display_name} · {r.topic} · {r.rating >= 4 && r.comment.length >= 10 && !r.hidden ? <span className="text-green-400">on landing page</span> : "not shown"}</div></div>
          <button className="ghost-btn !text-xs !py-1" disabled={busy === r.id} onClick={() => toggle(r)} data-testid={`review-toggle-${i}`}>{r.hidden ? <><Eye className="h-3 w-3" />Show</> : <><EyeOff className="h-3 w-3" />Hide</>}</button>
        </div>))}</div>}
    </Glass>);
}
