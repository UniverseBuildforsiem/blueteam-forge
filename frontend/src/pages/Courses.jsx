import { useState } from "react";
import { Search, ExternalLink } from "lucide-react";
import PublicNav, { Footer } from "../components/PublicNav";
import { CourseGrid } from "../components/CourseGrid";
import { AcademyCatalog } from "../components/academy/Catalog";
import { useCourses, COURSE_TYPES, COURSES_URL } from "../lib/courses";

export default function Courses() {
  const [type, setType] = useState("All");
  const [q, setQ] = useState("");
  const { courses: COURSES, synced_at, loading } = useCourses();
  const shown = COURSES.filter((c) => (type === "All" || c.type === type) && c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <section className="max-w-7xl mx-auto px-6 pt-14 pb-24">
        <div className="rise">
          <div className="eyebrow mb-4">// academy courses · learn by doing</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold">SOC courses with labs, CTFs & certificates.</h1>
          <p className="mt-4 text-slate-400 max-w-2xl">Hands-on courses with video lessons, Kali labs, SIEM and shift simulators, a final exam and a verifiable certificate. Watch the free previews before you buy.</p>
        </div>
        <div className="mt-10"><AcademyCatalog /></div>
        <div className="mt-20 pt-10 border-t border-white/10" data-testid="external-courses">
          <div className="eyebrow mb-3">// more from soc professionals</div>
          <h2 className="text-2xl font-bold">Recorded courses & exam prep</h2>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">Video courses, practice exams and ebooks on the SOC Professionals store. Click a course to see the matching labs and drills.</p>
          {synced_at && <p className="mt-2 text-[11px] font-mono text-slate-500" data-testid="courses-synced-at">prices synced {new Date(synced_at).toLocaleString()}</p>}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {COURSE_TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)} data-testid={`courses-filter-${t.toLowerCase()}`}
              className={`font-mono text-xs px-3 py-1.5 border rounded-sm transition-colors ${type === t ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:text-cyan-200"}`}>
              {t} <span className="text-slate-500">{t === "All" ? COURSES.length : COURSES.filter((c) => c.type === t).length}</span>
            </button>))}
          <label className="ml-auto flex items-center gap-2 border border-white/10 focus-within:border-cyan-400 px-3 py-1.5 rounded-sm w-full sm:w-72 transition-colors">
            <Search className="h-4 w-4 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" data-testid="courses-search-input" className="bg-transparent outline-none text-sm font-mono flex-1" />
          </label>
        </div>
        <div className="mt-8">
          {loading ? <div className="font-mono text-cyan-400 cursor-blink">loading courses </div> : shown.length ? <CourseGrid courses={shown} testId="courses-page-grid" /> :
            <div className="text-center font-mono text-sm text-slate-500 py-16" data-testid="courses-empty">// no courses match "{q}"</div>}
        </div>
        <a href={COURSES_URL} target="_blank" rel="noopener noreferrer" className="ghost-btn mt-10" data-testid="courses-visit-store">Visit the SOC Professionals store <ExternalLink className="h-4 w-4" /></a>
      </section>
      <Footer />
    </div>
  );
}
