import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, ChevronRight, Timer, Target, ShieldCheck, RotateCcw, Hourglass, Fingerprint, Star, Users, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import PublicNav from "../components/PublicNav";
import { Glass, Empty } from "../components/common";
import { Checkout } from "../components/academy/BuyCard";
import { PriceTag, Countdown } from "../components/academy/Price";
import { Reviews, Stars } from "../components/academy/Reviews";
import { SampleQuestion } from "../components/exam/Question";
import { KIND_LABEL } from "../components/exam/Catalog";
import { BundleOffers } from "../components/academy/Bundles";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";

const ID_LABEL = { account: "Tied to your account", name: "Legal name confirmation", webcam: "Name + webcam photo" };

export function Details({ t }) {
  const cert = t.kind === "certification";
  const rows = [[Target, "Questions", t.questions], [Timer, "Duration", t.duration_min ? `${t.duration_min} minutes` : "Untimed"], [ShieldCheck, "Pass mark", `${t.pass_mark}%`],
    [RotateCcw, "Attempts", cert ? `${t.attempts_max} certification attempts` : "Unlimited"], ...(cert ? [[Hourglass, "Cooldown", `${t.cooldown_hours} h between failed attempts`], [Fingerprint, "Identity check", ID_LABEL[t.identity]]] : []), ...(t.strict_mode ? [[ShieldCheck, "Strict mode", "Tab switches are recorded"]] : [])];
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-cyan-500/15 border border-cyan-500/15" data-testid="test-details">
      {rows.map(([I, l, v]) => <div key={l} className="bg-[#0B0F1A] p-4"><div className="text-[10px] font-mono uppercase text-slate-500 flex items-center gap-1.5"><I className="h-3.5 w-3.5 text-cyan-400" />{l}</div><div className="font-mono text-sm mt-1 text-slate-100" data-testid={`test-detail-${l.toLowerCase().replace(/\s/g, "-")}`}>{v}</div></div>)}
    </div>);
}

export function DomainWeights({ domains }) {
  if (!domains?.length) return null;
  return (
    <section data-testid="test-syllabus"><h2 className="text-xl font-bold mb-3">Syllabus & domain weightings</h2>
      <div className="space-y-3">{domains.map((d, i) => <div key={d.name} data-testid={`domain-weight-${i}`}>
        <div className="flex justify-between text-sm"><span>{d.name}</span><span className="font-mono text-cyan-300">{d.weight}%</span></div>
        <div className="h-1.5 bg-white/5 mt-1"><div className="h-full bg-gradient-to-r from-cyan-400 to-green-400" style={{ width: `${Math.min(100, d.weight * 2.5)}%` }} /></div></div>)}</div></section>);
}

function Action({ t, reload }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  if (t.owned) return <Link to={`/app/tests/${t.id}`} className="glow-btn w-full justify-center" data-testid="test-start">{t.me?.in_progress?.length ? "Resume test" : "Start test"}</Link>;
  if (!t.signed_in) return <button className="glow-btn w-full justify-center" onClick={() => nav("/login", { state: { from: `/test/${t.id}` } })} data-testid="test-signin">{t.price ? "Sign in to buy" : "Sign in to enroll free"}</button>;
  if (!t.price) return <button className="glow-btn w-full justify-center" disabled={busy} data-testid="test-enroll-free"
    onClick={async () => { setBusy(true); try { await api.post(`/exams/${t.id}/enroll`); toast.success("Enrolled — good luck!"); nav(`/app/tests/${t.id}`); } catch (e) { toast.error(errMsg(e)); setBusy(false); } }}>Enroll for free</button>;
  return <Checkout c={t} item={`test:${t.id}`} label={`Test: ${t.title}`} onPaid={() => { toast.success("Payment confirmed"); reload(); }} />;
}

