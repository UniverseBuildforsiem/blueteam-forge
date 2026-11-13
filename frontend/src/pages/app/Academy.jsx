import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PlayCircle, ListChecks, Terminal, Siren, BookMarked, Radar, Timer, CheckCircle2, Circle, Lock, Award, ArrowLeft, ExternalLink, GraduationCap, Printer } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { payRazorpay, payCashfree } from "../../lib/pay";
import { Glass, PageHeader, Empty } from "../../components/common";
import { VideoFrame } from "../../components/VideoField";
import { embedSrc } from "../../lib/video";

export const ITEM_TYPES = {
  video: ["Video", PlayCircle], quiz: ["Quiz", ListChecks], lab: ["Kali lab", Terminal], scenario: ["Scenario", Siren],
  sop: ["SOP", BookMarked], siem: ["SIEM simulator", Radar], shift: ["Shift simulator", Timer],
};
const LINK = { quiz: (i) => `/app/quizzes/${i.ref}`, lab: (i) => `/app/labs/${i.ref}`, scenario: (i) => `/app/challenges?case=${i.ref}`, sop: (i) => `/sops/${i.ref}`, siem: () => "/app/siem", shift: () => "/app/shift" };
const price = (c) => (c.price ? `₹${c.price.toLocaleString("en-IN")}` : "Free");

export default function AcademyList() {
  const [cs, setCs] = useState(null);
  useEffect(() => { api.get("/academy/courses").then((r) => setCs(r.data)); }, []);
  return (
    <div>
      <PageHeader eyebrow="// academy courses" title="Courses" sub="Module-by-module SOC courses combining video lessons, quizzes, Kali labs, investigation scenarios, SOPs and the SIEM & Shift simulators." />
      {cs && !cs.length && <Empty text="No courses published yet" />}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="academy-list">{(cs || []).map((c) => (
        <Link key={c.id} to={`/app/courses/${c.id}`} data-testid={`academy-card-${c.id}`}>
          <Glass className="h-full flex flex-col overflow-hidden hover:border-cyan-400/50 transition-colors">
            {c.cover ? <img src={c.cover} alt="" className="h-36 w-full object-cover" /> : <div className="h-36 grid place-items-center bg-gradient-to-br from-cyan-500/10 to-transparent"><GraduationCap className="h-12 w-12 text-cyan-400/60" /></div>}
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex items-center gap-2 text-[11px] font-mono"><span className="text-cyan-400">{c.level}</span><span className="text-slate-500">{c.modules_count} modules · {c.items_count} items</span>
                <span className={`ml-auto font-bold ${c.owned ? "text-green-400" : "text-yellow-300"}`} data-testid={`academy-price-${c.id}`}>{c.owned && c.price ? "Owned" : price(c)}</span></div>
              <div className="font-bold mt-2">{c.title}</div><p className="text-xs text-slate-400 mt-1 flex-1 line-clamp-2">{c.subtitle}</p>
              <div className="flex flex-wrap gap-1 mt-3">{c.types.map((t) => <span key={t} className="text-[10px] font-mono border border-white/10 text-slate-400 px-1.5">{ITEM_TYPES[t]?.[0]}</span>)}</div>
              {c.owned && <div className="mt-3 h-1 bg-white/5"><div className="h-full bg-green-400" style={{ width: `${c.percent}%` }} /></div>}
            </div></Glass></Link>))}</div>
    </div>);
}

