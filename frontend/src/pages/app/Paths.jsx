import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Circle, PlayCircle, Download, Award, ChevronRight, FileText, Lock, Eye, AlertTriangle } from "lucide-react";
import { TrackedVideo } from "../../components/TrackedVideo";
import { toast } from "sonner";
import { api, API, errMsg } from "../../lib/api";
import { Glass, PageHeader } from "../../components/common";
import { LessonQuiz } from "../../components/LessonQuiz";
import { LessonCtfButton } from "../../components/CtfDialog";
import { VideoFrame } from "../../components/VideoField";
import { embedSrc } from "../../lib/video";
import { PathTabBar, PathSops, PathQuizzes, pathItems, newUnlocks } from "../../components/PathTabs";
import { ProgressMap, UnlockCelebration } from "../../components/academy/ProgressMap";
import { CourseAbout } from "../../components/academy/CourseAbout";
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
  ctf: ["CTF", () => "/app/ctf"], course: ["Course", (a) => a.url], sop: ["SOP", (a) => `/sops/${a.id}`], siem: ["SIEM simulator", () => "/app/siem"], shift: ["Shift simulator", () => "/app/shift"] };

export function LessonBody({ lesson, grade, completed, videoNode }) {
  const video = embedSrc(lesson.video_url);
  return (<>
    <div className="eyebrow mb-2">// lesson · {lesson.minutes} min</div>
    <h2 className="text-2xl font-bold mb-6">{lesson.title || "Untitled lesson"}</h2>
    {video && (videoNode || <div className="aspect-video mb-6 border border-cyan-500/20"><VideoFrame src={video} title={lesson.title} testId="lesson-video" /></div>)}
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

function LessonView({ lesson, p, onComplete, grade, onWatched, onProgress }) {
  const done = p.completed_lessons.includes(lesson.id);
  const quizLock = lesson.quiz?.required && !p.quiz_passed_lessons?.includes(lesson.id);
  const src = embedSrc(lesson.video_url);
  const tracked = p.video_lessons?.includes(lesson.id) && !!src;
  const unavailable = p.unavailable_videos?.includes(lesson.id);
  const watched = p.watched_lessons?.includes(lesson.id);
  const videoNode = tracked ? <TrackedVideo src={src} title={lesson.title} pid={p.id} lid={lesson.id} percent={p.video_percent?.[lesson.id] || 0} watched={watched} resumeAt={p.video_resume?.[lesson.id] || 0} onWatched={onWatched} onProgress={onProgress} /> : null;
  return (
    <Glass className="p-6 sm:p-8" data-testid="lesson-view">
      <LessonBody lesson={lesson} grade={grade} completed={done} videoNode={videoNode} />
      {unavailable && <div className="-mt-3 mb-2 text-[11px] font-mono text-orange-300 inline-flex items-center gap-1.5" data-testid="lesson-video-unavailable"><AlertTriangle className="h-3.5 w-3.5" />This video is private or removed, so watching it isn't required. Please let your instructor know.</div>}
      {done ? <button className="glow-btn mt-8" disabled data-testid="lesson-complete-button"><CheckCircle2 className="h-4 w-4" /> Completed</button>
        : quizLock ? <div className="mt-8 text-xs font-mono text-yellow-300 inline-flex items-center gap-2" data-testid="lesson-complete-locked"><Lock className="h-3.5 w-3.5" />Pass the lesson quiz above to complete this lesson (+10 XP)</div>
        : tracked && !watched ? <div className="mt-8 text-xs font-mono text-yellow-300 inline-flex items-center gap-2" data-testid="lesson-video-locked"><Lock className="h-3.5 w-3.5" />Watch at least 90% of the video to complete this lesson (+10 XP)</div>
        : <button className="glow-btn mt-8" onClick={onComplete} data-testid="lesson-complete-button">Mark as complete (+10 XP)</button>}
    </Glass>
  );
}

export function PathDetail({ course }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [cur, setCur] = useState(null);
  const [tab, setTab] = useState("lessons");
  const [party, setParty] = useState(null);
  const load = () => api.get(course ? `/academy/courses/${id}` : `/paths/${id}`).then((r) => { setP(r.data); setCur((c) => c || r.data.modules[0]?.lessons[0]); return r.data; })
    .catch((e) => { if (course) { toast.error(errMsg(e)); nav(`/course/${id}`, { replace: true }); } });
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  if (!p) return null;
  const complete = async () => {
    try {
      const { data } = await api.post(`/paths/${id}/lessons/${cur.id}/complete`);
      toast.success(data.certificate && !p.certificate ? "Course complete — certificate issued!" : "+10 XP · lesson complete");
      const next = await load(), items = newUnlocks(p, next);
      if (items.length) setParty({ lesson: cur.title, items });
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div>
      <PathTabBar p={p} tab={tab} setTab={setTab} />
      {tab === "map" && <ProgressMap p={p} open={(l) => { setCur(l); setTab("lessons"); window.scrollTo({ top: 0 }); }} goTab={setTab} />}
      <UnlockCelebration party={party} onClose={() => setParty(null)} goTab={(t) => { setParty(null); setTab(t); window.scrollTo({ top: 0 }); }} />
      {tab === "quizzes" && <PathQuizzes p={p} />}
      {tab === "sops" && <PathSops p={p} />}
      {tab === "ctf" && <CTF key={p.completed_lessons.length} only={pathItems(p, "ctf")} />}
      {tab === "intel" && <ThreatIntel embedded />}
      {tab === "lessons" && <>
      <CourseAbout p={p} />
      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <div className="space-y-4">
          {p.modules.map((m, mi) => (
            <Glass key={m.id} className="p-4">
              <div className="font-mono text-xs text-slate-500 mb-2">MODULE {mi + 1}</div>
              <div className="font-bold mb-3">{m.title}</div>
              {m.lessons.map((l) => {
                const d = p.completed_lessons.includes(l.id);
                const vid = p.video_lessons?.includes(l.id);
                const seen = p.watched_lessons?.includes(l.id);
                const vp = p.video_percent?.[l.id];
                return (
                  <button key={l.id} onClick={() => setCur(l)} data-testid={`lesson-item-${l.id}`}
                    className={`w-full flex items-center gap-2 text-left text-sm px-2 py-2 rounded-sm transition-colors ${cur?.id === l.id ? "bg-cyan-500/10 text-cyan-200" : "text-slate-300 hover:bg-white/5"}`}>
                    {d ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : l.video_url ? <PlayCircle className="h-4 w-4 text-slate-500 shrink-0" /> : <Circle className="h-4 w-4 text-slate-600 shrink-0" />}
                    <span className="truncate flex-1">{l.title}</span>
                    {vid && <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-mono ${seen ? "text-green-400" : vp ? "text-cyan-400" : "text-slate-600"}`} title={seen ? "Video watched" : "Video not watched yet"} data-testid={`lesson-video-status-${l.id}`}>
                      <Eye className="h-3.5 w-3.5" />{!seen && vp ? `${vp}%` : ""}</span>}
                  </button>);
              })}
            </Glass>
          ))}
          <Glass className="p-4">
            <div className="font-bold mb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-orange-300" />Final exam</div>
            {course && <Link to={`/course/${id}`} className="text-[11px] font-mono text-slate-400 hover:text-cyan-300 block mb-2" data-testid="course-landing-link">Course page & reviews →</Link>}
            {p.final_quiz && !p.modules.every((m) => m.lessons.every((l) => p.completed_lessons.includes(l.id))) ? <div className="ghost-btn w-full justify-between opacity-60 cursor-not-allowed" aria-disabled="true" data-testid="path-final-exam-locked">{p.final_quiz.title}<Lock className="h-4 w-4" /></div>
              : p.final_quiz ? <Link to={`/app/quizzes/${p.final_quiz.id}`} className="ghost-btn w-full justify-between" data-testid="path-final-exam-button">{p.final_quiz.title}<ChevronRight className="h-4 w-4" /></Link> : <div className="text-xs text-slate-500">No exam configured</div>}
            {p.certificate && course && <Link to={`/app/courses/certificate/${p.certificate.id}`} className="glow-btn w-full justify-center mt-3" data-testid="course-certificate-button"><Award className="h-4 w-4" />Certificate · share</Link>}
            {course && !p.final_quiz && !p.certificate && <div className="text-[11px] font-mono text-slate-500 mt-2">Complete every lesson to earn your certificate.</div>}
            {p.certificate && !course && <a href={`${API}/public/certificates/${p.certificate.id}/pdf`} target="_blank" rel="noreferrer" className="glow-btn w-full justify-center mt-3" data-testid="path-certificate-button"><Award className="h-4 w-4" />Certificate</a>}
          </Glass>
        </div>
        {cur && <LessonView key={cur.id} lesson={cur} p={p} onComplete={complete} onWatched={() => { toast.success("Video watched — you can complete this lesson"); load(); }}
          onProgress={(d) => { const lid = cur.id; const pos = d.position ?? 0; setP((x) => ({ ...x, video_percent: { ...x.video_percent, [lid]: d.percent },
            video_resume: { ...x.video_resume, [lid]: !d.watched && pos >= 3 && pos < d.dur - 5 ? pos : 0 } })); }}
          grade={async (answers) => { const { data } = await api.post(`/paths/${id}/lessons/${cur.id}/quiz`, { answers }); if (data.passed) load(); return data; }} />}
      </div></>}
    </div>
  );
}
