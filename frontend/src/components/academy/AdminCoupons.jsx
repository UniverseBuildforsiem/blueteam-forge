import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, TicketPercent } from "lucide-react";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, Empty } from "../common";
import { Switch } from "../ui/switch";

const BLANK = { code: "", kind: "percent", value: 20, course_id: "", expires_at: "", active: true };
const F = ({ l, children }) => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><div className="mt-1">{children}</div></label>;
const off = (c) => (c.kind === "percent" ? `${c.value}% off` : `₹${c.value.toLocaleString("en-IN")} off`);
const isExpired = (c) => c.expires_at && new Date(c.expires_at) < new Date();

function CouponForm({ courses, onSaved }) {
  const [f, setF] = useState(BLANK);
  const up = (k, num) => (e) => setF({ ...f, [k]: num ? +e.target.value : e.target.value });
  const save = async () => {
    try {
      await api.post("/admin/coupons", { ...f, code: f.code.trim(), expires_at: f.expires_at ? new Date(`${f.expires_at}T23:59:59`).toISOString() : null });
      toast.success("Coupon created"); setF(BLANK); onSaved();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Glass className="p-5 space-y-3" data-testid="coupon-form">
      <div className="eyebrow flex items-center gap-1.5"><TicketPercent className="h-3.5 w-3.5" />new launch coupon</div>
      <div className="grid sm:grid-cols-5 gap-3">
        <F l="Code"><input className="field uppercase font-mono" placeholder="LAUNCH30" value={f.code} onChange={up("code")} data-testid="coupon-code-input" /></F>
        <F l="Discount type"><select className="field" value={f.kind} onChange={up("kind")} data-testid="coupon-kind-select"><option value="percent">Percent off</option><option value="flat">Flat ₹ off</option></select></F>
        <F l={f.kind === "percent" ? "Percent (1-99)" : "Amount (₹)"}><input type="number" min="1" className="field" value={f.value} onChange={up("value", true)} data-testid="coupon-value-input" /></F>
        <F l="Course"><select className="field" value={f.course_id} onChange={up("course_id")} data-testid="coupon-course-select"><option value="">All paid courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></F>
        <F l="Expires on (optional)"><input type="date" className="field" value={f.expires_at} onChange={up("expires_at")} data-testid="coupon-expiry-input" /></F>
      </div>
      <p className="text-[11px] font-mono text-slate-500">Each student can use a coupon once. Final price never drops below ₹1.</p>
      <button className="glow-btn" disabled={f.code.trim().length < 3} onClick={save} data-testid="coupon-create-btn"><Plus className="h-4 w-4" />Create coupon</button>
    </Glass>);
}

export default function AdminCoupons() {
  const [cs, setCs] = useState(null);
  const [courses, setCourses] = useState([]);
  const load = () => api.get("/admin/coupons").then((r) => setCs(r.data));
  useEffect(() => { load(); api.get("/academy/manage").then((r) => setCourses(r.data.filter((c) => c.price))); }, []);
  const title = (id) => (id ? courses.find((c) => c.id === id)?.title || "Deleted course" : "All paid courses");
  const toggle = async (c) => { try { await api.put(`/admin/coupons/${c.code}`, { ...c, active: !c.active }); load(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async (c) => { if (!window.confirm(`Delete coupon ${c.code}?`)) return; await api.delete(`/admin/coupons/${c.code}`); toast.success("Coupon deleted"); load(); };
  return (
    <div className="space-y-4" data-testid="admin-coupons">
      <CouponForm courses={courses} onSaved={load} />
      {cs && !cs.length && <Empty text="No coupons yet" />}
      <Glass className="divide-y divide-white/5">{(cs || []).map((c) => (
        <div key={c.code} className="p-3 flex flex-wrap items-center gap-3 text-sm" data-testid={`coupon-row-${c.code}`}>
          <span className="font-mono font-bold text-cyan-300 w-32">{c.code}</span>
          <span className="text-yellow-300 font-mono w-28">{off(c)}</span>
          <span className="flex-1 text-slate-300 truncate">{title(c.course_id)}</span>
          <span className={`text-[11px] font-mono ${isExpired(c) ? "text-red-400" : "text-slate-500"}`}>{c.expires_at ? `${isExpired(c) ? "expired" : "until"} ${fmtDate(c.expires_at)}` : "no expiry"}</span>
          <span className="text-[11px] font-mono text-slate-400" data-testid={`coupon-uses-${c.code}`}>{c.uses} used</span>
          <Switch checked={c.active} onCheckedChange={() => toggle(c)} data-testid={`coupon-active-${c.code}`} />
          <button onClick={() => del(c)} className="text-slate-500 hover:text-red-400" data-testid={`coupon-delete-${c.code}`}><Trash2 className="h-4 w-4" /></button>
        </div>))}</Glass>
    </div>);
}
