import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, XCircle, Award, Clock, Hash, Target, ArrowUpRight, Dumbbell, ChevronDown } from "lucide-react";
import { api, errMsg } from "../../lib/api";
import { Glass, Empty } from "../common";
import { Options, ScenarioPanel } from "./Question";
import { TrendChart, DomainChart, DomainBars, READY, fmtTime } from "./Charts";

function Stat({ I, l, v, tid, cls = "" }) {
  return <Glass className="p-4"><div className="text-[10px] font-mono uppercase text-slate-500 flex items-center gap-1.5"><I className="h-3.5 w-3.5 text-cyan-400" />{l}</div><div className={`font-mono text-2xl font-bold mt-1 ${cls}`} data-testid={tid}>{v}</div></Glass>;
}

function Recs({ recs, readiness }) {
  return (
    <Glass className="p-5 space-y-4" data-testid="recommendations">
      <div className="flex items-center gap-3"><h3 className="font-bold flex-1">What to study next</h3>{readiness && <span className={`text-xs font-mono border px-2 py-1 ${READY[readiness]}`} data-testid="readiness-label">{readiness}</span>}</div>
      {!recs.length && <p className="text-sm text-green-300">Every domain is above target. Keep it sharp with a timed exam.</p>}
      {recs.map((r, i) => <div key={r.domain} className="border border-white/10 p-3" data-testid={`rec-${i}`}>
        <div className="flex justify-between text-sm"><span><span className="font-mono text-red-300 mr-2">#{i + 1}</span>{r.domain}</span><span className="font-mono text-red-300">{r.percent}%</span></div>
        <div className="flex flex-wrap gap-2 mt-2">{r.links.map((l) => <Link key={l.link} to={l.link} className="text-xs border border-cyan-500/30 text-cyan-200 px-2 py-1 hover:bg-cyan-500/10 inline-flex items-center gap-1">{l.title}<ArrowUpRight className="h-3 w-3" /></Link>)}
          <Link to={r.practice} className="text-xs border border-green-500/40 text-green-300 px-2 py-1 hover:bg-green-500/10 inline-flex items-center gap-1" data-testid={`rec-practice-${i}`}><Dumbbell className="h-3 w-3" />Practice this domain</Link></div></div>)}
    </Glass>);
}

function ReviewItem({ q, i, picked, flagged, sc }) {
  const [open, setOpen] = useState(!q.is_correct && i < 3);
  return (
    <div className={`border ${q.is_correct ? "border-green-500/25" : "border-red-500/30"}`} data-testid={`review-item-${i}`}>
      <button className="w-full text-left p-3 flex gap-3 items-start" onClick={() => setOpen(!open)} data-testid={`review-toggle-${i}`}>
        {q.is_correct ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />}
        <span className="flex-1 text-sm"><span className="font-mono text-slate-500 mr-2">Q{i + 1}</span>{q.stem}<span className="block text-[10px] font-mono text-slate-500 mt-1">{q.domain}{flagged ? " · flagged" : ""}{!picked.length ? " · not answered" : ""}</span></span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} /></button>
      {open && <div className="px-3 pb-3 space-y-3">{sc && <ScenarioPanel s={sc} />}<Options q={q} picked={picked} onPick={() => {}} reveal disabled />
        {q.ref_url && <Link to={q.ref_url} className="text-xs text-cyan-300 underline">{q.ref_label || "Related lecture / lab"}</Link>}</div>}
    </div>);
}

export default function Result() {
  const { aid } = useParams();
  const [r, setR] = useState(null);
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState("all");
  useEffect(() => { api.get(`/exam-attempts/${aid}/result`).then((x) => { setR(x.data); return api.get(`/me/exams/${x.data.exam_id}/dashboard`); }).then((x) => setD(x.data)).catch((e) => setR({ error: errMsg(e) })); }, [aid]);
  if (!r) return <div className="font-mono text-cyan-400 cursor-blink py-20 text-center">scoring </div>;
  if (r.error) return <Empty text={r.error} />;
  const qs = r.questions.map((q, i) => ({ q, i })).filter(({ q }) => filter === "all" || (filter === "wrong" ? !q.is_correct : r.flags.includes(q.qid)));
  return (
    <div className="space-y-6" data-testid="test-result">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-0"><Link to={`/app/tests/${r.exam_id}`} className="text-xs font-mono text-cyan-400 hover:underline" data-testid="result-back">← {r.exam_title}</Link>
          <h1 className="text-3xl sm:text-4xl font-bold mt-2">{r.mode === "practice" ? "Practice results" : "Exam results"}</h1></div>
        <div className={`px-5 py-3 border-2 font-mono text-2xl font-black tracking-widest ${r.passed ? "border-green-400 text-green-300 shadow-[0_0_30px_rgba(0,255,102,.25)]" : "border-red-400 text-red-300"}`} data-testid="result-verdict">{r.passed ? "PASS" : "FAIL"}</div>
      </div>
      {r.certificate_id && <Glass className="p-4 flex items-center gap-3 border-green-500/40" data-testid="result-certificate"><Award className="h-6 w-6 text-green-400" /><span className="flex-1 text-sm">Certificate issued — <span className="font-mono text-green-300">{r.certificate_id}</span></span>
        <Link to={`/verify/${r.certificate_id}`} className="glow-btn !text-xs" data-testid="result-view-cert">View certificate</Link></Glass>}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat I={Target} l="Score" v={`${r.score}/${r.total}`} tid="result-score" /><Stat I={Target} l="Percentage" v={`${r.percent}%`} tid="result-percent" cls={r.passed ? "text-green-300" : "text-red-300"} />
        <Stat I={CheckCircle2} l="Pass mark" v={`${r.pass_mark}%`} tid="result-pass-mark" /><Stat I={Clock} l="Time taken" v={fmtTime(r.time_taken)} tid="result-time" /><Stat I={Hash} l="Attempt" v={`#${r.number}`} tid="result-attempt" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Glass className="p-5"><h3 className="font-bold mb-2">Score trend across attempts</h3>{d ? <TrendChart attempts={d.attempts} passMark={r.pass_mark} /> : null}</Glass>
        <Glass className="p-5"><h3 className="font-bold mb-2">Domain breakdown</h3><DomainChart domains={r.domains} passMark={r.pass_mark} /></Glass>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Glass className="p-5"><h3 className="font-bold mb-3">Strengths & weaknesses</h3><DomainBars domains={[...r.domains].reverse()} passMark={r.pass_mark} /></Glass>
        <Recs recs={r.recommendations} readiness={d?.readiness} />
      </div>
      <section data-testid="question-review">
        <div className="flex flex-wrap items-center gap-2 mb-3"><h3 className="font-bold flex-1">Question review</h3>
          {[["all", "All"], ["wrong", "Incorrect"], ["flagged", "Flagged"]].map(([v, l]) => <button key={v} onClick={() => setFilter(v)} className={`text-xs font-mono px-3 py-1 border ${filter === v ? "border-cyan-400 text-cyan-200 bg-cyan-400/10" : "border-white/10 text-slate-400"}`} data-testid={`review-filter-${v}`}>{l}</button>)}</div>
        <div className="space-y-2">{qs.map(({ q, i }) => <ReviewItem key={q.qid} q={q} i={i} picked={r.answers[q.qid] || []} flagged={r.flags.includes(q.qid)} sc={q.scenario_id ? r.scenarios?.[q.scenario_id] : null} />)}</div>
        {!qs.length && <Empty text="nothing here" />}
      </section>
    </div>);
}
