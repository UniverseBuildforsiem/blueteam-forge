import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Timer, Lock, Send, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2, Mic } from "lucide-react";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, PageHeader } from "../../components/common";

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function Intro({ meta, onStart, busy, onView }) {
  return (
    <Glass className="p-8" data-testid="interview-intro">
      <div className="grid sm:grid-cols-3 gap-4 font-mono text-center">
        {[[meta.count, "questions"], [`${meta.minutes} min`, "time limit"], [`${meta.pass_mark}%`, "to pass"]].map(([v, l]) => (
          <div key={l} className="border border-white/10 p-4"><div className="text-3xl font-bold neon-green">{v}</div><div className="text-xs text-slate-500 mt-1">{l}</div></div>))}
      </div>
      <p className="text-sm text-slate-400 mt-6">Questions are picked at random from {meta.pool} real interview questions in the ebook. Type your answers as you would say them in an interview. AI marks each answer out of 10 against the book's answer and tells you what you missed. Your answers save as you go, and the interview submits itself when the timer hits zero.</p>
      <button className="glow-btn mt-6" onClick={onStart} disabled={busy} data-testid="interview-start">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}Start mock interview</button>
      {meta.history.length > 0 && <div className="mt-8" data-testid="interview-history">
        <div className="eyebrow mb-3">// past interviews</div>
        {meta.history.map((h) => (
          <div key={h.id} className="flex items-center gap-3 py-2 border-b border-white/5 text-sm font-mono" data-testid={`interview-history-${h.id}`}>
            <span className="text-slate-500 w-44">{fmtDate(h.started_at)}</span>
            <span className="flex-1">{h.status === "graded" ? `${h.score}% · ${h.passed ? "passed" : "not passed"}` : h.status}</span>
            {h.status === "graded" && <button onClick={() => onView(h.id)} className="text-cyan-300 hover:underline" data-testid={`interview-review-${h.id}`}>review</button>}
          </div>))}
      </div>}
    </Glass>
  );
}

function Session({ s, onSubmitted }) {
  const [i, setI] = useState(0);
  const [ans, setAns] = useState(s.answers || {});
  const [left, setLeft] = useState(Math.max(0, Math.floor((new Date(s.expires_at) - Date.now()) / 1000)));
  const ansRef = useRef(ans);
  ansRef.current = ans;
  const sent = useRef(false);
  const submit = async () => {
    if (sent.current) return;
    sent.current = true;
    try { await api.post(`/mock-interview/${s.id}/submit`, { answers: ansRef.current }); onSubmitted(); } catch (e) { sent.current = false; toast.error(errMsg(e)); }
  };
  useEffect(() => {
    const t = setInterval(() => setLeft((l) => { if (l <= 1) { clearInterval(t); submit(); return 0; } return l - 1; }), 1000);
    const save = setInterval(() => api.put(`/mock-interview/${s.id}/draft`, { answers: ansRef.current }).catch(() => {}), 15000);
    return () => { clearInterval(t); clearInterval(save); };
  }, []); // eslint-disable-line
  const q = s.questions[i];
  const done = s.questions.filter((x) => (ans[x.id] || "").trim()).length;
  return (
    <div data-testid="interview-session">
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className={`flex items-center gap-2 font-mono text-2xl font-bold ${left < 300 ? "text-red-400" : "text-cyan-300"}`} data-testid="interview-timer"><Timer className="h-5 w-5" />{mmss(left)}</div>
        <span className="text-sm font-mono text-slate-400" data-testid="interview-answered">{done}/{s.questions.length} answered</span>
        <button className="glow-btn ml-auto" onClick={() => window.confirm(`Submit now? ${s.questions.length - done} questions are blank.`) && submit()} data-testid="interview-submit"><Send className="h-4 w-4" />Submit interview</button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4" data-testid="interview-nav">
        {s.questions.map((x, k) => (
          <button key={x.id} onClick={() => setI(k)} data-testid={`interview-jump-${k + 1}`}
            className={`h-8 w-8 text-xs font-mono border ${k === i ? "border-cyan-400 bg-cyan-400/20" : (ans[x.id] || "").trim() ? "border-green-500/50 text-green-300" : "border-white/10 text-slate-500"}`}>{k + 1}</button>))}
      </div>
      <Glass className="p-6">
        <div className="text-xs font-mono text-slate-500">QUESTION {i + 1} OF {s.questions.length} · {q.topic}</div>
        <h3 className="text-lg font-bold mt-2" data-testid="interview-question">{q.q}</h3>
        <textarea className="field mt-4 min-h-[220px]" placeholder="Type your answer as you'd say it to the interviewer…" value={ans[q.id] || ""}
          onChange={(e) => setAns({ ...ans, [q.id]: e.target.value })} data-testid="interview-answer" />
        <div className="flex justify-between mt-4">
          <button className="ghost-btn" disabled={i === 0} onClick={() => setI(i - 1)} data-testid="interview-prev"><ChevronLeft className="h-4 w-4" />Previous</button>
          <button className="ghost-btn" disabled={i === s.questions.length - 1} onClick={() => setI(i + 1)} data-testid="interview-next">Next<ChevronRight className="h-4 w-4" /></button>
        </div>
      </Glass>
    </div>
  );
}

