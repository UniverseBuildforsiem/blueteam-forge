import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Timer } from "lucide-react";
import { api, errMsg, fmtDate } from "../lib/api";
import { Glass, Empty } from "./common";
import { Switch } from "./ui/switch";

const BLANK = { tag: "", title: "", text: "", price: "", cta: "Learn more", url: "https://", accent: "#00F0FF", icon: "shield", img: "", active: true, ends_at: null };
const ICONS = ["shield", "play", "phone", "route", "book", "live"];
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
const F = ({ l, children }) => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><div className="mt-1">{children}</div></label>;

function PromoForm({ init, onSave, onCancel }) {
  const [f, setF] = useState({ ...init, ends_at: toLocal(init.ends_at) });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => onSave({ ...f, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null });
  return (
    <Glass className="p-5 space-y-3" data-testid="promo-form">
      <div className="grid sm:grid-cols-3 gap-3">
        <F l="Title"><input className="field" value={f.title} onChange={up("title")} data-testid="promo-form-title" /></F>
        <F l="Tag (small label)"><input className="field" value={f.tag} onChange={up("tag")} data-testid="promo-form-tag" /></F>
        <F l="Price / highlight"><input className="field" value={f.price} onChange={up("price")} data-testid="promo-form-price" /></F>
      </div>
      <F l="Description"><textarea className="field h-16 text-sm" value={f.text} onChange={up("text")} data-testid="promo-form-text" /></F>
      <div className="grid sm:grid-cols-3 gap-3">
        <F l="Button text"><input className="field" value={f.cta} onChange={up("cta")} data-testid="promo-form-cta" /></F>
        <div className="sm:col-span-2"><F l="Link (https://... or a page like /book)"><input className="field" value={f.url} onChange={up("url")} data-testid="promo-form-url" /></F></div>
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <F l="Accent colour"><input type="color" className="h-10 w-full bg-transparent" value={f.accent} onChange={up("accent")} data-testid="promo-form-accent" /></F>
        <F l="Icon"><select className="field" value={f.icon} onChange={up("icon")} data-testid="promo-form-icon">{ICONS.map((x) => <option key={x}>{x}</option>)}</select></F>
        <F l="Image URL (optional)"><input className="field text-xs" value={f.img} onChange={up("img")} data-testid="promo-form-img" /></F>
        <F l="Offer ends (optional countdown)"><input type="datetime-local" className="field text-xs" value={f.ends_at || ""} onChange={up("ends_at")} data-testid="promo-form-ends" /></F>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-300"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} data-testid="promo-form-active" />Visible on landing page</label>
        <div className="flex-1" />
        {f.ends_at && <button className="text-xs text-slate-400 hover:text-red-300" onClick={() => setF({ ...f, ends_at: null })} data-testid="promo-form-clear-ends">Remove countdown</button>}
        <button className="ghost-btn !text-xs" onClick={onCancel} data-testid="promo-form-cancel">Cancel</button>
        <button className="glow-btn !text-xs" onClick={save} data-testid="promo-form-save">Save card</button>
      </div>
    </Glass>);
}

export default function AdminPromos() {
  const [ps, setPs] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.get("/admin/promos").then((r) => setPs(r.data));
  useEffect(() => { load(); }, []);
  const save = async (f) => {
    try { if (f.id) await api.put(`/admin/promos/${f.id}`, f); else await api.post("/admin/promos", f); toast.success("Card saved"); setEdit(null); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const move = async (i, d) => { const ids = ps.map((p) => p.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; try { setPs((await api.post("/admin/promos/reorder", { ids })).data); } catch (e) { toast.error(errMsg(e)); load(); } };
  const toggle = async (p) => { try { await api.put(`/admin/promos/${p.id}`, { ...p, active: !p.active }); load(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async (p) => { if (!window.confirm(`Delete "${p.title}"?`)) return; try { await api.delete(`/admin/promos/${p.id}`); toast.success("Card deleted"); } catch (e) { toast.error(errMsg(e)); } load(); };
  return (
    <div className="space-y-4" data-testid="admin-promos">
      <div className="flex items-center justify-between"><p className="text-sm text-slate-400">Cards in the landing page spotlight, in display order. Expired offers hide automatically.</p>
        <button className="glow-btn !text-xs" onClick={() => setEdit({ ...BLANK })} data-testid="promo-add"><Plus className="h-3.5 w-3.5" />Add card</button></div>
      {edit && !edit.id && <PromoForm init={edit} onSave={save} onCancel={() => setEdit(null)} />}
      {!ps.length && <Empty text="no promotion cards" />}
      {ps.map((p, i) => edit?.id === p.id ? <PromoForm key={p.id} init={edit} onSave={save} onCancel={() => setEdit(null)} /> : (
        <Glass key={p.id} className={`p-4 flex items-center gap-3 ${p.active ? "" : "opacity-50"}`} data-testid={`promo-row-${i}`}>
          <div className="flex flex-col"><button disabled={i === 0} onClick={() => move(i, -1)} className="text-slate-500 hover:text-cyan-300 disabled:opacity-30" data-testid={`promo-up-${i}`}><ChevronUp className="h-4 w-4" /></button>
            <button disabled={i === ps.length - 1} onClick={() => move(i, 1)} className="text-slate-500 hover:text-cyan-300 disabled:opacity-30" data-testid={`promo-down-${i}`}><ChevronDown className="h-4 w-4" /></button></div>
          <span className="h-8 w-1.5 rounded-full" style={{ background: p.accent }} />
          <div className="flex-1 min-w-0"><div className="font-bold text-sm truncate" data-testid={`promo-row-title-${i}`}>{p.title} <span className="font-mono text-xs text-slate-400 ml-2">{p.price}</span></div>
            <div className="text-[11px] font-mono text-slate-500 truncate">{p.tag} · {p.url}{p.ends_at && <span className="text-yellow-300 ml-2 inline-flex items-center gap-1"><Timer className="h-3 w-3" />ends {fmtDate(p.ends_at)}</span>}</div></div>
          <label className="flex items-center gap-2 text-[11px] font-mono text-slate-400"><Switch checked={p.active} onCheckedChange={() => toggle(p)} data-testid={`promo-toggle-${i}`} />{p.active ? "visible" : "hidden"}</label>
          <button className="text-slate-500 hover:text-cyan-300" onClick={() => setEdit(p)} data-testid={`promo-edit-${i}`}><Pencil className="h-4 w-4" /></button>
          <button className="text-slate-500 hover:text-red-400" onClick={() => del(p)} data-testid={`promo-delete-${i}`}><Trash2 className="h-4 w-4" /></button>
        </Glass>))}
    </div>);
}
