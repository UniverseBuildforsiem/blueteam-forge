import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Package, Eye } from "lucide-react";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, Empty } from "../common";
import { Switch } from "../ui/switch";
import { inr } from "./Price";

const BLANK = { title: "", subtitle: "", description: "", cover: "", course_ids: [], price: 999, sale_price: null, sale_ends_at: null, active: true };
const F = ({ l, children, cls = "" }) => <label className={`block ${cls}`}><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><div className="mt-1">{children}</div></label>;
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");

function BundleForm({ init, courses, onDone }) {
  const [f, setF] = useState(init);
  const up = (k, num) => (e) => setF({ ...f, [k]: num ? (e.target.value === "" ? null : +e.target.value) : e.target.value });
  const value = courses.filter((c) => f.course_ids.includes(c.id)).reduce((n, c) => n + c.price, 0);
  const pick = (id) => setF({ ...f, course_ids: f.course_ids.includes(id) ? f.course_ids.filter((x) => x !== id) : [...f.course_ids, id] });
  const save = async () => { try { if (f.id) await api.put(`/admin/bundles/${f.id}`, f); else await api.post("/admin/bundles", f); toast.success("Bundle saved"); onDone(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Glass className="p-5 space-y-3" data-testid="bundle-form">
      <div className="grid sm:grid-cols-2 gap-3">
        <F l="Title"><input className="field" value={f.title} onChange={up("title")} data-testid="bundle-title-input" /></F>
        <F l="Subtitle"><input className="field" value={f.subtitle} onChange={up("subtitle")} data-testid="bundle-subtitle-input" /></F>
        <F l="Description" cls="sm:col-span-2"><textarea className="field h-20 text-sm" value={f.description} onChange={up("description")} data-testid="bundle-description-input" /></F>
        <F l="Cover image URL (optional)" cls="sm:col-span-2"><input className="field" value={f.cover} onChange={up("cover")} data-testid="bundle-cover-input" /></F>
      </div>
      <F l={`Courses (pick 2 or more) · separate total ${inr(value)}`}>
        <div className="grid sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto" data-testid="bundle-course-picker">{courses.map((c) => (
          <label key={c.id} className={`flex items-center gap-2 text-sm border px-2 py-1.5 cursor-pointer ${f.course_ids.includes(c.id) ? "border-cyan-400/60 bg-cyan-500/5" : "border-white/10"}`}>
            <input type="checkbox" checked={f.course_ids.includes(c.id)} onChange={() => pick(c.id)} data-testid={`bundle-pick-${c.id}`} />
            <span className="flex-1 truncate">{c.title}</span><span className="font-mono text-xs text-slate-400">{c.price ? inr(c.price) : "Free"}</span></label>))}</div>
      </F>
      <div className="grid sm:grid-cols-3 gap-3 border border-yellow-500/20 bg-yellow-500/5 p-3">
        <F l="Bundle price ₹"><input type="number" min="1" className="field" value={f.price ?? ""} onChange={up("price", true)} data-testid="bundle-price-input" /></F>
        <F l="Sale price ₹ (optional)"><input type="number" min="1" className="field" value={f.sale_price ?? ""} onChange={up("sale_price", true)} data-testid="bundle-sale-price-input" /></F>
        <F l="Sale ends (countdown)"><input type="datetime-local" className="field" value={toLocal(f.sale_ends_at)} onChange={(e) => setF({ ...f, sale_ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} data-testid="bundle-sale-ends-input" /></F>
        <div className="sm:col-span-3 text-[11px] font-mono text-slate-400" data-testid="bundle-saving-preview">Students save {value > (f.sale_price || f.price) ? `${Math.round(100 * (value - (f.sale_price || f.price)) / value)}% (${inr(value - (f.sale_price || f.price))})` : "nothing yet"} vs buying separately. Students who already own some courses pay a proportionally lower price.</div>
      </div>
      <div className="flex gap-2"><button className="glow-btn" disabled={!f.title.trim() || f.course_ids.length < 2 || !f.price} onClick={save} data-testid="bundle-save-btn"><Plus className="h-4 w-4" />Save bundle</button>
        <button className="ghost-btn" onClick={onDone} data-testid="bundle-cancel-btn">Cancel</button></div>
    </Glass>);
}

export default function AdminBundles() {
  const [bs, setBs] = useState(null);
  const [courses, setCourses] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.get("/admin/bundles").then((r) => setBs(r.data));
  useEffect(() => { load(); api.get("/academy/courses").then((r) => setCourses(r.data)); }, []); // eslint-disable-line
  const toggle = async (b) => { try { await api.put(`/admin/bundles/${b.id}`, { ...b, active: !b.active }); load(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async (b) => { if (!window.confirm(`Delete bundle "${b.title}"?`)) return; try { await api.delete(`/admin/bundles/${b.id}`); toast.success("Bundle deleted"); load(); } catch (e) { toast.error(errMsg(e)); } };
  if (edit) return <BundleForm init={edit} courses={courses} onDone={() => { setEdit(null); load(); }} />;
  return (
    <div className="space-y-4" data-testid="admin-bundles">
      <div className="flex items-center"><span className="text-sm text-slate-400 flex-1">Group published courses into a discounted bundle. Buying a bundle unlocks every course in it.</span>
        <button className="glow-btn !text-xs" onClick={() => setEdit(BLANK)} data-testid="bundle-new-btn"><Package className="h-3.5 w-3.5" />New bundle</button></div>
      {bs && !bs.length && <Empty text="No bundles yet" />}
      <Glass className="divide-y divide-white/5">{(bs || []).map((b) => (
        <div key={b.id} className="p-3 flex flex-wrap items-center gap-3 text-sm" data-testid={`bundle-row-${b.id}`}>
          <div className="flex-1 min-w-[200px]"><div className="font-bold">{b.title}</div><div className="text-[11px] font-mono text-slate-500">{b.course_ids.length} courses · worth {inr(b.pricing.value)} · {b.buyers} buyers · updated {fmtDate(b.updated_at)}</div></div>
          <span className="font-mono text-yellow-300" data-testid={`bundle-row-price-${b.id}`}>{inr(b.pricing.price)}{b.pricing.regular ? <span className="text-slate-500 line-through ml-1.5 text-xs">{inr(b.pricing.regular)}</span> : null}</span>
          <Switch checked={b.active} onCheckedChange={() => toggle(b)} data-testid={`bundle-active-${b.id}`} />
          <a href={`/bundle/${b.id}`} className="text-slate-400 hover:text-cyan-300" data-testid={`bundle-view-${b.id}`}><Eye className="h-4 w-4" /></a>
          <button onClick={() => setEdit(b)} className="text-slate-400 hover:text-cyan-300" data-testid={`bundle-edit-${b.id}`}><Pencil className="h-4 w-4" /></button>
          <button onClick={() => del(b)} className="text-slate-500 hover:text-red-400" data-testid={`bundle-delete-${b.id}`}><Trash2 className="h-4 w-4" /></button>
        </div>))}</Glass>
    </div>);
}
