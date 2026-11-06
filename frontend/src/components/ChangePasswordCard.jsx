import { useState } from "react";
import { KeyRound, Eye, EyeOff, Mail } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Glass } from "./common";

const EMPTY = { current: "", next: "", confirm: "" };

function EmailLinkButton({ email }) {
  const [sent, setSent] = useState(false);
  const send = async () => {
    try { await api.post("/auth/forgot-password", { email }); setSent(true); toast.success("Set-password link sent — check your inbox (valid 1 hour)"); }
    catch (err) { toast.error(errMsg(err)); }
  };
  return <button type="button" onClick={send} disabled={sent} className="text-xs font-mono text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1.5 mt-3 disabled:opacity-50" data-testid="set-password-email-link">
    <Mail className="h-3.5 w-3.5" />{sent ? "Link sent to your email" : "Or email me a set-password link"}</button>;
}

export default function ChangePasswordCard() {
  const { user, setUser } = useAuth();
  const setMode = user?.password_set === false;
  const [f, setF] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const strong = f.next.length >= 8 && /[A-Za-z]/.test(f.next) && /\d/.test(f.next);
  const mismatch = f.confirm && f.confirm !== f.next;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (setMode) { await api.post("/auth/set-password", { new_password: f.next }); setUser({ ...user, password_set: true }); toast.success("Password set — you can now also log in with email and password"); }
      else { await api.post("/auth/change-password", { current_password: f.current, new_password: f.next }); toast.success("Password changed — other devices were signed out and a confirmation email was sent"); }
      setF(EMPTY);
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  const input = (k, label, tid) => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{label}</span>
    <input type={show ? "text" : "password"} autoComplete={k === "current" ? "current-password" : "new-password"} className="field mt-1" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={tid} /></label>;
  return (
    <Glass className="p-5 mb-6" data-testid={setMode ? "set-password-card" : "change-password-card"}>
      <div className="flex items-center gap-3 mb-4"><KeyRound className="h-5 w-5 text-cyan-400" /><div className="flex-1"><div className="font-bold">{setMode ? "Set a password" : "Change password"}</div>
        <div className="text-xs text-slate-400">{setMode ? "You signed up with Google. Add a password to also log in with your email." : "Signs out your other devices and emails you a confirmation."}</div></div>
        <button type="button" className="text-slate-500 hover:text-slate-200" onClick={() => setShow(!show)} data-testid="change-password-toggle-visibility">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
      <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3 items-end">
        {!setMode && input("current", "Current password", "change-password-current")}
        {input("next", "New password", "change-password-new")}
        {input("confirm", "Confirm new password", "change-password-confirm")}
        <div className={`sm:col-span-2 text-[11px] font-mono ${mismatch ? "text-red-300" : f.next && !strong ? "text-orange-300" : "text-slate-500"}`} data-testid="change-password-hint">
          {mismatch ? "passwords don't match" : "at least 8 characters with letters and numbers"}</div>
        <button className="glow-btn justify-center" disabled={busy || (!setMode && !f.current) || !strong || f.confirm !== f.next} data-testid="change-password-submit">{busy ? "Saving..." : setMode ? "Set password" : "Update password"}</button>
      </form>
      {setMode && <EmailLinkButton email={user.email} />}
    </Glass>);
}
