import { useState } from "react";
import { Plus, Trash2, Wand2, Flag, X, Radar } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { CATS } from "../pages/app/CTF";
import IntelReport from "./intel/IntelReport";

const blank = (title) => ({ category: "Log Analysis", title: title ? `${title} CTF` : "", points: 100, flag: "", description: "", hints: [{ text: "", cost: 20 }], writeup: "" });
export const ctfReady = (f) => f.title?.trim() && f.flag?.trim() && f.description?.trim();
export const ctfPayload = (f) => ({ ...f, ioc: (f.ioc || "").trim() || undefined, hints: (f.hints || []).filter((h) => h.text.trim()) });

export async function pollJob(jobId, tries = 40) {
  let r = null;
  for (let i = 0; i < tries; i++) { await new Promise((res) => setTimeout(res, 3000)); r = (await api.get(`/builder/jobs/${jobId}`)).data; if (r.status !== "running") break; }
  return r;
}

function HintRows({ f, setF, tid }) {
  const hints = f.hints || [];
  const up = (i, h) => setF({ ...f, hints: hints.map((x, j) => (j === i ? h : x)) });
  return (
    <div className="space-y-2">{hints.map((h, i) => <div key={i} className="flex gap-2">
      <input className="field text-xs" placeholder={`Hint ${i + 1}`} value={h.text} onChange={(e) => up(i, { ...h, text: e.target.value })} data-testid={`${tid}-hint-${i}`} />
      <input type="number" min={0} className="field !w-20 text-xs" value={h.cost} onChange={(e) => up(i, { ...h, cost: +e.target.value })} title="points cost" data-testid={`${tid}-hint-cost-${i}`} />
      <button type="button" onClick={() => setF({ ...f, hints: hints.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
      <button type="button" className="text-[11px] font-mono text-cyan-400 inline-flex items-center gap-1" onClick={() => setF({ ...f, hints: [...hints, { text: "", cost: 20 }] })} data-testid={`${tid}-add-hint`}><Plus className="h-3 w-3" />Hint</button>
    </div>);
}

export function CtfFields({ f, setF, tid = "ctf-new" }) {
  const [intel, setIntel] = useState(null);
  const [busy, setBusy] = useState(false);
  const lookup = async () => {
    setBusy(true);
    try { setIntel((await api.post("/intel/lookup", { ioc: f.ioc })).data); setF({ ...f, category: "Threat Intel" }); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_150px_90px] gap-2">
        <input className="field text-xs" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid={`${tid}-title`} />
        <select className="field text-xs" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid={`${tid}-category`}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="field text-xs" value={f.points} onChange={(e) => setF({ ...f, points: +e.target.value })} data-testid={`${tid}-points`}>{[100, 150, 200, 250, 300].map((p) => <option key={p} value={p}>{p} pts</option>)}</select>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-black/40 border border-white/10 focus-within:border-cyan-400 px-2 rounded-sm"><Radar className="h-3.5 w-3.5 text-cyan-400" />
          <input className="bg-transparent py-2 text-xs font-mono outline-none flex-1" placeholder="Optional for an Intel CTF: IP, domain, URL or hash students must investigate" value={f.ioc || ""} onChange={(e) => setF({ ...f, ioc: e.target.value })} data-testid={`${tid}-ioc`} /></div>
        <button type="button" className="ghost-btn !text-xs" disabled={!f.ioc?.trim() || busy} onClick={lookup} data-testid={`${tid}-ioc-lookup`}>{busy ? "Looking up..." : "Look it up"}</button>
      </div>
      {intel && <div className="max-h-72 overflow-y-auto border border-white/10 p-2" data-testid={`${tid}-intel-report`}><div className="text-[11px] font-mono text-slate-500 mb-2">pick a stable fact from this report as the answer</div><IntelReport r={intel} /></div>}
      <textarea className="field h-28 text-xs font-mono" placeholder="Challenge: the artifact (logs, command, payload) and the question" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid={`${tid}-description`} />
      <input className="field text-xs font-mono" placeholder="Answer, plain value only (e.g. 3389)" value={f.flag} onChange={(e) => setF({ ...f, flag: e.target.value })} data-testid={`${tid}-flag`} />
      <HintRows f={f} setF={setF} tid={tid} />
      <textarea className="field h-20 text-xs" placeholder="Writeup shown to students after they solve it: how to find the answer and why it matters" value={f.writeup || ""} onChange={(e) => setF({ ...f, writeup: e.target.value })} data-testid={`${tid}-writeup`} />
    </div>);
}

export function CtfCreator({ lesson, level, onCreated, onClose }) {
  const [f, setF] = useState(blank(lesson.title));
  const [busy, setBusy] = useState("");
  const draft = async () => {
    setBusy("ai");
    try {
      const { data: job } = await api.post("/builder/ctf-draft", { title: lesson.title, content: lesson.content || "", level, ioc: f.ioc || "" });
      const r = await pollJob(job.job_id);
      if (r?.status === "done") { setF(r.ctf); toast.success("CTF drafted — review the answer, then save"); } else toast.error(r?.error || "The CTF writer took too long — please try again");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  const save = async () => {
    setBusy("save");
    try { const { data } = await api.post("/manage/ctfs", { ...ctfPayload(f), published: true }); toast.success("CTF added to the arena and attached"); onCreated(data); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  return (
    <div className="mt-3 border border-cyan-500/30 bg-cyan-500/[0.03] p-3 space-y-2" data-testid="ctf-creator">
      <div className="flex items-center gap-2"><Flag className="h-4 w-4 text-cyan-400" /><span className="text-xs font-mono uppercase text-cyan-300 flex-1">New CTF challenge</span>
        <button type="button" onClick={draft} disabled={!!busy || !lesson.title?.trim()} className="text-[11px] font-mono text-yellow-300 hover:text-yellow-200 inline-flex items-center gap-1 disabled:opacity-50" data-testid="ctf-new-ai-draft">
          <Wand2 className={`h-3.5 w-3.5 ${busy === "ai" ? "animate-pulse" : ""}`} />{busy === "ai" ? "Drafting (about 30s)..." : f.ioc?.trim() ? "Draft Intel CTF with AI" : "Draft with AI"}</button>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200" data-testid="ctf-new-close"><X className="h-4 w-4" /></button></div>
      <CtfFields f={f} setF={setF} />
      <button type="button" className="glow-btn !text-xs" disabled={!ctfReady(f) || !!busy} onClick={save} data-testid="ctf-new-save">{busy === "save" ? "Saving..." : "Save to CTF Arena & attach"}</button>
    </div>);
}