function Results({ s, onAgain }) {
  return (
    <div data-testid="interview-results">
      <Glass className={`p-6 mb-5 flex flex-wrap items-center gap-6 border ${s.passed ? "!border-green-400/50" : "!border-orange-400/50"}`}>
        <div className={`text-5xl font-extrabold font-mono ${s.passed ? "neon-green" : "text-orange-300"}`} data-testid="interview-score">{s.score}%</div>
        <div className="flex-1"><div className="font-bold text-lg" data-testid="interview-verdict">{s.passed ? "Interview passed" : "Not passed yet"}</div>
          <p className="text-sm text-slate-400">Pass mark {s.pass_mark}%.{s.timed_out ? " Time ran out, so the interview submitted itself." : ""} Read the feedback, then try a fresh set of questions.</p></div>
        <button className="glow-btn" onClick={onAgain} data-testid="interview-again">New interview</button>
      </Glass>
      <div className="space-y-3">
        {s.questions.map((q, k) => {
          const r = s.results[q.id] || { score: 0, feedback: "" };
          return (
            <Glass key={q.id} className="p-5" data-testid={`interview-result-${k + 1}`}>
              <div className="flex items-start gap-3">
                {r.score >= 7 ? <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" /> : <XCircle className="h-5 w-5 text-orange-300 shrink-0" />}
                <div className="flex-1"><div className="font-bold">{k + 1}. {q.q}</div>
                  <p className="text-sm text-slate-300 mt-2"><span className="text-slate-500 font-mono text-xs">YOUR ANSWER · </span>{s.answers[q.id] || "(blank)"}</p>
                  <p className="text-sm text-cyan-200 mt-2"><span className="text-slate-500 font-mono text-xs">FEEDBACK · </span>{r.feedback}</p>
                  <details className="mt-2 text-sm text-slate-400"><summary className="cursor-pointer text-xs font-mono text-green-300">Book answer</summary><p className="mt-1">{q.reference}</p></details></div>
                <span className="font-mono font-bold" data-testid={`interview-result-score-${k + 1}`}>{r.score}/10</span>
              </div>
            </Glass>);
        })}
      </div>
    </div>
  );
}

export default function MockInterview() {
  const [meta, setMeta] = useState(null);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/mock-interview/history").then((r) => setMeta(r.data));
  const poll = (id) => api.get(`/mock-interview/${id}`).then((r) => { setS(r.data); if (r.data.status === "grading") setTimeout(() => poll(id), 4000); if (r.data.status === "error") toast.error("Marking failed. Press Retry marking."); });
  useEffect(() => { load(); const v = new URLSearchParams(window.location.search).get("view"); if (v) poll(v); }, []);
  const start = async () => { setBusy(true); try { const { data } = await api.post("/mock-interview/start"); setS(data); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  if (!meta) return <div className="font-mono text-cyan-400 cursor-blink">loading </div>;
  return (
    <div>
      <PageHeader eyebrow="// mock interview · ai marked" title="Mock SOC interview" sub="Timed interview practice built from the SOC Interview Preparation ebook." />
      {!meta.owned ? (
        <Glass className="p-8 flex flex-wrap items-center gap-6" data-testid="interview-locked">
          <img src="/book/cover.jpg" alt="SOC Interview ebook" className="h-32 w-auto shadow-lg" />
          <div className="flex-1 min-w-[220px]"><div className="flex items-center gap-2 font-bold"><Lock className="h-4 w-4" />Included with the ebook</div>
            <p className="text-sm text-slate-400 mt-2">Buy the SOC Interview Preparation ebook to unlock unlimited 30-question AI-marked mock interviews.</p></div>
          <Link to="/book" className="glow-btn" data-testid="interview-get-book">Get the ebook</Link>
        </Glass>
      ) : !s ? <Intro meta={meta} onStart={start} busy={busy} onView={poll} />
        : s.status === "in_progress" ? <Session s={s} onSubmitted={() => { setS({ ...s, status: "grading" }); poll(s.id); }} />
        : s.status === "graded" ? <Results s={s} onAgain={() => { setS(null); load(); }} />
        : <Glass className="p-10 text-center" data-testid="interview-grading">
            {s.status === "error" ? <button className="glow-btn" onClick={() => api.post(`/mock-interview/${s.id}/submit`, { answers: {} }).then(() => poll(s.id))} data-testid="interview-retry">Retry marking</button>
              : <><Loader2 className="h-8 w-8 animate-spin mx-auto text-cyan-400" /><p className="mt-4 font-mono text-sm text-slate-400">Your interviewer is marking 30 answers. This takes about a minute…</p></>}
          </Glass>}
    </div>
  );
}
