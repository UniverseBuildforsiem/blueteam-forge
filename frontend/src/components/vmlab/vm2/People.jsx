import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, ArrowUp, ArrowDown } from "lucide-react";
import { Sev, Panel, Btn, In, Sel, Lbl, Table, Drawer, SubTabs, Check, useForm } from "../ui";
import { allLists, listMatch, targetHosts, findings, groupsOf } from "./lib";

const ROLES = ["Manager", "Unit Manager", "Scanner", "Reader", "Remediation User"];

function Inbox({ d, st, emit, onClose }) {
  const mine = st.console.users || [];
  const [open, setOpen] = useState(null);
  const [f, on] = useForm({ login: "", password: "" });
  const act = () => emit("user.activated", { login: f.login.trim(), password: f.password });
  return <Drawer title="Inbox" onClose={onClose} tid="vmc-inbox">
    {mine.length ? mine.map((u, i) => <button key={i} onClick={() => { setOpen(i); emit("user.email_opened", { login: `socp_new${i + 1}` }); }} className="w-full text-left border border-slate-700 p-2 text-xs hover:bg-slate-700/40" data-testid={`vmc-inbox-mail-${i}`}><b>SOCP Registration – Start Now</b><div className="text-slate-400">to {u.email || u.name}</div></button>) : <p className="text-xs text-slate-500">No emails yet. Create a user first.</p>}
    {open != null && <div className="border border-sky-700 p-3 text-xs space-y-1 bg-[#0b121a]" data-testid="vmc-inbox-body"><p>Welcome {mine[open].name}! Your SOCP Sentinel account is ready.</p><p>Login: <code className="text-sky-200" data-testid="vmc-inbox-login">socp_new{open + 1}</code></p><p>Temporary password: <code className="text-sky-200" data-testid="vmc-inbox-password">{d.m2.password}</code></p></div>}
    <div className="border-t border-slate-700 pt-3 space-y-2"><div className="text-xs font-semibold">Activate account (first login)</div><Lbl t="Login"><In value={f.login} onChange={on("login")} data-testid="vmc-activate-login" /></Lbl><Lbl t="Password"><In type="password" value={f.password} onChange={on("password")} data-testid="vmc-activate-password" /></Lbl>
      <Btn primary onClick={act} data-testid="vmc-activate-submit">Log in & activate</Btn></div></Drawer>;
}

export function Users2({ d, st, emit }) {
  const [f, on, reset] = useForm({ name: "", email: "", role: "Reader" });
  const [gs, setGs] = useState([]);
  const [inbox, setInbox] = useState(false);
  const act = st.console.activated || [];
  const add = (e) => { e.preventDefault(); if (!f.name.trim() || !f.email.includes("@")) return toast.error("Full name and a valid email are required"); emit("user.created", { ...f, name: f.name.trim(), groups: gs.join(", ") }); toast.success("User created · Pending activation"); reset(); setGs([]); };
  const rows = [...d.users.map((u) => [u.name, u.login, u.role, "-", u.status]), ...(st.console.users || []).map((u, i) => [u.name, `socp_new${i + 1}`, u.role, u.groups || "-", act.includes(`socp_new${i + 1}`) ? <span className="text-green-400">Active</span> : <span className="text-yellow-200">Pending Activation</span>])];
  return <div className="grid grid-cols-1 gap-3 min-h-[420px]"><Panel title="Users" tid="vmc-users" actions={<Btn onClick={() => setInbox(true)} data-testid="vmc-users-inbox"><Mail className="inline h-3.5 w-3.5 mr-1" />Inbox</Btn>}><Table rowTid="vmc-user-row" cols={["Name", "Login", "Role", "Asset groups", "Status"]} rows={rows} /></Panel>
    <Panel title="New user"><form onSubmit={add} className="space-y-2"><Lbl t="Full name"><In value={f.name} onChange={on("name")} data-testid="vmc-user-name" /></Lbl><Lbl t="Email"><In value={f.email} onChange={on("email")} data-testid="vmc-user-email" /></Lbl>
      <Lbl t="User role"><Sel options={ROLES} value={f.role} onChange={on("role")} data-testid="vmc-user-role" /></Lbl>
      <div><div className="text-[11px] text-slate-400 mb-1">Asset groups</div>{groupsOf(st).length ? groupsOf(st).map((g) => <Check key={g.name} label={g.name} checked={gs.includes(g.name)} onChange={(v) => setGs(v ? [...gs, g.name] : gs.filter((x) => x !== g.name))} tid={`vmc-user-group-${g.name.replace(/\W+/g, "-").toLowerCase()}`} />) : <p className="text-[11px] text-slate-500">No asset groups</p>}</div>
      <Btn primary type="submit" data-testid="vmc-user-add">Save</Btn></form></Panel>
    {inbox && <Inbox d={d} st={st} emit={emit} onClose={() => setInbox(false)} />}</div>;
}

