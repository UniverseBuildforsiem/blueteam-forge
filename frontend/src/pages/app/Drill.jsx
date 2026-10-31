import { useEffect, useState } from "react";
import { Flame, CalendarCheck, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../lib/api";
import { Glass, PageHeader, SeverityBadge } from "../../components/common";
import { Investigate } from "./Challenges";

function Done({ d }) {
  const s = d.submission;
  return (
    <Glass className="p-6" data-testid="drill-completed">
      <div className="flex items-center gap-2 font-mono font-bold text-lg">{s.verdict_correct ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <XCircle className="h-5 w-5 text-red-400" />}Today's drill complete · {s.auto_score}/100</div>
      <div className="text-sm text-slate-400 mt-2">You earned <span className="text-green-400 font-mono">+{s.xp} XP</span> (including the {d.bonus_xp} XP daily bonus). A fresh alert lands tomorrow (UTC).</div>
      <div className="mt-4 space-y-1 text-xs font-mono">
        <div className="text-slate-400">Your verdict: <span className="text-slate-200">{s.verdict}</span>{s.expected_verdict && <> · expected: <span className="text-slate-200">{s.expected_verdict}</span></>}</div>
        <div className="text-slate-400">Covered: <span className="text-green-300">{s.keywords_hit.join(", ") || "—"}</span></div>
        {s.missed_keywords && <div className="text-slate-400" data-testid="drill-missed">Missed: <span className="text-orange-300">{s.missed_keywords.join(", ") || "—"}</span></div>}
      </div>
    </Glass>
  );
}

export default function Drill() {
  const [d, setD] = useState(null);
  const load = () => api.get("/drill/today").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  if (!d) return null;
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow={`// daily alert drill · ${d.date}`} title="Today's alert"
        sub={`One fresh triage case every day. Finish it for a +${d.bonus_xp} XP bonus on top of your score, and keep your streak alive.`}
        right={<div className="flex items-center gap-2 font-mono text-orange-400 text-lg" data-testid="drill-streak"><Flame className="h-5 w-5" />{d.drill_streak} day drill streak</div>} />
      {d.submission ? <Done d={d} /> : (
        <Glass className="p-6" data-testid="drill-case">
          <div className="flex flex-wrap items-center gap-3"><SeverityBadge level={d.severity} /><span className="font-mono text-xs text-cyan-400">{d.alert.rule}</span>
            <span className="font-mono text-xs text-slate-500 flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5" />{d.category}</span></div>
          <h2 className="text-xl font-bold mt-3" data-testid="drill-title">{d.title}</h2>
          <Investigate c={d} submitUrl="/drill/today/submit" onDone={load} />
        </Glass>
      )}
    </div>
  );
}
