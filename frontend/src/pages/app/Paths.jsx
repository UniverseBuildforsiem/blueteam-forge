import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Circle, PlayCircle, Download, Award, ChevronRight, FileText, Lock } from "lucide-react";
import { toast } from "sonner";
import { api, API, errMsg } from "../../lib/api";
import { Glass, PageHeader } from "../../components/common";
import { LessonQuiz } from "../../components/LessonQuiz";
import { LessonCtfButton } from "../../components/CtfDialog";
import { VideoFrame } from "../../components/VideoField";
import { embedSrc } from "../../lib/video";
import { PathTabBar, PathSops } from "../../components/PathTabs";
import { Quizzes } from "./Quizzes";
import CTF from "./CTF";
import ThreatIntel from "../ThreatIntel";

export function Paths() {
  const [paths, setPaths] = useState([]);
  useEffect(() => { api.get("/paths").then((r) => setPaths(r.data)); }, []);
  return (
    <div>
      <PageHeader eyebrow="// learning paths" title="Choose your track" sub="Each path ends with a final exam. Pass at 70% after completing every lesson to earn a verifiable certificate." />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {paths.map((p) => (
          <Link to={`/app/paths/${p.id}`} key={p.id} data-testid={`path-card-${p.id}`} className="glass rounded-sm p-6 hover:border-cyan-400/50 transition-colors group">
            <div className="flex justify-between text-xs font-mono"><span className="text-green-400">{p.level}</span><span className="text-slate-500">{p.completed}/{p.lesson_count} lessons</span></div>
            <h3 className="text-lg font-bold mt-3 group-hover:text-cyan-300 transition-colors">{p.title}</h3>
            <p className="text-sm text-slate-400 mt-2 line-clamp-3">{p.description}</p>
            <div className="mt-5 h-1.5 bg-white/5"><div className="h-1.5 bg-cyan-400" style={{ width: `${p.percent}%` }} /></div>
            <div className="text-xs font-mono text-slate-400 mt-2">{p.percent}% complete</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const ATTACH = { quiz: ["Quiz", (a) => `/app/quizzes/${a.id}`], lab: ["Lab", (a) => `/app/labs/${a.id}`], challenge: ["SOC challenge", (a) => `/app/challenges?case=${a.id}`],
  ctf: ["CTF", () => "/app/ctf"], course: ["Course", (a) => a.url], sop: ["SOP", (a) => `/sops/${a.id}`] };

export function LessonBody({ lesson, grade, completed }) {
  const video = embedSrc(lesson.video_url);
  return (<>
    <div className="eyebrow mb-2">// lesson · {lesson.minutes} min</div>
    <h2 className="text-2xl font-bold mb-6">{lesson.title || "Untitled lesson"}</h2>
    {video && <div className="aspect-video mb-6 border border-cyan-500/20"><VideoFrame src={video} title={lesson.title} testId="lesson-video" /></div>}
    <div className="text-slate-300 whitespace-pre-line leading-relaxed text-[15px]">{lesson.content}</div>
    <LessonQuiz key={lesson.id} quiz={lesson.quiz} grade={grade} completed={completed} />
    {lesson.attachments?.length > 0 && <div className="mt-8" data-testid="lesson-practice"><div className="eyebrow mb-3">practice this lesson</div>
      <div className="grid sm:grid-cols-2 gap-2">{lesson.attachments.map((a) => { const [label, to] = ATTACH[a.type] || ["Item", () => "#"]; const href = to(a); const ext = /^https?:/.test(href || "");
        const cls = "glass rounded-sm p-3 hover:border-cyan-400/50 transition-colors flex items-center gap-3 text-left w-full";
        const inner = <><span className="text-[10px] font-mono uppercase text-green-400 border border-green-500/30 px-1.5 py-0.5">{label}</span><span className="text-sm truncate">{a.title}</span><ChevronRight className="h-4 w-4 ml-auto text-slate-500" /></>;
        if (a.type === "ctf") return <LessonCtfButton key={`ctf-${a.id}`} a={a} className={cls}>{inner}</LessonCtfButton>;
        return <a key={`${a.type}-${a.id}`} href={href} {...(ext ? { target: "_blank", rel: "noreferrer" } : {})} className={cls} data-testid={`lesson-attachment-${a.type}-${a.id}`}>{inner}</a>; })}</div></div>}
    {lesson.resources?.filter((r) => r.url).length > 0 && <div className="mt-8"><div className="eyebrow mb-3">resources</div>
      {lesson.resources.filter((r) => r.url).map((r) => <a key={r.name + r.url} href={r.url.startsWith("/api") ? `${process.env.REACT_APP_BACKEND_URL}${r.url}` : r.url} target="_blank" rel="noreferrer" className="ghost-btn mr-2 mb-2 !text-xs" data-testid="lesson-resource-link"><Download className="h-3.5 w-3.5" />{r.name || "Resource"}</a>)}</div>}
  </>);
}

function LessonView({ lesson, done, onComplete, grade }) {
  const req = lesson.quiz?.required;
  return (
    <Glass className="p-6 sm:p-8" data-testid="lesson-view">
      <LessonBody lesson={lesson} grade={grade} completed={done} />
      {req && !done ? <div className="mt-8 text-xs font-mono text-yellow-300 inline-flex items-center gap-2" data-testid="lesson-complete-locked"><Lock className="h-3.5 w-3.5" />Pass the lesson quiz above to complete this lesson (+10 XP)</div>
        : <button className="glow-btn mt-8" disabled={done} onClick={onComplete} data-testid="lesson-complete-button">{done ? <><CheckCircle2 className="h-4 w-4" /> Completed</> : "Mark as complete (+10 XP)"}</button>}
    </Glass>
  );
}

export function PathDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [cur, setCur] = useState(null);
  const [tab, setTab] = useState("lessons");
  const load = () => api.get(`/paths/${id}`).then((r) => { setP(r.data); setCur((c) => c || r.data.modules[0]?.lessons[0]); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  if (!p) return null;
  const complete = async () => {
    try { await api.post(`/paths/${id}/lessons/${cur.id}/complete`); toast.success("+10 XP · lesson complete"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div>
      <PathTabBar p={p} tab={tab} setTab={setTab} />
      {tab === "quizzes" && <Quizzes inPath={new Set([p.final_quiz?.id, ...p.modules.flatMap((m) => m.lessons.flatMap((l) => (l.attachments || []).filter((a) => a.type === "quiz").map((a) => a.id)))].filter(Boolean))} />}
      {tab === "sops" && <PathSops p={p} />}
      {tab === "ctf" && <CTF />}
      {tab === "intel" && <ThreatIntel embedded />}
      {tab === "lessons" && <>
      <p className="text-sm text-slate-400 mb-6 max-w-3xl">{p.description}</p>
      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <div className="space-y-4">
          {p.modules.map((m, mi) => (
            <Glass key={m.id} className="p-4">
              <div className="font-mono text-xs text-slate-500 mb-2">MODULE {mi + 1}</div>
              <div className="font-bold mb-3">{m.title}</div>
              {m.lessons.map((l) => {
                const d = p.completed_lessons.includes(l.id);
                return (
                  <button key={l.id} onClick={() => setCur(l)} data-testid={`lesson-item-${l.id}`}
                    className={`w-full flex items-center gap-2 text-left text-sm px-2 py-2 rounded-sm transition-colors ${cur?.id === l.id ? "bg-cyan-500/10 text-cyan-200" : "text-slate-300 hover:bg-white/5"}`}>
                    {d ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : l.video_url ? <PlayCircle className="h-4 w-4 text-slate-500 shrink-0" /> : <Circle className="h-4 w-4 text-slate-600 shrink-0" />}
                    <span className="truncate">{l.title}</span>
                  </button>);
              })}
            </Glass>
          ))}
          <Glass className="p-4">
            <div className="font-bold mb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-orange-300" />Final exam</div>
            {p.final_quiz ? <Link to={`/app/quizzes/${p.final_quiz.id}`} className="ghost-btn w-full justify-between" data-testid="path-final-exam-button">{p.final_quiz.title}<ChevronRight className="h-4 w-4" /></Link> : <div className="text-xs text-slate-500">No exam configured</div>}
            {p.certificate && <a href={`${API}/public/certificates/${p.certificate.id}/pdf`} target="_blank" rel="noreferrer" className="glow-btn w-full justify-center mt-3" data-testid="path-certificate-button"><Award className="h-4 w-4" />Certificate</a>}
          </Glass>
        </div>
        {cur && <LessonView key={cur.id} lesson={cur} done={p.completed_lessons.includes(cur.id)} onComplete={complete}
          grade={async (answers) => { const { data } = await api.post(`/paths/${id}/lessons/${cur.id}/quiz`, { answers }); if (data.passed) load(); return data; }} />}
      </div></>}
    </div>
  );
}
