import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, ShieldPlus, Siren, MessagesSquare } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/common";
import { toast } from "sonner";
import { takePendingCase } from "./AuthPages";

const GOALS = [
  ["SOC L1", Shield, "Land your first analyst role: triage, phishing, auth alerts."],
  ["SOC L2", ShieldPlus, "Go deeper: correlation, hunting, detection engineering."],
  ["IR", Siren, "Lead incidents end-to-end, from containment to lessons learned."],
  ["Interview Prep", MessagesSquare, "Nail technical questions and scenario walkthroughs."],
];

export default function Onboarding() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [goal, setGoal] = useState(null);
  const save = async () => {
    try { const { data } = await api.post("/auth/onboarding", { goal }); setUser(data); nav(takePendingCase() || "/app"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="min-h-screen grid-bg px-6 py-12">
      <div className="max-w-4xl mx-auto rise">
        <Logo />
        <div className="eyebrow mt-14 mb-3">// step 1 of 1 · mission briefing</div>
        <h1 className="text-3xl sm:text-4xl font-bold">What's your objective, analyst?</h1>
        <p className="text-slate-400 mt-3">We'll set your primary learning path. You can access every path anytime.</p>
        <div className="grid sm:grid-cols-2 gap-4 mt-10">
          {GOALS.map(([g, I, d]) => (
            <button key={g} onClick={() => setGoal(g)} data-testid={`onboarding-goal-${g.toLowerCase().replace(/\s+/g, "-")}`}
              className={`text-left p-6 glass rounded-sm transition-colors ${goal === g ? "!border-cyan-400 bg-cyan-500/10" : "hover:bg-white/5"}`}>
              <I className={`h-6 w-6 ${goal === g ? "text-green-400" : "text-cyan-400"}`} />
              <div className="font-mono font-bold mt-4">{g}</div>
              <div className="text-sm text-slate-400 mt-1">{d}</div>
            </button>
          ))}
        </div>
        <button className="glow-btn mt-10" disabled={!goal} onClick={save} data-testid="onboarding-continue-button">Deploy to dashboard</button>
      </div>
    </div>
  );
}
