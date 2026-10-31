import { useEffect, useState } from "react";
import { Flag, Lightbulb, Trophy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { api, errMsg } from "../../lib/api";
import { Glass, PageHeader } from "../../components/common";

const CATS = ["Log Analysis", "Forensics", "Network", "Malware", "Web"];

export default function CTF() {
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState([]);
  const [open, setOpen] = useState(null);
  const [flag, setFlag] = useState("");
  const load = async () => {
    const [b, s] = await Promise.all([api.get("/ctf"), api.get("/ctf/scoreboard")]);
    setBoard(b.data); setScore(s.data);
    setOpen((o) => (o ? b.data.find((x) => x.id === o.id) : o));
  };
  useEffect(() => { load(); const t = setInterval(() => api.get("/ctf/scoreboard").then((r) => setScore(r.data)), 10000); return () => clearInterval(t); }, []);
  const submit = async () => {
    try { const { data } = await api.post(`/ctf/${open.id}/submit`, { flag }); data.correct ? toast.success(data.already ? "Already solved" : `Flag captured! +${data.points}`) : toast.error("Wrong flag"); setFlag(""); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const hint = async (i) => { await api.post(`/ctf/${open.id}/hint/${i}`); load(); };
  return (
    <div>
      <PageHeader eyebrow="// jeopardy ctf" title="CTF Arena" sub="Flags use the format SOCF{...}. Hints cost points from that challenge's reward." />
      <div className="grid xl:grid-cols-[1fr_320px] gap-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="ctf-board">
          {CATS.map((cat) => (
            <div key={cat} className="space-y-3">
              <div className="font-mono text-xs uppercase text-cyan-400 text-center py-2 border-b border-cyan-500/30">{cat}</div>
              {board.filter((c) => c.category === cat).sort((a, b) => a.points - b.points).map((c) => (
                <button key={c.id} onClick={() => setOpen(c)} data-testid={`ctf-tile-${c.id}`}
                  className={`w-full glass rounded-sm p-4 text-center transition-colors ${c.solved ? "!border-green-400/60 bg-green-500/10" : "hover:!border-cyan-400"}`}>
                  <div className={`text-2xl font-mono font-bold ${c.solved ? "text-green-400" : "neon-text"}`}>{c.points}</div>
                  <div className="text-xs text-slate-300 mt-1 truncate">{c.title}</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">{c.solved ? "✓ solved" : `${c.solves} solves`}</div>
                </button>))}
            </div>))}
        </div>
        <Glass className="p-5 h-fit">
          <h3 className="font-bold flex items-center gap-2 mb-4"><Trophy className="h-4 w-4 text-yellow-300" />Live scoreboard</h3>
          <ol className="space-y-1.5" data-testid="ctf-scoreboard">
            {score.length ? score.map((s, i) => <li key={s.user_id} className="flex items-center gap-3 text-sm"><span className="font-mono text-slate-500 w-5">{i + 1}</span><span className="flex-1 truncate">{s.name}</span><span className="text-xs text-slate-500">{s.solves}⚑</span><span className="font-mono text-green-400">{s.points}</span></li>)
              : <li className="text-xs text-slate-500 font-mono">// no flags captured yet</li>}
          </ol>
        </Glass>
      </div>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-xl">
          {open && <><DialogHeader><DialogTitle className="font-mono flex items-center gap-2"><Flag className="h-5 w-5 text-cyan-400" />{open.title} <span className="text-green-400 text-sm">· {open.points} pts</span></DialogTitle></DialogHeader>
            <pre className="whitespace-pre-wrap text-sm text-slate-300 bg-black/40 p-4 border border-white/5 font-mono max-h-64 overflow-y-auto" data-testid="ctf-description">{open.description}</pre>
            <div className="space-y-2">{open.hints.map((h) => h.text ? <div key={h.idx} className="text-xs font-mono text-yellow-300">hint: {h.text}</div>
              : <button key={h.idx} onClick={() => hint(h.idx)} className="ghost-btn !text-xs" data-testid={`ctf-hint-${h.idx}`}><Lightbulb className="h-3.5 w-3.5" />Unlock hint (-{h.cost} pts)</button>)}</div>
            {open.solved ? <div className="text-green-400 font-mono flex items-center gap-2" data-testid="ctf-solved"><CheckCircle2 className="h-5 w-5" />Solved</div> :
              <div className="flex gap-2"><input className="field font-mono" value={flag} onChange={(e) => setFlag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="SOCF{...}" data-testid="ctf-flag-input" />
                <button className="glow-btn" onClick={submit} data-testid="ctf-flag-submit">Submit</button></div>}</>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
