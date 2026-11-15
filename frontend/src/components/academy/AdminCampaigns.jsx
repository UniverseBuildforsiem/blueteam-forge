import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, PartyPopper } from "lucide-react";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, Empty } from "../common";
import { Switch } from "../ui/switch";
import { campaignOff } from "../../lib/campaign";

const THEMES = [["diwali", "Diwali — diyas & gold"], ["newyear", "New Year — fireworks & midnight blue"], ["christmas", "Christmas — snow & red"], ["holi", "Holi — colour splashes"], ["festive", "Any festival — neon sparkles"]];
const BLANK = { name: "Diwali Gifting Fest", theme: "diwali", headline: "Light up someone's career this Diwali", subtext: "Gift a SOC course to a friend — or treat yourself.", coupon_code: "DIWALI25", coupon_kind: "percent", coupon_value: 25, starts_at: "", ends_at: "", active: true, email_blast: true };
const F = ({ l, children, cls = "" }) => <label className={`block ${cls}`}><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><div className="mt-1">{children}</div></label>;
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
const live = (c) => c.active && new Date(c.starts_at) <= new Date() && new Date() < new Date(c.ends_at);

function CampaignForm({ init, onDone }) {
  const [f, setF] = useState(init);
  const up = (k, num) => (e) => setF({ ...f, [k]: num ? +e.target.value : e.target.value });
  const dt = (k) => (e) => setF({ ...f, [k]: e.target.value ? new Date(e.target.value).toISOString() : "" });
  const save = async () => { try { if (f.id) await api.put(`/admin/campaigns/${f.id}`, f); else await api.post("/admin/campaigns", f); toast.success("Campaign saved"); onDone(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Glass className="p-5 space-y-3" data-testid="campaign-form">
      <div className="grid sm:grid-cols-2 gap-3">
        <F l="Campaign name"><input className="field" value={f.name} onChange={up("name")} data-testid="campaign-name" /></F>
        <F l="Theme"><select className="field" value={f.theme} onChange={up("theme")} data-testid="campaign-theme">{THEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></F>
        <F l="Banner headline" cls="sm:col-span-2"><input className="field" value={f.headline} onChange={up("headline")} data-testid="campaign-headline" /></F>
        <F l="Banner subtext" cls="sm:col-span-2"><input className="field" value={f.subtext} onChange={up("subtext")} data-testid="campaign-subtext" /></F>
        <F l="Starts"><input type="datetime-local" className="field" value={toLocal(f.starts_at)} onChange={dt("starts_at")} data-testid="campaign-starts" /></F>
        <F l="Ends"><input type="datetime-local" className="field" value={toLocal(f.ends_at)} onChange={dt("ends_at")} data-testid="campaign-ends" /></F>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 border border-yellow-500/20 bg-yellow-500/5 p-3">
        <F l="Coupon code"><input className="field font-mono uppercase" value={f.coupon_code} onChange={up("coupon_code")} data-testid="campaign-coupon-code" /></F>
        <F l="Discount type"><select className="field" value={f.coupon_kind} onChange={up("coupon_kind")} data-testid="campaign-coupon-kind"><option value="percent">Percent off</option><option value="flat">Flat ₹ off</option></select></F>
        <F l={f.coupon_kind === "percent" ? "Percent (1-99)" : "Amount ₹"}><input type="number" min="1" className="field" value={f.coupon_value} onChange={up("coupon_value", true)} data-testid="campaign-coupon-value" /></F>
        <p className="sm:col-span-3 text-[11px] font-mono text-slate-400">The coupon is created for you, works on every course, bundle and gift purchase only between the start and end time, once per student.</p>
      </div>
      <label className="flex items-center gap-2 text-xs font-mono text-slate-300" data-testid="campaign-email-blast-label">
        <input type="checkbox" checked={f.email_blast !== false} disabled={!!f.blast_done_at} onChange={(e) => setF({ ...f, email_blast: e.target.checked })} data-testid="campaign-email-blast" />
        {f.blast_done_at ? `Festival email already sent (${fmtDate(f.blast_done_at)})` : "Email all students (except opted-out) with the banner and coupon when the campaign goes live"}</label>
      <div className="flex gap-2"><button className="glow-btn" disabled={!f.starts_at || !f.ends_at} onClick={save} data-testid="campaign-save"><Plus className="h-4 w-4" />Save campaign</button>
        <button className="ghost-btn" onClick={onDone} data-testid="campaign-cancel">Cancel</button></div>
    </Glass>);
}

export default function AdminCampaigns() {
  const [cs, setCs] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => api.get("/admin/campaigns").then((r) => setCs(r.data));
  useEffect(() => { load(); }, []);
  const toggle = async (c) => { try { await api.put(`/admin/campaigns/${c.id}`, { ...c, active: !c.active }); load(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async (c) => { if (!window.confirm(`Delete "${c.name}"? Its coupon stops working.`)) return; try { await api.delete(`/admin/campaigns/${c.id}`); toast.success("Campaign deleted"); load(); } catch (e) { toast.error(errMsg(e)); } };
  if (edit) return <CampaignForm init={edit} onDone={() => { setEdit(null); load(); }} />;
  return (
    <div className="space-y-4" data-testid="admin-campaigns">
      <div className="flex items-center"><span className="text-sm text-slate-400 flex-1">Festival banners with a ready-made coupon. They show on the home page, the course catalog, course and bundle pages and the student Courses tab while live.</span>
        <button className="glow-btn !text-xs" onClick={() => setEdit(BLANK)} data-testid="campaign-new"><PartyPopper className="h-3.5 w-3.5" />New campaign</button></div>
      {cs && !cs.length && <Empty text="No campaigns yet" />}
      <Glass className="divide-y divide-white/5">{(cs || []).map((c) => (
        <div key={c.id} className="p-3 flex flex-wrap items-center gap-3 text-sm" data-testid={`campaign-row-${c.id}`}>
          <div className="flex-1 min-w-[220px]"><div className="font-bold">{c.name} {live(c) && <span className="text-[10px] font-mono text-green-400 border border-green-500/40 px-1.5 ml-1" data-testid={`campaign-live-${c.id}`}>LIVE</span>}</div>
            <div className="text-[11px] font-mono text-slate-500">{c.theme} · {fmtDate(c.starts_at)} → {fmtDate(c.ends_at)} · {c.uses} used · <span data-testid={`campaign-email-status-${c.id}`}>{c.email_blast === false ? "no email" : c.blast_done_at ? `emailed ${c.emailed} students` : c.blast_started_at ? `emailing… ${c.emailed} sent` : "email goes out at launch"}</span></div></div>
          <span className="font-mono text-yellow-300">{c.coupon_code} · {campaignOff(c)}</span>
          <Switch checked={c.active} onCheckedChange={() => toggle(c)} data-testid={`campaign-active-${c.id}`} />
          <button onClick={() => setEdit(c)} className="text-slate-400 hover:text-cyan-300" data-testid={`campaign-edit-${c.id}`}><Pencil className="h-4 w-4" /></button>
          <button onClick={() => del(c)} className="text-slate-500 hover:text-red-400" data-testid={`campaign-delete-${c.id}`}><Trash2 className="h-4 w-4" /></button>
        </div>))}</Glass>
    </div>);
}
