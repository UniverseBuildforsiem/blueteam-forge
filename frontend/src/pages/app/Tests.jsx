import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Dumbbell, Timer, ShieldCheck, PlayCircle, Award, Lock } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Glass, PageHeader, Empty } from "../../components/common";
import { TestCatalog, KIND_LABEL } from "../../components/exam/Catalog";
import { Details } from "../TestLanding";
import { IdentityGate } from "../../components/exam/IdentityGate";
import { TrendChart, DomainChart, DomainBars, READY, fmtTime } from "../../components/exam/Charts";

export function TestsHome() {
  const [mine, setMine] = useState(null);
  useEffect(() => { api.get("/me/exams").then((r) => setMine(r.data)).catch(() => setMine([])); }, []);
  return (
    <div>
      <PageHeader eyebrow="// certification tests" title="Tests" sub="Exam simulators with practice mode, timed exams and certification attempts." />
      {mine?.length > 0 && <section className="mb-10" data-testid="my-tests"><div className="eyebrow mb-3">my tests</div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{mine.map((t) => <Link key={t.id} to={`/app/tests/${t.id}`} className="glass p-4 hover:border-cyan-400/50 transition-colors" data-testid={`my-test-${t.id}`}>
          <div className="text-[10px] font-mono text-cyan-400">{t.code} · {KIND_LABEL[t.kind]}</div><div className="font-bold text-sm mt-1">{t.title}</div>
          <div className="text-xs font-mono mt-2 text-slate-400">{t.last ? <>last: <span className={t.last.passed ? "text-green-300" : "text-red-300"}>{t.last.percent}%</span> · {fmtDate(t.last.submitted_at)}</> : "not attempted yet"}</div></Link>)}</div></section>}
      <TestCatalog to={(t) => (t.owned ? `/app/tests/${t.id}` : `/test/${t.id}`)} />
    </div>);
}

function StartPanel({ t, d, reload }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [sp] = useSearchParams();
  const [timed, setTimed] = useState(false);
  const [domain, setDomain] = useState(sp.get("practice") || "");
  const [gate, setGate] = useState(false);
  const st = d.status || {};
  const prog = (m) => st.in_progress?.find((x) => x.mode === m);
  const start = async (body) => { try { const r = await api.post(`/exams/${t.id}/start`, body); if (r.data.resumed) toast.info("Resuming your attempt"); nav(`/app/tests/attempt/${r.data.id}`); } catch (e) { toast.error(errMsg(e)); reload(); } };
  const main = t.kind !== "practice" ? t.kind : null;
  const certBlock = main === "certification" && (st.certificate ? "passed" : st.cert_attempts_left === 0 ? "No certification attempts left" : st.cooldown_until ? `Cooldown until ${fmtDate(st.cooldown_until)}` : null);
  return (
    <div className="grid md:grid-cols-2 gap-4" data-testid="start-panel">
      {(t.practice_enabled || t.kind === "practice") && <Glass className="p-5 space-y-3" data-testid="start-practice">
        <div className="flex items-center gap-2 font-bold"><Dumbbell className="h-4 w-4 text-green-400" />Practice mode</div>
        <p className="text-xs text-slate-400">Instant feedback after each question, hints, explanations, flag and skip.</p>
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <select className="field !w-auto !text-xs" value={domain} onChange={(e) => setDomain(e.target.value)} data-testid="practice-domain"><option value="">All domains (full set)</option>{d.domain_names.map((x) => <option key={x}>{x}</option>)}</select>
          {t.duration_min > 0 && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} data-testid="practice-timed" />Timed ({t.duration_min} min)</label>}
        </div>
        <button className="glow-btn !text-xs" onClick={() => start({ mode: "practice", timed, domain: domain || null })} data-testid="practice-start"><PlayCircle className="h-3.5 w-3.5" />{prog("practice") ? "Resume practice" : "Start practice"}</button>
      </Glass>}
      {main && <Glass className={`p-5 space-y-3 ${main === "certification" ? "border-green-500/30" : ""}`} data-testid={`start-${main}`}>
        <div className="flex items-center gap-2 font-bold">{main === "certification" ? <ShieldCheck className="h-4 w-4 text-green-400" /> : <Timer className="h-4 w-4 text-cyan-400" />}{main === "certification" ? "Certification exam" : "Exam mode"}</div>
        <p className="text-xs text-slate-400">{t.duration_min ? `${t.duration_min}-minute countdown` : "Untimed"}, shuffled questions, no hints, results after submit. {main === "certification" && `Pass ${t.pass_mark}% to earn a certificate.`}{t.strict_mode && <span className="text-red-300" data-testid="start-strict-note"> Strict mode: tab switches are logged.</span>}</p>
        {main === "certification" && <div className="text-xs font-mono text-slate-300" data-testid="cert-attempts-left">Attempts left: <b className="text-cyan-300">{st.cert_attempts_left}</b> / {t.attempts_max} · cooldown {t.cooldown_hours}h</div>}
        {certBlock === "passed" ? <Link to={`/verify/${st.certificate.id}`} className="glow-btn !text-xs" data-testid="cert-view"><Award className="h-3.5 w-3.5" />Passed — view certificate</Link>
          : certBlock && !prog(main) ? <div className="text-xs font-mono text-yellow-300 inline-flex items-center gap-1" data-testid="cert-blocked"><Lock className="h-3.5 w-3.5" />{certBlock}</div>
          : <button className="glow-btn !text-xs" onClick={() => (prog(main) ? start({ mode: main }) : main === "certification" ? setGate(true) : start({ mode: main }))} data-testid="exam-start"><PlayCircle className="h-3.5 w-3.5" />{prog(main) ? "Resume exam" : `Start ${main === "certification" ? "certification" : "exam"}`}</button>}
      </Glass>}
      {gate && <IdentityGate strict={t.strict_mode} open={gate} setOpen={setGate} method={t.identity} user={user} meta={`${t.code} · attempt ${(st.cert_attempts_used || 0) + 1} of ${t.attempts_max} · ${t.duration_min} min · pass ${t.pass_mark}%`} onStart={(x) => start({ mode: "certification", ...x })} />}
    </div>);
}

