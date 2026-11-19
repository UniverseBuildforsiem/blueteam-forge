import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { Panel, Btn, Check } from "../ui";

function One({ s, st, emit }) {
  const [pick, setPick] = useState([]);
  const sent = (st.console.scenarios || []).some((x) => x.sid === s.id);
  const submit = async () => {
    if (!pick.length) return toast.error("Tick at least one item");
    const r = await emit("scenario.checked", { sid: s.id, picked: [...pick].sort().join(",") });
    if (r && !r.new?.length) toast.info("Submitted. If the task didn't tick, some picks are wrong or missing. Re-read the intro and try again.");
  };
  return <Panel title={s.prompt} tid={`pcc-scenario-${s.id}`}><div className="space-y-1.5">{s.items.map((it) => <Check key={it.id} label={`${it.id.toUpperCase()}. ${it.text}`} checked={pick.includes(it.id)} onChange={(v) => setPick(v ? [...pick, it.id] : pick.filter((x) => x !== it.id))} tid={`pcc-scenario-${s.id}-${it.id}`} />)}
    <div className="flex items-center gap-3 pt-2"><Btn primary onClick={submit} data-testid={`pcc-scenario-${s.id}-submit`}>Submit checklist</Btn>{sent && <span className="text-[11px] text-slate-400">submitted before. You can resubmit.</span>}</div></div></Panel>;
}

export function Scenario({ st, emit, lab }) {
  const list = lab?.scenarios || [];
  if (!list.length) return <div className="h-full grid place-items-center text-center text-sm text-slate-400" data-testid="pcc-scenario-none"><div><ClipboardCheck className="h-8 w-8 mx-auto mb-2 text-slate-500" />This lab has no scenario checklist. Use the other console screens.</div></div>;
  return <div className="space-y-3">{list.map((s) => <One key={s.id} s={s} st={st} emit={emit} />)}</div>;
}
