import { useState } from "react";
import { Layers, Wand2, Trash2, Save, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Glass } from "./common";
import { CtfFields, ctfReady, ctfPayload, pollJob } from "./CtfCreator";

const parse = (t) => [...new Set(t.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];

function DraftCard({ d, i, update, remove, saveOne }) {
  return (
    <Glass className="p-4" data-testid={`bulk-ctf-card-${i}`}>
      <div className="flex items-center gap-2 mb-3 text-xs font-mono"><span className="text-cyan-300 break-all flex-1" data-testid={`bulk-ctf-ioc-${i}`}>{d.ioc}</span>
        {d.status === "running" && <span className="text-yellow-300 inline-flex items-center gap-1" data-testid={`bulk-ctf-status-${i}`}><Loader2 className="h-3.5 w-3.5 animate-spin" />drafting...</span>}
        {d.status === "saved" && <span className="text-green-400" data-testid={`bulk-ctf-status-${i}`}>saved to arena</span>}
        {d.status === "error" && <span className="text-red-400 inline-flex items-center gap-1" data-testid={`bulk-ctf-status-${i}`}><AlertTriangle className="h-3.5 w-3.5" />{d.error}</span>}
        <button onClick={remove} className="text-slate-500 hover:text-red-400" data-testid={`bulk-ctf-discard-${i}`}><Trash2 className="h-4 w-4" /></button></div>
      {d.status === "done" && <><CtfFields f={d.ctf} setF={(c) => update({ ctf: c })} tid={`bulk-ctf-${i}`} />
        <button className="glow-btn !text-xs mt-3" disabled={!ctfReady(d.ctf)} onClick={saveOne} data-testid={`bulk-ctf-save-${i}`}><Save className="h-3.5 w-3.5" />Save to CTF Arena</button></>}
    </Glass>);
}

export function BulkIntelCtfs({ onSaved }) {
  const [text, setText] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [drafts, setDrafts] = useState([]);
  const [busy, setBusy] = useState(false);
  const iocs = parse(text);
  const patch = (job, p) => setDrafts((ds) => ds.map((d) => (d.job_id === job ? { ...d, ...p } : d)));
  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/builder/ctf-bulk", { iocs, level });
      setDrafts((ds) => [...data.jobs.map((j) => ({ ...j, status: "running" })), ...ds]);
      setText("");
      await Promise.all(data.jobs.map(async (j) => {
        const r = await pollJob(j.job_id, 60).catch(() => null);
        patch(j.job_id, r?.status === "done" ? { status: "done", ctf: r.ctf } : { status: "error", error: r?.error || "took too long — try this one again" });
      }));
      toast.success("Drafts ready — review each one, then save");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const saveOne = async (d) => {
    try { await api.post("/manage/ctfs", { ...ctfPayload(d.ctf), published: true }); patch(d.job_id, { status: "saved" }); onSaved(); return true; }
    catch (e) { toast.error(`${d.ioc}: ${errMsg(e)}`); return false; }
  };
  const ready = drafts.filter((d) => d.status === "done" && ctfReady(d.ctf));
  const saveAll = async () => { let n = 0; for (const d of ready) n += (await saveOne(d)) ? 1 : 0; if (n) toast.success(`${n} Intel CTF${n > 1 ? "s" : ""} saved to the arena`); };
  return (
    <Glass className="p-5 mb-4" data-testid="bulk-intel-ctfs">
      <div className="flex items-center gap-2 mb-1"><Layers className="h-4 w-4 text-cyan-400" /><span className="font-bold">Bulk Intel CTFs</span></div>
      <p className="text-xs text-slate-400 mb-3">Paste up to 10 IPs, domains, URLs or hashes (one per line or comma-separated). AI looks each one up and drafts a challenge with a fixed answer, hints and a writeup for you to review.</p>
      <textarea className="field h-24 font-mono text-xs" placeholder={"185.220.101.1\n44d88612fea8a8f36de82e1278abb02f"} value={text} onChange={(e) => setText(e.target.value)} data-testid="bulk-ctf-input" />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <select className="field !w-36 text-xs" value={level} onChange={(e) => setLevel(e.target.value)} data-testid="bulk-ctf-level">{["Beginner", "Intermediate", "Advanced"].map((l) => <option key={l}>{l}</option>)}</select>
        <span className={`text-[11px] font-mono ${iocs.length > 10 ? "text-red-400" : "text-slate-500"}`} data-testid="bulk-ctf-count">{iocs.length}/10 indicators</span>
        <button className="glow-btn !text-xs ml-auto" disabled={busy || !iocs.length || iocs.length > 10} onClick={start} data-testid="bulk-ctf-draft"><Wand2 className={`h-3.5 w-3.5 ${busy ? "animate-pulse" : ""}`} />{busy ? "Drafting..." : "Draft with AI"}</button>
      </div>
      {drafts.length > 0 && <div className="mt-5 space-y-3">
        <div className="flex items-center gap-2"><span className="text-xs font-mono text-slate-400 flex-1">{drafts.length} drafts · {ready.length} ready to save</span>
          {ready.length > 1 && <button className="ghost-btn !text-xs" onClick={saveAll} data-testid="bulk-ctf-save-all"><Save className="h-3.5 w-3.5" />Save all {ready.length}</button>}</div>
        {drafts.map((d, i) => <DraftCard key={d.job_id} d={d} i={i} update={(p) => patch(d.job_id, p)} remove={() => setDrafts((ds) => ds.filter((x) => x.job_id !== d.job_id))} saveOne={() => saveOne(d)} />)}
      </div>}
    </Glass>);
}
