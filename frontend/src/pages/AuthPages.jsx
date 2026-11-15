import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Glass, Logo } from "../components/common";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;

function Shell({ title, sub, children }) {
  return (
    <div className="min-h-screen grid-bg grid place-items-center px-4 py-10">
      <div className="w-full max-w-md rise">
        <div className="mb-8"><Logo /></div>
        <Glass className="p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {sub && <p className="text-sm text-slate-400 mt-2">{sub}</p>}
          <div className="mt-6">{children}</div>
        </Glass>
      </div>
    </div>
  );
}

const F = ({ label, ...p }) => (
  <label className="block mb-4"><span className="text-xs font-mono text-slate-400 uppercase">{label}</span><input className="field mt-1.5" {...p} /></label>
);

const ErrorLine = ({ e }) => e ? <div data-testid="auth-error" className="text-sm text-red-400 font-mono mb-4">! {e}</div> : null;

export const takePendingCase = () => {
  let c = null, p = null, t = null;
  try { c = JSON.parse(localStorage.getItem("pending_case")); p = JSON.parse(localStorage.getItem("pending_path")); t = JSON.parse(localStorage.getItem("pending_intel")); } catch { c = null; }
  localStorage.removeItem("pending_case");
  localStorage.removeItem("pending_path");
  localStorage.removeItem("pending_intel");
  if (t?.q && Date.now() - t.at < 3600e3) return `/app/threat-intel?q=${encodeURIComponent(t.q)}`;
  if (p?.id && Date.now() - p.at < 3600e3) return `/app/paths/${p.id}`;
  return c?.id && Date.now() - c.at < 3600e3 ? `/app/challenges?case=${c.id}` : null;
};

function pendingCourse() {
  let k = null;
  try { k = JSON.parse(localStorage.getItem("pending_course")); } catch { k = null; }
  localStorage.removeItem("pending_course");
  return k?.id && Date.now() - k.at < 3600e3 ? `/${k.kind || "course"}/${k.id}` : null;
}
const homeFor = (u) => (u.role !== "student" || u.onboarded ? pendingCourse() : null) || (u.role === "admin" ? "/admin" : u.role === "instructor" ? "/instructor" : !u.onboarded ? "/onboarding" : takePendingCase() || "/app");

function GoogleButton({ label }) {
  const go = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/app";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };
  return (
    <>
      <button type="button" onClick={go} className="ghost-btn w-full justify-center gap-3" data-testid="google-login-button">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        {label}
      </button>
      <div className="flex items-center gap-3 my-5 text-[11px] font-mono text-slate-500 uppercase"><span className="h-px flex-1 bg-white/10" />or with email<span className="h-px flex-1 bg-white/10" /></div>
    </>
  );
}

export function AuthCallback() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sid = new URLSearchParams(loc.hash.slice(1)).get("session_id");
    window.history.replaceState(null, "", window.location.pathname);
    api.post("/auth/google", { session_id: sid })
      .then(({ data }) => { setUser(data); nav(homeFor(data), { replace: true }); })
      .catch((x) => { setUser(false); toast.error(errMsg(x)); nav("/login", { replace: true }); });
  }, [loc.hash, nav, setUser]);
  return <div data-testid="auth-callback" className="min-h-screen grid-bg" />;
}

export function Login() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(f.email)) return setErr("Enter a valid email address");
    setBusy(true); setErr("");
    try {
      const { data } = await api.post("/auth/login", f);
      setUser(data);
      const pending = data.onboarded && data.role === "student" ? takePendingCase() : null;
      nav(pending || (data.role === "admin" ? "/admin" : data.role === "instructor" ? "/instructor" : loc.state?.from || "/app"));
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Analyst login" sub="Welcome back to the queue.">
      <GoogleButton label="Continue with Google" />
      <form onSubmit={submit}>
        <F label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="login-email-input" required />
        <F label="Password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} data-testid="login-password-input" required />
        <ErrorLine e={err} />
        <button className="glow-btn w-full justify-center" disabled={busy} data-testid="login-submit-button">{busy ? "Authenticating..." : "Log in"}</button>
      </form>
      <div className="flex justify-between mt-5 text-sm">
        <Link to="/forgot-password" className="text-cyan-400 hover:underline" data-testid="forgot-password-link">Forgot password?</Link>
        <Link to="/register" className="text-slate-400 hover:text-cyan-300" data-testid="go-register-link">Create account</Link>
      </div>
    </Shell>
  );
}

export function Register() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", username: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(f.email)) return setErr("Enter a valid email address");
    if (f.password.length < 8) return setErr("Password must be at least 8 characters");
    setBusy(true); setErr("");
    try {
      const { data } = await api.post("/auth/register", f);
      setUser(data);
      nav("/onboarding");
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Create your analyst account" sub="Free forever for SOC Fundamentals.">
      <GoogleButton label="Sign up with Google" />
      <form onSubmit={submit}>
        <F label="Full name" value={f.name} onChange={set("name")} data-testid="register-name-input" required />
        <F label="Email" type="email" value={f.email} onChange={set("email")} data-testid="register-email-input" required />
        <F label="Username" value={f.username} onChange={set("username")} data-testid="register-username-input" required />
        <F label="Password (min 8 chars)" type="password" value={f.password} onChange={set("password")} data-testid="register-password-input" required />
        <ErrorLine e={err} />
        <button className="glow-btn w-full justify-center" disabled={busy} data-testid="register-submit-button">{busy ? "Provisioning..." : "Create account"}</button>
      </form>
      <p className="mt-5 text-sm text-slate-400">Already have an account? <Link to="/login" className="text-cyan-400" data-testid="go-login-link">Log in</Link></p>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setErr("Enter a valid email address");
    try { await api.post("/auth/forgot-password", { email }); setDone(true); } catch (x) { setErr(errMsg(x)); }
  };
  return (
    <Shell title="Reset password" sub="We'll email you a secure reset link valid for 1 hour.">
      {done ? <p data-testid="forgot-success" className="text-green-400 font-mono text-sm">If that email exists, a reset link is on its way. Check your inbox.</p> :
        <form onSubmit={submit}>
          <F label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email-input" required />
          <ErrorLine e={err} />
          <button className="glow-btn w-full justify-center" data-testid="forgot-submit-button">Send reset link</button>
        </form>}
      <Link to="/login" className="block mt-5 text-sm text-cyan-400">Back to login</Link>
    </Shell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (p.length < 8) return setErr("Password must be at least 8 characters");
    try { await api.post("/auth/reset-password", { token: sp.get("token") || "", password: p }); toast.success("Password updated. Log in."); nav("/login"); }
    catch (x) { setErr(errMsg(x)); }
  };
  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit}>
        <F label="New password" type="password" value={p} onChange={(e) => setP(e.target.value)} data-testid="reset-password-input" required />
        <ErrorLine e={err} />
        <button className="glow-btn w-full justify-center" data-testid="reset-submit-button">Update password</button>
      </form>
    </Shell>
  );
}
