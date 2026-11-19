import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel, Btn, In, Sel, Lbl, Table, Drawer, useForm } from "../ui";
import { ScanRun } from "../vm2/ScanRun";

const policies = (st) => { const m = new Map(); (st.console.pc_policies || []).forEach((p) => m.set(p.title, p)); return [...m.values()]; };
const expected = (c, pol, st) => { const e = [...(st.console.pc_edits || [])].reverse().find((x) => String(x.cid) === String(c.cid)); return e ? e.value : pol?.overrides?.[String(c.cid)] ?? c.expected; };
const passes = (op, exp, act) => (op === ">=" ? Number(act) >= Number(exp) : op === "1-5" ? Number(act) >= 1 && Number(act) <= Number(exp) : act.toLowerCase() === String(exp).toLowerCase());
const approved = (st) => { const a = new Set((st.console.pc_approved || []).map((x) => String(x.cid))); return (st.console.pc_exceptions || []).filter((x) => a.has(String(x.cid))); };
const isExc = (st, cid, host) => approved(st).some((x) => String(x.cid) === String(cid) && x.host === host);
const OPS = { ">=": "≥", "1-5": "1 –", "==": "=" };

export function grid(d, st, pol) {
  return d.m3.pc.controls.map((c) => { const exp = expected(c, pol, st); return { ...c, exp, res: c.actual.map((a) => passes(c.op, exp, a)) }; });
}

function Controls({ d, st, pol, emit }) {
  const [edit, setEdit] = useState(null);
  const [val, setVal] = useState("");
  return <Table rowTid="pcc-control-row" cols={["CID", "Control", "Expected", ""]} rows={d.m3.pc.controls.map((c) => [c.cid, c.title, edit === c.cid ? <In value={val} onChange={(e) => setVal(e.target.value)} data-testid={`pcc-control-value-${c.cid}`} /> : `${OPS[c.op]} ${expected(c, pol, st)}`,
    edit === c.cid ? <Btn primary onClick={() => { if (!val.trim()) return toast.error("Enter a value"); emit("pc.control_edited", { cid: String(c.cid), value: val.trim(), policy: pol.title }); setEdit(null); toast.success("Control updated"); }} data-testid={`pcc-control-save-${c.cid}`}>Save</Btn>
      : <Btn onClick={() => { setEdit(c.cid); setVal(String(expected(c, pol, st))); }} data-testid={`pcc-control-edit-${c.cid}`}>Edit</Btn>])} />;
}