function BuyCard({ t, reload }) {
  return (
    <Glass className="overflow-hidden" data-testid="test-buy-card">
      <div className="aspect-video relative bg-[#060912] border-b border-cyan-500/20 grid place-items-center overflow-hidden">
        {t.cover ? <img src={t.cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" /> : <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "linear-gradient(rgba(0,255,102,.2) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,102,.2) 1px,transparent 1px)", backgroundSize: "18px 18px" }} />}
        <div className="relative text-center"><div className="text-[10px] font-mono tracking-[0.4em] text-slate-400">{t.vendor?.toUpperCase()}</div><div className="font-mono text-4xl font-black neon-text">{t.code || "EXAM"}</div><div className="text-[10px] font-mono text-green-400 mt-1">{KIND_LABEL[t.kind]?.toUpperCase()}</div></div>
      </div>
      <div className="p-5 space-y-3">
        <PriceTag c={t} size="lg" testId="test-landing-price" />
        {t.sale_ends_at && <Countdown ends={t.sale_ends_at} onEnd={reload} />}
        <Action t={t} reload={reload} />
        <ul className="space-y-1.5 text-xs text-slate-300 pt-1">{[`${t.questions} exam-style questions`, t.duration_min ? `${t.duration_min}-minute countdown timer` : "Untimed", "Practice mode with hints & explanations", "Domain analytics & readiness score", "Autosave & resume", t.kind === "certification" && "Verifiable certificate when you pass"].filter(Boolean).map((x) => <li key={x} className="flex gap-2"><Check className="h-3.5 w-3.5 text-green-400 shrink-0" />{x}</li>)}</ul>
      </div>
    </Glass>);
}

const List = ({ title, items, testId }) => (items?.length ? <section data-testid={testId}><h2 className="text-xl font-bold mb-3">{title}</h2><ul className="grid sm:grid-cols-2 gap-2">{items.map((x) => <li key={x} className="text-sm text-slate-300 flex gap-2"><Check className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />{x}</li>)}</ul></section> : null);

export default function TestLanding() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const [t, setT] = useState(null);
  const load = () => api.get(`/public/exams/${id}`).then((r) => setT(r.data)).catch(() => setT(false));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  useEffect(() => { const o = sp.get("cf_order"); if (!o) return; api.get(`/payments/cashfree/${o}`).then((r) => { r.data.status === "PAID" ? toast.success("Payment confirmed") : toast.error(`Payment status: ${r.data.status}`); load(); }).catch(() => {}); setSp({}, { replace: true }); }, []); // eslint-disable-line
  if (t === false) return <div className="min-h-screen grid-bg"><PublicNav /><div className="py-24"><Empty text="Test not found" /></div></div>;
  if (!t) return <div className="min-h-screen grid-bg"><PublicNav /></div>;
  return (
    <div className="min-h-screen grid-bg" data-testid="test-landing">
      <PublicNav />
      <div className="max-w-6xl mx-auto px-6 py-10 lg:grid lg:grid-cols-[1fr_360px] gap-10 items-start">
        <div className="min-w-0 border-b border-cyan-500/20 pb-8 lg:col-start-1 lg:row-start-1">
            <div className="text-xs font-mono text-cyan-400 flex items-center gap-1.5"><Link to={t.signed_in ? "/app/tests" : "/tests"} className="hover:underline" data-testid="test-breadcrumb">Tests</Link><ChevronRight className="h-3 w-3" />{t.vendor}<ChevronRight className="h-3 w-3" />{t.code}</div>
            {t.status !== "published" && <div className="mt-3 text-xs font-mono text-yellow-300 border border-yellow-500/30 p-2 inline-block">Preview — this test is a draft.</div>}
            <h1 className="text-3xl sm:text-4xl font-bold mt-3 leading-tight" data-testid="test-landing-title">{t.title}</h1>
            {t.subtitle && <p className="text-base md:text-lg text-slate-300 mt-3">{t.subtitle}</p>}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm">
              {t.rating ? <span className="inline-flex items-center gap-1.5 text-yellow-300 font-bold" data-testid="test-landing-rating">{t.rating}<Stars value={t.rating} size="h-3.5 w-3.5" /><span className="text-cyan-300 font-normal text-xs">({t.reviews_count} ratings)</span></span> : <span className="text-xs font-mono text-slate-500 inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />New test</span>}
              <span className="inline-flex items-center gap-1.5 text-slate-300"><Users className="h-4 w-4" />{t.students.toLocaleString("en-IN")} candidate{t.students === 1 ? "" : "s"}</span>
              <span className="text-slate-300 font-mono text-xs border border-white/15 px-2 py-0.5">{t.level}</span>
              <span className="text-green-300 font-mono text-xs border border-green-500/30 px-2 py-0.5">{KIND_LABEL[t.kind]}</span>
            </div>
            <div className="mt-6"><Details t={t} /></div>
        </div>
        <div className="my-8 lg:my-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-6 self-start"><BuyCard t={t} reload={load} /></div>
        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2 lg:pt-10">
        <Glass className="p-6"><List title="What you will be tested on" items={t.outcomes} testId="test-outcomes" /></Glass>
        {!t.owned && <BundleOffers courseId={t.id} />}
        <DomainWeights domains={t.domains} />
        {t.samples?.length > 0 && <section data-testid="test-samples"><h2 className="text-xl font-bold mb-1">Try {t.samples.length} free sample questions</h2><p className="text-xs text-slate-500 mb-3">Answer, check, and read why every option is right or wrong.</p>
          <div className="space-y-4">{t.samples.map((q, i) => <SampleQuestion key={q.qid} q={q} i={i} scenario={q.scenario_id ? t.sample_scenarios?.[q.scenario_id] : null} />)}</div></section>}
        {t.description && <section data-testid="test-description"><h2 className="text-xl font-bold mb-3">About this test</h2><p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{t.description}</p></section>}
        <List title="Requirements" items={t.requirements} testId="test-requirements" />
        <List title="Who this test is for" items={t.audience} testId="test-audience" />
        {t.faqs?.length > 0 && <section data-testid="test-faqs"><h2 className="text-xl font-bold mb-3">FAQs</h2>
          <Accordion type="single" collapsible className="border border-white/10">{t.faqs.map((f, i) => <AccordionItem key={i} value={`f${i}`} className="border-white/10 px-4"><AccordionTrigger className="text-sm text-left" data-testid={`test-faq-${i}`}>{f.q}</AccordionTrigger><AccordionContent className="text-sm text-slate-400">{f.a}</AccordionContent></AccordionItem>)}</Accordion></section>}
        <Reviews c={t} reload={load} postUrl={`/exams/${t.id}/reviews`} noun="test" />
        {t.related?.length > 0 && <section data-testid="test-related"><h2 className="text-xl font-bold mb-3">Related courses & labs</h2>
          <div className="grid sm:grid-cols-2 gap-3">{t.related.map((r, i) => <Link key={i} to={r.link} className="glass p-4 flex items-center gap-3 hover:border-cyan-400/50 transition-colors" data-testid={`test-related-${i}`}><span className="text-[10px] font-mono uppercase text-green-400 w-16">{r.kind}</span><span className="text-sm flex-1">{r.title}</span><ArrowUpRight className="h-4 w-4 text-slate-500" /></Link>)}</div></section>}
        </div>
      </div>
    </div>);
}
