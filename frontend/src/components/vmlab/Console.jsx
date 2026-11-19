import { useEffect, useState } from "react";
import { Shield, LayoutDashboard, Server, Tag, Boxes, Radar, CalendarClock, FileBarChart, Users as UsersIcon, BookOpen, Cpu, Globe, ClipboardCheck } from "lucide-react";
import { api } from "../../lib/api";
import * as V from "./ConsoleViews";
import { Agents } from "./AgentViews";

const APPS = [
  { id: "vm", label: "VMDR", nav: [["dashboard", "Dashboard", LayoutDashboard, V.Dashboard], ["assets", "Assets", Server, V.Assets], ["tags", "Tags", Tag, V.Tags], ["groups", "Asset Groups", Boxes, V.Groups], ["scans", "Scans", Radar, V.Scans], ["schedules", "Schedules", CalendarClock, V.Schedules], ["reports", "Reports", FileBarChart, V.Reports], ["kb", "KnowledgeBase", BookOpen, V.KB], ["users", "Users", UsersIcon, V.Users]] },
  { id: "ca", label: "Cloud Agent", nav: [["agents", "Agents & Keys", Cpu, Agents]] },
  { id: "was", label: "Web App Scanning", nav: [], soon: Globe },
  { id: "pc", label: "Policy Compliance", nav: [], soon: ClipboardCheck },
];

export function Console({ lab, emit }) {
  const [d, setD] = useState(null);
  const [app, setApp] = useState("ca");
  const [view, setView] = useState("agents");
  useEffect(() => { api.get("/vmlab/console-data").then((r) => setD(r.data)); }, []);
  if (!d) return <div className="h-full grid place-items-center text-xs text-slate-500">Loading console…</div>;
  const A = APPS.find((a) => a.id === app), cur = A.nav.find((n) => n[0] === view) || A.nav[0], View = cur?.[3];
  const pick = (a) => { setApp(a.id); setView(a.nav[0]?.[0]); };
  return <div className="h-full flex flex-col bg-[#0f1720] border border-slate-700/70 text-slate-200" data-testid="vm-console">
    <div className="flex items-center gap-3 px-3 py-2 bg-[#0b2238] border-b border-sky-900">
      <span className="flex items-center gap-1.5 font-semibold text-[13px] text-white shrink-0"><Shield className="h-4 w-4 text-sky-400" /><span className="hidden md:inline">{d.brand}</span></span>
      <div className="flex gap-1 overflow-x-auto" role="tablist">{APPS.map((a) => <button key={a.id} role="tab" aria-selected={app === a.id} onClick={() => pick(a)} className={`px-2.5 py-1 text-[11px] whitespace-nowrap ${app === a.id ? "bg-sky-600 text-white" : "text-sky-100/80 hover:bg-white/10"}`} data-testid={`vmc-app-${a.id}`}>{a.label}</button>)}</div>
      <span className="ml-auto text-[10px] font-mono text-sky-200/60 hidden sm:inline">training · fake data</span>
    </div>
    <div className="flex flex-1 min-h-0">
      {A.nav.length > 1 && <nav className="w-12 sm:w-44 shrink-0 border-r border-slate-700/70 py-2 overflow-y-auto" aria-label="Console navigation">{A.nav.map(([id, l, I]) => <button key={id} onClick={() => setView(id)} aria-current={cur[0] === id ? "page" : undefined}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${cur[0] === id ? "bg-sky-500/15 text-sky-200 border-l-2 border-sky-400" : "text-slate-300 hover:bg-slate-700/40 border-l-2 border-transparent"}`} data-testid={`vmc-nav-${id}`} title={l}><I className="h-3.5 w-3.5 shrink-0" /><span className="hidden sm:inline truncate">{l}</span></button>)}</nav>}
      <main className="flex-1 min-w-0 overflow-auto p-3">{View ? <View d={d} st={lab.state} emit={emit} />
        : <div className="h-full grid place-items-center text-center text-sm text-slate-400" data-testid={`vmc-soon-${A.id}`}><div><A.soon className="h-8 w-8 mx-auto mb-2 text-slate-500" />{A.label} labs are coming soon.</div></div>}</main>
    </div>
  </div>;
}
