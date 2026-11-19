const num = (s) => s.split(".").reduce((n, x) => n * 256 + Number(x), 0);
const str = (n) => [24, 16, 8, 0].map((b) => Math.floor(n / 2 ** b) % 256).join(".");
const valid = (s) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split(".").every((x) => Number(x) <= 255);

export function expand(text) {
  const out = new Set();
  String(text || "").split(/[,\s;]+/).filter(Boolean).forEach((p) => {
    if (p.includes("-")) {
      let [a, b] = p.split("-");
      if (b && !b.includes(".")) b = a.replace(/\d+$/, b);
      if (valid(a) && valid(b)) { const lo = num(a), hi = num(b); if (hi >= lo && hi - lo < 1024) for (let i = lo; i <= hi; i++) out.add(str(i)); }
    } else if (valid(p)) out.add(p);
  });
  return [...out].sort((a, b) => num(a) - num(b));
}

export const inSub = (st) => new Set((st.console.hosts || []).flatMap((h) => expand(h.ips)));
export const subHosts = (d, st) => { const s = inSub(st); return d.m2.hosts.filter((h) => s.has(h.ip)); };
export const kbMap = (d) => Object.fromEntries(d.m2.kb.map((k) => [k.qid, k]));
export const findings = (d, h) => { const kb = kbMap(d); return h.qids.map((q) => kb[q]); };
export const groupsOf = (st) => st.console.groups || [];

export function targetHosts(d, st, target) {
  const g = groupsOf(st).find((x) => x.name === target);
  if (target === "All lab hosts" || target === "All") return subHosts(d, st);
  const ips = new Set(expand(g ? g.ips : target)), s = inSub(st);
  return d.m2.hosts.filter((h) => ips.has(h.ip) && s.has(h.ip));
}

export const allLists = (d, st) => [...d.m2.search_lists, ...(st.console.searchlists || [])];

export function listMatch(d, st, title) {
  const l = allLists(d, st).find((x) => x.title === title);
  if (!l) return () => true;
  if (title === "Remote Exploitable") return (k) => k.remote && k.severity >= 3 && k.type !== "Information gathered";
  if (title === "Sev 4-5 Confirmed") return (k) => k.severity >= 4 && k.type === "Confirmed";
  if (title === "Accepted Risk") return (k) => [82003, 90043].includes(k.qid);
  if (l.kind === "Static") { const q = (l.qids || "").split(/[,\s]+/).map(Number); return (k) => q.includes(k.qid); }
  return (k) => (!l.severity || l.severity === "Any" || String(k.severity) === l.severity) && (!l.category || l.category === "Any" || k.category === l.category);
}

export const TYPE_CLS = { Confirmed: "text-red-300 border-red-500/60", Potential: "text-yellow-200 border-yellow-500/60", "Information gathered": "text-sky-300 border-sky-500/60" };
export const yes = (b) => (b ? "yes" : "no");
