import { useState } from "react";
import { ChevronDown, PlayCircle, FileText, ListChecks, Terminal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { VideoFrame } from "../VideoField";
import { embedSrc } from "../../lib/video";

const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

export function Curriculum({ c, onPreview }) {
  const [open, setOpen] = useState(() => new Set(c.modules.slice(0, 1).map((m) => m.id)));
  const all = open.size === c.modules.length;
  const tog = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <section data-testid="course-curriculum">
      <h2 className="text-xl font-bold mb-2">Course content</h2>
      <div className="flex items-center text-xs font-mono text-slate-400 mb-3"><span className="flex-1">{c.modules_count} sections · {c.lessons_count} lessons · {hm(c.minutes)} total length</span>
        <button className="text-cyan-300 hover:text-cyan-200" onClick={() => setOpen(all ? new Set() : new Set(c.modules.map((m) => m.id)))} data-testid="curriculum-toggle-all">{all ? "Collapse all" : "Expand all"} sections</button></div>
      <div className="border border-white/10 divide-y divide-white/10">{c.modules.map((m, mi) => (
        <div key={m.id}>
          <button onClick={() => tog(m.id)} className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] text-left transition-colors" data-testid={`curriculum-section-${mi}`}>
            <ChevronDown className={`h-4 w-4 text-cyan-400 transition-transform ${open.has(m.id) ? "rotate-180" : ""}`} />
            <span className="font-bold text-sm flex-1">{m.title}</span>
            <span className="text-[11px] font-mono text-slate-400">{m.lessons.length} lessons · {hm(m.lessons.reduce((n, l) => n + l.minutes, 0))}</span></button>
          {open.has(m.id) && <div className="py-1">{m.lessons.map((l) => { const I = l.video ? PlayCircle : l.quiz ? ListChecks : l.practice ? Terminal : FileText;
            return <div key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm text-slate-300" data-testid={`curriculum-lesson-${l.id}`}>
              <I className="h-4 w-4 text-slate-500 shrink-0" />
              {l.preview ? <button onClick={() => onPreview(l.id)} className="flex-1 text-left text-cyan-300 underline underline-offset-2 hover:text-cyan-200" data-testid={`curriculum-preview-${l.id}`}>{l.title}</button> : <span className="flex-1">{l.title}</span>}
              {l.preview && <button onClick={() => onPreview(l.id)} className="text-[11px] font-mono text-cyan-300 hover:text-cyan-200" data-testid={`curriculum-preview-btn-${l.id}`}>Preview</button>}
              <span className="text-[11px] font-mono text-slate-500 w-14 text-right">{hm(l.minutes)}</span></div>; })}</div>}
        </div>))}</div>
    </section>);
}

export function PreviewDialog({ c, open, setOpen, current, setCurrent }) {
  const list = c.modules.flatMap((m) => m.lessons).filter((l) => l.preview);
  const l = list.find((x) => x.id === current) || list[0];
  const src = l && embedSrc(l.video_url);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl bg-[#0B0F1A] border-cyan-500/30" data-testid="course-preview-dialog">
        <DialogHeader><DialogTitle className="text-sm font-mono text-slate-400">Course preview · <span className="text-slate-100">{c.title}</span></DialogTitle></DialogHeader>
        {l && <div className="space-y-3">
          <div className="font-bold" data-testid="preview-lesson-title">{l.title}</div>
          {src && <div className="aspect-video border border-cyan-500/20"><VideoFrame src={src} title={l.title} testId="preview-video" /></div>}
          {l.content && <div className="text-sm text-slate-300 whitespace-pre-line max-h-48 overflow-y-auto" data-testid="preview-content">{l.content}</div>}
          <div className="text-[11px] font-mono uppercase text-slate-500 pt-2">Free sample lessons</div>
          <div className="max-h-40 overflow-y-auto divide-y divide-white/5 border border-white/10">{list.map((x) => (
            <button key={x.id} onClick={() => setCurrent(x.id)} className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${x.id === l.id ? "bg-cyan-500/10 text-cyan-200" : "hover:bg-white/5"}`} data-testid={`preview-pick-${x.id}`}>
              <PlayCircle className="h-4 w-4 shrink-0" /><span className="flex-1 truncate">{x.title}</span><span className="text-[11px] font-mono text-slate-500">{hm(x.minutes)}</span></button>))}</div>
        </div>}
      </DialogContent>
    </Dialog>);
}
