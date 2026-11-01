import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { api, errMsg, fmtDate } from "../lib/api";
import { Glass, PageHeader, Empty } from "../components/common";
import ContentEditor from "../components/ContentEditor";
import AdminAnalytics from "../components/AdminAnalytics";
import AdminUsers from "../components/AdminUsers";
import AdminPromos from "../components/AdminPromos";
import AdminLive from "../components/AdminLive";
import AdminSeries from "../components/AdminSeries";

function Publishing() {
  const [items, setItems] = useState([]);
  const kinds = ["paths", "quizzes", "ctfs", "challenges", "labs"];
  const load = async () => setItems((await Promise.all(kinds.map((k) => api.get(`/manage/${k}`).then((r) => r.data.map((x) => ({ ...x, _kind: k })))))).flat());
  useEffect(() => { load(); }, []); // eslint-disable-line
  const toggle = async (it) => { const { _kind, ...doc } = it; await api.put(`/manage/${_kind}/${it.id}`, { ...doc, published: !it.published }); toast.success(`${!it.published ? "Published" : "Unpublished"}`); load(); };
  return (
    <Glass className="divide-y divide-white/5" data-testid="admin-publishing">{items.map((it) => (
      <div key={it._kind + it.id} className="p-3 flex items-center gap-3 text-sm"><span className="text-[10px] font-mono uppercase text-cyan-400 w-20">{it._kind}</span><span className="flex-1">{it.title}</span>
        <button onClick={() => toggle(it)} className={`text-xs font-mono px-3 py-1 border rounded-sm ${it.published ? "border-green-400/50 text-green-400" : "border-white/10 text-slate-500"}`} data-testid={`publish-toggle-${it.id}`}>{it.published ? "PUBLISHED" : "DRAFT"}</button></div>))}</Glass>
  );
}

function SimpleList({ kind, fields }) {
  const [items, setItems] = useState([]);
  const [f, setF] = useState(Object.fromEntries(fields.map((x) => [x, ""])));
  const load = () => api.get(`/manage/${kind}`).then((r) => setItems(r.data));
  useEffect(() => { load(); }, []); // eslint-disable-line
  const add = async () => { try { await api.post(`/manage/${kind}`, { ...f, active: true, created_at: new Date().toISOString() }); setF(Object.fromEntries(fields.map((x) => [x, ""]))); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-4 max-w-3xl">
      <Glass className="p-4 flex flex-wrap gap-2">{fields.map((x) => <input key={x} className="field flex-1 min-w-[180px]" placeholder={x} value={f[x]} onChange={(e) => setF({ ...f, [x]: e.target.value })} data-testid={`${kind}-${x}-input`} />)}
        <button className="glow-btn" onClick={add} disabled={!f[fields[0]]} data-testid={`${kind}-add-button`}><Plus className="h-4 w-4" />Add</button></Glass>
      <Glass className="divide-y divide-white/5">{items.length ? items.map((it) => <div key={it.id} className="p-3 flex items-center gap-3 text-sm"><div className="flex-1">{it[fields[0]]}{fields[1] && <div className="text-xs text-slate-500">{it[fields[1]]}</div>}</div>
        <button className="text-slate-500 hover:text-red-400" onClick={async () => { await api.delete(`/manage/${kind}/${it.id}`); load(); }} data-testid={`${kind}-delete-${it.id}`}><Trash2 className="h-4 w-4" /></button></div>) : <Empty text="empty" />}</Glass>
    </div>
  );
}

function Certs() {
  const [cs, setCs] = useState([]);
  const load = () => api.get("/admin/certificates").then((r) => setCs(r.data));
  useEffect(() => { load(); }, []);
  const toggle = async (c) => { await api.patch(`/admin/certificates/${c.id}`, { status: c.status === "valid" ? "revoked" : "valid" }); load(); };
  return <Glass className="divide-y divide-white/5" data-testid="admin-certificates">{cs.length ? cs.map((c) => <div key={c.id} className="p-3 flex flex-wrap items-center gap-3 text-sm"><span className="font-mono text-xs text-cyan-400">{c.id}</span><span className="flex-1">{c.name} · {c.path_title}</span><span className="text-xs font-mono">{c.score}%</span>
    <button onClick={() => toggle(c)} className={`ghost-btn !py-1 !text-xs ${c.status === "valid" ? "" : "!text-red-300"}`} data-testid={`cert-toggle-${c.id}`}>{c.status === "valid" ? "Revoke" : "Restore"}</button></div>) : <Empty text="no certificates issued" />}</Glass>;
}

function Audit() {
  const [l, setL] = useState([]);
  useEffect(() => { api.get("/admin/audit-logs").then((r) => setL(r.data)); }, []);
  return <Glass className="divide-y divide-white/5 font-mono text-xs" data-testid="admin-audit-logs">{l.length ? l.map((x) => <div key={x.id} className="p-2.5 flex gap-4"><span className="text-slate-500 w-40 shrink-0">{fmtDate(x.created_at)}</span><span className="text-cyan-300 w-48 truncate">{x.actor}</span><span className="flex-1">{x.action}</span><span className="text-slate-500">{x.target}</span></div>) : <Empty text="no audit events" />}</Glass>;
}

function Settings() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)); }, []);
  if (!s) return null;
  const save = async () => { await api.put("/admin/settings", s); toast.success("Settings saved"); };
  return (
    <Glass className="p-6 max-w-xl space-y-4">
      {[["platform_name", "Platform name"], ["support_email", "Support email"], ["pass_mark", "Default pass mark (%)"]].map(([k, l]) => <label key={k} className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><input className="field mt-1" value={s[k]} onChange={(e) => setS({ ...s, [k]: k === "pass_mark" ? +e.target.value : e.target.value })} data-testid={`settings-${k}`} /></label>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.allow_signups} onChange={(e) => setS({ ...s, allow_signups: e.target.checked })} data-testid="settings-allow-signups" />Allow new signups</label>
      <button className="glow-btn" onClick={save} data-testid="settings-save">Save settings</button>
    </Glass>
  );
}

const TABS = [["analytics", "Analytics", AdminAnalytics], ["users", "Users", AdminUsers], ["live", "Live classes", AdminLive], ["promos", "Promotions", AdminPromos], ["blog", "Security blog", AdminSeries], ["publishing", "Publishing", Publishing], ["builder", "Path builder", () => <ContentEditor kind="paths" />],
  ["categories", "Categories", () => <SimpleList kind="categories" fields={["name"]} />], ["certificates", "Certificates", Certs],
  ["announcements", "Announcements", () => <SimpleList kind="announcements" fields={["title", "body"]} />], ["audit", "Audit logs", Audit], ["settings", "Settings", Settings]];

export default function Admin() {
  return (
    <div>
      <PageHeader eyebrow="// root access" title="Admin panel" sub="Users, roles, publishing, analytics, certificates, announcements and platform settings." />
      <Tabs defaultValue="analytics"><TabsList className="bg-black/40 mb-5 flex-wrap h-auto">{TABS.map(([v, l]) => <TabsTrigger key={v} value={v} data-testid={`admin-tab-${v}`}>{l}</TabsTrigger>)}</TabsList>
        {TABS.map(([v, , C]) => <TabsContent key={v} value={v}><C /></TabsContent>)}</Tabs>
    </div>
  );
}
