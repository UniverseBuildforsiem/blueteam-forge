import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus, Trash2, Mail, RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Glass, Empty } from "./common";

function InviteDialog({ open, setOpen, onDone }) {
  const [f, setF] = useState({ name: "", email: "", role: "student", plan: "free" });
  const send = async () => {
    try { await api.post("/admin/users/invite", f); toast.success(`Invite sent to ${f.email}`); setOpen(false); setF({ name: "", email: "", role: "student", plan: "free" }); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-[#0B0F1A] border-cyan-500/20" data-testid="invite-dialog">
        <DialogHeader><DialogTitle className="font-mono">Invite a user</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <input className="field" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="invite-name-input" />
          <input className="field" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="invite-email-input" />
          <div className="grid grid-cols-2 gap-3">
            <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} data-testid="invite-role-select">{["student", "instructor", "admin"].map((r) => <option key={r}>{r}</option>)}</select>
            <select className="field" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} data-testid="invite-plan-select">{["free", "pro"].map((r) => <option key={r}>{r}</option>)}</select>
          </div>
          <p className="text-xs text-slate-500">They get an email with a one-time link (valid 72 hours) to set their password.</p>
          <button className="glow-btn w-full justify-center" disabled={f.name.length < 2 || !f.email.includes("@")} onClick={send} data-testid="invite-send-button"><Mail className="h-4 w-4" />Send invite</button>
        </div>
      </DialogContent>
    </Dialog>);
}

