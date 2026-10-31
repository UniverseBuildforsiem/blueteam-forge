import { Link } from "react-router-dom";
import { Target, ArrowRight } from "lucide-react";
import { Glass } from "./common";
import { badgeArt } from "../lib/badges";

const ORDER = [["first-blood", "/app/ctf", "Open CTF arena"], ["on-fire", "/app/drill", "Do today's drill"], ["triage-pro", "/app/challenges", "Triage alerts"],
  ["quiz-master", "/app/quizzes", "Take a quiz"], ["lab-rat", "/app/labs", "Start a lab"], ["drill-7", "/app/drill", "Keep the streak"],
  ["pathfinder", "/app/paths", "Finish a path"], ["drill-30", "/app/drill", "Keep the streak"]];

export default function NextBadge({ badges }) {
  const byId = Object.fromEntries(badges.map((b) => [b.id, b]));
  const next = ORDER.find(([id]) => byId[id] && !byId[id].earned);
  if (!next) return null;
  const b = byId[next[0]];
  const a = badgeArt(b);
  return (
    <Glass className={`p-5 mb-4 flex flex-wrap items-center gap-5 border ${a.ring}`} data-testid="next-badge-card">
      <div className="relative h-20 w-20 rounded-full overflow-hidden border-2 border-white/15 shrink-0">
        <img src={a.img2} alt={b.name} className="h-full w-full object-cover grayscale opacity-60" />
      </div>
      <div className="flex-1 min-w-[200px]">
        <div className="eyebrow flex items-center gap-2"><Target className="h-3.5 w-3.5" />next badge to chase</div>
        <div className="mt-1 text-lg font-bold" data-testid="next-badge-name">{b.name} <span className={`text-xs font-mono uppercase ${a.text}`}>{a.level}</span></div>
        <p className="text-sm text-slate-400" data-testid="next-badge-rule">How to unlock: {b.description}</p>
      </div>
      <Link to={next[1]} className="glow-btn" data-testid="next-badge-go">{next[2]} <ArrowRight className="h-4 w-4" /></Link>
    </Glass>
  );
}
