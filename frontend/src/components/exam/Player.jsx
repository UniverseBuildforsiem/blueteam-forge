import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Flag, ChevronLeft, ChevronRight, Lightbulb, LayoutGrid, Send, Timer, CloudCheck, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { Options, ScenarioPanel, typeLabel } from "./Question";

const pad = (n) => String(n).padStart(2, "0");
const clock = (s) => `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

function useCountdown(a, onZero) {
  const [left, setLeft] = useState(null);
  const fired = useRef(false);
  useEffect(() => {
    if (!a?.deadline) return undefined;
    const skew = new Date(a.server_now) - Date.now();
    const tick = () => { const s = Math.max(0, Math.round((new Date(a.deadline) - (Date.now() + skew)) / 1000)); setLeft(s); if (!s && !fired.current) { fired.current = true; onZero(); } };
    tick(); const i = setInterval(tick, 1000); return () => clearInterval(i);
  }, [a?.deadline]); // eslint-disable-line
  return left;
}

function Navigator({ a, idx, go, answers, flags }) {
  return <div className="grid grid-cols-8 sm:grid-cols-10 lg:grid-cols-5 gap-1" data-testid="question-navigator">{a.questions.map((q, i) => {
    const done = (answers[q.qid] || []).length, fl = flags.includes(q.qid), chk = a.checked?.includes(q.qid);
    return <button key={q.qid} onClick={() => go(i)} data-testid={`nav-q-${i + 1}`}
      className={`h-8 text-[11px] font-mono border relative transition-colors ${i === idx ? "border-cyan-300 bg-cyan-400/20 text-cyan-100" : done ? "border-green-500/40 bg-green-500/10 text-green-200" : "border-white/10 text-slate-500 hover:border-cyan-400/40"}`}>
      {i + 1}{fl && <span className="absolute -top-1 -right-1 h-2 w-2 bg-yellow-400" />}{chk && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-3 bg-green-400" />}</button>;
  })}</div>;
}

function ReviewScreen({ a, answers, flags, go, submit, busy }) {
  const un = a.questions.filter((q) => !(answers[q.qid] || []).length).length;
  return (
    <div className="max-w-3xl mx-auto space-y-5" data-testid="review-screen">
      <div><div className="eyebrow">// review before submitting</div><h2 className="text-2xl font-bold mt-1">Section review</h2>
        <p className="text-sm text-slate-400 mt-1"><span className="text-green-300 font-mono">{a.questions.length - un}</span> answered · <span className="text-red-300 font-mono" data-testid="review-unanswered">{un}</span> unanswered · <span className="text-yellow-300 font-mono">{flags.length}</span> flagged</p></div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">{a.questions.map((q, i) => <button key={q.qid} onClick={() => go(i)} data-testid={`review-q-${i + 1}`}
        className={`h-10 font-mono text-xs border relative ${(answers[q.qid] || []).length ? "border-green-500/40 text-green-200" : "border-red-500/40 text-red-300"}`}>{i + 1}{flags.includes(q.qid) && <Flag className="h-2.5 w-2.5 text-yellow-300 absolute top-0.5 right-0.5" />}</button>)}</div>
      {flags.length > 0 && <button className="ghost-btn !text-xs" onClick={() => go(a.questions.findIndex((q) => q.qid === flags[0]))} data-testid="review-first-flagged"><Flag className="h-3.5 w-3.5" />Review flagged</button>}
      <button className="glow-btn" disabled={busy} onClick={submit} data-testid="exam-submit"><Send className="h-4 w-4" />{busy ? "Submitting…" : `Submit ${a.mode === "practice" ? "practice" : "exam"}`}</button>
    </div>);
}

export default function Player() {
  const { aid } = useParams();
  const nav = useNavigate();
  const [a, setA] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flags, setFlags] = useState([]);
  const [revealed, setRevealed] = useState({});
  const [hints, setHints] = useState({});
  const [review, setReview] = useState(false);
  const [save, setSave] = useState("saved");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/exam-attempts/${aid}`).then(({ data }) => {
      if (data.status === "submitted") return nav(`/app/tests/result/${aid}`, { replace: true });
      setA(data); setAnswers(data.answers || {}); setFlags(data.flags || []); setIdx(Math.min(data.last_index || 0, data.questions.length - 1));
      setRevealed(Object.fromEntries(data.questions.filter((q) => q.correct).map((q) => [q.qid, q])));
      setHints(Object.fromEntries(data.questions.filter((q) => q.hint).map((q) => [q.qid, q.hint])));
    }).catch((e) => { toast.error(errMsg(e)); nav("/app/tests"); });
  }, [aid]); // eslint-disable-line
  const submit = useCallback(async (auto) => {
    setBusy(true);
    try { await api.post(`/exam-attempts/${aid}/submit`); if (auto) toast.warning("Time is up — your exam was submitted automatically"); nav(`/app/tests/result/${aid}`); } catch (e) { toast.error(errMsg(e)); setBusy(false); }
  }, [aid, nav]);
  const left = useCountdown(a, () => submit(true));
  if (!a) return <div className="font-mono text-cyan-400 cursor-blink py-20 text-center">loading secure exam environment </div>;
  const q = a.questions[idx], practice = a.mode === "practice", rev = revealed[q.qid];
  const persist = async (body) => { setSave("saving"); try { const r = await api.put(`/exam-attempts/${aid}/answer`, { qid: q.qid, index: idx, answer: answers[q.qid] || [], ...body }); setSave("saved"); return r.data; } catch (e) { setSave("error"); toast.error(errMsg(e)); return null; } };
  const pick = (v) => { if (rev) return; const lim = q.type === "multi" ? v.slice(-q.choose) : v; setAnswers((x) => ({ ...x, [q.qid]: lim })); persist({ answer: lim }); };
  const flag = () => { const on = !flags.includes(q.qid); setFlags((f) => (on ? [...f, q.qid] : f.filter((x) => x !== q.qid))); persist({ flagged: on }); };
  const check = async () => { const r = await persist({ check: true }); if (r?.question) { setRevealed((x) => ({ ...x, [q.qid]: r.question })); toast[r.question.is_correct ? "success" : "error"](r.question.is_correct ? "Correct" : "Incorrect — read the explanations"); } };
  const hint = async () => { try { const r = await api.post(`/exam-attempts/${aid}/hint/${q.qid}`); setHints((h) => ({ ...h, [q.qid]: r.data.hint })); } catch (e) { toast.error(errMsg(e)); } };
  const go = (i) => { setReview(false); setIdx(i); };
  const low = left != null && left < 300;
  const sc = q.scenario_id ? a.scenarios?.[q.scenario_id] : null;
  return (
    <div className="-m-5 sm:-m-8 min-h-screen bg-[#05070D]" data-testid="exam-player">
      <div className="sticky top-0 z-20 bg-[#070A12]/95 backdrop-blur border-b border-cyan-500/20 px-4 sm:px-6 h-14 flex items-center gap-4">
        <div className="min-w-0 flex-1"><div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">{a.mode} mode · attempt #{a.number}{a.domain ? ` · ${a.domain}` : ""}</div><div className="text-sm font-bold truncate" data-testid="exam-title">{a.exam_title}</div></div>
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-slate-400" data-testid="autosave-status">{save === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudCheck className={`h-3.5 w-3.5 ${save === "error" ? "text-red-400" : "text-green-400"}`} />}{save === "error" ? "not saved" : save}</span>
        {left != null ? <span className={`font-mono text-lg px-3 py-1 border inline-flex items-center gap-2 ${low ? "border-red-500/60 text-red-300 animate-pulse" : "border-cyan-500/30 text-cyan-200"}`} data-testid="exam-timer"><Timer className="h-4 w-4" />{clock(left)}</span>
          : <span className="font-mono text-xs text-slate-500 border border-white/10 px-2 py-1" data-testid="exam-timer">untimed</span>}
        <button className="ghost-btn !text-xs" onClick={() => setReview(true)} data-testid="exam-open-review"><LayoutGrid className="h-3.5 w-3.5" />Review</button>
      </div>
      <div className="grid lg:grid-cols-[1fr_260px] gap-6 p-4 sm:p-6 max-w-[1400px] mx-auto">
        {review ? <ReviewScreen a={a} answers={answers} flags={flags} go={go} submit={() => window.confirm("Submit now? You can't change answers afterwards.") && submit(false)} busy={busy} /> : (
          <div className="space-y-4 min-w-0" data-testid="question-panel">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase">
              <span className="text-cyan-200 text-sm normal-case" data-testid="question-number">Question {idx + 1} of {a.questions.length}</span>
              <span className="text-slate-400 border border-white/10 px-1.5 py-0.5">{typeLabel(q)}</span><span className="text-slate-400 border border-white/10 px-1.5 py-0.5">{q.domain}</span>
              <button onClick={flag} className={`ml-auto inline-flex items-center gap-1 border px-2 py-1 ${flags.includes(q.qid) ? "border-yellow-400 text-yellow-300 bg-yellow-400/10" : "border-white/10 text-slate-400 hover:text-yellow-200"}`} data-testid="question-flag"><Flag className="h-3 w-3" />{flags.includes(q.qid) ? "flagged" : "flag for review"}</button>
            </div>
            <div className={sc ? "grid xl:grid-cols-2 gap-4" : ""}>
              {sc && <ScenarioPanel s={sc} testId="question-scenario" />}
              <div className="space-y-4">
                <p className="text-base leading-relaxed" data-testid="question-stem">{q.stem}</p>
                <Options q={rev || q} picked={answers[q.qid] || []} onPick={pick} reveal={!!rev} disabled={!!rev} />
                {rev && <div className={`text-sm font-mono ${rev.is_correct ? "text-green-400" : "text-red-400"}`} data-testid="question-verdict">{rev.is_correct ? "CORRECT" : "INCORRECT"}{rev.ref_url && <a href={rev.ref_url} className="ml-3 text-cyan-300 underline inline-flex items-center gap-1 text-xs">{rev.ref_label || "Study this"}<ExternalLink className="h-3 w-3" /></a>}</div>}
                {hints[q.qid] && <p className="text-xs text-yellow-200 border-l-2 border-yellow-400 pl-2" data-testid="question-hint-text">{hints[q.qid]}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
              <button className="ghost-btn !text-xs" disabled={!idx} onClick={() => go(idx - 1)} data-testid="question-prev"><ChevronLeft className="h-3.5 w-3.5" />Previous</button>
              {practice && !rev && <button className="glow-btn !text-xs" disabled={!(answers[q.qid] || []).length} onClick={check} data-testid="question-check">Check answer</button>}
              {practice && !hints[q.qid] && !rev && <button className="ghost-btn !text-xs" onClick={hint} data-testid="question-hint"><Lightbulb className="h-3.5 w-3.5" />Hint</button>}
              <span className="flex-1" />
              {idx < a.questions.length - 1 ? <button className="ghost-btn !text-xs" onClick={() => go(idx + 1)} data-testid="question-next">{(answers[q.qid] || []).length ? "Next" : "Skip"}<ChevronRight className="h-3.5 w-3.5" /></button>
                : <button className="glow-btn !text-xs" onClick={() => setReview(true)} data-testid="question-finish">Review & submit</button>}
            </div>
          </div>)}
        <aside className="glass p-3 h-fit lg:sticky lg:top-20 space-y-3"><div className="eyebrow">navigator</div><Navigator a={a} idx={idx} go={go} answers={answers} flags={flags} />
          <div className="text-[10px] font-mono text-slate-500 space-y-0.5"><div><span className="inline-block h-2 w-2 bg-green-500/60 mr-1" />answered</div><div><span className="inline-block h-2 w-2 bg-yellow-400 mr-1" />flagged</div>{!practice && <div className="text-slate-400 pt-1">No feedback until you submit.</div>}</div></aside>
      </div>
    </div>);
}
