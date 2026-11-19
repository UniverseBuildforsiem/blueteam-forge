import { useState } from "react";
import { X, Copy } from "lucide-react";
import { toast } from "sonner";

export const SEV = ["", "bg-slate-500", "bg-sky-500", "bg-yellow-500", "bg-orange-500", "bg-red-600"];
export const Sev = ({ n }) => <span className={`inline-grid place-items-center h-5 w-5 text-[10px] font-bold text-white ${SEV[n]}`} title={`Severity ${n}`}>{n}</span>;
export const Panel = ({ title, actions, children, tid }) => <section className="bg-[#131c27] border border-slate-700/70" data-testid={tid}>
  {title && <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/70"><h3 className="text-[13px] font-semibold text-slate-100 flex-1">{title}</h3>{actions}</div>}<div className="p-3">{children}</div></section>;
export const Btn = ({ primary, className = "", ...p }) => <button {...p} className={`px-3 py-1.5 text-xs font-semibold border transition-colors disabled:opacity-40 ${primary ? "bg-sky-600 border-sky-500 text-white hover:bg-sky-500" : "border-slate-600 text-slate-200 hover:bg-slate-700/60"} ${className}`} />;
export const In = (p) => <input {...p} className={`w-full bg-[#0b121a] border border-slate-600 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500 ${p.className || ""}`} />;
export const Sel = ({ options, ...p }) => <select {...p} className="w-full bg-[#0b121a] border border-slate-600 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500">{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
export const Lbl = ({ t, children }) => <label className="block text-[11px] text-slate-400 space-y-1"><span>{t}</span>{children}</label>;

export function Table({ cols, rows, onRow, tid, rowTid, empty = "No records" }) {
  return <div className="overflow-x-auto" data-testid={tid}><table className="w-full text-xs"><thead><tr className="text-left text-slate-400 border-b border-slate-700">{cols.map((c) => <th key={c} className="px-2 py-1.5 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map((r, i) => <tr key={i} onClick={onRow ? () => onRow(i) : undefined} onKeyDown={onRow ? (e) => e.key === "Enter" && onRow(i) : undefined} tabIndex={onRow ? 0 : undefined}
      className={`border-b border-slate-800 text-slate-200 ${onRow ? "cursor-pointer hover:bg-sky-500/10 focus:bg-sky-500/10 outline-none" : ""}`} data-testid={rowTid ? `${rowTid}-${i}` : undefined}>{r.map((c, j) => <td key={j} className="px-2 py-1.5 whitespace-nowrap">{c}</td>)}</tr>)
      : <tr><td colSpan={cols.length} className="px-2 py-4 text-center text-slate-500">{empty}</td></tr>}</tbody></table></div>;
}

export function Drawer({ title, onClose, children, tid }) {
  return <div className="absolute inset-0 z-30 flex justify-end bg-black/50" onClick={onClose} data-testid={tid}>
    <div className="w-full max-w-md h-full overflow-auto bg-[#131c27] border-l border-slate-600 p-4 space-y-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
      <div className="flex items-center"><h3 className="font-semibold text-slate-100 flex-1">{title}</h3><button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white" data-testid={`${tid}-close`}><X className="h-4 w-4" /></button></div>{children}</div></div>;
}

export function CopyField({ label, value, tid }) {
  const copy = () => { navigator.clipboard?.writeText(value).then(() => toast.success(`${label} copied`)).catch(() => {}); };
  return <div><div className="text-[11px] text-slate-400">{label}</div><div className="flex gap-1 mt-0.5"><code className="flex-1 bg-[#0b121a] border border-slate-700 px-2 py-1 text-[11px] text-sky-200 break-all select-all" data-testid={tid}>{value}</code>
    <button onClick={copy} className="px-2 border border-slate-600 text-slate-300 hover:bg-slate-700" aria-label={`Copy ${label}`}><Copy className="h-3.5 w-3.5" /></button></div></div>;
}

export const SubTabs = ({ tabs, cur, set, tid }) => <div className="flex gap-1 flex-wrap">{tabs.map(([k, l]) => <Btn key={k} primary={cur === k} onClick={() => set(k)} data-testid={`${tid}-${k}`}>{l}</Btn>)}</div>;
export const Check = ({ label, checked, onChange, tid, disabled }) => <label className={`flex items-center gap-2 text-xs ${disabled ? "opacity-40" : ""}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} data-testid={tid} />{label}</label>;
export const Radio = ({ options, value, onChange, tid }) => <div className="flex gap-3 flex-wrap">{options.map((o) => <label key={o} className="flex items-center gap-1.5 text-xs text-slate-200"><input type="radio" checked={value === o} onChange={() => onChange(o)} data-testid={`${tid}-${o.replace(/\W+/g, "-").toLowerCase()}`} />{o}</label>)}</div>;

export function useForm(init) {
  const [f, setF] = useState(init);
  return [f, (k) => (e) => setF({ ...f, [k]: e.target.value }), () => setF(init)];
}
