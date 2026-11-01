import { useState } from "react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Glass } from "./common";

const EMPTY = { current: "", next: "", confirm: "" };

export default function ChangePasswordCard() {
  const [f, setF] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const strong = f.next.length >= 8 && /[A-Za-z]/.test(f.next) && /\d/.test(f.next);
  const mismatch = f.confirm && f.confirm !== f.next;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.post("/auth/change-password", { current_password: f.current, new_password: f.next }); setF(EMPTY); toast.success("Password changed — other devices were signed out and a confirmation email was sent"); }
    catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  const input = (k, label, tid) => <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">{label}</span>
    <input type={show ? "text" : "password"} autoComplete={k === "current" ? "current-password" : "new-password"} className="field mt-1" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={tid} /></label>;
  return (
    <Glass className="p-5 mb-6" data-testid="change-password-card">
      <div className="flex items-center gap-3 mb-4"><KeyRound className="h-5 w-5 text-cyan-400" /><div className="flex-1"><div className="font-bold">Change password</div>
        <div className="text-xs text-slate-400">Signs out your other devices and emails you a confirmation.</div></div>
        <button type="button" className="text-slate-500 hover:text-slate-200" onClick={() => setShow(!show)} data-testid="change-password-toggle-visibility">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
      <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3 items-end">
        {input("current", "Current password", "change-password-current")}
        {input("next", "New password", "change-password-new")}
        {input("confirm", "Confirm new password", "change-password-confirm")}
        <div className={`sm:col-span-2 text-[11px] font-mono ${mismatch ? "text-red-300" : f.next && !strong ? "text-orange-300" : "text-slate-500"}`} data-testid="change-password-hint">
          {mismatch ? "passwords don't match" : "at least 8 characters with letters and numbers"}</div>
        <button className="glow-btn justify-center" disabled={busy || !f.current || !strong || f.confirm !== f.next} data-testid="change-password-submit">{busy ? "Saving..." : "Update password"}</button>
      </form>
    </Glass>);
}
