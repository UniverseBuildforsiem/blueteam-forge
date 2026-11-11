import { useEffect, useRef, useState } from "react";
import Player from "@vimeo/player";
import { Eye, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";

let ytReady;
const loadYT = () => ytReady || (ytReady = new Promise((res) => {
  if (window.YT?.Player) return res(window.YT);
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
  const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
}));

const withJsApi = (src) => { const u = new URL(src); u.searchParams.set("enablejsapi", "1"); u.searchParams.set("origin", window.location.origin); return u.toString(); };

function useTracker(pid, lid, onUpdate) {
  const s = useRef({ last: null, pending: [], dur: 0, busy: false });
  const flush = async () => {
    const t = s.current;
    if (!t.pending.length || !t.dur || t.busy) return;
    const segments = t.pending.splice(0);
    t.busy = true;
    try { const { data } = await api.post(`/paths/${pid}/lessons/${lid}/video`, { duration: t.dur, segments }); onUpdate(data); } catch { /* retry on next flush */ }
    t.busy = false;
  };
  const tick = (time, dur) => {
    const t = s.current;
    if (dur) t.dur = dur;
    if (t.last !== null && time > t.last && time - t.last <= 3.5) {
      const p = t.pending[t.pending.length - 1];
      if (p && Math.abs(p[1] - t.last) < 0.01) p[1] = time; else t.pending.push([t.last, time]);
    }
    t.last = time;
  };
  const jump = (time) => { s.current.last = time; };
  return { tick, jump, flush };
}

export function TrackedVideo({ src, title, pid, lid, percent: initial = 0, watched: initWatched, onWatched }) {
  const ref = useRef(null);
  const [pct, setPct] = useState(initial);
  const [watched, setWatched] = useState(!!initWatched);
  const youtube = src.includes("youtube.com/embed/");
  const tr = useTracker(pid, lid, (d) => { setPct(d.percent); setWatched(d.watched); if (d.newly) onWatched?.(); });
  useEffect(() => {
    let alive = true;
    let cleanup = () => {};
    const every = setInterval(tr.flush, 10000);
    if (youtube) {
      loadYT().then((YT) => {
        if (!alive) return;
        const pl = new YT.Player(ref.current, { events: { onStateChange: (e) => { if (e.data !== 1) { tr.tick(pl.getCurrentTime(), pl.getDuration()); tr.flush(); } } } });
        const poll = setInterval(() => { if (pl.getPlayerState?.() === 1) tr.tick(pl.getCurrentTime(), pl.getDuration()); }, 1000);
        cleanup = () => { clearInterval(poll); };
      });
    } else {
      const pl = new Player(ref.current);
      pl.on("timeupdate", (d) => tr.tick(d.seconds, d.duration));
      pl.on("seeked", (d) => tr.jump(d.seconds));
      pl.on("pause", tr.flush);
      pl.on("ended", tr.flush);
      cleanup = () => pl.off("timeupdate");
    }
    return () => { alive = false; clearInterval(every); cleanup(); tr.flush(); };
  }, [src]); // eslint-disable-line
  return (<div className="mb-6">
    <div className="aspect-video border border-cyan-500/20">
      <iframe ref={ref} title={title || "Lesson video"} src={youtube ? withJsApi(src) : src} className="w-full h-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
        allowFullScreen referrerPolicy="strict-origin-when-cross-origin" data-testid="lesson-video" />
    </div>
    <div className="flex items-center gap-3 mt-2 text-[11px] font-mono" data-testid="video-progress">
      {watched ? <span className="text-green-400 inline-flex items-center gap-1.5" data-testid="video-watched"><CheckCircle2 className="h-3.5 w-3.5" />video watched</span>
        : <span className="text-slate-400 inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" />watched <span className="text-cyan-300" data-testid="video-percent">{pct}%</span> · 90% needed</span>}
      <div className="flex-1 h-1 bg-white/5 max-w-xs"><div className={`h-full ${watched ? "bg-green-400" : "bg-cyan-400"} transition-[width] duration-500`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
    </div>
  </div>);
}