export function Policies({ d, st, emit }) {
  const groups = (st.console.groups || []).map((g) => g.name);
  const [f, on, reset] = useForm({ title: "", template: d.m3.pc.library[0], group: groups[0] || "" });
  const pols = policies(st), cur = pols[pols.length - 1];
  const save = (e) => { e.preventDefault(); if (!f.title.trim() || !f.group) return toast.error("Title and asset group are required"); emit("pc.policy_created", { ...f, title: f.title.trim() }); toast.success("Policy created from library"); reset(); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="Compliance Policies" tid="pcc-policies"><Table rowTid="pcc-policy-row" empty="No policies" cols={["Title", "Template", "Asset group", "Controls"]} rows={pols.map((p) => [p.title, p.template, p.group, d.m3.pc.controls.length])} /></Panel>
    {cur && <Panel title={`Controls · ${cur.title}`} tid="pcc-controls"><Controls d={d} st={st} pol={cur} emit={emit} /></Panel>}
    <Panel title="New policy from library"><form onSubmit={save} className="grid sm:grid-cols-2 gap-2"><Lbl t="Library template"><Sel options={d.m3.pc.library} value={f.template} onChange={on("template")} data-testid="pcc-policy-template" /></Lbl><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="pcc-policy-title" /></Lbl>
      <Lbl t="Asset group"><Sel options={groups.length ? groups : ["(none)"]} value={f.group} onChange={on("group")} data-testid="pcc-policy-group" /></Lbl><div className="self-end"><Btn primary type="submit" data-testid="pcc-policy-create">Create policy</Btn></div></form></Panel></div>;
}

export function CScans({ d, st, emit }) {
  const pols = policies(st), auths = (st.console.auth || []).filter((a) => a.kind === "Windows").map((a) => a.title);
  const [f, on, reset] = useForm({ title: "", policy: pols[0]?.title || "", auth: "None", target: (st.console.groups || [])[0]?.name || "" });
  const [run, setRun] = useState(null);
  const launch = (e) => { e.preventDefault(); if (!f.title.trim() || !f.policy) return toast.error("Title and policy are required"); if (f.auth === "None") return toast.error("Compliance scans require authentication");
    emit("pc.scan_launched", { ...f, title: f.title.trim() });
    const g = grid(d, st, pols.find((p) => p.title === f.policy));
    setRun({ title: f.title.trim(), tiles: d.m3.pc.hosts.map((h) => ({ ip: h, name: h, label: h })), items: g.flatMap((c) => c.res.map((ok, i) => ({ h: { ip: d.m3.pc.hosts[i], tag: d.m3.pc.hosts[i] }, k: { qid: c.cid, title: `${c.title}: ${ok ? "PASS" : "FAIL"}`, severity: ok ? 1 : 4, tag: `CID ${c.cid}` } }))) }); reset(); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="Compliance scans" tid="pcc-cscans"><div className="space-y-3">{run && <ScanRun d={d} hosts={run.tiles} items={run.items} title={run.title} onDone={() => { setRun(null); toast.success("Compliance scan processed"); }} />}
    <Table rowTid="pcc-cscan-row" empty="No compliance scans" cols={["Title", "Policy", "Auth", "Target"]} rows={(st.console.pc_scans || []).map((s) => [s.title, s.policy, s.auth, s.target])} /></div></Panel>
    <Panel title="Launch compliance scan"><form onSubmit={launch} className="grid sm:grid-cols-2 gap-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="pcc-cscan-title" /></Lbl><Lbl t="Policy"><Sel options={pols.map((p) => p.title)} value={f.policy} onChange={on("policy")} data-testid="pcc-cscan-policy" /></Lbl>
      <Lbl t="Authentication record"><Sel options={["None", ...auths]} value={f.auth} onChange={on("auth")} data-testid="pcc-cscan-auth" /></Lbl><Lbl t="Target asset group"><Sel options={(st.console.groups || []).map((g) => g.name)} value={f.target} onChange={on("target")} data-testid="pcc-cscan-target" /></Lbl>
      <div className="self-end"><Btn primary type="submit" disabled={!!run} data-testid="pcc-cscan-launch">Launch</Btn></div></form></Panel></div>;
}

export function Posture({ d, st, emit }) {
  const scan = (st.console.pc_scans || []).slice(-1)[0];
  useEffect(() => { if (scan) emit("pc.posture_viewed", {}); }, [!!scan]); // eslint-disable-line
  if (!scan) return <Panel title="Posture" tid="pcc-posture"><p className="text-xs text-slate-500">No compliance scan yet. Launch one from Compliance Scans.</p></Panel>;
  const pol = policies(st).find((p) => p.title === scan.policy), g = grid(d, st, pol), cells = g.flatMap((c) => c.res), rate = Math.round((100 * cells.filter(Boolean).length) / cells.length);
  return <Panel title={`Posture · ${scan.policy}`} tid="pcc-posture"><div className="text-sm mb-2">Pass rate <b className="text-sky-200" data-testid="pcc-pass-rate">{rate}%</b> <span className="text-[11px] text-slate-400">({cells.filter(Boolean).length}/{cells.length} control checks)</span></div>
    <Table rowTid="pcc-posture-row" cols={["CID", "Control", "Expected", ...d.m3.pc.hosts]} rows={g.map((c) => [c.cid, c.title, `${OPS[c.op]} ${c.exp}`, ...c.res.map((ok, i) => isExc(st, c.cid, d.m3.pc.hosts[i]) ? <span className="text-yellow-200" title={c.actual[i]}>Exception</span>
      : <span className={ok ? "text-green-400" : "text-red-400"} title={`actual: ${c.actual[i]}`}>{ok ? "Pass" : <>Fail <span className="text-slate-500">({c.actual[i].replace("Success and Failure", "S+F")})</span></>}</span>)])} /></Panel>;
}

export function Exceptions({ d, st, emit }) {
  const [f, on, reset] = useForm({ cid: String(d.m3.pc.controls[0].cid), host: d.m3.pc.hosts[0], days: "90", reason: "" });
  const ok = new Set((st.console.pc_approved || []).map((x) => String(x.cid)));
  const save = (e) => { e.preventDefault(); if (f.reason.trim().length < 20) return toast.error("Write a justification (20+ characters)"); emit("pc.exception_created", { ...f, reason: f.reason.trim() }); toast.success("Exception requested · pending approval"); reset(); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="Exceptions" tid="pcc-exceptions"><Table rowTid="pcc-exc-row" empty="No exceptions" cols={["CID", "Host", "Days", "Justification", "Status", ""]} rows={(st.console.pc_exceptions || []).map((x, i) => [x.cid, x.host, x.days, x.reason, ok.has(String(x.cid)) ? <span className="text-green-400">Approved</span> : <span className="text-yellow-200">Pending</span>,
    ok.has(String(x.cid)) ? "" : <Btn onClick={() => { emit("pc.exception_approved", { cid: String(x.cid), host: x.host }); toast.success("Exception approved"); }} data-testid={`pcc-exc-approve-${i}`}>Approve</Btn>])} /></Panel>
    <Panel title="Request exception"><form onSubmit={save} className="grid sm:grid-cols-2 gap-2"><Lbl t="Control"><Sel options={d.m3.pc.controls.map((c) => String(c.cid))} value={f.cid} onChange={on("cid")} data-testid="pcc-exc-cid" /></Lbl><Lbl t="Host"><Sel options={d.m3.pc.hosts} value={f.host} onChange={on("host")} data-testid="pcc-exc-host" /></Lbl>
      <Lbl t="Duration (days)"><Sel options={["30", "60", "90", "180"]} value={f.days} onChange={on("days")} data-testid="pcc-exc-days" /></Lbl><Lbl t="Justification"><In value={f.reason} onChange={on("reason")} data-testid="pcc-exc-reason" /></Lbl><div><Btn primary type="submit" data-testid="pcc-exc-save">Request</Btn></div></form></Panel></div>;
}

export function PcReports({ d, st, emit }) {
  const pols = policies(st);
  const [pol, setPol] = useState(pols[0]?.title || "");
  const [open, setOpen] = useState(null);
  const view = (r) => { setOpen(r); emit("pc.report_viewed", { policy: r.policy }); };
  const g = open ? grid(d, st, pols.find((p) => p.title === open.policy)) : [];
  return <div className="grid grid-cols-1 gap-3"><Panel title="Policy reports" tid="pcc-reports"><Table rowTid="pcc-report-row" empty="No reports" cols={["Report", "Policy", ""]} rows={(st.console.pc_reports || []).map((r, i) => [r.title, r.policy, <Btn onClick={() => view(r)} data-testid={`pcc-report-view-${i}`}>View</Btn>])} />
    <div className="flex gap-2 items-end pt-3"><Lbl t="Policy"><Sel options={pols.map((p) => p.title)} value={pol} onChange={(e) => setPol(e.target.value)} data-testid="pcc-report-policy" /></Lbl><Btn primary onClick={() => { if (!pol) return toast.error("Create a policy first"); emit("pc.report_generated", { title: `Policy Report · ${pol}`, policy: pol }); toast.success("Report generated"); }} data-testid="pcc-report-run">Run Policy Report</Btn></div></Panel>
    {open && <Drawer title={open.title} onClose={() => setOpen(null)} tid="pcc-report-view"><Table cols={["CID", "Control", "Passed", "Failed", "Exceptions"]} rows={g.map((c) => { const ex = d.m3.pc.hosts.filter((h) => isExc(st, c.cid, h)).length; return [c.cid, c.title, c.res.filter(Boolean).length, c.res.filter((x, i) => !x && !isExc(st, c.cid, d.m3.pc.hosts[i])).length, ex]; })} /></Drawer>}</div>;
}
