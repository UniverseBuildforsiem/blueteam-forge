import { useEffect, useState } from "react";
import { Shield, LayoutDashboard, Server, Tag, Boxes, Radar, CalendarClock, FileBarChart, Users as UsersIcon, BookOpen, Cpu, Globe, ClipboardCheck } from "lucide-react";
import { api } from "../../lib/api";
import * as V from "./ConsoleViews";
import { Agents } from "./AgentViews";
import { Wrench } from "lucide-react";
import { Dash2 } from "./vm2/Dash";
import { Assets2, Groups2 } from "./vm2/Assets";
import { Tags2 } from "./vm2/Tags";
import { Scans2 } from "./vm2/Scans";
import { Schedules2 } from "./vm2/Schedules";
import { Reports2 } from "./vm2/Reports";
import { KB2 } from "./vm2/KB";
import { Users2, Remediation } from "./vm2/People";
import { WebApps, WasAuth, WasProfiles } from "./was/Apps";
import { WasScans, WasSchedules } from "./was/Scans";
import { WasReports, WasLists } from "./was/Reports";
import { Scenario } from "./pc/Scenario";
import { Pci } from "./pc/Pci";
import { Policies, CScans, Posture, Exceptions, PcReports } from "./pc/Policy";
import { KeyRound, SlidersHorizontal, ListChecks, ShieldCheck, Gauge, FileWarning, CreditCard } from "lucide-react";

const APPS = [
  { id: "vm", label: "VMDR", nav: [["dashboard", "Dashboard", LayoutDashboard, V.Dashboard], ["assets", "Assets", Server, V.Assets], ["tags", "Tags", Tag, V.Tags], ["groups", "Asset Groups", Boxes, V.Groups], ["scans", "Scans", Radar, V.Scans], ["schedules", "Schedules", CalendarClock, V.Schedules], ["reports", "Reports", FileBarChart, V.Reports], ["kb", "KnowledgeBase", BookOpen, V.KB], ["users", "Users", UsersIcon, V.Users]] },
  { id: "ca", label: "Cloud Agent", nav: [["agents", "Agents & Keys", Cpu, Agents]] },
  { id: "was", label: "Web App Scanning", nav: [], soon: Globe },
  { id: "pc", label: "Policy Compliance", nav: [], soon: ClipboardCheck },
];

const APPS2 = [
  { id: "vm", label: "VMDR", nav: [["dashboard", "Dashboard", LayoutDashboard, Dash2], ["assets", "Assets", Server, Assets2], ["groups", "Asset Groups", Boxes, Groups2], ["tags", "Tags", Tag, Tags2], ["scans", "Scans", Radar, Scans2], ["schedules", "Schedules", CalendarClock, Schedules2],
    ["reports", "Reports", FileBarChart, Reports2], ["kb", "KnowledgeBase", BookOpen, KB2], ["users", "Users", UsersIcon, Users2], ["remediation", "Remediation", Wrench, Remediation]] },
  APPS[2], APPS[3],
];

const WAS = { id: "was", label: "Web App Scanning", nav: [["webapps", "Web Applications", Globe, WebApps], ["wauth", "Authentication", KeyRound, WasAuth], ["wprofiles", "Option Profiles", SlidersHorizontal, WasProfiles],
  ["wscans", "Scans", Radar, WasScans], ["wschedules", "Schedules", CalendarClock, WasSchedules], ["wreports", "Reports", FileBarChart, WasReports], ["wlists", "Search Lists", ListChecks, WasLists]] };
const PC = { id: "pc", label: "Policy Compliance", nav: [["scenario", "Scenario", ClipboardCheck, Scenario], ["pci", "PCI Merchant", CreditCard, Pci], ["policies", "Policies", ShieldCheck, Policies], ["cscans", "Compliance Scans", Radar, CScans],
  ["posture", "Posture", Gauge, Posture], ["exceptions", "Exceptions", FileWarning, Exceptions], ["preports", "Reports", FileBarChart, PcReports]] };
const BY_MODULE = { 1: [APPS, "ca", "agents"], 2: [APPS2, "vm", "dashboard"], 3: [[WAS], "was", "webapps"], 4: [[PC], "pc", "scenario"] };

export function Console({ lab, emit }) {
  const [apps, app0, view0] = BY_MODULE[lab.module] || BY_MODULE[1];
  const [d, setD] = useState(null);
  const [app, setApp] = useState(app0);
  const [view, setView] = useState(lab.module === 4 && !lab.scenarios?.length ? (/posture/.test(lab.id) ? "cscans" : "pci") : view0);
  useEffect(() => { api.get("/vmlab/console-data").then((r) => setD(r.data)); }, []);
  if (!d) return <div className="h-full grid place-items-center text-xs text-slate-500">Loading console…</div>;
  const A = apps.find((a) => a.id === app), cur = A.nav.find((n) => n[0] === view) || A.nav[0], View = cur?.[3];
  const pick = (a) => { setApp(a.id); setView(a.nav[0]?.[0]); };
  return <div className="h-full min-w-0 overflow-hidden flex flex-col bg-[#0f1720] border border-slate-700/70 text-slate-200" data-testid="vm-console">
    <div className="flex items-center gap-3 px-3 py-2 bg-[#0b2238] border-b border-sky-900">
      <span className="flex items-center gap-1.5 font-semibold text-[13px] text-white shrink-0"><Shield className="h-4 w-4 text-sky-400" /><span className="hidden md:inline">{d.brand}</span></span>
      <div className="flex gap-1 overflow-x-auto" role="tablist">{apps.map((a) => <button key={a.id} role="tab" aria-selected={app === a.id} onClick={() => pick(a)} className={`px-2.5 py-1 text-[11px] whitespace-nowrap ${app === a.id ? "bg-sky-600 text-white" : "text-sky-100/80 hover:bg-white/10"}`} data-testid={`vmc-app-${a.id}`}>{a.label}</button>)}</div>
      <span className="ml-auto text-[10px] font-mono text-sky-200/60 hidden sm:inline">training · fake data</span>
    </div>
    <div className="flex flex-1 min-h-0">
      {A.nav.length > 1 && <nav className="w-12 sm:w-44 shrink-0 border-r border-slate-700/70 py-2 overflow-y-auto" aria-label="Console navigation">{A.nav.map(([id, l, I]) => <button key={id} onClick={() => setView(id)} aria-current={cur[0] === id ? "page" : undefined}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${cur[0] === id ? "bg-sky-500/15 text-sky-200 border-l-2 border-sky-400" : "text-slate-300 hover:bg-slate-700/40 border-l-2 border-transparent"}`} data-testid={`vmc-nav-${id}`} title={l}><I className="h-3.5 w-3.5 shrink-0" /><span className="hidden sm:inline truncate">{l}</span></button>)}</nav>}
      <main className="relative flex-1 min-w-0 overflow-auto p-3">{View ? <View d={d} st={lab.state} emit={emit} lab={lab} />
        : <div className="h-full grid place-items-center text-center text-sm text-slate-400" data-testid={`vmc-soon-${A.id}`}><div><A.soon className="h-8 w-8 mx-auto mb-2 text-slate-500" />Open a {A.label} lab from the lab hub to use this app.</div></div>}</main>
    </div>
  </div>;
}
