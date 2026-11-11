import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { toEmbed } from "../lib/video";

export const VideoFrame = ({ src, title, testId }) => {
  const known = /^https:\/\/(www\.youtube\.com\/embed|player\.vimeo\.com\/video)\//.test(src);
  return <iframe title={title || "Lesson video"} src={src} className="w-full h-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
    allowFullScreen referrerPolicy="strict-origin-when-cross-origin" {...(known ? {} : { sandbox: "allow-scripts allow-same-origin allow-presentation" })} data-testid={testId} />;
};

function useCheck(r) {
  const [check, setCheck] = useState(null);
  useEffect(() => {
    setCheck(null);
    if (!r.watch) return undefined;
    const t = setTimeout(() => { setCheck({ loading: true }); api.get("/builder/video-check", { params: { url: r.watch } }).then((x) => setCheck(x.data)).catch(() => setCheck(null)); }, 500);
    return () => clearTimeout(t);
  }, [r.watch]);
  return check;
}

export function VideoField({ l, upL }) {
  const [raw, setRaw] = useState(l.video_url || "");
  const r = toEmbed(raw);
  const check = useCheck(r);
  const change = (v) => { setRaw(v); const x = toEmbed(v); upL({ ...l, video_url: x.error || x.empty ? "" : x.url }); };
  const warn = r.error || r.warning || (check && check.ok === false && check.reason);
  return (
    <div data-testid="builder-video-field">
      <input className="field text-xs font-mono" placeholder="Paste a Vimeo or YouTube link, or its <iframe> embed code" value={raw} onChange={(e) => change(e.target.value)} data-testid="builder-lesson-video" />
      {!r.empty && !r.error && <div className="text-[11px] font-mono mt-1.5 text-slate-500 break-all" data-testid="builder-video-embed-url">embed: <span className="text-cyan-300">{r.url}</span></div>}
      {warn && <div className={`mt-2 flex items-start gap-2 text-xs p-2.5 border ${r.error || check?.ok === false ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"}`} data-testid="builder-video-warning">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-px" /><span>{warn}{r.error ? " The video won't be saved until this is fixed." : ""}</span></div>}
      {check?.loading && <div className="mt-2 text-[11px] font-mono text-slate-500 inline-flex items-center gap-1.5" data-testid="builder-video-checking"><Loader2 className="h-3 w-3 animate-spin" />checking the video can be embedded...</div>}
      {check?.ok && <div className="mt-2 text-[11px] font-mono text-green-400 inline-flex items-center gap-1.5" data-testid="builder-video-ok"><CheckCircle2 className="h-3.5 w-3.5" />embeddable{check.title ? ` · ${check.title}` : ""}</div>}
      {!r.empty && !r.error && <div className="aspect-video mt-3 border border-cyan-500/20 bg-black/40 max-w-xl" data-testid="builder-video-preview"><VideoFrame src={r.url} title={l.title} testId="builder-video-preview-frame" /></div>}
    </div>);
}