function Policies({ d, st, emit }) {
  const lists = allLists(d, st).map((l) => l.title);
  const logins = [...d.users, ...(st.console.users || []).map((u, i) => ({ ...u, login: `socp_new${i + 1}` }))].map((u) => `${u.login}`);
  const [f, on, reset] = useForm({ title: "", action: "Assign", target: "All", vulns: lists[0], assignee: logins[0], due: "30", reopen_days: "90" });
  const [reo, setReo] = useState(false);
  const pol = st.console.policies || [];
  const save = (e) => { e.preventDefault(); if (!f.title.trim()) return toast.error("Title is required");
    const base = { title: f.title.trim(), action: f.action, target: f.target, vulns: f.vulns };
    emit("remediation.policy_created", f.action === "Assign" ? { ...base, assignee: f.assignee, due: f.due, reopen: "no" } : { ...base, reopen: reo ? "yes" : "no", reopen_days: reo ? f.reopen_days : "" }); toast.success("Policy saved"); reset(); setReo(false); };
  const move = (i, dir) => emit("remediation.policy_moved", { title: pol[i].title, position: String(i + 1 + dir) });
  return <div className="grid grid-cols-1 gap-3"><Panel title="Remediation Policies (evaluated top to bottom)" tid="vmc-policies"><Table rowTid="vmc-policy-row" empty="No policies" cols={["#", "Title", "Action", "Vulnerabilities", "Assets", "Assignee / reopen", ""]} rows={pol.map((p, i) => [i + 1, p.title, p.action, p.vulns, p.target, p.action === "Assign" ? `${p.assignee} · due ${p.due}d` : p.reopen === "yes" ? `reopen after ${p.reopen_days}d` : "-",
    <span className="flex gap-1"><Btn disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" data-testid={`vmc-policy-up-${i}`}><ArrowUp className="h-3 w-3" /></Btn><Btn disabled={i === pol.length - 1} onClick={() => move(i, 1)} aria-label="Move down" data-testid={`vmc-policy-down-${i}`}><ArrowDown className="h-3 w-3" /></Btn></span>])} /></Panel>
    <Panel title="New rule"><form onSubmit={save} className="space-y-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="vmc-pol-title" /></Lbl><Lbl t="Action"><Sel options={["Assign", "Ignore"]} value={f.action} onChange={on("action")} data-testid="vmc-pol-action" /></Lbl>
      <Lbl t="Assets"><Sel options={["All", ...groupsOf(st).map((g) => g.name)]} value={f.target} onChange={on("target")} data-testid="vmc-pol-target" /></Lbl><Lbl t="Vulnerabilities (search list)"><Sel options={lists} value={f.vulns} onChange={on("vulns")} data-testid="vmc-pol-vulns" /></Lbl>
      {f.action === "Assign" ? <><Lbl t="Assign to (login)"><Sel options={logins} value={f.assignee} onChange={on("assignee")} data-testid="vmc-pol-assignee" /></Lbl><Lbl t="Due in (days)"><In type="number" value={f.due} onChange={on("due")} data-testid="vmc-pol-due" /></Lbl></>
        : <><Check label="Reopen ignored tickets" checked={reo} onChange={setReo} tid="vmc-pol-reopen" />{reo && <Lbl t="Reopen after (days)"><In type="number" value={f.reopen_days} onChange={on("reopen_days")} data-testid="vmc-pol-reopen-days" /></Lbl>}</>}
      <Btn primary type="submit" data-testid="vmc-pol-save">Save rule</Btn></form></Panel></div>;
}

function Tickets({ d, st, emit }) {
  useEffect(() => { emit("remediation.tickets_viewed", {}); }, []); // eslint-disable-line
  const seen = new Set(), rows = [];
  (st.console.policies || []).forEach((p) => { const m = listMatch(d, st, p.vulns);
    targetHosts(d, st, p.target === "All" ? "All lab hosts" : p.target).forEach((h) => findings(d, h).filter((k) => k.type !== "Information gathered" && m(k)).forEach((k) => {
      const key = `${h.ip}-${k.qid}`; if (seen.has(key)) return; seen.add(key);
      rows.push([`#${4100 + rows.length}`, h.ip, <Sev n={k.severity} />, k.qid, k.title, p.action === "Assign" ? p.assignee : "-", p.action === "Assign" ? `${p.due} days` : "-", p.action === "Assign" ? "Open" : "Ignored"]); })); });
  return <Panel title={`Tickets (${rows.length})`} tid="vmc-tickets"><Table rowTid="vmc-ticket-row" cols={["Ticket", "IP", "Sev", "QID", "Title", "Assignee", "Due", "State"]} rows={rows} empty="No tickets. Create a policy, then rescan." /></Panel>;
}

export function Remediation({ ...p }) {
  const [t, setT] = useState("policies");
  const V = t === "policies" ? Policies : Tickets;
  return <div className="space-y-3"><SubTabs tid="vmc-rem-tab" cur={t} set={setT} tabs={[["policies", "Policies"], ["tickets", "Tickets"]]} /><V {...p} /></div>;
}
