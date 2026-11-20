import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./common";

export default function PublicNav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 bg-[#0B0F1A]/75 backdrop-blur-xl border-b border-cyan-500/10">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-5 xl:gap-7 text-sm text-slate-400 font-mono whitespace-nowrap">
          <a href="/#features" className="hover:text-cyan-300 transition-colors">Features</a>
          <Link to="/courses" data-testid="nav-courses" className="hover:text-cyan-300 transition-colors">Courses</Link>
          <Link to="/tests" data-testid="nav-tests" className="hover:text-cyan-300 transition-colors">Tests</Link>
          <Link to="/book" data-testid="nav-ebook" className="hover:text-cyan-300 transition-colors">Ebook</Link>
          <Link to="/blog" data-testid="nav-blog" className="hover:text-cyan-300 transition-colors">Blog</Link>
          <Link to="/sops" data-testid="nav-sops" className="hover:text-cyan-300 transition-colors">SOPs</Link>
          <Link to="/playbooks" data-testid="nav-playbooks" className="hover:text-cyan-300 transition-colors">Playbooks</Link>
          <Link to="/catalog" data-testid="nav-catalog" className="hover:text-cyan-300 transition-colors">Catalog</Link>
          <Link to="/talent" data-testid="nav-talent" className="hover:text-cyan-300 transition-colors">Hire talent</Link>
          <a href="/#pricing" className="hover:text-cyan-300 transition-colors">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          {user ? <Link to="/app" className="glow-btn !py-2" data-testid="nav-dashboard-button">Dashboard</Link> : <>
            <Link to="/login" className="hidden sm:inline text-sm font-mono text-slate-300 hover:text-cyan-300 whitespace-nowrap" data-testid="nav-login-button">Log in</Link>
            <Link to="/register" className="glow-btn !py-2 !px-4 sm:!px-6 whitespace-nowrap" data-testid="nav-signup-button">Sign up</Link></>}
          <button className="md:hidden text-slate-300" onClick={() => setOpen(!open)} data-testid="nav-mobile-toggle" aria-label="Menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden border-t border-cyan-500/10 px-6 py-3 flex flex-col gap-3 font-mono text-sm text-slate-300" data-testid="nav-mobile-menu" onClick={() => setOpen(false)}>
          <a href="/#features">Features</a>
          <Link to="/courses" data-testid="nav-mobile-courses">Courses</Link>
          <Link to="/tests" data-testid="nav-mobile-tests">Tests</Link>
          <Link to="/book" data-testid="nav-mobile-ebook">Ebook</Link>
          <Link to="/blog" data-testid="nav-mobile-blog">Blog</Link>
          <Link to="/sops" data-testid="nav-mobile-sops">SOPs</Link>
          <Link to="/catalog">Catalog</Link>
          <Link to="/talent">Hire talent</Link>
          <a href="/#pricing">Pricing</a>
          <a href="/#faq">FAQ</a>
          {!user && <Link to="/login" className="sm:hidden text-cyan-300" data-testid="nav-mobile-login">Log in</Link>}
        </nav>)}
    </header>
  );
}

export const Footer = () => (
  <footer className="border-t border-cyan-500/10 py-10 text-center text-xs font-mono text-slate-500">
    <img src="/logo.png" alt="SOCProfessionals Academy logo" className="h-12 w-12 mx-auto mb-3 object-contain opacity-90" data-testid="footer-logo-img" />
    © {new Date().getFullYear()} SOCProfessionals Academy · All labs are simulated and safe · Built for aspiring blue teamers
  </footer>
);
