import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { NotebookPen, FileDown, FileText, Search, Check, Loader2 } from "lucide-react";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, Empty } from "../common";

export function LessonNotes({ pid, lid }) {
  const [text, setText] = useState("");
  const [st, setSt] = useState("idle");
  const saved = useRef(null);
  const pending = useRef(null);
  useEffect(() => {
    saved.current = null; setSt("idle"); setText("");
    let on = true;
    api.get("/notes", { params: { path_id: pid } }).then((r) => { if (!on) return; const t = r.data.find((n) => n.lesson_id === lid)?.text || ""; saved.current = t; setText(t); });
    return () => { on = false; const p = pending.current; if (p) { pending.current = null; api.put(`/notes/${p.pid}/${p.lid}`, { text: p.text }).catch(() => {}); } };
  }, [pid, lid]);
  useEffect(() => {
    if (saved.current === null || text === saved.current) return undefined;
    setSt("typing");
    pending.current = { pid, lid, text };
    const id = setTimeout(() => { pending.current = null; api.put(`/notes/${pid}/${lid}`, { text }).then(() => { saved.current = text; setSt("saved"); }).catch((e) => { setSt("error"); toast.error(errMsg(e)); }); }, 800);
    return () => clearTimeout(id);
  }, [text]); // eslint-disable-line
  return <div className="mt-8 border-t border-white/10 pt-6" data-testid="lesson-notes">
    <div className="flex items-center justify-between mb-2"><label htmlFor="lesson-notes-input" className="eyebrow flex items-center gap-1.5"><NotebookPen className="h-3.5 w-3.5" />my notes</label>
      <span className="text-[11px] font-mono text-slate-500 inline-flex items-center gap-1" data-testid="lesson-notes-status" aria-live="polite">
        {st === "typing" ? <><Loader2 className="h-3 w-3 animate-spin" />saving…</> : st === "saved" ? <><Check className="h-3 w-3 text-green-400" />saved</> : st === "error" ? <span className="text-red-400">not saved</span> : "private to you · autosaves"}</span></div>
    <textarea id="lesson-notes-input" className="field h-32 !text-sm leading-6" maxLength={20000} value={text} onChange={(e) => setText(e.target.value)}
      placeholder="Key points, commands, interview answers you want to remember…" data-testid="lesson-notes-input" />
  </div>;
}

async function download(fmt, pathId) {
  try {
    const r = await api.get("/notes/export", { params: { format: fmt, ...(pathId ? { path_id: pathId } : {}) }, responseType: "blob" });
    const name = (r.headers["content-disposition"] || "").match(/filename="?([^"]+)"?/)?.[1] || `notes.${fmt}`;
    const url = URL.createObjectURL(r.data), a = document.createElement("a");
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { toast.error(e.response?.status === 404 ? "No notes to download yet" : errMsg(e)); }
}

export function NotesList({ pathId }) {
  const [ns, setNs] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.get("/notes", { params: pathId ? { path_id: pathId } : {} }).then((r) => setNs(r.data)); }, [pathId]);
  if (!ns) return null;
  const shown = ns.filter((n) => !q || `${n.text} ${n.lesson_title} ${n.module_title} ${n.path_title}`.toLowerCase().includes(q.toLowerCase()));
  const groups = shown.reduce((g, n) => ({ ...g, [n.path_id]: [...(g[n.path_id] || []), n] }), {});
  return <div className="space-y-5 max-w-4xl" data-testid="notes-list">
    <div className="flex flex-wrap gap-2 items-center">
      <div className="relative flex-1 min-w-[200px]"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input className="field !pl-9" placeholder="Search your notes" value={q} onChange={(e) => setQ(e.target.value)} data-testid="notes-search" /></div>
      <button className="glow-btn !text-xs" disabled={!ns.length} onClick={() => download("pdf", pathId)} data-testid="notes-download-pdf"><FileDown className="h-3.5 w-3.5" />Download PDF</button>
      <button className="ghost-btn !text-xs" disabled={!ns.length} onClick={() => download("md", pathId)} data-testid="notes-download-text"><FileText className="h-3.5 w-3.5" />Download text</button>
    </div>
    {!ns.length ? <Empty text="No notes yet. Open any lesson and write in the 'My notes' box under it. Notes save automatically." />
      : !shown.length ? <p className="text-sm text-slate-500">No notes match “{q}”.</p>
        : Object.values(groups).map((g) => <section key={g[0].path_id}>
          {!pathId && <div className="flex items-center justify-between mb-2"><div className="font-bold">{g[0].path_title}</div><Link to={`/app/${g[0].kind === "course" ? "courses" : "paths"}/${g[0].path_id}`} className="text-[11px] font-mono text-cyan-300 hover:underline" data-testid={`notes-open-${g[0].path_id}`}>open {g[0].kind} →</Link></div>}
          <div className="space-y-3">{g.map((n) => <Glass key={n.lesson_id} className="p-4" data-testid={`note-${n.lesson_id}`}>
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs"><span className="text-slate-500 font-mono">{n.module_title}</span><span className="text-slate-600">›</span><span className="font-semibold text-cyan-200">{n.lesson_title}</span><span className="ml-auto text-[10px] font-mono text-slate-600">{fmtDate(n.updated_at)}</span></div>
            <p className="text-sm text-slate-300 mt-2 whitespace-pre-line">{n.text}</p></Glass>)}</div>
        </section>)}
  </div>;
}
