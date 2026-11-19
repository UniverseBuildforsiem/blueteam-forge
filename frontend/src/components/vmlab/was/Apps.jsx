import { useState } from "react";
import { toast } from "sonner";
import { Panel, Btn, In, Sel, Lbl, Table, Drawer, Check, useForm } from "../ui";
import { apps, authOf, assigned, excluded, lastScan, sitemap } from "./lib";

export function SitemapDrawer({ d, st, scan, emit, onClose }) {
  const rows = sitemap(d, st, scan);
  const ex = (path) => { emit("webapp.exclusion_added", { app: scan.app, path }); toast.success(`${path} excluded`); };
  return <Drawer title={`Sitemap · ${scan.app}`} onClose={onClose} tid="wasc-sitemap"><div className="text-[11px] text-slate-400">{rows.length} URLs · {rows.filter((r) => r.kind === "form").length} forms · auth: {scan.auth || "None"}{!(scan.auth && scan.auth !== "None") && " (authenticated pages not reached)"}</div>
    <Table rowTid="wasc-sitemap-row" cols={["URL", "Type", "Auth", "Status", ""]} rows={rows.map((r) => [<span className="font-mono">{r.path}</span>, r.kind, r.auth ? "yes" : "-", r.excluded ? <span className="text-yellow-200">Excluded</span> : "Crawled",
      r.excluded ? "" : <Btn onClick={() => ex(r.path)} data-testid={`wasc-exclude-${r.path.replace(/\W+/g, "-")}`}>Exclude</Btn>])} /></Drawer>;
}

function AppRow({ a, i, d, st, emit, onSitemap }) {
  const [rec, setRec] = useState(authOf(st)[0] || "");
  const [path, setPath] = useState("");
  return <div className="border border-slate-700 p-2 space-y-2 text-xs" data-testid={`wasc-app-${i}`}><div className="flex flex-wrap gap-3 items-center"><b className="text-slate-100">{a.name}</b><span className="font-mono text-sky-300">{a.url}</span><span className="text-slate-400">{a.scope} · max {a.maxlinks} links</span>
    <span className="text-slate-400">auth: {assigned(st, a.name) || "none"}</span><span className="text-slate-400">exclusions: {excluded(st, a.name).join(", ") || "none"}</span></div>
    <div className="flex flex-wrap gap-2 items-center"><div className="w-40"><Sel options={authOf(st).length ? authOf(st) : ["(no records)"]} value={rec} onChange={(e) => setRec(e.target.value)} data-testid={`wasc-app-auth-${i}`} /></div>
      <Btn disabled={!authOf(st).length} onClick={() => { emit("webapp.auth_assigned", { app: a.name, record: rec || authOf(st)[0] }); toast.success("Authentication assigned"); }} data-testid={`wasc-app-assign-${i}`}>Assign auth</Btn>
      <div className="w-40"><In placeholder="/logout" value={path} onChange={(e) => setPath(e.target.value)} data-testid={`wasc-app-excl-${i}`} /></div>
      <Btn onClick={() => { if (!path.trim().startsWith("/")) return toast.error("Enter a path starting with /"); emit("webapp.exclusion_added", { app: a.name, path: path.trim() }); setPath(""); toast.success("Exclusion added"); }} data-testid={`wasc-app-addexcl-${i}`}>Add exclusion</Btn>
      <Btn onClick={() => onSitemap(a.name)} data-testid={`wasc-app-sitemap-${i}`}>Sitemap</Btn></div></div>;
}

