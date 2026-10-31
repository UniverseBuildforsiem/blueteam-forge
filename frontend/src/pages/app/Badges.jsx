import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Lock, CheckCircle2, Sparkles } from "lucide-react";
import { api } from "../../lib/api";
import { LEVELS, badgeArt } from "../../lib/badges";
import { Glass, PageHeader } from "../../components/common";
import { RankAvatar } from "../../components/RankAvatar";
import ShareCardButton from "../../components/ShareCardButton";

const FRAME_INFO = { ember: ["Ember", "red flame pulse"], neon: ["Neon", "cyan spinning ring"], glitch: ["Glitch", "flickering RGB split"] };

const BadgeCard = ({ b }) => {
  const a = badgeArt(b);
  const locked = !b.earned;
  return (
    <Glass className={`p-5 flex flex-col items-center text-center border ${locked ? "!border-white/5" : a.ring}`} data-testid={`collection-badge-${b.id}`}>
      <div className={`relative h-32 w-32 rounded-full overflow-hidden border-4 ${locked ? "border-white/10" : `${a.ring} ${a.glow}`}`}>
        <img src={a.img2} alt={b.name} loading="lazy" className={`h-full w-full object-cover ${locked ? "grayscale opacity-25 blur-[1px]" : ""}`} />
        {locked && <Lock className="absolute inset-0 m-auto h-7 w-7 text-slate-300" />}
      </div>
      <div className="mt-4 font-bold">{b.name}</div>
      <div className={`mt-1 inline-flex items-center gap-1 text-[10px] font-mono uppercase ${locked ? "text-slate-500" : "text-green-400"}`} data-testid={`collection-status-${b.id}`}>
        {locked ? <><Lock className="h-3 w-3" />locked</> : <><CheckCircle2 className="h-3 w-3" />earned</>}
      </div>
      <p className="text-xs text-slate-400 mt-2" data-testid={`collection-rule-${b.id}`}>{locked ? "How to unlock: " : ""}{b.description}</p>
      {!locked && b.kind !== "course" && <div className="mt-4"><ShareCardButton endpoint={`/me/badges/${b.id}/share-card`} title={`Share your ${b.name} badge`} testId={`collection-share-${b.id}`} /></div>}
    </Glass>
  );
};

function FramePicker({ d, setD }) {
  const elite = d.rank === "Elite";
  const pick = async (frame) => {
    try { const { data } = await api.patch("/me/avatar-frame", { frame }); setD({ ...d, frame: data.frame }); toast.success(frame ? `${FRAME_INFO[frame][0]} frame on` : "Frame removed"); }
    catch { toast.error("Couldn't change your frame"); }
  };
  return (
    <Glass className="p-6 mb-10" data-testid="frame-picker">
      <div className="flex flex-wrap items-center gap-6">
        <RankAvatar rank={d.rank} size="lg" frame={elite ? d.frame : null} testId="frame-preview" />
        <div className="flex-1 min-w-[220px]">
          <div className="eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" />avatar frame · elite perk</div>
          <h3 className="text-xl font-bold mt-2">You're a <span className={LEVELS[d.rank].text}>{d.rank}</span> · {d.xp.toLocaleString()} XP</h3>
          <p className="text-sm text-slate-400 mt-1">{elite ? "Pick a glowing frame for your avatar on every leaderboard." : `Reach Elite at 3,000 XP to unlock glowing avatar frames. ${(3000 - d.xp).toLocaleString()} XP to go.`}</p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[null, ...d.frames].map((f) => (
          <button key={f || "none"} disabled={!elite} onClick={() => pick(f)} data-testid={`frame-option-${f || "none"}`}
            className={`flex items-center gap-3 p-3 border rounded-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${elite && d.frame === f ? "border-green-400 bg-green-500/10" : "border-white/10 hover:border-cyan-400/60"}`}>
            <RankAvatar rank="Elite" size="md" frame={f} />
            <div><div className="text-sm font-mono font-bold">{f ? FRAME_INFO[f][0] : "No frame"}</div><div className="text-[10px] text-slate-500">{f ? FRAME_INFO[f][1] : "plain ring"}</div></div>
          </button>))}
      </div>
    </Glass>
  );
}

export default function Badges() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/me/badges").then((r) => setD(r.data)).catch(() => setD(false)); }, []);
  if (d === null) return <div className="font-mono text-cyan-400 cursor-blink">loading badges </div>;
  if (!d) return <div className="text-slate-400">Couldn't load your badges.</div>;
  const std = d.badges.filter((b) => b.kind !== "course");
  const courses = d.badges.filter((b) => b.kind === "course");
  return (
    <div>
      <PageHeader eyebrow="// badge collection" title="Badges" sub={`${d.badges.filter((b) => b.earned).length} earned · ${std.filter((b) => !b.earned).length} still locked. Harder badges unlock higher levels.`} />
      <FramePicker d={d} setD={setD} />
      {Object.keys(LEVELS).map((lvl, i) => (
        <section key={lvl} className="mb-10" data-testid={`collection-level-${lvl.toLowerCase()}`}>
          <div className="flex items-baseline gap-3 mb-4"><span className="font-mono text-xs text-slate-500">LEVEL 0{i + 1}</span><h2 className={`text-2xl font-extrabold font-mono ${LEVELS[lvl].text}`}>{lvl}</h2><span className="text-sm text-slate-500">{LEVELS[lvl].blurb}</span></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{std.filter((b) => b.level === lvl).map((b) => <BadgeCard key={b.id} b={b} />)}</div>
        </section>))}
      <section data-testid="collection-course-badges">
        <div className="flex items-baseline gap-3 mb-4"><h2 className="text-2xl font-extrabold font-mono text-slate-200">Course badges</h2><span className="text-sm text-slate-500">Recruit level · one per watched course</span></div>
        {courses.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{courses.map((b) => <BadgeCard key={b.id} b={b} />)}</div>
          : <Glass className="p-6 text-sm text-slate-400" data-testid="collection-course-empty">How to unlock: open any course on the <Link to="/courses" className="text-cyan-300 underline">courses page</Link> and mark it as watched.</Glass>}
      </section>
    </div>
  );
}
