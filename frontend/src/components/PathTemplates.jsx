import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutTemplate, Trash2, ArrowRight, BookmarkPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Empty } from "./common";

function TemplateCard({ t, onUse, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass rounded-sm p-4 flex flex-col" data-testid={`template-card-${t.id}`}>
      <div className="flex items-center justify-between text-[10px] font-mono"><span className="text-cyan-400">{t.category || "Custom"}</span>
        <span className={t.builtin ? "text-green-400" : "text-yellow-300"}>{t.builtin ? "BUILT-IN" : "SAVED"}</span></div>
      <div className="font-bold mt-2">{t.title}</div>
      <p className="text-xs text-slate-400 mt-1 flex-1">{t.description}</p>
      <div className="text-[11px] font-mono text-slate-500 mt-3">{t.level} · {t.module_count} modules · {t.lesson_count} lessons · {Math.round(t.minutes / 60)}h{t.duration ? ` · ${t.duration}` : ""}</div>
      <button className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 text-left mt-2" onClick={() => setOpen(!open)} data-testid={`template-outline-toggle-${t.id}`}>{open ? "hide outline" : "show outline"}</button>
      {open && <div className="mt-2 max-h-48 overflow-y-auto space-y-2 text-xs" data-testid={`template-outline-${t.id}`}>{t.outline.map((m) => <div key={m.title}><div className="text-slate-200">{m.title}</div>
        {m.lessons.map((l) => <div key={l} className="text-slate-500 pl-3">· {l}</div>)}</div>)}</div>}
      <div className="flex items-center gap-2 mt-4">
        <button className="glow-btn !text-xs flex-1 justify-center" onClick={() => onUse(t)} data-testid={`template-use-${t.id}`}>Use template <ArrowRight className="h-3.5 w-3.5" /></button>
        {!t.builtin && onDelete && <button className="text-slate-500 hover:text-red-400" onClick={() => onDelete(t)} data-testid={`template-delete-${t.id}`}><Trash2 className="h-4 w-4" /></button>}
      </div>
    </div>);
}

export function TemplateGallery({ open, setOpen, onPick }) {
  const { user } = useAuth();
  const [ts, setTs] = useState(null);
  const load = () => api.get("/builder/templates").then((r) => setTs(r.data));
  useEffect(() => { if (open) load(); }, [open]);
  const use = async (t) => { try { const { data } = await api.post(`/builder/templates/${t.id}/use`); onPick(data); setOpen(false); toast.success(`Started a new draft from "${t.title}"`); } catch (e) { toast.error(errMsg(e)); } };
  const del = async (t) => { if (!window.confirm(`Delete template "${t.title}"?`)) return; try { await api.delete(`/builder/templates/${t.id}`); toast.success("Template deleted"); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-[#0B0F1A] border-cyan-500/20 max-w-5xl max-h-[85vh] overflow-y-auto" data-testid="template-gallery">
        <DialogHeader><DialogTitle className="font-mono flex items-center gap-2"><LayoutTemplate className="h-5 w-5 text-cyan-400" />Start from a template</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-400 -mt-2">Templates give you the module and lesson outline. You get an unpublished draft to fill in and publish.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">{ts?.map((t) => <TemplateCard key={t.id} t={t} onUse={use} onDelete={user?.role === "admin" ? del : null} />)}</div>
        {ts && !ts.length && <Empty text="no templates" />}
      </DialogContent>
    </Dialog>);
}

export function SaveAsTemplate({ path }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "" });
  const save = async () => {
    try { await api.post("/builder/templates", { path_id: path.id, ...f }); toast.success("Saved as a template"); setOpen(false); } catch (e) { toast.error(errMsg(e)); }
  };
  return (<>
    <button className="ghost-btn" onClick={() => { setF({ title: `${path.title} (template)`, description: path.description || "" }); setOpen(true); }} data-testid="builder-save-template"><BookmarkPlus className="h-4 w-4" />Save as template</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-[#0B0F1A] border-cyan-500/20" data-testid="save-template-dialog">
        <DialogHeader><DialogTitle className="font-mono">Save path as template</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-400">Saves the last saved version of this path, including lesson content and practice links.</p>
        <input className="field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Template name" data-testid="save-template-title" />
        <textarea className="field h-24 text-sm" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description" data-testid="save-template-description" />
        <button className="glow-btn justify-center" disabled={f.title.trim().length < 3} onClick={save} data-testid="save-template-confirm">Save template</button>
      </DialogContent>
    </Dialog>
  </>);
}