function Buy({ c, onPaid }) {
  const [cfg, setCfg] = useState(null);
  const [phone, setPhone] = useState("");
  useEffect(() => { api.get("/payments/config").then((r) => setCfg(r.data)).catch(() => {}); }, []);
  if (!cfg) return null;
  const item = `course:${c.id}`;
  const rzp = () => payRazorpay(item, `Course: ${c.title}`, onPaid, (e) => toast.error(errMsg(e))).catch((e) => toast.error(errMsg(e)));
  const cf = () => (/^\d{10}$/.test(phone) ? payCashfree(item, phone, cfg.cashfree_mode).catch((e) => toast.error(errMsg(e))) : toast.error("Enter a 10-digit mobile number for Cashfree"));
  return (
    <Glass className="p-5 space-y-2.5" data-testid="academy-buy-box">
      <div className="text-3xl font-mono font-bold neon-text">{price(c)}</div><div className="text-xs text-slate-400">One-time payment · lifetime access · certificate on completion</div>
      {!cfg.razorpay && !cfg.cashfree && <div className="text-xs font-mono text-yellow-300 border border-yellow-500/30 p-2" data-testid="academy-pay-not-configured">Payments open soon.</div>}
      <button className="glow-btn w-full justify-center" disabled={!cfg.razorpay} onClick={rzp} data-testid="academy-buy-razorpay">Buy course with Razorpay</button>
      {cfg.cashfree && <><input className="field" placeholder="Mobile number (for Cashfree)" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="academy-phone" />
        <button className="ghost-btn w-full justify-center" onClick={cf} data-testid="academy-buy-cashfree">Pay with Cashfree</button></>}
    </Glass>);
}

