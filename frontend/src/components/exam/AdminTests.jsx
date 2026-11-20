import { useEffect, useState } from "react";
import { Plus, Trash2, Save, ArrowLeft, Eye, Check, EyeOff, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, Empty } from "../common";
import { L, Lines } from "../academy/CourseBuilder";
import { PriceTag } from "../academy/Price";
import { KIND_LABEL } from "./Catalog";
import { TestAnalytics } from "./TestAnalytics";

const blank = () => ({ title: "", subtitle: "", description: "", vendor: "", topic: "", code: "", level: "Intermediate", price: 0, mrp: 0, sale_ends_at: null, cover: "", kind: "certification",
  duration_min: 60, pass_mark: 70, attempts_max: 3, cooldown_hours: 24, identity: "name", practice_enabled: true, shuffle: true, outcomes: [], requirements: [], audience: [], faqs: [], domains: [], related: [],
  selection: { mode: "fixed", ids: [] }, sample_qids: [] });

function Rows({ items, set, cols, tid, add }) {
  return <div className="space-y-2" data-testid={tid}>{items.map((it, i) => <div key={i} className="flex gap-2">{cols.map(([k, ph, w = "flex-1", type]) => <input key={k} type={type} className={`field !text-xs ${w}`} placeholder={ph} value={it[k] ?? ""}
    onChange={(e) => set(items.map((x, j) => (j === i ? { ...x, [k]: type === "number" ? +e.target.value : e.target.value } : x)))} data-testid={`${tid}-${k}-${i}`} />)}
    <button className="text-slate-500 hover:text-red-400" onClick={() => set(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button></div>)}
    <button className="ghost-btn !text-xs" onClick={() => set([...items, add])} data-testid={`${tid}-add`}><Plus className="h-3.5 w-3.5" />Add</button></div>;
}

function Selection({ d, setD, bank }) {
  const s = d.selection;
  const doms = [...new Set(bank.map((q) => q.domain))];
  const ids = new Set(s.ids || []);
  const set = (x) => setD({ ...d, selection: { ...s, ...x } });
  return (
    <Glass className="p-5 space-y-3" data-testid="test-selection">
      <div className="flex flex-wrap items-center gap-3"><h3 className="font-bold flex-1">Questions</h3>
        {[["fixed", "Fixed list"], ["pool", "Random pool per domain"]].map(([v, l]) => <button key={v} className={`text-xs font-mono px-3 py-1 border ${s.mode === v ? "border-cyan-400 text-cyan-200 bg-cyan-400/10" : "border-white/10 text-slate-400"}`} onClick={() => set(v === "pool" ? { mode: v, domains: s.domains || doms.map((x) => ({ domain: x, count: 5, tags: [] })) } : { mode: v, ids: s.ids || [] })} data-testid={`selection-${v}`}>{l}</button>)}</div>
      {s.mode === "pool" ? <Rows items={s.domains || []} set={(v) => set({ domains: v })} tid="pool" add={{ domain: doms[0] || "", count: 5, tags: [] }} cols={[["domain", "Domain (exact name)"], ["count", "Questions", "w-28", "number"]]} />
        : <div className="max-h-72 overflow-auto border border-white/10 divide-y divide-white/5">
          <div className="p-2 flex gap-2 text-xs sticky top-0 bg-[#0B0F1A]"><span className="flex-1 font-mono text-cyan-300" data-testid="selection-count">{ids.size} selected</span>
            <button className="underline" onClick={() => set({ ids: bank.map((q) => q.qid) })} data-testid="selection-all">select all</button><button className="underline" onClick={() => set({ ids: [] })}>clear</button></div>
          {bank.map((q) => <label key={q.qid} className="p-2 flex gap-2 text-xs items-start"><input type="checkbox" checked={ids.has(q.qid)} onChange={() => set({ ids: ids.has(q.qid) ? s.ids.filter((x) => x !== q.qid) : [...(s.ids || []), q.qid] })} data-testid={`select-${q.qid}`} />
            <span className="font-mono text-slate-500 w-20 shrink-0">{q.qid}</span><span className="flex-1 line-clamp-1">{q.stem}</span><span className="text-slate-500">{q.domain}</span>
            <button type="button" onClick={(e) => { e.preventDefault(); const on = d.sample_qids.includes(q.qid); if (!on && d.sample_qids.length >= 3) return toast.error("Max 3 sample questions"); setD({ ...d, sample_qids: on ? d.sample_qids.filter((x) => x !== q.qid) : [...d.sample_qids, q.qid] }); }}
              className={`font-mono px-1.5 border ${d.sample_qids.includes(q.qid) ? "border-yellow-400 text-yellow-300" : "border-white/10 text-slate-500"}`} data-testid={`sample-${q.qid}`}>sample</button></label>)}
        </div>}
      <p className="text-[11px] text-slate-500">Mark up to 3 questions as free <b>sample</b> previews on the landing page ({d.sample_qids.length}/3).</p>
    </Glass>);
}

function Editor({ t, back }) {
  const [d, setD] = useState(t.id ? t : blank());
  const [bank, setBank] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/admin/questions").then((r) => setBank(r.data.questions)); }, []);
  const f = (k, l, props = {}) => <L l={l}><input className="field" value={d[k] ?? ""} onChange={(e) => setD({ ...d, [k]: props.type === "number" ? +e.target.value : e.target.value })} data-testid={`test-${k}`} {...props} /></L>;
  const sel = (k, l, opts) => <L l={l}><select className="field" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} data-testid={`test-${k}`}>{opts.map(([v, x]) => <option key={v} value={v}>{x}</option>)}</select></L>;
  const save = async () => { setBusy(true); try { const { data } = d.id ? await api.put(`/admin/exams/${d.id}`, d) : await api.post("/admin/exams", d); setD(data); toast.success("Test saved"); return data; } catch (e) { toast.error(errMsg(e)); return null; } finally { setBusy(false); } };
  const publish = async (status) => { const s = await save(); if (!s) return; try { await api.post(`/admin/exams/${s.id}/status`, { status }); toast.success(status === "published" ? "Test published" : "Test unpublished"); setD({ ...s, status }); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-4" data-testid="test-editor">
      <div className="flex flex-wrap items-center gap-2"><button onClick={back} className="text-xs font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1" data-testid="test-back"><ArrowLeft className="h-3.5 w-3.5" />Tests</button>
        {d.status && <span className="text-[10px] font-mono uppercase border px-1.5 py-0.5 border-white/15">{d.status}</span>}<span className="flex-1" />
        {d.id && <a href={`/test/${d.id}`} target="_blank" rel="noreferrer" className="ghost-btn !text-xs" data-testid="test-open-landing"><Eye className="h-3.5 w-3.5" />Test page</a>}
        <button className="ghost-btn !text-xs" disabled={busy} onClick={save} data-testid="test-save"><Save className="h-3.5 w-3.5" />Save</button>
        {d.status === "published" ? <button className="ghost-btn !text-xs" onClick={() => publish("draft")} data-testid="test-unpublish"><EyeOff className="h-3.5 w-3.5" />Unpublish</button> : <button className="glow-btn !text-xs" disabled={busy} onClick={() => publish("published")} data-testid="test-publish"><Check className="h-3.5 w-3.5" />Publish</button>}
      </div>
      <Glass className="p-5 space-y-4" data-testid="test-meta">
        <div className="grid sm:grid-cols-4 gap-3"><div className="sm:col-span-2">{f("title", "Title")}</div>{f("code", "Exam code")}{sel("level", "Level", ["Beginner", "Intermediate", "Advanced"].map((x) => [x, x]))}
          {f("vendor", "Vendor")}{f("topic", "Topic")}<div className="sm:col-span-2">{f("cover", "Cover image URL (optional)")}</div><div className="sm:col-span-4">{f("subtitle", "Short description")}</div></div>
        <div className="border border-yellow-500/20 bg-yellow-500/5 p-3 grid sm:grid-cols-3 gap-3 items-end">{f("price", "Sale price ₹ (0 = free)", { type: "number", min: 0 })}{f("mrp", "Original price ₹", { type: "number", min: 0 })}
          <div className="text-xs font-mono pb-2"><PriceTag c={{ price: d.price, mrp: d.mrp > d.price ? d.mrp : null, off: d.mrp > d.price ? Math.round((100 * (d.mrp - d.price)) / d.mrp) : 0 }} /></div></div>
        <div className="border border-cyan-500/20 p-3 grid sm:grid-cols-4 gap-3" data-testid="test-format">
          {sel("kind", "Format", Object.entries(KIND_LABEL))}{f("duration_min", "Duration (min, 0 = untimed)", { type: "number", min: 0 })}{f("pass_mark", "Pass mark %", { type: "number", min: 1, max: 100 })}
          <L l="Options"><div className="space-y-1 text-xs pt-1"><label className="flex gap-2"><input type="checkbox" checked={d.practice_enabled} onChange={(e) => setD({ ...d, practice_enabled: e.target.checked })} data-testid="test-practice-enabled" />Practice mode available</label>
            <label className="flex gap-2"><input type="checkbox" checked={d.shuffle} onChange={(e) => setD({ ...d, shuffle: e.target.checked })} />Shuffle in practice</label></div></L>
          {d.kind === "certification" && <>{f("attempts_max", "Certification attempts", { type: "number", min: 1 })}{f("cooldown_hours", "Cooldown hours", { type: "number", min: 0 })}
            {sel("identity", "Identity check", [["account", "Account only"], ["name", "Account + legal name"], ["webcam", "Name + webcam photo"]])}</>}
        </div>
        <L l="Description"><textarea className="field h-28 text-sm" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} data-testid="test-description" /></L>
        <div className="grid md:grid-cols-3 gap-3"><Lines tid="test" k="outcomes" l="What you'll be tested on (one per line)" d={d} setD={setD} /><Lines tid="test" k="requirements" l="Requirements" d={d} setD={setD} /><Lines tid="test" k="audience" l="Who it's for" d={d} setD={setD} /></div>
      </Glass>
      <div className="grid lg:grid-cols-2 gap-4">
        <Glass className="p-5 space-y-2"><h3 className="font-bold">Syllabus domains & weights (%)</h3><Rows items={d.domains} set={(v) => setD({ ...d, domains: v })} tid="test-domains" add={{ name: "", weight: 10, links: [] }} cols={[["name", "Domain name (matches question domain)"], ["weight", "%", "w-20", "number"]]} /></Glass>
        <Glass className="p-5 space-y-2"><h3 className="font-bold">FAQs</h3><Rows items={d.faqs} set={(v) => setD({ ...d, faqs: v })} tid="test-faqs" add={{ q: "", a: "" }} cols={[["q", "Question"], ["a", "Answer"]]} /></Glass>
        <Glass className="p-5 space-y-2 lg:col-span-2"><h3 className="font-bold">Related courses & labs</h3><Rows items={d.related} set={(v) => setD({ ...d, related: v })} tid="test-related" add={{ kind: "Course", title: "", link: "" }} cols={[["kind", "Kind", "w-28"], ["title", "Title"], ["link", "Link (/course/... or /app/labs/...)"]]} /></Glass>
      </div>
      <Selection d={d} setD={setD} bank={bank} />
    </div>);
}

export function AdminTests() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [stats, setStats] = useState(null);
  const load = () => api.get("/admin/exams").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  if (edit) return <Editor t={edit} back={() => { setEdit(null); load(); }} />;
  if (stats) return <TestAnalytics id={stats} back={() => setStats(null)} />;
  const del = async (t) => { if (!window.confirm(`Delete "${t.title}"?`)) return; try { await api.delete(`/admin/exams/${t.id}`); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div data-testid="admin-tests">
      <div className="flex items-center mb-4"><span className="text-sm text-slate-400 flex-1">Certification and practice tests. Questions come from the question bank.</span><button className="glow-btn !text-xs" onClick={() => setEdit({})} data-testid="test-new"><Plus className="h-3.5 w-3.5" />New test</button></div>
      {list && !list.length && <Empty text="No tests yet" />}
      <div className="space-y-2">{(list || []).map((t) => <Glass key={t.id} className="p-4 flex flex-wrap items-center gap-3" data-testid={`test-row-${t.id}`}>
        <div className="flex-1 min-w-[200px]"><div className="font-bold text-sm">{t.title}</div><div className="text-[11px] font-mono text-slate-500">{t.code} · {KIND_LABEL[t.kind]} · {t.questions} questions · {t.price ? `₹${t.price}` : "Free"} · {t.attempts} attempts · updated {fmtDate(t.updated_at)}</div></div>
        <span className={`text-[10px] font-mono uppercase border px-1.5 py-0.5 ${t.status === "published" ? "text-green-400 border-green-500/40" : "text-slate-400 border-white/15"}`}>{t.status}</span>
        <button className="ghost-btn !text-xs" onClick={() => setEdit(t)} data-testid={`test-edit-${t.id}`}>Edit</button>
        <button className="ghost-btn !text-xs" onClick={() => setStats(t.id)} data-testid={`test-analytics-${t.id}`}><BarChart3 className="h-3.5 w-3.5" />Analytics</button>
        <button className="text-slate-500 hover:text-red-400" onClick={() => del(t)} data-testid={`test-delete-${t.id}`}><Trash2 className="h-4 w-4" /></button></Glass>)}</div>
    </div>);
}
