import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Workflow, ArrowLeft, CheckCircle2, XCircle, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { api, errMsg } from "../../lib/api";
import { SeverityBadge } from "../common";
import { PlaybookRunner, MitreTags } from "./PlaybookRunner";

export function PlaybookResult({ run }) {
  if (!run) return <div className="text-xs text-slate-500 mt-2" data-testid="pb-result-none">Playbook: not used on this alert.</div>;
  return (
    <div className={`mt-3 text-xs border-l-2 pl-3 py-1 ${run.correct ? "border-green-400" : "border-orange-400"}`} data-testid="pb-result">
      <div className="font-mono flex items-center gap-1.5">{run.correct ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <XCircle className="h-3.5 w-3.5 text-orange-300" />}
        {run.correct ? "Followed the correct playbook path" : "Playbook path didn't match the correct outcome"}</div>
      <div className="text-slate-400 mt-1">{run.playbook_title} · you {run.outcome === "escalate" ? "escalated" : "closed"} it; expected to {run.expected_outcome === "escalate" ? "escalate" : "close"}.</div>
      {run.wrong_step && <div className="text-orange-200 mt-1" data-testid="pb-wrong-step">Went off track at "{run.wrong_step.title}" when you chose "{run.wrong_step.answer}".</div>}
    </div>);
}

function Picker({ list, pick }) {
  if (!list) return <div className="text-sm text-slate-500 mt-6">Loading playbooks...</div>;
  if (!list.length) return <div className="text-sm text-slate-500 mt-6" data-testid="pb-panel-empty">No playbook covers this alert type yet.</div>;
  return (
    <div className="space-y-2 mt-5">{list.map((p) => <button key={p.id} onClick={() => pick(p)} className="w-full text-left border border-white/10 hover:border-cyan-400 p-3 transition-colors" data-testid={`pb-panel-item-${p.id}`}>
      <div className="flex items-center gap-2 text-[11px] font-mono"><SeverityBadge level={p.severity} /><span className={p.source.type === "siem" ? "text-yellow-300" : "text-cyan-400"}>{p.source.type === "siem" ? "SIEM alert" : "SOP"}</span></div>
      <div className="text-sm font-bold mt-2">{p.title.replace(/^Playbook:\s*/, "")}</div><div className="text-xs text-slate-400 mt-1 line-clamp-2">{p.summary}</div></button>)}</div>);
}

export function PlaybookPanel({ c, open, setOpen, onRecorded }) {
  const [list, setList] = useState(null);
  const [failed, setFailed] = useState(false);
  const [pb, setPb] = useState(null);
  useEffect(() => { if (open && !list) { setFailed(false); api.get(`/challenges/${c.id}/playbooks`).then((r) => { setList(r.data); if (r.data.length === 1) setPb(r.data[0]); }).catch(() => setFailed(true)); } }, [open]); // eslint-disable-line
  const finish = async (path) => {
    try {
      const { data } = await api.post(`/playbooks/${pb.id}/run`, { path, challenge_id: c.id });
      toast.success(!data.recorded ? "Practice run — your first playbook run for this alert is kept" : data.result ? "Playbook path recorded" : "Playbook path recorded — you'll see if it was right after you submit");
      onRecorded?.(data.result);
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="bg-[#0B0F1A] border-cyan-500/20 w-full sm:max-w-lg overflow-y-auto" data-testid="pb-panel">
        <SheetHeader><SheetTitle className="font-mono flex items-center gap-2"><Workflow className="h-5 w-5 text-cyan-400" />Playbook</SheetTitle>
          <div className="text-xs text-slate-400">{c.category} · {c.title}</div></SheetHeader>
        {failed ? <div className="text-sm text-red-300 mt-6" data-testid="pb-panel-error">Couldn't load playbooks for this alert. Please try again.</div> : !pb ? <Picker list={list} pick={setPb} /> : <div className="mt-4">
          {list?.length > 1 && <button onClick={() => setPb(null)} className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1 mb-3" data-testid="pb-panel-back"><ArrowLeft className="h-3.5 w-3.5" />Other playbooks</button>}
          <div className="font-bold" data-testid="pb-panel-title">{pb.title}</div>
          <div className="mt-2 mb-4"><MitreTags tags={pb.mitre} /></div>
          <PlaybookRunner key={pb.id} pb={pb} onFinish={finish} />
          {pb.lab_info?.length > 0 && <div className="mt-6 border-t border-white/10 pt-4"><div className="eyebrow mb-2 flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" />related labs</div>
            {pb.lab_info.map((l) => <Link key={l.id} to={`/app/labs/${l.id}`} className="block text-xs text-cyan-300 hover:underline py-0.5" data-testid={`pb-panel-lab-${l.id}`}>{l.title}</Link>)}</div>}
        </div>}
      </SheetContent>
    </Sheet>);
}
