export const LEVELS = {
  Recruit: { img: "/badges/level-recruit.jpg", ring: "border-slate-300/60", text: "text-slate-200", glow: "shadow-[0_0_24px_rgba(226,232,240,.15)]", blurb: "Your first wins on shift." },
  Analyst: { img: "/badges/triage-pro.jpg", ring: "border-cyan-400/70", text: "text-cyan-300", glow: "shadow-[0_0_24px_rgba(0,240,255,.25)]", blurb: "Consistent, accurate triage." },
  Hunter: { img: "/badges/level-hunter.png", ring: "border-orange-400/70", text: "text-orange-300", glow: "shadow-[0_0_24px_rgba(251,146,60,.25)]", blurb: "Labs and streaks that prove grit." },
  Elite: { img: "/badges/level-elite.jpg", ring: "border-red-500/70", text: "text-red-400", glow: "shadow-[0_0_28px_rgba(239,68,68,.3)]", blurb: "Certified and battle-hardened." },
};

export const BADGE_ART = {
  "first-blood": ["Recruit", "/badges/first-blood.jpg"],
  "on-fire": ["Recruit", "/badges/on-fire.jpg"],
  "triage-pro": ["Analyst", "/badges/triage-pro.jpg"],
  "quiz-master": ["Analyst", "/badges/quiz-master.jpg"],
  "lab-rat": ["Hunter", "/badges/lab-rat.jpg"],
  "drill-7": ["Hunter", "/badges/drill-7.jpg"],
  pathfinder: ["Elite", "/badges/pathfinder.jpg"],
  "drill-30": ["Elite", "/badges/drill-30.jpg"],
};

export const badgeArt = (b) => {
  const [level, img] = BADGE_ART[b.id] || ["Recruit", "/badges/course.jpg"];
  return { level, img, ...LEVELS[level], img2: img };
};

export const SHOWCASE_BADGES = [
  ["first-blood", "First Blood", "Solve your first CTF"], ["on-fire", "On Fire", "3-day streak"],
  ["triage-pro", "Triage Pro", "3 correct alert verdicts"], ["quiz-master", "Quiz Master", "Score 100% on a quiz"],
  ["lab-rat", "Lab Rat", "Finish a scenario lab"], ["drill-7", "Week Watch", "7-day daily drill streak"],
  ["pathfinder", "Pathfinder", "Earn a certificate"], ["drill-30", "Night Shift", "30-day daily drill streak"],
];
