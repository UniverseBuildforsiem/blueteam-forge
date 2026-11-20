import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api, fmtDate } from "../../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Glass, Empty } from "../common";
import { fmtTime } from "./Charts";
import { API } from "../../lib/api";

const S = ({ l, v, tid }) => <Glass className="p-4"><div className="text-[10px] font-mono uppercase text-slate-500">{l}</div><div className="font-mono text-2xl mt-1" data-testid={tid}>{v ?? "—"}</div></Glass>;
const diffTag = (p) => (p == null ? "—" : p >= 0.8 ? "easy" : p >= 0.4 ? "medium" : "hard");
const discTag = (d) => (d == null ? "n/a" : d >= 0.3 ? "good" : d >= 0.1 ? "fair" : "poor");

export function TestAnalytics({ id, back }) {
  const [a, setA] = useState(null);
  const [log, setLog] = useState(null);
  useEffect(() => { api.get(`/admin/exams/${id}/analytics`).then((r) => setA(r.data)); }, [id]);
  if (!a) return null;
  const missed = a.items.filter((x) => x.answered).slice(0, 10);
  return (
    <div className="space-y-5" data-testid="test-analytics">
      <button onClick={back} className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="analytics-back"><ArrowLeft className="h-3.5 w-3.5" />Tests</button>
      <h2 className="text-xl font-bold">{a.title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3"><S l="Attempts" v={a.attempts} tid="an-attempts" /><S l="Students" v={a.students} tid="an-students" /><S l="Average" v={a.average != null ? `${a.average}%` : null} tid="an-average" />
        <S l="Pass rate" v={a.pass_rate != null ? `${a.pass_rate}%` : null} tid="an-pass-rate" /><S l="Avg time" v={a.avg_time != null ? fmtTime(a.avg_time) : null} tid="an-time" /><S l="Completion" v={a.completion_rate != null ? `${a.completion_rate}%` : null} tid="an-completion" /></div>
      {a.focus_flagged > 0 && <div className="text-xs font-mono text-red-300" data-testid="an-focus-flagged">{a.focus_flagged} attempt(s) have recorded tab switches (strict mode)</div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <Glass className="p-5"><h3 className="font-bold mb-2">Most-missed questions</h3>{missed.length ? <ol className="space-y-2 text-xs" data-testid="an-most-missed">{missed.map((x) => <li key={x.qid} className="flex gap-2"><span className="font-mono text-red-300 w-12">{Math.round((x.p_correct || 0) * 100)}%</span><span className="flex-1 line-clamp-2">{x.stem}</span></li>)}</ol> : <Empty text="no data yet" />}</Glass>
        <Glass className="p-5"><h3 className="font-bold mb-2">Drop-off (unfinished attempts by answers given)</h3>{a.dropoff.length ? <div className="space-y-1 text-xs font-mono" data-testid="an-dropoff">{a.dropoff.map((x) => <div key={x.answered} className="flex gap-2 items-center"><span className="w-28">{x.answered} answered</span><div className="h-2 bg-yellow-400/70" style={{ width: `${x.attempts * 20}px` }} /><span>{x.attempts}</span></div>)}</div> : <Empty text="no abandoned attempts" />}
          <div className="text-[11px] font-mono text-slate-500 mt-3">submitted by mode: {Object.entries(a.by_mode).map(([k, v]) => `${k} ${v}`).join(" · ")}</div></Glass>
      </div>
      <Glass className="p-5"><h3 className="font-bold mb-2">Per-question difficulty & discrimination</h3><p className="text-[11px] text-slate-500 mb-2">Difficulty = share of candidates answering correctly. Discrimination = top 27% minus bottom 27% correct rate (≥0.3 good).</p>
        <div className="overflow-x-auto max-h-96"><table className="w-full text-xs" data-testid="an-items"><thead><tr className="text-left text-slate-500 font-mono"><th className="p-2">Question</th><th>Domain</th><th>n</th><th>p-correct</th><th>Difficulty</th><th>Discrimination</th></tr></thead>
          <tbody>{a.items.map((x) => <tr key={x.qid} className="border-t border-white/5"><td className="p-2 max-w-md truncate">{x.stem}</td><td className="text-slate-400">{x.domain}</td><td className="font-mono">{x.answered}</td><td className="font-mono">{x.p_correct ?? "—"}</td><td>{diffTag(x.p_correct)}</td><td className="font-mono">{x.discrimination ?? "—"} <span className="text-slate-500">{discTag(x.discrimination)}</span></td></tr>)}</tbody></table></div></Glass>
      <Glass className="p-5"><h3 className="font-bold mb-2">Recent attempts & identity</h3>{a.recent.length ? <table className="w-full text-xs font-mono" data-testid="an-recent"><tbody>{a.recent.map((r) => <tr key={r.id} className="border-t border-white/5"><td className="p-2">{r.user_name}</td><td>{r.mode} #{r.number}</td><td className={r.passed ? "text-green-300" : "text-red-300"}>{r.percent}%</td><td>{fmtTime(r.time_taken)}</td>
        <td>{r.identity.method}{r.identity.name ? ` · ${r.identity.name}` : ""}</td><td>{r.focus_count ? <button className="text-red-300 underline" onClick={() => setLog(r.id)} data-testid={`an-focus-${r.id}`}>{r.focus_count} switches · {r.away_seconds}s away</button> : <span className="text-slate-600">0 switches</span>}</td><td>{r.identity.photo && <a href={`${API}/admin/exam-attempts/${r.id}/photo`} target="_blank" rel="noreferrer" className="text-cyan-300 underline">photo</a>}</td></tr>)}</tbody></table> : <Empty text="no attempts yet" />}</Glass>
      {log && <FocusLog aid={log} close={() => setLog(null)} />}
    </div>);
}

function FocusLog({ aid, close }) {
  const [l, setL] = useState(null);
  useEffect(() => { api.get(`/admin/exam-attempts/${aid}/focus`).then((r) => setL(r.data)); }, [aid]);
  return <Dialog open onOpenChange={close}><DialogContent className="bg-[#0B0F1A] border-red-500/40 max-w-lg max-h-[80vh] overflow-auto" data-testid="focus-log"><DialogHeader><DialogTitle>Focus log · {l?.user_name}</DialogTitle></DialogHeader>
    {l && <div className="text-xs font-mono space-y-1"><div className="text-slate-400">{l.focus_count} switches · {l.away_seconds}s away in total</div>
      {(l.focus_events || []).map((e, i) => <div key={i} className="flex gap-3 border-t border-white/5 pt-1"><span className="text-slate-500 w-40">{fmtDate(e.at)}</span><span className="text-red-300 w-20">{e.event}</span><span>Q{e.question}</span><span className="ml-auto">{e.away_seconds}s</span></div>)}</div>}
  </DialogContent></Dialog>;
}