function ItemView({ c, it, done, onDone }) {
  const [busy, setBusy] = useState(false);
  const [T, Icon] = ITEM_TYPES[it.type];
  const mark = async () => { setBusy(true); try { onDone((await api.post(`/academy/courses/${c.id}/items/${it.id}/done`)).data); toast.success("Marked done"); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  const src = it.type === "video" ? embedSrc(it.url) : "";
  return (
    <Glass className="p-6" data-testid="academy-item-view">
      <div className="eyebrow flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{T} · {it.minutes} min</div>
      <h2 className="text-xl font-bold mt-2">{it.title}</h2>
      {it.note && <p className="text-sm text-slate-300 mt-2 whitespace-pre-line">{it.note}</p>}
      {it.type === "video" && (src ? <div className="aspect-video mt-4 border border-cyan-500/20"><VideoFrame src={src} title={it.title} testId="academy-video" /></div>
        : <a href={it.url} target="_blank" rel="noreferrer" className="ghost-btn !text-xs mt-4" data-testid="academy-video-link"><ExternalLink className="h-3.5 w-3.5" />Open video</a>)}
      {LINK[it.type] && <Link to={LINK[it.type](it)} className="ghost-btn !text-xs mt-4" data-testid="academy-item-open"><ExternalLink className="h-3.5 w-3.5" />Open {T}</Link>}
      <div className="mt-6">{done ? <span className="text-green-400 font-mono text-sm inline-flex items-center gap-2" data-testid="academy-item-done"><CheckCircle2 className="h-4 w-4" />Done</span>
        : <button className="glow-btn" disabled={busy} onClick={mark} data-testid="academy-mark-done">Mark as done</button>}</div>
      {["quiz", "lab", "scenario"].includes(it.type) && !done && <p className="text-[11px] font-mono text-slate-500 mt-2">Complete it first — we check your {T} result before marking it done.</p>}
    </Glass>);
}

function CertCard({ cert }) {
  return <Link to={`/app/courses/certificate/${cert.id}`} className="flex items-center gap-3 border border-green-500/40 bg-green-500/10 p-4 mb-5" data-testid="academy-cert-link">
    <Award className="h-6 w-6 text-green-400" /><span className="text-sm"><span className="font-bold">Course complete!</span> View your certificate {cert.id}</span></Link>;
}

export function AcademyDetail() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const [c, setC] = useState(null);
  const [cur, setCur] = useState(null);
  const load = () => api.get(`/academy/courses/${id}`).then((r) => { setC(r.data); setCur((x) => x || r.data.modules[0]?.items[0]?.id); }).catch(() => setC(false));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  useEffect(() => { const o = sp.get("cf_order"); if (!o) return; api.get(`/payments/cashfree/${o}`).then((r) => { r.data.status === "PAID" ? toast.success("Payment confirmed — course unlocked") : toast.error(`Payment status: ${r.data.status}`); load(); }); setSp({}, { replace: true }); }, []); // eslint-disable-line
  if (c === false) return <Empty text="Course not found" />;
  if (!c) return null;
  const it = c.modules.flatMap((m) => m.items).find((x) => x.id === cur);
  const onDone = (d) => { setC({ ...c, done: d.done, percent: d.percent, certificate: d.certificate || c.certificate }); if (d.certificate && !c.certificate) toast.success("Course complete — certificate issued!"); };
  return (
    <div data-testid="academy-detail">
      <Link to="/app/courses" className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1 mb-3"><ArrowLeft className="h-3.5 w-3.5" />All courses</Link>
      <PageHeader eyebrow={`// ${c.level} · ${c.modules_count} modules · ${c.owned ? `${c.percent}% complete` : price(c)}`} title={c.title} sub={c.subtitle} />
      {c.status !== "published" && <div className="mb-4 text-xs font-mono text-yellow-300 border border-yellow-500/30 p-2" data-testid="academy-preview-banner">Preview — this course is {c.status} and not visible to students yet.</div>}
      {c.certificate && <CertCard cert={c.certificate} />}
      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <Glass className="p-3 h-fit" data-testid="academy-modules">{c.modules.map((m, mi) => <div key={m.id} className="mb-3">
          <div className="text-[11px] font-mono uppercase text-cyan-400 px-2 py-1.5">Module {mi + 1} · {m.title}</div>
          {m.items.map((x) => { const [, I] = ITEM_TYPES[x.type]; const d = c.done.includes(x.id);
            return <button key={x.id} disabled={!c.owned} onClick={() => setCur(x.id)} data-testid={`academy-item-${x.id}`}
              className={`w-full flex items-center gap-2 text-left text-sm px-2 py-2 transition-colors ${cur === x.id && c.owned ? "bg-cyan-500/10 text-cyan-200" : "text-slate-300 hover:bg-white/5"} disabled:cursor-default`}>
              {!c.owned ? <Lock className="h-4 w-4 text-slate-600 shrink-0" /> : d ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : <Circle className="h-4 w-4 text-slate-600 shrink-0" />}
              <span className="flex-1 truncate">{x.title}</span><I className="h-3.5 w-3.5 text-slate-500 shrink-0" /></button>; })}</div>)}</Glass>
        <div className="space-y-4">
          {!c.owned ? <div className="grid md:grid-cols-[1fr_300px] gap-4"><Glass className="p-6"><div className="eyebrow mb-2">about this course</div><p className="text-sm text-slate-300 whitespace-pre-line">{c.description || c.subtitle || `${c.modules_count} modules · ${c.items_count} items · about ${Math.round(c.minutes / 60) || 1} h of hands-on SOC training.`}</p></Glass><Buy c={c} onPaid={() => { toast.success("Payment confirmed — course unlocked"); load(); }} /></div>
            : it ? <ItemView key={it.id} c={c} it={it} done={c.done.includes(it.id)} onDone={onDone} /> : <Empty text="This course has no items yet" />}
        </div>
      </div>
    </div>);
}

export function AcademyCert() {
  const { certId } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState(null);
  useEffect(() => { api.get(`/academy/certificates/${certId}`).then((r) => setC(r.data)).catch(() => nav("/app/courses")); }, [certId]); // eslint-disable-line
  if (!c) return null;
  return (
    <div className="max-w-3xl mx-auto">
      <div className="border-2 border-cyan-400/60 p-10 text-center bg-[#0B0F1A] print:bg-white print:text-black" data-testid="academy-certificate">
        <div className="eyebrow">SOCProfessionals Academy</div><div className="text-sm text-slate-400 mt-6">This certifies that</div>
        <div className="text-4xl font-bold mt-2" data-testid="academy-cert-name">{c.name}</div><div className="text-sm text-slate-400 mt-4">has completed the course</div>
        <div className="text-2xl font-bold neon-text mt-2" data-testid="academy-cert-course">{c.course_title}</div>
        <div className="text-xs font-mono text-slate-500 mt-8">{c.instructor_name ? `Instructor: ${c.instructor_name} · ` : ""}Issued {fmtDate(c.issued_at)} · ID {c.id}</div>
      </div>
      <div className="flex gap-2 mt-4 print:hidden"><button className="glow-btn" onClick={() => window.print()} data-testid="academy-cert-print"><Printer className="h-4 w-4" />Print / save as PDF</button>
        <Link to={`/app/courses/${c.course_id}`} className="ghost-btn" data-testid="academy-cert-back">Back to course</Link></div>
    </div>);
}
