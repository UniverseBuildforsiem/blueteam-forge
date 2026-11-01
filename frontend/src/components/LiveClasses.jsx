import { useEffect, useState } from "react";
import { Radio, CalendarDays, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { api, errMsg } from "../lib/api";

const EXP = ["Student / fresher", "0-1 years IT", "1-3 years IT", "3+ years IT", "Already in a SOC"];
const ist = (iso, o = {}) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", ...o });
const istTime = (iso) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const local = (iso) => (Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Kolkata" ? null : new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" }));

function EnquiryForm({ pick, onClose }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", experience: EXP[0], message: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data } = await api.post("/public/live-classes/enquiry", { kind: pick.kind, session_at: pick.at, ...f }); setDone(data.when); } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  const demo = pick.kind === "demo";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-lg" data-testid="live-enquiry-dialog">
        <DialogHeader><div className="eyebrow">// soc live classes · {demo ? "free demo" : "new batch"}</div>
          <DialogTitle className="font-mono text-lg">{ist(pick.at)} · {istTime(pick.at)} IST</DialogTitle></DialogHeader>
        {done ? <div className="text-sm text-slate-300 space-y-3" data-testid="live-enquiry-success"><CheckCircle2 className="h-8 w-8 text-green-400" />
          <p>{demo ? `You're registered for the free demo on ${done}. Check your email for the joining link.` : `Thanks! Our team will contact you about the batch starting ${done}.`}</p>
          <button className="ghost-btn" onClick={onClose} data-testid="live-enquiry-close">Close</button></div>
          : <form onSubmit={submit} className="space-y-3">
            <input className="field" placeholder="Full name" required minLength={2} value={f.name} onChange={up("name")} data-testid="live-enquiry-name" />
            <div className="grid sm:grid-cols-2 gap-3">
              <input className="field" type="email" placeholder="Email" required value={f.email} onChange={up("email")} data-testid="live-enquiry-email" />
              <input className="field" type="tel" placeholder="Phone / WhatsApp" required minLength={7} pattern="[0-9+()\-\s]+" value={f.phone} onChange={up("phone")} data-testid="live-enquiry-phone" /></div>
            <select className="field" value={f.experience} onChange={up("experience")} data-testid="live-enquiry-experience">{EXP.map((x) => <option key={x}>{x}</option>)}</select>
            <textarea className="field h-20 text-sm" placeholder="Anything you'd like us to know? (optional)" maxLength={1000} value={f.message} onChange={up("message")} data-testid="live-enquiry-message" />
            <button className="glow-btn w-full justify-center" disabled={busy} data-testid="live-enquiry-submit">{busy ? "Sending..." : demo ? "Register for the free demo" : "Enquire about this batch"}</button>
          </form>}
      </DialogContent>
    </Dialog>);
}

function Dates({ items, kind, onPick, accent }) {
  return <div className="grid sm:grid-cols-2 gap-2">{items.map((d, i) => (
    <button key={d.at} onClick={() => onPick({ kind, at: d.at })} data-testid={`live-${kind}-date-${i}`}
      className="text-left border border-white/10 hover:border-cyan-400/50 px-3 py-2.5 rounded-sm transition-colors group">
      <div className="font-mono text-sm" style={{ color: i === 0 ? accent : undefined }}>{ist(d.at)} · {istTime(d.at)} IST</div>
      <div className="text-[11px] text-slate-500 flex items-center justify-between">{d.label || (local(d.at) ? `your time: ${local(d.at)}` : "free · online")}<ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" /></div>
    </button>))}</div>;
}

export default function LiveClasses() {
  const [d, setD] = useState(null);
  const [pick, setPick] = useState(null);
  useEffect(() => { api.get("/public/live-classes").then((r) => setD(r.data)).catch(() => {}); }, []);
  if (!d) return null;
  return (
    <section id="live-classes" className="max-w-7xl mx-auto px-6 pb-24" data-testid="live-classes">
      <div className="flex items-center gap-2 eyebrow mb-3"><span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />// live · instructor-led</div>
      <h2 className="text-3xl font-bold" data-testid="live-classes-title">{d.title}</h2>
      <p className="text-slate-400 text-sm mt-2 max-w-2xl">{d.description}</p>
      <div className="grid lg:grid-cols-2 gap-4 mt-8">
        <div className="glass rounded-sm p-6" data-testid="live-demo-card">
          <div className="flex items-center gap-2 font-bold"><Radio className="h-4 w-4 text-red-400" />Free demo · every Friday {d.demos[0] ? istTime(d.demos[0]) : ""} IST</div>
          <p className="text-xs text-slate-400 mt-1 mb-4">A live 1-hour walkthrough of the course on Microsoft Teams. Pick a Friday to register.</p>
          <Dates items={d.demos.map((at) => ({ at }))} kind="demo" onPick={setPick} accent="#F87171" />
        </div>
        <div className="glass rounded-sm p-6" data-testid="live-batch-card">
          <div className="flex items-center gap-2 font-bold"><Users className="h-4 w-4 text-green-400" />New batches · 2nd & 4th Friday</div>
          <p className="text-xs text-slate-400 mt-1 mb-4 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Seats are limited — enquire to enrol in an upcoming batch.</p>
          <Dates items={d.batches.map((b) => ({ at: b.start, label: b.label }))} kind="batch" onPick={setPick} accent="#00FF66" />
        </div>
      </div>
      {pick && <EnquiryForm pick={pick} onClose={() => setPick(null)} />}
    </section>);
}