function AttemptsTable({ rows }) {
  if (!rows.length) return <Empty text="no submitted attempts yet" />;
  return <div className="overflow-x-auto"><table className="w-full text-xs font-mono" data-testid="attempts-table"><thead><tr className="text-slate-500 text-left"><th className="p-2">#</th><th>Mode</th><th>Score</th><th>Result</th><th>Time</th><th>Date</th><th /></tr></thead>
    <tbody>{[...rows].reverse().map((a) => <tr key={a.id} className="border-t border-white/5"><td className="p-2">{a.number}</td><td>{a.mode}{a.domain ? ` · ${a.domain}` : ""}</td><td>{a.score}/{a.total} ({a.percent}%)</td>
      <td className={a.passed ? "text-green-300" : "text-red-300"}>{a.passed ? "PASS" : "FAIL"}</td><td>{fmtTime(a.time_taken)}</td><td>{fmtDate(a.submitted_at)}</td><td><Link to={`/app/tests/result/${a.id}`} className="text-cyan-300 underline" data-testid={`attempt-open-${a.id}`}>review</Link></td></tr>)}</tbody></table></div>;
}

export function TestHub() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [d, setD] = useState(null);
  const load = () => Promise.all([api.get(`/public/exams/${id}`), api.get(`/me/exams/${id}/dashboard`)]).then(([a, b]) => { setT(a.data); setD(b.data); }).catch(() => setT(false));
  useEffect(() => { load(); const i = setInterval(() => api.get(`/me/exams/${id}/dashboard`).then((r) => setD(r.data)).catch(() => {}), 15000); return () => clearInterval(i); }, [id]); // eslint-disable-line
  if (t === false) return <Empty text="Test not found" />;
  if (!t || !d) return null;
  if (!t.owned) return <Glass className="p-8 text-center space-y-3" data-testid="test-locked"><Lock className="h-8 w-8 mx-auto text-cyan-400" /><p>You haven't enrolled in this test yet.</p><Link to={`/test/${id}`} className="glow-btn">View test page</Link></Glass>;
  return (
    <div className="space-y-6" data-testid="test-hub">
      <PageHeader eyebrow={`// ${t.vendor} · ${t.code}`} title={t.title} sub={t.subtitle} right={<Link to={`/test/${id}`} className="ghost-btn !text-xs" data-testid="hub-landing">Test page</Link>} />
      <Details t={t} />
      <StartPanel t={t} d={d} reload={load} />
      <div className="eyebrow pt-2" data-testid="results-dashboard">// results dashboard · live</div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Glass className="p-4"><div className="text-[10px] font-mono uppercase text-slate-500">Readiness</div>{d.readiness ? <span className={`inline-block mt-2 text-sm font-mono border px-2 py-1 ${READY[d.readiness]}`} data-testid="hub-readiness">{d.readiness}</span> : <div className="text-sm text-slate-500 mt-2">Take a test to get a readiness score</div>}</Glass>
        <Glass className="p-4"><div className="text-[10px] font-mono uppercase text-slate-500">Recent average (last 3)</div><div className="font-mono text-2xl mt-1" data-testid="hub-average">{d.recent_average ?? "—"}{d.recent_average != null && "%"}</div></Glass>
        <Glass className="p-4"><div className="text-[10px] font-mono uppercase text-slate-500">Attempts</div><div className="font-mono text-2xl mt-1" data-testid="hub-attempts">{d.attempts.length}</div></Glass>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Glass className="p-5"><h3 className="font-bold mb-2">Score trend</h3><TrendChart attempts={d.attempts} passMark={d.pass_mark} /></Glass>
        <Glass className="p-5"><h3 className="font-bold mb-2">Domains (last 5 full attempts)</h3><DomainChart domains={d.domains} passMark={d.pass_mark} />{d.domains.length > 0 && <div className="mt-3"><DomainBars domains={d.domains} passMark={d.pass_mark} /></div>}</Glass>
      </div>
      <Glass className="p-5"><h3 className="font-bold mb-2">Attempt history</h3><AttemptsTable rows={d.attempts} /></Glass>
    </div>);
}
