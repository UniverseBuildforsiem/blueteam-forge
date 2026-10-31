import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./common";

export default function PublicNav() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-30 bg-[#0B0F1A]/75 backdrop-blur-xl border-b border-cyan-500/10">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-400 font-mono">
          <a href="/#features" className="hover:text-cyan-300 transition-colors">Features</a>
          <Link to="/catalog" data-testid="nav-catalog" className="hover:text-cyan-300 transition-colors">Catalog</Link>
          <a href="/#pricing" className="hover:text-cyan-300 transition-colors">Pricing</a>
          <a href="/#faq" className="hover:text-cyan-300 transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          {user ? <Link to="/app" className="glow-btn !py-2" data-testid="nav-dashboard-button">Dashboard</Link> : <>
            <Link to="/login" className="text-sm font-mono text-slate-300 hover:text-cyan-300" data-testid="nav-login-button">Log in</Link>
            <Link to="/register" className="glow-btn !py-2" data-testid="nav-signup-button">Sign up</Link></>}
        </div>
      </div>
    </header>
  );
}

export const Footer = () => (
  <footer className="border-t border-cyan-500/10 py-10 text-center text-xs font-mono text-slate-500">
    © {new Date().getFullYear()} SOCForge · All labs are simulated and safe · Built for aspiring blue teamers
  </footer>
);
