import { useState } from "react";
import { Flag, Lightbulb, CheckCircle2, Radar, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { api, errMsg } from "../lib/api";
import IntelReport from "./intel/IntelReport";

function IntelInline({ ioc }) {
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { setR((await api.post("/intel/lookup", { ioc })).data); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  return (
    <div className="border border-cyan-500/25 bg-cyan-500/[0.03] p-3" data-testid="ctf-intel-box">
      <div className="flex flex-wrap items-center gap-2 text-xs"><Radar className="h-4 w-4 text-cyan-400" /><span className="text-slate-400">Investigate</span><code className="font-mono text-cyan-300 break-all" data-testid="ctf-intel-ioc">{ioc}</code>
        <button className="ghost-btn !text-xs !py-1 ml-auto" onClick={run} disabled={busy} data-testid="ctf-intel-lookup">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}{busy ? "Checking sources..." : r ? "Re-run lookup" : "Run Threat Intel lookup"}</button></div>
      {r && <div className="mt-3" data-testid="ctf-intel-report"><IntelReport r={r} /></div>}
    </div>);
}

export function CtfDialog({ c, onClose, onChange }) {
  const [flag, setFlag] = useState("");
  const submit = async () => {
    try { const { data } = await api.post(`/ctf/${c.id}/submit`, { flag }); data.correct ? toast.success(data.already ? "Already solved" : `Flag captured! +${data.points}`) : toast.error("Wrong flag"); setFlag(""); onChange(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const hint = async (i) => { await api.post(`/ctf/${c.id}/hint/${i}`); onChange(); };
  return (
    <Dialog open={!!c} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={`bg-[#0B0F1A] border-cyan-500/30 ${c?.ioc ? "max-w-4xl" : "max-w-xl"} max-h-[90vh] overflow-y-auto`} data-testid="ctf-dialog">
        {c && <><DialogHeader><DialogTitle className="font-mono flex items-center gap-2"><Flag className="h-5 w-5 text-cyan-400" />{c.title} <span className="text-green-400 text-sm" data-testid="ctf-dialog-points">· {c.points - c.hints.filter((h) => h.text).reduce((a, h) => a + h.cost, 0)} pts</span></DialogTitle></DialogHeader>
          <pre className="whitespace-pre-wrap text-sm text-slate-300 bg-black/40 p-4 border border-white/5 font-mono max-h-64 overflow-y-auto" data-testid="ctf-description">{c.description}</pre>
          {c.ioc && <IntelInline ioc={c.ioc} />}
          <div className="space-y-2">{c.hints.map((h) => h.text ? <div key={h.idx} className="text-xs font-mono text-yellow-300">hint: {h.text}</div>
            : !c.solved && <button key={h.idx} onClick={() => hint(h.idx)} className="ghost-btn !text-xs" data-testid={`ctf-hint-${h.idx}`}><Lightbulb className="h-3.5 w-3.5" />Unlock hint (-{h.cost} pts)</button>)}</div>
          {c.solved ? <><div className="text-green-400 font-mono flex items-center gap-2" data-testid="ctf-solved"><CheckCircle2 className="h-5 w-5" />Solved</div>
            {c.writeup && <div className="border-l-2 border-green-400/60 bg-green-500/5 p-4" data-testid="ctf-writeup"><div className="text-[11px] font-mono uppercase text-green-300 mb-2 flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" />Writeup</div>
              <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{c.writeup}</p></div>}</> :
            <div className="flex gap-2"><input className="field font-mono" value={flag} onChange={(e) => setFlag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Your answer" data-testid="ctf-flag-input" />
              <button className="glow-btn" onClick={submit} data-testid="ctf-flag-submit">Submit</button></div>}</>}
      </DialogContent>
    </Dialog>);
}

export function LessonCtfButton({ a, children, className }) {
  const [c, setC] = useState(null);
  const load = async () => {
    try { const found = (await api.get("/ctf")).data.find((x) => String(x.id) === String(a.id)); found ? setC(found) : toast.error("This CTF is no longer available"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (<>
    <button type="button" onClick={load} className={className} data-testid={`lesson-attachment-ctf-${a.id}`}>{children}</button>
    <CtfDialog c={c} onClose={() => setC(null)} onChange={load} />
  </>);
}
