import { useEffect, useState } from "react";
import { api } from "./api";

export const COURSES_URL = "https://www.socprofessionals.com/courses";
export const COURSE_TYPES = ["All", "Videos", "Tests", "Files"];

export function useCourses() {
  const [data, setData] = useState({ courses: [], synced_at: null, loading: true });
  useEffect(() => {
    api.get("/public/courses").then((r) => setData({ ...r.data, loading: false })).catch(() => setData((d) => ({ ...d, loading: false })));
  }, []);
  return data;
}
