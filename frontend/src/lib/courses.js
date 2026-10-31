const IMG = "https://cdn-wl-assets.classplus.co/production/single/jepxbq/";
export const COURSES_URL = "https://www.socprofessionals.com/courses";

const raw = [
  [803635, "SOC Analyst Bundle (5 Courses)", "Videos", 4859, 14999, "cadd7065-f2a2-4c0e-99c8-11e395802a8d"],
  [586238, "CSA - Certified SOC Analyst (Splunk, MDR, Qualys Guard, Kali Linux)", "Videos", 2000, 6999, "bf773c69-0cdc-4db3-9794-d3a87ec52d00"],
  [711866, "SOC Analyst Interview Preparation: 100+ Real-Time Scenarios", "Videos", 973, 4999, "14e4b66f-da7b-42af-abe0-5cea5e739236", ["Free content"]],
  [585279, "CEH v13 - Certified Ethical Hacker | Zero to Hero", "Videos", 3892, 14999, "40794744-3f14-4f67-ac33-93bebe019c52"],
  [585979, "Complete Wireshark Essentials with Kali Linux course", "Videos", 486, 2999, "b8ba3c3d-29a7-4c85-b8c8-161a80059a63", ["New"]],
  [584863, "Complete Kali Linux Command-Line & Shell Scripting", "Videos", 486, 2999, "590eb546-6ca3-4110-854f-3631ca157ae4", ["New"]],
  [584264, "Qualys Guard VMDR, Cloud Agent & Web Application Scanning", "Videos", 2054, 7009, "9805771e-4dc1-4387-9c1f-50889dfabddf"],
  [715679, "CSA v1 - Exam Preparation (312-39)", "Tests", 973, 1999, "879f2370-de60-4f9b-9f66-1866152f123a", ["New"]],
  [715668, "CEH v13 - Certification Preparation Q&A", "Tests", 973, 1999, "7fc108e2-6221-4cbe-af99-0a54cae02137", ["New"]],
  [715790, "GMON - SEC511 Continuous Monitoring and Security practice", "Tests", 973, 1999, "8446f45a-b570-4442-b458-80e2d2bffeae"],
  [715797, "ITIL 4 Foundation Certification Real Practice Exams 2025", "Tests", 973, 1999, "356fb762-23bf-4d72-8e01-f7a9dd69d387"],
  [715800, "JN0-104 - Real Exam practice test with explanations - 2025", "Tests", 973, 1999, "0382be8b-0648-4ac8-8f5a-076ef59520b9"],
  [712610, "SOC Interview Preparation - Ebook", "Files", 973, 2999, "e7dc6c4a-c480-4904-9892-576b99fd98d9"],
];

export const COURSES = raw.map(([id, title, type, price, mrp, img, tags = []]) => ({
  id, title, type, price, mrp, tags,
  image: `${IMG}${img}.png`,
  url: `${COURSES_URL}/${id}`,
  off: Math.floor((1 - price / mrp) * 100),
}));

export const COURSE_TYPES = ["All", "Videos", "Tests", "Files"];
