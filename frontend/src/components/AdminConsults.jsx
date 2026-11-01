import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { waLink } from "../lib/pay";
import { Glass, Empty } from "./common";

const ist = (iso) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
export const waNum = (p) => { const d = (p || "").replace(/\D/g, ""); return d.length === 10 ? `91${d}` : d; };

export function BatchSeats() {
  const [bs, setBs] = useState([]);
  const [edit, setEdit] = useState({});
  useEffect(() => { api.get("/admin/live-classes/batches").then((r) => setBs(r.data)); }, []);
  const save = async (b) => { try { setBs((await api.put("/admin/live-classes/batches", { start: b.start, seats: Number(edit[b.start]) })).data); toast.success("Seats updated"); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Glass className="p-5" data-testid="batch-seats">
      <div className="font-bold mb-3">Batch seats</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{bs.map((b, i) => (
        <div key={b.start} className="border border-white/10 p-3 rounded-sm space-y-2" data-testid={`batch-seat-${i}`}>
          <div className="text-xs font-mono">{ist(b.start)}</div><div className="text-[11px] text-slate-500">{b.label} · {b.taken} enquiries · <span className={b.left ? "text-green-400" : "text-red-400"}>{b.left} left</span></div>
          <div className="flex gap-2"><input type="number" min={0} max={500} className="field !py-1 text-sm" value={edit[b.start] ?? b.seats} onChange={(e) => setEdit({ ...edit, [b.start]: e.target.value })} data-testid={`batch-seat-input-${i}`} />
            <button className="ghost-btn !text-xs" onClick={() => save(b)} data-testid={`batch-seat-save-${i}`}>Save</button></div>
        </div>))}</div>
    </Glass>);
}

export function Consultations() {
  const [cs, setCs] = useState(null);
  useEffect(() => { api.get("/admin/consultations").then((r) => setCs(r.data)); }, []);
  const set = async (c, status) => { try { await api.patch(`/admin/consultations/${c.id}`, { status }); setCs(cs.map((x) => (x.id === c.id ? { ...x, status } : x))); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Glass className="p-5" data-testid="admin-consultations">
      <div className="font-bold mb-3">Paid consultations <span className="text-xs font-mono text-slate-500 ml-2" data-testid="consult-count">{cs?.length ?? ""}</span></div>
      {!cs ? null : !cs.length ? <Empty text="no paid consultations yet" /> : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] font-mono uppercase text-slate-500 border-b border-white/5">{["Slot (IST)", "Name", "Contact", "Topic", "Notes", "Paid", "Status"].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}</tr></thead>
        <tbody>{cs.map((c, i) => <tr key={c.id} className="border-b border-white/5 align-top" data-testid={`consult-row-${i}`}>
          <td className="px-2 py-2 text-xs font-mono">{ist(c.slot_at)}</td><td className="px-2 py-2">{c.name}</td>
          <td className="px-2 py-2 text-xs"><a href={`mailto:${c.email}`} className="text-cyan-300 hover:underline">{c.email}</a>
            <a href={waLink(waNum(c.phone), `Hi ${c.name}, this is SOCProfessionals about your consultation on ${ist(c.slot_at)}.`)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-300 hover:underline"><MessageCircle className="h-3 w-3" />{c.phone}</a></td>
          <td className="px-2 py-2 text-xs">{c.topic}</td><td className="px-2 py-2 text-xs text-slate-400 max-w-[220px]">{c.notes || "—"}</td><td className="px-2 py-2 text-xs font-mono">₹{c.amount}</td>
          <td className="px-2 py-2"><select className="field !py-1 text-xs" value={c.status} onChange={(e) => set(c, e.target.value)} data-testid={`consult-status-${i}`}>{["paid", "completed", "cancelled", "needs_reschedule"].map((s) => <option key={s}>{s}</option>)}</select></td></tr>)}</tbody>
      </table></div>}
    </Glass>);
}