function DeleteBox({ u, onDeleted }) {
  const [txt, setTxt] = useState("");
  const del = async () => { try { const { data } = await api.delete(`/admin/users/${u.id}`); toast.success(`Deleted ${u.email} and ${Object.values(data.removed).reduce((a, b) => a + b, 0)} records`); onDeleted(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="border border-red-500/30 bg-red-500/5 p-4 mt-6" data-testid="user-delete-box">
      <div className="text-sm font-bold text-red-300">Delete user permanently</div>
      <p className="text-xs text-slate-400 mt-1">Removes the account and all of their progress, submissions, purchases and activity (payment records are kept for accounting). This cannot be undone. Type <span className="font-mono text-slate-200">{u.email}</span> to confirm.</p>
      <div className="flex gap-2 mt-3"><input className="field" value={txt} onChange={(e) => setTxt(e.target.value)} data-testid="user-delete-confirm-input" />
        <button className="ghost-btn ghost-danger !text-red-300 disabled:opacity-40" disabled={txt.trim().toLowerCase() !== u.email} onClick={del} data-testid="user-delete-button"><Trash2 className="h-4 w-4" />Delete</button></div>
    </div>);
}

function UserDetail({ uid, onClose, onChanged }) {
  const { user: me } = useAuth();
  const [d, setD] = useState(null);
  const load = () => api.get(`/admin/users/${uid}`).then((r) => setD(r.data));
  useEffect(() => { setD(null); if (uid) load(); }, [uid]); // eslint-disable-line
  const patch = async (body, msg) => { try { await api.patch(`/admin/users/${uid}/access`, body); toast.success(msg); onChanged(); } catch (e) { toast.error(errMsg(e)); } load(); };
  const resend = async () => { try { await api.post(`/admin/users/${uid}/resend-invite`); toast.success("Invite re-sent"); } catch (e) { toast.error(errMsg(e)); } };
  const u = d?.user;
  return (
    <Sheet open={!!uid} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="bg-[#0B0F1A] border-cyan-500/20 w-full sm:max-w-xl overflow-y-auto" data-testid="user-detail">
        {u && <>
          <SheetHeader><SheetTitle className="font-mono">{u.name}</SheetTitle>
            <div className="text-xs font-mono text-slate-400">{u.email} · @{u.username} · {u.role} · {u.status}{u.invite_pending && <span className="text-yellow-300"> · invite pending</span>}</div></SheetHeader>
          <div className="grid grid-cols-4 gap-2 mt-4 font-mono text-xs">{[["XP", u.xp], ["Rank", u.rank], ["Streak", u.streak], ["Joined", u.created_at?.slice(0, 10)], ...Object.entries(d.counts)].map(([k, v]) =>
            <div key={k} className="bg-black/40 border border-white/5 p-2"><div className="text-slate-500 capitalize">{k.replace("_", " ")}</div><div className="text-cyan-300 text-sm truncate">{v ?? "—"}</div></div>)}</div>
          <div className="eyebrow mt-6 mb-2">plan & access</div>
          <Glass className="p-4 space-y-3" data-testid="user-access">
            <div className="flex items-center justify-between text-sm"><span>Plan</span>
              <select className="field !w-32 !py-1 text-xs" value={u.plan || "free"} onChange={(e) => patch({ plan: e.target.value }, `Plan set to ${e.target.value}`)} data-testid="user-plan-select">{["free", "pro"].map((p) => <option key={p}>{p}</option>)}</select></div>
            {[["sop", "Full SOP library (₹499)"], ["book", "Interview ebook"]].map(([k, l]) => <label key={k} className="flex items-center justify-between text-sm"><span>{l}{k === "sop" && u.plan === "pro" && <span className="text-[11px] font-mono text-green-400 ml-2" data-testid="user-sop-via-pro">included with Pro</span>}</span>
              <input type="checkbox" checked={d.access[k]} onChange={(e) => { const v = e.target.checked; setD({ ...d, access: { ...d.access, [k]: v } }); patch({ [k]: v }, v ? `${l} granted` : `${l} removed`); }} data-testid={`user-grant-${k}`} /></label>)}
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="ghost-btn !text-xs" onClick={() => window.confirm("Reset XP and streak to 0?") && patch({ reset_xp: true }, "XP reset")} data-testid="user-reset-xp"><RotateCcw className="h-3.5 w-3.5" />Reset XP</button>
              {u.invite_pending && <button className="ghost-btn !text-xs" onClick={resend} data-testid="user-resend-invite"><Mail className="h-3.5 w-3.5" />Resend invite</button>}
            </div>
          </Glass>
          <div className="eyebrow mt-6 mb-2">payments</div>
          {d.payments.length ? d.payments.map((p) => <div key={p.id} className="text-xs flex justify-between border-b border-white/5 py-1.5"><span>{p.plan_name || p.plan}</span><span className={`font-mono ${p.status === "paid" ? "text-green-400" : "text-slate-500"}`}>₹{p.amount} · {p.status} · {p.created_at?.slice(0, 10)}</span></div>) : <Empty text="no payments" />}
          <div className="eyebrow mt-6 mb-2">recent activity</div>
          <div data-testid="user-activity">{d.activity.length ? d.activity.map((a, i) => <div key={i} className="text-xs flex justify-between gap-3 border-b border-white/5 py-1.5"><span className="text-slate-300">{a.text}</span><span className="font-mono text-green-400">{a.xp}</span></div>) : <Empty text="no activity" />}</div>
          {u.id !== me.id && <DeleteBox u={u} onDeleted={() => { onClose(); onChanged(); }} />}
        </>}
      </SheetContent>
    </Sheet>);
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [us, setUs] = useState([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [inv, setInv] = useState(false);
  const [sel, setSel] = useState(null);
  const load = () => api.get("/admin/users").then((r) => setUs(r.data));
  useEffect(() => { load(); }, []);
  const upd = async (id, body) => { try { await api.patch(`/admin/users/${id}`, body); toast.success("User updated"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const list = us.filter((u) => (role === "all" || u.role === role) && `${u.name} ${u.email} ${u.username}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input className="field max-w-sm" placeholder="Search users..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="admin-user-search" />
        {["all", "student", "instructor", "admin"].map((r) => <button key={r} onClick={() => setRole(r)} data-testid={`admin-role-filter-${r}`} className={`px-3 py-1.5 text-xs font-mono border rounded-sm capitalize ${role === r ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-slate-400"}`}>{r}</button>)}
        <button className="glow-btn ml-auto" onClick={() => setInv(true)} data-testid="admin-invite-button"><UserPlus className="h-4 w-4" />Invite user</button>
      </div>
      <Glass className="overflow-x-auto"><table className="w-full text-sm" data-testid="admin-users-table">
        <thead><tr className="text-left text-xs font-mono text-slate-500 border-b border-cyan-500/15">{["Name", "Email", "Role", "Status", "Plan", "XP", "Joined", ""].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>{list.map((u) => <tr key={u.id} className="border-b border-white/5 hover:bg-cyan-500/5" data-testid={`admin-user-row-${u.username}`}>
          <td className="px-4 py-2.5"><button onClick={() => setSel(u.id)} className="text-left hover:text-cyan-300" data-testid={`admin-user-open-${u.username}`}>{u.name}<div className="text-[10px] font-mono text-slate-500">@{u.username}{u.invite_pending && <span className="text-yellow-300"> · invited</span>}</div></button></td>
          <td className="px-4 font-mono text-xs text-slate-400">{u.email}</td>
          <td className="px-4"><select className="field !py-1 !w-32 text-xs" value={u.role} disabled={u.id === me.id} onChange={(e) => upd(u.id, { role: e.target.value })} data-testid={`admin-role-select-${u.username}`}>{["student", "instructor", "admin"].map((r) => <option key={r}>{r}</option>)}</select></td>
          <td className={`px-4 text-xs font-mono ${u.status === "active" ? "text-green-400" : "text-red-400"}`}>{u.status}</td><td className="px-4 text-xs font-mono">{u.plan}</td><td className="px-4 text-xs font-mono text-green-400">{u.xp || 0}</td><td className="px-4 text-xs text-slate-500">{u.created_at.slice(0, 10)}</td>
          <td className="px-4 whitespace-nowrap">{u.id !== me.id && <button className={`ghost-btn !py-1 !text-xs ${u.status === "active" ? "ghost-danger !text-red-300" : ""}`} onClick={() => upd(u.id, { status: u.status === "active" ? "suspended" : "active" })} data-testid={`admin-status-toggle-${u.username}`}>{u.status === "active" ? "Suspend" : "Approve"}</button>}</td>
        </tr>)}</tbody></table>{!list.length && <Empty text="no users match" />}</Glass>
      <InviteDialog open={inv} setOpen={setInv} onDone={load} />
      <UserDetail uid={sel} onClose={() => setSel(null)} onChanged={load} />
    </div>);
}
