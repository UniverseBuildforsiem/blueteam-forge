const last = (arr, pred) => [...(arr || [])].reverse().find(pred);

export const apps = (st) => { const m = new Map(); (st.console.webapps || []).forEach((a) => m.set(a.name, a)); return [...m.values()]; };
export const authOf = (st) => (st.console.was_auth || []).map((a) => a.title);
export const assigned = (st, app) => last(st.console.was_assign, (x) => x.app === app)?.record || "";
export const profilesOf = (st) => ["Initial WAS Options", ...new Set((st.console.was_profiles || []).map((p) => p.title))];
export const profile = (st, title) => last(st.console.was_profiles, (p) => p.title === title) || { title, maxlinks: "300", detection: "Core", forms: "GET only", cc: "no" };
export const excluded = (st, app) => { const a = apps(st).find((x) => x.name === app); return [...(a?.blacklist || "").split(/[,\s]+/).filter(Boolean), ...(st.console.was_excl || []).filter((x) => x.app === app).map((x) => x.path)]; };
export const isExcl = (path, ex) => ex.some((e) => path === e || path.startsWith(`${e.replace(/\/$/, "")}/`) || path.replace(/\/$/, "") === e.replace(/\/$/, ""));
export const listsOf = (st) => { const m = new Map(); (st.console.was_lists || []).forEach((l) => m.set(l.title, l)); return [...m.values()]; };

export function listMatch(st, title) {
  const l = listsOf(st).find((x) => x.title === title);
  if (!l) return () => true;
  if (title === "Injection Only") return (k) => k.owasp.startsWith("A03");
  if (title === "Sensitive Content") return (k) => k.sensitive;
  if (l.kind === "Static") { const q = (l.qids || "").split(/[,\s]+/).map(Number); return (k) => q.includes(k.qid); }
  if (l.kind === "Dynamic") return (k) => (!l.owasp || l.owasp === "Any" || k.owasp === l.owasp) && (!l.severity || l.severity === "Any" || String(k.severity) === l.severity);
  return () => true;
}

export const sitemap = (d, st, scan) => { const ex = excluded(st, scan.app); return d.m3.was.sitemap.filter((s) => !s.auth || (scan.auth && scan.auth !== "None")).map((s) => ({ ...s, excluded: isExcl(s.path, ex) })); };

export function findings(d, st, scan) {
  if (scan.type !== "Vulnerability") return [];
  const p = profile(st, scan.profile), auth = scan.auth && scan.auth !== "None", ex = excluded(st, scan.app);
  const m = p.detection === "Custom search list" ? listMatch(st, p.searchlist) : p.detection === "XSS Power Mode" ? (k) => k.cwe === "CWE-79" : () => true;
  const ign = new Set((st.console.was_ignored || []).map((x) => Number(x.qid)));
  return d.m3.was.kb.filter((k) => (!k.auth || auth) && (!k.sensitive || p.cc === "yes") && m(k) && !isExcl(k.path, ex)).map((k) => ({ ...k, ignored: ign.has(k.qid) }));
}

export const tileOf = (path) => `/${path.split(/[/?]/)[1] || ""}`;
export function runItems(d, st, scan) {
  const f = findings(d, st, scan);
  const items = scan.type === "Vulnerability" ? f.map((k) => ({ h: { ip: tileOf(k.path), tag: k.path }, k: { ...k, tag: k.cwe } }))
    : sitemap(d, st, scan).filter((s) => !s.excluded).map((s) => ({ h: { ip: tileOf(s.path), tag: s.kind }, k: { qid: s.path, severity: 1, title: s.path, tag: "crawl" } }));
  const tiles = [...new Set(d.m3.was.sitemap.map((s) => tileOf(s.path)))].slice(0, 12).map((ip) => ({ ip, name: ip, label: ip }));
  return { items, tiles };
}
export const lastScan = (st, app, type) => last(st.console.was_scans, (s) => s.app === app && (!type || s.type === type));
