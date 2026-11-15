import { useState } from "react";
import { Pin as PinIcon, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Glass } from "../../common";

export function PinDialog({ target, findings, existing, onSave, onRemove, onClose }) {
  const [finding, setFinding] = useState(existing?.finding ?? null);
  const [note, setNote] = useState(existing?.note || "");
  return <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-lg max-h-[90vh] overflow-y-auto" data-testid="pin-dialog">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><PinIcon className="h-4 w-4 text-yellow-300" />Pin as evidence</DialogTitle></DialogHeader>
      <div className="text-xs font-mono text-slate-300 border-l-2 border-yellow-400/60 pl-3 break-all" data-testid="pin-dialog-excerpt">{target?.text}</div>
      <fieldset className="space-y-1.5"><legend className="eyebrow mb-2">what does this prove?</legend>
        {findings.map((f, i) => <label key={i} className={`flex gap-2 items-start text-sm border px-3 py-2 cursor-pointer transition-colors ${finding === i ? "border-cyan-400/60 bg-cyan-500/5" : "border-white/10 hover:border-white/25"}`}>
          <input type="radio" name="pin-finding" checked={finding === i} onChange={() => setFinding(i)} className="mt-1" data-testid={`pin-finding-${i}`} />{f}</label>)}
      </fieldset>
      <input className="field" maxLength={300} placeholder="Short analyst note (optional)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="pin-note" />
      <div className="flex gap-2 justify-end">
        {existing && <button className="ghost-btn !text-xs" onClick={onRemove} data-testid="pin-remove"><Trash2 className="h-3.5 w-3.5" />Unpin</button>}
        <button className="glow-btn !text-xs" disabled={finding == null} onClick={() => onSave(finding, note)} data-testid="pin-save">{existing ? "Update pin" : "Pin evidence"}</button>
      </div>
    </DialogContent>
  </Dialog>;
}

export function PinBoard({ pins, findings, onEdit, iocCount }) {
  return <Glass className="p-4 space-y-3" data-testid="pin-board">
    <div className="flex items-center justify-between"><div className="eyebrow flex items-center gap-1.5"><PinIcon className="h-3.5 w-3.5" />evidence board</div><span className="text-[11px] font-mono text-slate-500" data-testid="pin-count">{pins.length} pinned · {iocCount} IOCs</span></div>
    {!pins.length ? <p className="text-xs text-slate-500">Click any header line, body line, message or log row to pin it with the finding it supports.</p>
      : <ul className="space-y-2">{pins.map((p) => <li key={p.ref}><button onClick={() => onEdit(p)} className="w-full text-left border border-yellow-400/25 hover:border-yellow-400/60 px-3 py-2 transition-colors" data-testid={`pin-item-${p.ref}`}>
        <div className="text-[11px] font-mono text-slate-400 truncate">{p.text}</div>
        <div className="text-xs text-yellow-100 mt-0.5">→ {findings[p.finding]}</div>
        {p.note && <div className="text-[11px] text-slate-400 italic mt-0.5">“{p.note}”</div>}</button></li>)}</ul>}
  </Glass>;
}
