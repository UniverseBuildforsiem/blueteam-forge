import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { api, errMsg, fmtDate } from "../lib/api";
import { Glass, Empty } from "./common";

const STATUS = ["new", "contacted", "enrolled", "closed"];
const SCOL = { new: "text-yellow-300", contacted: "text-cyan-300", enrolled: "text-green-400", closed: "text-slate-500" };
const ist = (iso) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

function Settings() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/live-classes/settings").then((r) => setS(r.data)); }, []);
  if (!s) return null;
  const up = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const save = async () => { try { setS((await api.put("/admin/live-classes/settings", s)).data); toast.success("Live class settings saved"); } catch (e) { toast.error(errMsg(e)); } };
  const inp = (k, l, tid, type = "text") => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{l}</span><input type={type} className="field mt-1 text-sm" value={s[k]} onChange={up(k)} data-testid={tid} /></label>;
  return (
    <Glass className="p-5 space-y-3" data-testid="live-settings">
      <div className="font-bold">Settings</div>
      <div className="grid sm:grid-cols-2 gap-3">{inp("title", "Section title", "live-settings-title")}{inp("notify_email", "Send enquiries to", "live-settings-email", "email")}</div>
      {inp("description", "Description", "live-settings-description")}
      <div className="grid sm:grid-cols-3 gap-3">{inp("demo_link", "Demo meeting link (Teams/Meet)", "live-settings-link")}{inp("demo_time", "Friday demo time (IST)", "live-settings-demo-time", "time")}{inp("batch_time", "Batch start time (IST)", "live-settings-batch-time", "time")}</div>
      <button className="glow-btn !text-xs" onClick={save} data-testid="live-settings-save">Save settings</button>
    </Glass>);
}

export default function AdminLive() {
  const [es, setEs] = useState(null);
  const [f, setF] = useState("all");
  const load = () => api.get("/admin/live-enquiries").then((r) => setEs(r.data));
  useEffect(() => { load(); }, []);
  const set = async (e, status) => { try { await api.patch(`/admin/live-enquiries/${e.id}`, { status }); setEs(es.map((x) => (x.id === e.id ? { ...x, status } : x))); } catch (err) { toast.error(errMsg(err)); } };
  const shown = (es || []).filter((e) => f === "all" || e.kind === f);
  const csv = () => {
    const rows = [["Type", "Session (IST)", "Name", "Email", "Phone", "Experience", "Message", "Status", "Received"], ...shown.map((e) => [e.kind, ist(e.session_at), e.name, e.email, e.phone, e.experience, e.message, e.status, e.created_at])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "live-class-enquiries.csv"; a.click();
  };
  return (
    <div className="space-y-4" data-testid="admin-live">
      <Glass className="p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4"><div className="font-bold flex-1">Enquiries <span className="text-xs font-mono text-slate-500 ml-2" data-testid="live-enquiry-count">{shown.length}</span></div>
          {["all", "demo", "batch"].map((x) => <button key={x} onClick={() => setF(x)} data-testid={`live-filter-${x}`} className={`px-3 py-1 text-xs font-mono border rounded-sm ${f === x ? "border-cyan-400 text-cyan-300" : "border-white/10 text-slate-400"}`}>{x}</button>)}
          <button className="ghost-btn !text-xs" onClick={csv} disabled={!shown.length} data-testid="live-export-csv"><Download className="h-3.5 w-3.5" />CSV</button></div>
        {!es ? null : !shown.length ? <Empty text="no enquiries yet" /> : <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="live-enquiries-table">
          <thead><tr className="text-left text-[11px] font-mono uppercase text-slate-500 border-b border-white/5">{["Type", "Session (IST)", "Name", "Contact", "Experience", "Message", "Received", "Status"].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}</tr></thead>
          <tbody>{shown.map((e, i) => <tr key={e.id} className="border-b border-white/5 align-top" data-testid={`live-enquiry-row-${i}`}>
            <td className="px-2 py-2 font-mono text-xs uppercase">{e.kind}</td><td className="px-2 py-2 text-xs">{ist(e.session_at)}</td><td className="px-2 py-2">{e.name}</td>
            <td className="px-2 py-2 text-xs"><a href={`mailto:${e.email}`} className="text-cyan-300 hover:underline">{e.email}</a><div className="text-slate-400">{e.phone}</div></td>
            <td className="px-2 py-2 text-xs">{e.experience}</td><td className="px-2 py-2 text-xs text-slate-400 max-w-[240px]">{e.message || "—"}</td><td className="px-2 py-2 text-xs text-slate-500">{fmtDate(e.created_at)}</td>
            <td className="px-2 py-2"><select className={`field !py-1 text-xs ${SCOL[e.status]}`} value={e.status} onChange={(x) => set(e, x.target.value)} data-testid={`live-enquiry-status-${i}`}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></td></tr>)}</tbody>
        </table></div>}
      </Glass>
      <Settings />
    </div>);
}
