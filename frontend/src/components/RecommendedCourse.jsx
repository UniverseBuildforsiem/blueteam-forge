import { useEffect, useState } from "react";
import { ArrowUpRight, GraduationCap, Mail } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Glass } from "./common";
import { Switch } from "./ui/switch";
import { PracticeList, inr } from "./CourseGrid";

const CourseEmailToggle = () => {
  const [on, setOn] = useState(null);
  useEffect(() => { api.get("/me/courses").then((r) => setOn(r.data.course_emails)).catch(() => {}); }, []);
  if (on === null) return null;
  const flip = async (v) => {
    const { data } = await api.patch("/me/preferences", { course_emails: v });
    setOn(data.course_emails);
    toast.success(data.course_emails ? "New course emails on" : "New course emails off");
  };
  return (
    <label className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-4 cursor-pointer">
      <Mail className="h-3.5 w-3.5" />Email me about new courses & badges
      <Switch checked={on} onCheckedChange={flip} data-testid="course-emails-toggle" />
    </label>
  );
};

export default function RecommendedCourse() {
  const [r, setR] = useState(null);
  useEffect(() => { api.get("/courses/recommended").then((x) => setR(x.data)).catch(() => {}); }, []);
  if (!r?.course) return null;
  const c = r.course;
  return (
    <Glass className="p-5 mb-4 grid md:grid-cols-[200px_1fr_1fr] gap-5 items-start" data-testid="dashboard-recommended-course">
      <img src={c.image} alt={c.title} className="w-full aspect-[16/11] object-cover border border-white/10" />
      <div>
        <div className="eyebrow flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5" />recommended course</div>
        <p className="text-xs text-slate-400 mt-2" data-testid="recommended-reason">{r.reason}</p>
        <h3 className="font-bold mt-2 leading-snug" data-testid="recommended-title">{c.title}</h3>
        <div className="font-mono mt-2"><span className="neon-green font-bold">{inr(c.price)}</span> <span className="text-xs line-through text-slate-500">{inr(c.mrp)}</span> <span className="text-xs text-green-400">{c.off}% off</span></div>
        <a href={c.url} target="_blank" rel="noopener noreferrer" className="glow-btn mt-4 !py-2" data-testid="recommended-open">Open course <ArrowUpRight className="h-4 w-4" /></a>
        <CourseEmailToggle />
      </div>
      <div><div className="text-xs font-mono text-slate-500 mb-2">then practise it here</div><PracticeList c={c} /></div>
    </Glass>
  );
}
