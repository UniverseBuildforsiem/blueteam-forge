import { useEffect, useRef, useState } from "react";
import Player from "@vimeo/player";
import { Eye, CheckCircle2, RotateCcw } from "lucide-react";
import { api } from "../lib/api";

let ytReady;
const loadYT = () => ytReady || (ytReady = new Promise((res) => {
  if (window.YT?.Player) return res(window.YT);
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
  const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
}));

const ytSrc = (src, at) => { const u = new URL(src); u.searchParams.set("enablejsapi", "1"); u.searchParams.set("origin", window.location.origin); if (at) u.searchParams.set("start", Math.floor(at)); return u.toString(); };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const merge = (xs) => [...xs].sort((a, b) => a[0] - b[0]).reduce((o, [a, b]) => { const l = o[o.length - 1]; if (l && a <= l[1] + 1) l[1] = Math.max(l[1], b); else o.push([a, b]); return o; }, []);
const covered = (xs) => merge(xs).reduce((n, [a, b]) => n + (b - a), 0);

function useTracker(pid, lid, onUpdate) {
  const s = useRef({ last: null, pending: [], dur: 0, busy: false, pos: null, sentPos: null });
  const flush = async () => {
    const t = s.current;
    const posChanged = t.pos !== null && t.pos !== t.sentPos;
    if ((!t.pending.length && !posChanged) || !t.dur || t.busy) return;
    const segments = t.pending.splice(0).map((x) => [...x]);
    const position = t.pos;
    t.busy = true;
    try { const { data } = await api.post(`/paths/${pid}/lessons/${lid}/video`, { duration: t.dur, segments, ...(position !== null ? { position } : {}) }); t.sentPos = position; onUpdate({ ...data, position, dur: t.dur }); } catch { t.pending.unshift(...segments); }
    t.busy = false;
  };
  const tick = (time, dur) => {
    const t = s.current;
    if (dur) t.dur = dur;
    t.pos = Math.round(time * 10) / 10;
    if (t.last !== null && time > t.last && time - t.last <= 3.5) {
      const p = t.pending[t.pending.length - 1];
      if (p && Math.abs(p[1] - t.last) < 0.01) p[1] = time; else t.pending.push([t.last, time]);
    }
    t.last = time;
  };
  const jump = (time) => { s.current.last = time; s.current.pos = time; };
  return { tick, jump, flush, pending: () => s.current.pending, playerDur: () => s.current.dur };
}

function ProgressRow({ watched, pct, secs, total, resumed, restart }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] font-mono" data-testid="video-progress">
      {watched ? <span className="text-green-400 inline-flex items-center gap-1.5" data-testid="video-watched"><CheckCircle2 className="h-3.5 w-3.5" />video watched</span>
        : <span className="text-slate-400 inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" />watched <span className="text-cyan-300" data-testid="video-watch-time">{clock(secs)}{total ? ` of ${clock(total)}` : ""}</span> · <span className="text-cyan-300" data-testid="video-percent">{pct}%</span> · 90% needed</span>}
      <div className="flex-1 min-w-[80px] h-1 bg-white/5 max-w-xs"><div className={`h-full ${watched ? "bg-green-400" : "bg-cyan-400"} transition-[width] duration-500`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
      {resumed > 0 && <span className="text-slate-500 inline-flex items-center gap-2" data-testid="video-resumed">resumed from {clock(resumed)}
        <button type="button" onClick={restart} className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="video-start-over"><RotateCcw className="h-3 w-3" />Start over</button></span>}
    </div>);
}

export function TrackedVideo({ src, title, pid, lid, percent: initial = 0, spans: initSpans, duration: initDur, watched: initWatched, resumeAt = 0, onWatched, onProgress }) {
  const ref = useRef(null);
  const player = useRef(null);
  const [start] = useState(initWatched ? 0 : resumeAt);
  const [resumed, setResumed] = useState(initWatched ? 0 : resumeAt);
  const [pct, setPct] = useState(initial);
  const [watched, setWatched] = useState(!!initWatched);
  const server = useRef({ spans: initSpans || [], dur: initDur || 0, pct: initial });
  const [secs, setSecs] = useState(covered(initSpans || []));
  const [total, setTotal] = useState(initDur || 0);
  const [failed, setFailed] = useState(false);
  const youtube = src.includes("youtube.com/embed/");
  const tr = useTracker(pid, lid, (d) => {
    if (!alive.current) { onProgress?.(d); if (d.newly) onWatched?.(); return; }
    if (d.spans) server.current = { spans: d.spans, dur: d.duration, pct: 0 };
    setWatched(d.watched); onProgress?.(d); if (d.newly) onWatched?.(); live(d.percent);
  });
  const live = (floor = 0) => {
    const dur = server.current.dur || tr.playerDur();
    if (!dur) return;
    const s = Math.min(dur, covered([...server.current.spans, ...tr.pending()]));
    setSecs(s); setTotal(dur); if (floor) server.current.pct = floor;
    setPct(Math.max(server.current.pct || 0, Math.min(100, Math.round((100 * s) / dur))));
  };
  const tick = (time, dur) => { tr.tick(time, dur); live(); };
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const restart = () => { const pl = player.current; if (!pl) return; tr.jump(0); if (youtube) pl.seekTo(0, true); else pl.setCurrentTime(0); setResumed(0); };
  useEffect(() => {
    let alive = true;
    let cleanup = () => {};
    const every = setInterval(tr.flush, 5000);
    const hide = () => document.visibilityState === "hidden" && tr.flush();
    document.addEventListener("visibilitychange", hide);
    if (youtube) {
      loadYT().then((YT) => {
        if (!alive) return;
        const pl = new YT.Player(ref.current, { events: { onError: () => setFailed(true), onStateChange: (e) => { if (e.data !== 1) { tick(pl.getCurrentTime(), pl.getDuration()); tr.flush(); } } } });
        player.current = pl;
        const poll = setInterval(() => { if (pl.getPlayerState?.() === 1) tick(pl.getCurrentTime(), pl.getDuration()); }, 1000);
        cleanup = () => { clearInterval(poll); };
      });
    } else {
      const pl = new Player(ref.current);
      player.current = pl;
      if (start) { tr.jump(start); pl.ready().then(() => pl.setCurrentTime(start)).catch(() => {}); }
      pl.on("timeupdate", (d) => tick(d.seconds, d.duration));
      pl.on("seeked", (d) => tr.jump(d.seconds));
      pl.on("pause", tr.flush);
      pl.on("ended", tr.flush);
      pl.on("error", () => setFailed(true));
      pl.ready().catch(() => setFailed(true));
      cleanup = () => pl.off("timeupdate");
    }
    return () => { alive = false; clearInterval(every); document.removeEventListener("visibilitychange", hide); cleanup(); tr.flush(); };
  }, [src]); // eslint-disable-line
  return (<div className="mb-6">
    <div className="aspect-video border border-cyan-500/20">
      <iframe ref={ref} title={title || "Lesson video"} src={youtube ? ytSrc(src, start) : src} className="w-full h-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
        allowFullScreen referrerPolicy="strict-origin-when-cross-origin" data-testid="lesson-video" />
    </div>
    {failed && !watched && <div className="mt-2 text-[11px] font-mono text-orange-300" data-testid="video-error">This video won't play here. Please let your instructor know so they can fix the link.</div>}
    <ProgressRow watched={watched} pct={pct} secs={secs} total={total} resumed={resumed} restart={restart} />
  </div>);
}
