import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, Flame, Zap, BadgeCheck, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { Glass, Stat } from "../components/common";
import PublicNav, { Footer } from "../components/PublicNav";

export default function PublicProfile() {
  const { username } = useParams();
  const [p, setP] = useState(undefined);
  useEffect(() => { api.get(`/public/profile/${username}`).then((r) => setP(r.data)).catch(() => setP(null)); }, [username]);
  return (
    <div className="min-h-screen grid-bg">
      <PublicNav />
      <div className="max-w-5xl mx-auto px-6 py-14">
        {p === undefined ? <p className="font-mono cursor-blink">loading profile </p> : !p ? (
          <Glass className="p-8" data-testid="profile-not-found"><h1 className="text-2xl font-bold">Profile not found</h1><p className="text-slate-400 mt-2 text-sm">This analyst profile doesn't exist or is private.</p></Glass>
        ) : (
          <div className="rise" data-testid="public-profile">
            <div className="eyebrow mb-3">// analyst profile · @{p.username}</div>
            <h1 className="text-4xl sm:text-5xl font-extrabold" data-testid="profile-name">{p.name}</h1>
            <p className="text-slate-400 mt-3 font-mono text-sm">{p.rank} · {p.goal ? `${p.goal} track · ` : ""}joined {p.joined}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
              <Stat label="Rank" value={p.rank} testId="profile-rank" />
              <Stat label="XP" value={p.xp} accent="neon-green" />
              <Stat label="Drill streak" value={<span className="flex items-center gap-2 text-orange-400"><Flame className="h-5 w-5" />{p.drill.current}d</span>} testId="profile-streak" />
              <Stat label="Longest / total drills" value={`${p.drill.longest}d / ${p.drill.total}`} />
            </div>
            <h2 className="text-lg font-bold mt-12 mb-4 flex items-center gap-2"><Zap className="h-5 w-5 text-green-400" />Badges</h2>
            {p.badges.length ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="profile-badges">
              {p.badges.map((b) => <Glass key={b.id} className="p-4 !border-green-400/40" data-testid={`profile-badge-${b.id}`}><Zap className="h-5 w-5 text-green-400" /><div className="font-mono text-sm mt-2">{b.name}</div><div className="text-xs text-slate-500">{b.description}</div></Glass>)}
            </div> : <p className="text-sm font-mono text-slate-500">// no badges yet</p>}
            <h2 className="text-lg font-bold mt-12 mb-4 flex items-center gap-2"><Award className="h-5 w-5 text-cyan-400" />Certificates</h2>
            {p.certificates.length ? <div className="grid md:grid-cols-2 gap-3" data-testid="profile-certificates">
              {p.certificates.map((c) => <Glass key={c.id} className="p-5 flex items-center gap-4"><BadgeCheck className="h-6 w-6 text-green-400 shrink-0" />
                <div className="flex-1"><div className="font-bold">{c.path_title}</div><div className="text-xs font-mono text-slate-500">{c.id} · {c.score}% · {c.issued_at.slice(0, 10)}</div></div>
                <Link to={`/verify/${c.id}`} className="ghost-btn !py-1 !text-xs" data-testid={`profile-cert-verify-${c.id}`}><ExternalLink className="h-3.5 w-3.5" />Verify</Link></Glass>)}
            </div> : <p className="text-sm font-mono text-slate-500">// no certificates yet</p>}
            <Glass className="p-6 mt-14 flex flex-wrap items-center justify-between gap-4"><span className="text-slate-300">Train on the same alerts as {p.name.split(" ")[0]}.</span><Link to="/register" className="glow-btn" data-testid="profile-cta-signup">Join SOCForge</Link></Glass>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