export function WebApps({ d, st, emit }) {
  const [f, on, reset] = useForm({ name: "", url: "", scope: "Limit to URL hostname", maxlinks: "300", blacklist: "", tags: "" });
  const [map, setMap] = useState(null);
  const add = (e) => { e.preventDefault(); if (!f.name.trim() || !/^https?:\/\/\S+$/.test(f.url.trim())) return toast.error("Name and a valid http(s) URL are required"); emit("webapp.created", { ...f, name: f.name.trim(), url: f.url.trim() }); toast.success("Web application saved"); reset(); };
  const openMap = (app) => { const s = lastScan(st, app); if (!s) return toast.error("Run a discovery or vulnerability scan first"); setMap(s); emit("was.sitemap_viewed", { app }); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="Web Applications" tid="wasc-apps"><div className="space-y-2">{apps(st).map((a, i) => <AppRow key={a.name} a={a} i={i} d={d} st={st} emit={emit} onSitemap={openMap} />)}{!apps(st).length && <p className="text-xs text-slate-500">No web applications yet.</p>}</div></Panel>
    <Panel title="New web application"><form onSubmit={add} className="grid sm:grid-cols-2 gap-2"><Lbl t="Name"><In value={f.name} onChange={on("name")} data-testid="wasc-app-name" /></Lbl><Lbl t="Starting URL"><In value={f.url} onChange={on("url")} placeholder={d.m3.was.url} data-testid="wasc-app-url" /></Lbl>
      <Lbl t="Crawl scope"><Sel options={["Limit to URL hostname", "Limit to content at or below URL subdirectory", "Limit to URL hostname and specified sub-domains"]} value={f.scope} onChange={on("scope")} data-testid="wasc-app-scope" /></Lbl>
      <Lbl t="Maximum links to crawl"><In type="number" value={f.maxlinks} onChange={on("maxlinks")} data-testid="wasc-app-maxlinks" /></Lbl><Lbl t="Exclusions (comma separated)"><In value={f.blacklist} onChange={on("blacklist")} data-testid="wasc-app-blacklist" /></Lbl>
      <Lbl t="Tags"><In value={f.tags} onChange={on("tags")} /></Lbl><div><Btn primary type="submit" data-testid="wasc-app-create">Save web application</Btn></div></form></Panel>
    {map && <SitemapDrawer d={d} st={st} scan={map} emit={emit} onClose={() => setMap(null)} />}</div>;
}

export function WasAuth({ st, emit }) {
  const [f, on, reset] = useForm({ title: "", kind: "Form", user_field: "", pass_field: "", user: "", password: "", check: "" });
  const save = (e) => { e.preventDefault(); if (!f.title.trim() || !f.user.trim() || !f.password) return toast.error("Title, user and password are required"); if (f.kind === "Form" && (!f.user_field.trim() || !f.pass_field.trim())) return toast.error("Form records need both field names");
    const { password, ...rest } = f; emit("was.auth_created", { ...rest, title: f.title.trim(), user_field: f.user_field.trim(), pass_field: f.pass_field.trim(), check: f.check.trim() }); toast.success("Authentication record saved"); reset(); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="Web Authentication Records" tid="wasc-auth"><Table rowTid="wasc-auth-row" empty="No records" cols={["Title", "Type", "User field", "Password field", "User", "Login check"]} rows={(st.console.was_auth || []).map((a) => [a.title, a.kind, a.user_field || "-", a.pass_field || "-", a.user, a.check || "-"])} /></Panel>
    <Panel title="New record"><form onSubmit={save} className="grid sm:grid-cols-2 gap-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="wasc-auth-title" /></Lbl><Lbl t="Type"><Sel options={["Form", "Basic", "Bearer token"]} value={f.kind} onChange={on("kind")} data-testid="wasc-auth-kind" /></Lbl>
      {f.kind === "Form" && <><Lbl t="Username field name"><In value={f.user_field} onChange={on("user_field")} data-testid="wasc-auth-userfield" /></Lbl><Lbl t="Password field name"><In value={f.pass_field} onChange={on("pass_field")} data-testid="wasc-auth-passfield" /></Lbl></>}
      <Lbl t="Username"><In value={f.user} onChange={on("user")} data-testid="wasc-auth-user" /></Lbl><Lbl t="Password"><In type="password" value={f.password} onChange={on("password")} data-testid="wasc-auth-password" /></Lbl>
      <Lbl t="Login check (regex on success page)"><In value={f.check} onChange={on("check")} placeholder="Logout" data-testid="wasc-auth-check" /></Lbl><div className="self-end"><Btn primary type="submit" data-testid="wasc-auth-save">Save record</Btn></div></form></Panel></div>;
}

export function WasProfiles({ st, emit }) {
  const [f, on, reset] = useForm({ title: "", maxlinks: "300", detection: "Core", searchlist: "", forms: "GET only", bruteforce: "None" });
  const [cc, setCc] = useState(false);
  const lists = (st.console.was_lists || []).map((l) => l.title);
  const save = (e) => { e.preventDefault(); if (!f.title.trim()) return toast.error("Title is required"); if (f.detection === "Custom search list" && !(f.searchlist || lists[0])) return toast.error("Create a search list first");
    emit("was.profile_created", { ...f, title: f.title.trim(), searchlist: f.detection === "Custom search list" ? f.searchlist || lists[0] : "", cc: cc ? "yes" : "no" }); toast.success("Option profile saved"); reset(); setCc(false); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="WAS Option Profiles" tid="wasc-profiles"><Table rowTid="wasc-profile-row" cols={["Title", "Max links", "Detection", "Forms", "Credit cards", "Brute force"]} rows={[["Initial WAS Options", "300", "Core", "GET only", "No", "None"], ...(st.console.was_profiles || []).map((p) => [p.title, p.maxlinks, p.detection === "Custom search list" ? `List: ${p.searchlist}` : p.detection, p.forms, p.cc === "yes" ? "Yes" : "No", p.bruteforce])]} /></Panel>
    <Panel title="New option profile"><form onSubmit={save} className="grid sm:grid-cols-2 gap-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="wasc-op-title" /></Lbl><Lbl t="Maximum links"><In type="number" value={f.maxlinks} onChange={on("maxlinks")} data-testid="wasc-op-maxlinks" /></Lbl>
      <Lbl t="Detection scope"><Sel options={["Core", "XSS Power Mode", "Custom search list"]} value={f.detection} onChange={on("detection")} data-testid="wasc-op-detection" /></Lbl>
      {f.detection === "Custom search list" && <Lbl t="Search list"><Sel options={lists.length ? lists : ["(none)"]} value={f.searchlist || lists[0]} onChange={on("searchlist")} data-testid="wasc-op-searchlist" /></Lbl>}
      <Lbl t="Form submission"><Sel options={["GET only", "POST and GET", "None"]} value={f.forms} onChange={on("forms")} data-testid="wasc-op-forms" /></Lbl><Lbl t="Password brute forcing"><Sel options={["None", "Minimal", "Exhaustive"]} value={f.bruteforce} onChange={on("bruteforce")} /></Lbl>
      <Check label="Sensitive content: credit card numbers" checked={cc} onChange={setCc} tid="wasc-op-cc" /><div><Btn primary type="submit" data-testid="wasc-op-save">Save profile</Btn></div></form></Panel></div>;
}
