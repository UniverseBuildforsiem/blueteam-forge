import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Sparkles, Eye, ExternalLink, Loader2 } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { Glass, Empty } from "./common";
import { Switch } from "./ui/switch";
import Markdown from "./Markdown";

const F = ({ l, children }) => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><div className="mt-1">{children}</div></label>;
const STATUS = { ready: "text-green-400 border-green-500/30", planned: "text-slate-400 border-white/10", generating: "text-amber-300 border-amber-500/30", failed: "text-red-300 border-red-500/30" };
const csv = (a) => (a || []).join(", ");
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

function PostForm({ init, sections, onSaved, onCancel }) {
  const [f, setF] = useState({ ...init, tags: csv(init.tags), mitre: csv(init.mitre) });
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    const body = { title: f.title, section: f.section, excerpt: f.excerpt || "", cover: f.cover || "", tags: list(f.tags), mitre: list(f.mitre), body: f.body || "", published: f.published };
    try { f.id ? await api.put(`/admin/series/${f.id}`, body) : await api.post("/admin/series", body); toast.success("Post saved"); onSaved(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Glass className="p-5 space-y-3" data-testid="series-form">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2"><F l="Title"><input className="field" value={f.title} onChange={up("title")} data-testid="series-form-title" /></F></div>
        <F l="Section"><select className="field" value={f.section} onChange={up("section")} data-testid="series-form-section">{sections.map((s) => <option key={s}>{s}</option>)}</select></F>
      </div>
      <F l="Excerpt (one line)"><input className="field" value={f.excerpt} onChange={up("excerpt")} data-testid="series-form-excerpt" /></F>
      <div className="grid sm:grid-cols-3 gap-3">
        <F l="Cover image link (blank = section image)"><input className="field text-xs" value={f.cover} onChange={up("cover")} placeholder="https://..." data-testid="series-form-cover" /></F>
        <F l="Tags (comma separated)"><input className="field text-xs" value={f.tags} onChange={up("tags")} data-testid="series-form-tags" /></F>
        <F l="MITRE techniques (comma separated)"><input className="field text-xs" value={f.mitre} onChange={up("mitre")} data-testid="series-form-mitre" /></F>
      </div>
      {f.cover && <img src={f.cover} alt="" className="h-24 w-48 object-cover border border-white/10" data-testid="series-form-cover-preview" />}
      <div className="flex items-center gap-3"><span className="text-[11px] font-mono uppercase text-slate-500">Article (Markdown: ## headings, ```spl / ```kql code blocks, tables)</span>
        <button className="ml-auto text-xs font-mono text-cyan-300" onClick={() => setPreview(!preview)} data-testid="series-form-preview-toggle">{preview ? "edit" : "preview"}</button></div>
      {preview ? <div className="border border-white/10 p-4 max-h-[60vh] overflow-y-auto" data-testid="series-form-preview"><Markdown>{f.body}</Markdown></div>
        : <textarea className="field h-[50vh] font-mono text-xs" value={f.body} onChange={up("body")} data-testid="series-form-body" />}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-300"><Switch checked={f.published} onCheckedChange={(v) => setF({ ...f, published: v })} data-testid="series-form-published" />Published (visible on the blog)</label>
        <div className="flex-1" />
        <button className="ghost-btn !text-xs" onClick={onCancel} data-testid="series-form-cancel">Cancel</button>
        <button className="glow-btn !text-xs" onClick={save} disabled={busy || f.title.length < 3} data-testid="series-form-save">Save post</button>
      </div>
    </Glass>);
}

function Row({ p, i, n, act, onEdit }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 border-b border-white/5 hover:bg-white/[0.02]" data-testid={`series-row-${p.id}`}>
      <span className="font-mono text-[11px] text-slate-500 w-10">#{String(p.number).padStart(3, "0")}</span>
      <div className="flex-1 min-w-[220px]"><div className="text-sm">{p.title}</div>{p.error && p.status === "failed" && <div className="text-[11px] text-red-300 mt-0.5">{p.error}</div>}</div>
      <span className={`text-[10px] font-mono uppercase border px-2 py-0.5 w-28 justify-center inline-flex items-center gap-1 ${STATUS[p.status]}`} data-testid={`series-status-${p.id}`}>{p.status === "generating" && <Loader2 className="h-3 w-3 animate-spin" />}{p.status === "ready" ? `ready · ${p.read_min}m` : p.status}</span>
      <Switch checked={p.published} onCheckedChange={(v) => act("put", p, { published: v })} data-testid={`series-publish-${p.id}`} />
      <div className="flex items-center gap-1 text-slate-400">
        <button disabled={i === 0} onClick={() => act("move", p, { dir: -1 })} className="p-1 hover:text-cyan-300 disabled:opacity-20" data-testid={`series-up-${p.id}`}><ChevronUp className="h-4 w-4" /></button>
        <button disabled={i === n - 1} onClick={() => act("move", p, { dir: 1 })} className="p-1 hover:text-cyan-300 disabled:opacity-20" data-testid={`series-down-${p.id}`}><ChevronDown className="h-4 w-4" /></button>
        {p.status !== "ready" && p.status !== "generating" && <button onClick={() => act("generate", p)} className="p-1 text-amber-300 hover:text-amber-200 inline-flex items-center gap-1 text-[11px] font-mono" data-testid={`series-generate-${p.id}`}><Sparkles className="h-3.5 w-3.5" />write with AI</button>}
        {p.status === "ready" && p.published && <a href={`/soc-series/${p.slug}`} target="_blank" rel="noreferrer" className="p-1 hover:text-cyan-300" data-testid={`series-view-${p.id}`}><ExternalLink className="h-4 w-4" /></a>}
        <button onClick={() => onEdit(p)} className="p-1 hover:text-cyan-300" data-testid={`series-edit-${p.id}`}><Pencil className="h-4 w-4" /></button>
        <button onClick={() => window.confirm(`Delete "${p.title}"?`) && act("delete", p)} className="p-1 hover:text-red-300" data-testid={`series-delete-${p.id}`}><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>);
}

export default function AdminSeries() {
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState("");
  const [st, setSt] = useState("");
  const load = () => api.get("/admin/series").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  const busy = d?.posts.some((p) => p.status === "generating");
  useEffect(() => { if (!busy) return undefined; const t = setInterval(load, 6000); return () => clearInterval(t); }, [busy]);
  const act = async (kind, p, body) => {
    try {
      if (kind === "put") await api.put(`/admin/series/${p.id}`, body);
      if (kind === "move") await api.post(`/admin/series/${p.id}/move`, body);
      if (kind === "delete") { await api.delete(`/admin/series/${p.id}`); toast.success("Post deleted"); }
      if (kind === "generate") { await api.post(`/admin/series/${p.id}/generate`); toast.success("AI is writing this post — about 1-2 minutes"); }
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const openEdit = async (p) => setEdit((await api.get(`/admin/series/${p.id}`)).data);
  if (!d) return null;
  if (edit) return <PostForm init={edit} sections={d.sections} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />;
  const count = (s) => d.posts.filter((p) => p.status === s).length;
  return (
    <div className="space-y-4" data-testid="admin-series">
      <Glass className="p-4 flex flex-wrap items-center gap-3">
        <div className="text-sm"><span className="text-green-400 font-bold">{count("ready")}</span> written · <span className="text-amber-300 font-bold">{count("generating")}</span> writing · <span className="text-slate-300 font-bold">{count("planned") + count("failed")}</span> to write · {d.posts.length} total</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles" className="field !w-48 text-xs" data-testid="series-admin-search" />
        <select value={st} onChange={(e) => setSt(e.target.value)} className="field !w-36 text-xs" data-testid="series-admin-status">{["", "ready", "planned", "generating", "failed"].map((s) => <option key={s} value={s}>{s || "all statuses"}</option>)}</select>
        <a href="/soc-series" target="_blank" rel="noreferrer" className="ghost-btn !text-xs ml-auto" data-testid="series-admin-open"><Eye className="h-3.5 w-3.5" />View blog</a>
        <button className="glow-btn !text-xs" onClick={() => setEdit({ title: "", section: d.sections[0], excerpt: "", cover: "", tags: [], mitre: [], body: "", published: true })} data-testid="series-new"><Plus className="h-3.5 w-3.5" />New post</button>
      </Glass>
      {d.sections.map((s) => {
        const all = d.posts.filter((p) => p.section === s);
        const rows = all.filter((p) => (!st || p.status === st) && (!q || p.title.toLowerCase().includes(q.toLowerCase())));
        return rows.length ? (
          <Glass key={s} className="overflow-hidden" data-testid={`series-admin-section-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
            <div className="px-3 py-2 border-b border-white/10 text-xs font-mono uppercase text-cyan-300 flex">{s}<span className="ml-auto text-slate-500">{all.filter((p) => p.status === "ready").length}/{all.length}</span></div>
            {rows.map((p) => <Row key={p.id} p={p} i={all.indexOf(p)} n={all.length} act={act} onEdit={openEdit} />)}
          </Glass>) : null;
      })}
      {!d.posts.length && <Empty text="no posts yet" />}
    </div>);
}
