import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Layers } from "lucide-react";
import { api } from "../lib/api";
import { Glass } from "../components/common";
import PublicNav, { Footer } from "../components/PublicNav";

export default function Catalog() {
  const [paths, setPaths] = useState([]);
  useEffect(() => { api.get("/public/paths").then((r) => setPaths(r.data)); }, []);
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="eyebrow mb-3">// course catalog</div>
        <h1 className="text-4xl sm:text-5xl font-bold">Learning paths</h1>
        <p className="text-slate-400 mt-4 max-w-2xl">Lessons, labs, CTFs, videos and quizzes unlock after you sign in.</p>
        <div className="grid md:grid-cols-2 gap-5 mt-12">
          {paths.map((p) => (
            <Glass key={p.id} className="p-7 flex flex-col" data-testid={`catalog-path-${p.id}`}>
              <div className="flex items-center justify-between text-xs font-mono"><span className="text-green-400">{p.level}</span><span className="text-slate-500 flex items-center gap-1"><Layers className="h-3 w-3" />{p.modules.length} modules · {p.lesson_count} lessons</span></div>
              <h2 className="text-xl font-bold mt-3">{p.title}</h2>
              <p className="text-sm text-slate-400 mt-3 flex-1">{p.description}</p>
              <Link to="/register" className="ghost-btn mt-6 self-start" data-testid={`catalog-unlock-${p.id}`}><Lock className="h-4 w-4" /> Sign up to unlock</Link>
            </Glass>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
