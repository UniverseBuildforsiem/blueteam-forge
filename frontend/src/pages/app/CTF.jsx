import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { api } from "../../lib/api";
import { Glass, PageHeader, ProfileLink } from "../../components/common";
import { RankAvatar } from "../../components/RankAvatar";
import { CtfDialog } from "../../components/CtfDialog";

export const CATS = ["Log Analysis", "Forensics", "Network", "Malware", "Web", "Threat Intel"];

export default function CTF() {
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState([]);
  const [open, setOpen] = useState(null);
  const load = async () => {
    const [b, s] = await Promise.all([api.get("/ctf"), api.get("/ctf/scoreboard")]);
    setBoard(b.data); setScore(s.data);
    setOpen((o) => (o ? b.data.find((x) => x.id === o.id) : o));
  };
  useEffect(() => { load(); const t = setInterval(() => api.get("/ctf/scoreboard").then((r) => setScore(r.data)), 10000); return () => clearInterval(t); }, []);
  const cats = CATS.filter((cat) => cat !== "Threat Intel" || board.some((c) => c.category === cat));
  return (
    <div>
      <PageHeader eyebrow="// jeopardy ctf" title="CTF Arena" sub="Submit the plain answer (e.g. an IP, port or Event ID). Hints cost points from that challenge's reward." />
      <div className="grid xl:grid-cols-[1fr_320px] gap-4">
        <div className={`grid grid-cols-2 gap-3 ${cats.length > 5 ? "md:grid-cols-3 2xl:grid-cols-6" : "md:grid-cols-5"}`} data-testid="ctf-board">
          {cats.map((cat) => (
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
            {score.length ? score.map((s, i) => <li key={s.user_id} className="flex items-center gap-3 text-sm"><span className="font-mono text-slate-500 w-5">{i + 1}</span><RankAvatar rank={s.rank} frame={s.frame} size="xs" testId={`ctf-avatar-${s.username}`} /><ProfileLink username={s.username} isPublic={s.public} className="flex-1 truncate" testId={`ctf-profile-${s.username}`}>{s.name}</ProfileLink><span className="text-xs text-slate-500">{s.solves}⚑</span><span className="font-mono text-green-400">{s.points}</span></li>)
              : <li className="text-xs text-slate-500 font-mono">// no flags captured yet</li>}
          </ol>
        </Glass>
      </div>
      <CtfDialog c={open} onClose={() => setOpen(null)} onChange={load} />
    </div>
  );
}
