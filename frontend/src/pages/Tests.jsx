import PublicNav, { Footer } from "../components/PublicNav";
import { TestCatalog } from "../components/exam/Catalog";

export default function Tests() {
  return (
    <div className="grid-bg min-h-screen">
      <PublicNav />
      <section className="max-w-7xl mx-auto px-6 pt-14 pb-24">
        <div className="rise">
          <div className="eyebrow mb-4">// certification tests · exam simulator</div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold">Sit the exam before the exam.</h1>
          <p className="mt-4 text-slate-400 max-w-2xl">Timed certification simulations with verified answers, per-option explanations, domain analytics and a readiness score. Practise with hints, then attempt the real thing.</p>
        </div>
        <div className="mt-10"><TestCatalog /></div>
      </section>
      <Footer />
    </div>);
}
