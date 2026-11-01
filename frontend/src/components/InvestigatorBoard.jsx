import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Crown } from "lucide-react";
import { api } from "../lib/api";
import { Glass, ProfileLink } from "./common";
import { RankAvatar } from "./RankAvatar";

const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default function InvestigatorBoard({ meId }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/leaderboard/investigators").then((r) => setD(r.data)).catch(() => {}); }, []);
  if (!d) return null;
  return (
    <Glass className="p-6" data-testid="investigator-board">
      <h3 className="font-bold flex items-center gap-2"><Search className="h-4 w-4 text-cyan-300" />Top investigators this week</h3>
      <div className="text-[11px] font-mono text-slate-500 mt-1 mb-4" data-testid="investigator-board-reset">alerts investigated before the verdict · resets {fmt(d.resets_on)}</div>
      {d.top.length ? <ol className="space-y-2" data-testid="investigator-board-list">{d.top.map((u, i) => (
        <li key={u.id} className={`flex items-center gap-3 text-sm px-2 py-1.5 ${u.id === meId ? "bg-cyan-500/10" : ""}`} data-testid={`investigator-row-${i}`}>
          <span className="font-mono text-slate-500 w-5">{i + 1}</span><RankAvatar rank={u.rank} frame={u.frame} size="xs" />
          <ProfileLink username={u.username} isPublic={u.public} className="flex-1 truncate">{u.name}</ProfileLink>
          <span className="font-mono text-cyan-300" data-testid={`investigator-count-${i}`}>{u.count}</span></li>))}</ol>
        : <div className="text-xs text-slate-400" data-testid="investigator-board-empty">No one yet this week — <Link to="/app/challenges" className="text-cyan-300 hover:underline">investigate an alert</Link> to take the top spot.</div>}
      <div className="mt-4 pt-3 border-t border-white/5 text-xs font-mono text-slate-400 space-y-1">
        <div data-testid="investigator-board-me">you: <span className="text-slate-200">{d.me.count}</span> this week{d.me.position ? ` · #${d.me.position}` : ""}</div>
        {d.last_champion && <div className="flex items-center gap-1.5" data-testid="investigator-board-champion"><Crown className="h-3.5 w-3.5 text-yellow-300" />last week: <span className="text-yellow-200">{d.last_champion.name}</span> ({d.last_champion.count})</div>}
      </div>
    </Glass>);
}
