import { useState } from "react";
import { toast } from "sonner";
import { Panel, Btn, In, Sel, Lbl, Table, Check, useForm } from "../ui";
import { expand, subHosts } from "./lib";

const ENGINES = ["Static", "Asset Inventory", "Asset Name Contains", "OS Regular Expression", "IP Address In Range(s)", "Vulnerability (QID) Exists"];

export function evalRule(engine, query, hosts) {
  const q = (query || "").trim();
  if (engine === "Asset Inventory") { const m = q.match(/^operatingSystem(?:\.\w+)?\s*:\s*["'`]?(.+?)["'`]?$/i); if (!m) throw new Error("Use the operatingSystem token, e.g. operatingSystem: Windows"); return hosts.map((h) => h.os.toLowerCase().includes(m[1].toLowerCase())); }
  if (engine === "Asset Name Contains") return hosts.map((h) => !!q && h.name.toLowerCase().includes(q.toLowerCase()));
  if (engine === "OS Regular Expression") { let r; try { r = new RegExp(q, "i"); } catch { throw new Error("Invalid regular expression"); } return hosts.map((h) => r.test(h.os)); }
  if (engine === "IP Address In Range(s)") { const s = new Set(expand(q)); return hosts.map((h) => s.has(h.ip)); }
  if (engine === "Vulnerability (QID) Exists") return hosts.map((h) => h.qids.includes(Number(q)));
  return hosts.map(() => false);
}

export function Tags2({ d, st, emit }) {
  const [f, on, reset] = useForm({ name: "", parent: "(none)", engine: "Static", query: "" });
  const [ev, setEv] = useState(false);
  const [test, setTest] = useState(null);
  const hosts = subHosts(d, st), mine = st.console.tags || [];
  const own = (t) => { try { return t.evaluate === "yes" ? hosts.filter((h, i) => evalRule(t.engine, t.query, hosts)[i]).map((h) => h.ip) : []; } catch { return []; } };
  const reach = (t, depth = 0) => new Set([...own(t), ...(depth < 6 ? mine.filter((c) => c.parent === t.name).flatMap((c) => [...reach(c, depth + 1)]) : [])]);
  const count = (t) => reach(t).size;
  const run = () => { try { const r = evalRule(f.engine, f.query, hosts); setTest(r); emit("tag.rule_tested", { engine: f.engine, query: f.query.trim(), passed: String(r.filter(Boolean).length) }); } catch (e) { toast.error(e.message); } };
  const add = (e) => { e.preventDefault(); if (!f.name.trim()) return toast.error("Tag name is required"); emit("tag.created", { name: f.name.trim(), parent: f.parent === "(none)" ? "" : f.parent, engine: f.engine, query: f.engine === "Static" ? "" : f.query.trim(), evaluate: f.engine === "Static" ? "no" : ev ? "yes" : "no" }); toast.success(`Tag '${f.name.trim()}' created`); reset(); setEv(false); setTest(null); };
  const tree = [];
  const walk = (parent, depth) => mine.filter((t) => (t.parent || "") === parent).forEach((t) => { tree.push([depth, t]); if (depth < 5) walk(t.name, depth + 1); });
  walk("", 0);
  return <div className="grid grid-cols-1 gap-3"><Panel title="Asset Tags" tid="vmc-tags"><Table rowTid="vmc-tag-row" empty="No tags yet" cols={["Tag", "Rule engine", "Rule", "Assets"]} rows={tree.map(([dp, t]) => [<span style={{ paddingLeft: dp * 16 }}>{dp ? "└ " : ""}{t.name}</span>, t.engine, t.query || "-", count(t)])} /></Panel>
    <Panel title="Create tag"><form onSubmit={add} className="space-y-2"><Lbl t="Tag name"><In value={f.name} onChange={on("name")} data-testid="vmc-tag-name" /></Lbl>
      <Lbl t="Parent tag"><Sel options={["(none)", ...mine.map((t) => t.name)]} value={f.parent} onChange={on("parent")} data-testid="vmc-tag-parent" /></Lbl>
      <Lbl t="Rule engine"><Sel options={ENGINES} value={f.engine} onChange={(e) => { on("engine")(e); setTest(null); }} data-testid="vmc-tag-engine" /></Lbl>
      {f.engine !== "Static" && <><Lbl t="Rule / query"><In value={f.query} onChange={on("query")} placeholder={f.engine === "Asset Inventory" ? "operatingSystem: Windows" : ""} data-testid="vmc-tag-query" /></Lbl>
        <Btn type="button" onClick={run} data-testid="vmc-tag-test">Test rule</Btn>
        {test && <ul className="text-[11px] space-y-0.5" data-testid="vmc-tag-test-result">{hosts.map((h, i) => <li key={h.ip} className="flex gap-2"><span className={test[i] ? "text-green-400 w-8" : "text-red-400 w-8"}>{test[i] ? "Pass" : "Fail"}</span><span className="text-slate-300">{h.name.split(".")[0]}</span><span className="text-slate-500 truncate">{h.os}</span></li>)}<li className="text-slate-400 pt-1" data-testid="vmc-tag-test-count">{test.filter(Boolean).length} of {hosts.length} pass</li></ul>}
        <Check label="Evaluate rule on creation (tag hosts already scanned)" checked={ev} onChange={setEv} tid="vmc-tag-evaluate" /></>}
      <Btn primary type="submit" data-testid="vmc-tag-create">Create</Btn></form></Panel></div>;
}
