import { NavLink, Outlet, Navigate, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Route as RouteIcon, CalendarClock, ListChecks, Activity, Siren, Flag, FlaskConical, Terminal, Search, Wrench,
  Award, CreditCard, GraduationCap, Medal, Mic, ShieldCheck, LogOut, Menu, Zap, BookMarked, Newspaper, KeyRound, Radar, Workflow, Timer, Fish, NotebookPen, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./common";

const STUDENT = [
  ["Dashboard", "/app", LayoutDashboard], ["Learning Paths", "/app/paths", RouteIcon], ["Live Sessions", "/app/sessions", CalendarClock],
  ["Quizzes", "/app/quizzes", ListChecks], ["Progress", "/app/progress", Activity], ["Daily Drill", "/app/drill", Zap], ["Courses", "/app/courses", GraduationCap], ["My Notes", "/app/notes", NotebookPen], ["Badges", "/app/badges", Medal], ["Mock Interview", "/app/interview", Mic], ["SOC Challenges", "/app/challenges", Siren], ["Shift Simulator", "/app/shift", Timer], ["Phishing Simulator", "/app/phishing", Fish], ["Vuln Mgmt Lab", "/app/vmlab", ShieldAlert],
  ["CTF Arena", "/app/ctf", Flag], ["Scenario Labs", "/app/labs", FlaskConical], ["Kali Terminal", "/app/kali", Terminal],
  ["SIEM", "/app/siem", Search], ["Investigation Tools", "/app/tools", Wrench], ["Threat Intel", "/app/threat-intel", Radar], ["SOP Library", "/sops", BookMarked], ["Playbooks", "/playbooks", Workflow], ["Blogs", "/blog", Newspaper], ["Certificates", "/app/certificates", Award], ["Billing", "/app/billing", CreditCard], ["Account Settings", "/app/account", KeyRound],
];

export function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === null) return <div className="min-h-screen grid place-items-center font-mono text-cyan-400 cursor-blink">authenticating </div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  if (!user.onboarded && user.role === "student" && loc.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  return children;
}

const Item = ({ label, to, Icon, onClick }) => (
  <NavLink to={to} end={to === "/app"} onClick={onClick} data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
    className={({ isActive }) => `flex items-center gap-3 px-3 py-2 text-sm rounded-sm transition-colors ${isActive ? "bg-cyan-500/10 text-cyan-300 border-l-2 border-cyan-400" : "text-slate-400 hover:text-slate-100 hover:bg-white/5 border-l-2 border-transparent"}`}>
    <Icon className="h-4 w-4" />{label}
  </NavLink>
);

export default function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="min-h-screen flex grid-bg">
      <aside className={`fixed lg:sticky top-0 z-40 h-screen w-64 shrink-0 bg-[#080B14]/95 backdrop-blur-xl border-r border-cyan-500/15 flex flex-col transition-transform ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="p-5 border-b border-cyan-500/10"><Logo to="/app" /></div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {STUDENT.map(([l, t, I]) => <Item key={t} label={l} to={t} Icon={I} onClick={close} />)}
          {["instructor", "admin"].includes(user.role) && <><div className="eyebrow px-3 pt-5 pb-2">Staff</div><Item label="Instructor Panel" to="/instructor" Icon={GraduationCap} onClick={close} /></>}
          {user.role === "admin" && <Item label="Admin Panel" to="/admin" Icon={ShieldCheck} onClick={close} />}
        </nav>
        <div className="p-4 border-t border-cyan-500/10 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm truncate" data-testid="sidebar-user-name">{user.name}</div>
            <div className="text-[10px] font-mono uppercase text-cyan-400/70" data-testid="sidebar-user-role">{user.role} · {user.plan === "pro" ? "PRO" : "FREE"}</div>
          </div>
          <button data-testid="logout-button" onClick={async () => { await logout(); nav("/"); }} className="text-slate-400 hover:text-red-400 transition-colors"><LogOut className="h-4 w-4" /></button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={close} />}
      <main className="flex-1 min-w-0">
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-cyan-500/10 bg-[#0B0F1A]/80 backdrop-blur sticky top-0 z-20">
          <Logo to="/app" />
          <button data-testid="mobile-menu-button" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
        </div>
        <div className="p-5 sm:p-8 max-w-[1500px] mx-auto"><Outlet /></div>
      </main>
    </div>
  );
}
