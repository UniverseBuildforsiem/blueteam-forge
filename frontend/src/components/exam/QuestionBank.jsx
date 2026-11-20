import { useEffect, useState } from "react";
import { Plus, Trash2, Upload, History, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, Empty } from "../common";
import { Options, ScenarioPanel } from "./Question";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

const blankQ = () => ({ type: "single", stem: "", options: [{ id: "a", text: "", why: "" }, { id: "b", text: "", why: "" }, { id: "c", text: "", why: "" }, { id: "d", text: "", why: "" }], correct: [], domain: "", difficulty: "medium", hint: "", ref_url: "", ref_label: "", tags: [], scenario_id: null });
const SAMPLE_CSV = "type,stem,option_a,option_b,option_c,option_d,why_a,why_b,why_c,why_d,correct,domain,difficulty,hint,ref_url,ref_label,tags,scenario_id,scenario_title,scenario_kind,scenario_body\nsingle,Which Windows event ID records a failed logon?,4624,4625,4740,4688,Successful logon,Correct - failed logon,Account lockout,Process creation,b,Incidents Events & Logging,easy,Its twin is 4624,/app/siem,SIEM simulator,windows|logon,,,,\n";

function QForm({ q, scenarios, done }) {
  const [d, setD] = useState(q.qid ? q : blankQ());
  const setOpt = (i, k, v) => setD({ ...d, options: d.options.map((o, j) => (j === i ? { ...o, [k]: v } : o)) });
  const toggle = (id) => setD({ ...d, correct: d.type === "multi" ? (d.correct.includes(id) ? d.correct.filter((x) => x !== id) : [...d.correct, id]) : [id] });
  const setType = (type) => setD({ ...d, type, correct: [], options: type === "tf" ? [{ id: "a", text: "True", why: "" }, { id: "b", text: "False", why: "" }] : d.options.length === 2 && d.type === "tf" ? blankQ().options : d.options });
  const save = async () => { try { await (d.qid ? api.put(`/admin/questions/${d.qid}`, d) : api.post("/admin/questions", d)); toast.success(d.qid ? "Saved as a new version" : "Question added"); done(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Glass className="p-5 space-y-3" data-testid="question-form">
      <div className="flex flex-wrap gap-2">{[["single", "Single choice"], ["multi", "Multiple select"], ["tf", "True / False"]].map(([v, l]) => <button key={v} onClick={() => setType(v)} className={`text-xs font-mono px-3 py-1 border ${d.type === v ? "border-cyan-400 text-cyan-200 bg-cyan-400/10" : "border-white/10 text-slate-400"}`} data-testid={`qform-type-${v}`}>{l}</button>)}
        <select className="field !w-auto !text-xs ml-auto" value={d.scenario_id || ""} onChange={(e) => setD({ ...d, scenario_id: e.target.value || null })} data-testid="qform-scenario"><option value="">No case study</option>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
      <textarea className="field h-20 text-sm" placeholder="Question text" value={d.stem} onChange={(e) => setD({ ...d, stem: e.target.value })} data-testid="qform-stem" />
      <div className="space-y-2">{d.options.map((o, i) => <div key={o.id} className="grid sm:grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
        <button onClick={() => toggle(o.id)} className={`h-7 w-7 font-mono text-xs border ${d.correct.includes(o.id) ? "border-green-400 bg-green-500/20 text-green-200" : "border-white/15 text-slate-400"}`} title="Mark correct" data-testid={`qform-correct-${o.id}`}>{o.id.toUpperCase()}</button>
        <input className="field !text-xs" placeholder="Option text" value={o.text} disabled={d.type === "tf"} onChange={(e) => setOpt(i, "text", e.target.value)} data-testid={`qform-opt-${o.id}`} />
        <input className="field !text-xs" placeholder="Why right / why wrong" value={o.why} onChange={(e) => setOpt(i, "why", e.target.value)} data-testid={`qform-why-${o.id}`} />
        {d.type !== "tf" && d.options.length > 2 ? <button className="text-slate-500 hover:text-red-400" onClick={() => setD({ ...d, options: d.options.filter((_, j) => j !== i), correct: d.correct.filter((x) => x !== o.id) })}><X className="h-4 w-4" /></button> : <span />}</div>)}
        {d.type !== "tf" && d.options.length < 6 && <button className="ghost-btn !text-xs" onClick={() => setD({ ...d, options: [...d.options, { id: "abcdef".split("").find((x) => !d.options.some((o) => o.id === x)), text: "", why: "" }] })} data-testid="qform-add-option"><Plus className="h-3.5 w-3.5" />Option</button>}</div>
      <div className="grid sm:grid-cols-4 gap-2">
        <input className="field !text-xs" placeholder="Domain / topic" value={d.domain} onChange={(e) => setD({ ...d, domain: e.target.value })} data-testid="qform-domain" />
        <select className="field !text-xs" value={d.difficulty} onChange={(e) => setD({ ...d, difficulty: e.target.value })} data-testid="qform-difficulty">{["easy", "medium", "hard"].map((x) => <option key={x}>{x}</option>)}</select>
        <input className="field !text-xs sm:col-span-2" placeholder="Tags (comma separated)" value={(d.tags || []).join(", ")} onChange={(e) => setD({ ...d, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} data-testid="qform-tags" />
        <input className="field !text-xs sm:col-span-2" placeholder="Hint" value={d.hint} onChange={(e) => setD({ ...d, hint: e.target.value })} data-testid="qform-hint" />
        <input className="field !text-xs" placeholder="Reference link (lecture/lab)" value={d.ref_url} onChange={(e) => setD({ ...d, ref_url: e.target.value })} data-testid="qform-ref-url" />
        <input className="field !text-xs" placeholder="Reference label" value={d.ref_label} onChange={(e) => setD({ ...d, ref_label: e.target.value })} data-testid="qform-ref-label" /></div>
      <div className="flex gap-2"><button className="glow-btn !text-xs" onClick={save} data-testid="qform-save">{d.qid ? "Save new version" : "Add question"}</button><button className="ghost-btn !text-xs" onClick={done} data-testid="qform-cancel">Cancel</button></div>
    </Glass>);
}

function Import({ done }) {
  const [fmt, setFmt] = useState("csv");
  const [text, setText] = useState("");
  const [res, setRes] = useState(null);
  const run = async (commit) => { try { const r = await api.post("/admin/questions/import", { format: fmt, text, commit }); setRes(r.data); if (commit) { toast.success(`Imported ${r.data.valid} questions`); done(); } } catch (e) { toast.error(errMsg(e)); } };
  const file = (e) => { const f = e.target.files[0]; if (!f) return; setFmt(f.name.endsWith(".json") ? "json" : "csv"); f.text().then(setText); };
  return (
    <Glass className="p-5 space-y-3" data-testid="question-import">
      <div className="flex flex-wrap gap-2 items-center"><h3 className="font-bold flex-1">Import questions (CSV / JSON)</h3>
        <select className="field !w-auto !text-xs" value={fmt} onChange={(e) => setFmt(e.target.value)} data-testid="import-format"><option value="csv">CSV</option><option value="json">JSON</option></select>
        <label className="ghost-btn !text-xs cursor-pointer"><Upload className="h-3.5 w-3.5" />Choose file<input type="file" accept=".csv,.json" className="hidden" onChange={file} data-testid="import-file" /></label>
        <button className="ghost-btn !text-xs" onClick={() => { setFmt("csv"); setText(SAMPLE_CSV); }} data-testid="import-sample">Load CSV template</button></div>
      <textarea className="field h-40 font-mono text-[11px]" value={text} onChange={(e) => { setText(e.target.value); setRes(null); }} placeholder="Paste CSV or JSON here" data-testid="import-text" />
      <p className="text-[11px] text-slate-500">CSV columns: type (single|multi|tf), stem, option_a…f, why_a…f, correct (a or a|c), domain, difficulty, hint, ref_url, ref_label, tags (x|y), qid (optional: updates create a new version), scenario_id/title/kind/body (case study shared by linked rows).</p>
      <div className="flex gap-2"><button className="ghost-btn !text-xs" disabled={!text.trim()} onClick={() => run(false)} data-testid="import-preview">Preview</button>
        <button className="glow-btn !text-xs" disabled={!res?.valid} onClick={() => run(true)} data-testid="import-commit">Import {res?.valid || ""} questions</button></div>
      {res && <div className="text-xs space-y-2" data-testid="import-result"><div className="font-mono"><span className="text-green-300">{res.valid} valid</span> · <span className="text-red-300">{res.errors.length} errors</span>{res.scenarios.length > 0 && ` · ${res.scenarios.length} case studies`}</div>
        {res.errors.map((e) => <div key={e.row} className="text-red-300">Row {e.row}: {e.error}</div>)}
        <div className="space-y-1 max-h-60 overflow-auto">{res.preview.map((q, i) => <div key={i} className="border border-white/10 p-2"><span className="font-mono text-cyan-300 mr-2">{q.type}</span>{q.stem}<span className="text-slate-500"> · {q.domain} · correct {q.correct.join(", ")}</span></div>)}</div></div>}
    </Glass>);
}

function Versions({ qid, close }) {
  const [v, setV] = useState([]);
  useEffect(() => { api.get(`/admin/questions/${qid}/versions`).then((r) => setV(r.data)); }, [qid]);
  const restore = async (n) => { await api.post(`/admin/questions/${qid}/restore/${n}`); toast.success(`Restored v${n} as a new version`); close(true); };
  return <Dialog open onOpenChange={() => close(false)}><DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-2xl max-h-[80vh] overflow-auto" data-testid="question-versions"><DialogHeader><DialogTitle>Versions · {qid}</DialogTitle></DialogHeader>
    {v.map((x) => <div key={x.id} className="border border-white/10 p-3 text-xs space-y-1"><div className="flex gap-2 font-mono"><span className="text-cyan-300">v{x.version}</span>{x.latest && <span className="text-green-300">current</span>}<span className="text-slate-500 flex-1">{fmtDate(x.created_at)} · {x.author}</span>
      {!x.latest && <button className="underline" onClick={() => restore(x.version)} data-testid={`restore-v${x.version}`}>restore</button>}</div><div>{x.stem}</div><div className="text-slate-500">correct: {x.correct.join(", ")}</div></div>)}</DialogContent></Dialog>;
}

function Scenarios({ list, reload }) {
  const [d, setD] = useState({ title: "", kind: "log", body: "" });
  const add = async () => { try { await api.post("/admin/scenarios", d); setD({ title: "", kind: "log", body: "" }); reload(); toast.success("Case study added"); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Glass className="p-5 space-y-3" data-testid="scenario-manager"><h3 className="font-bold">Case studies (scenario-based questions)</h3>
      <p className="text-[11px] text-slate-500">Create a case (text, log excerpt or markdown table), then link 2–5 questions to it from the question form.</p>
      <div className="grid sm:grid-cols-[1fr_auto] gap-2"><input className="field !text-xs" placeholder="Title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} data-testid="scenario-title" />
        <select className="field !text-xs" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })} data-testid="scenario-kind"><option value="text">Text</option><option value="log">Log excerpt</option><option value="table">Table (markdown)</option></select></div>
      <textarea className="field h-24 font-mono text-[11px]" placeholder="Case body" value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} data-testid="scenario-body" />
      <button className="glow-btn !text-xs" disabled={!d.title || d.body.length < 5} onClick={add} data-testid="scenario-add"><Plus className="h-3.5 w-3.5" />Add case study</button>
      <div className="space-y-2">{list.map((s) => <details key={s.id} className="text-xs"><summary className="cursor-pointer">{s.title} <span className="text-slate-500 font-mono">({s.id} · {s.kind})</span></summary><div className="mt-2"><ScenarioPanel s={s} /></div></details>)}</div>
    </Glass>);
}

export function QuestionBank() {
  const [data, setData] = useState(null);
  const [f, setF] = useState({ q: "", domain: "", tag: "", type: "" });
  const [form, setForm] = useState(null);
  const [imp, setImp] = useState(false);
  const [open, setOpen] = useState(null);
  const [ver, setVer] = useState(null);
  const [sc, setSc] = useState([]);
  const load = () => { api.get("/admin/questions", { params: f }).then((r) => setData(r.data)); api.get("/admin/scenarios").then((r) => setSc(r.data)); };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [f]); // eslint-disable-line
  if (!data) return null;
  const scMap = Object.fromEntries(sc.map((s) => [s.id, s]));
  const archive = async (q) => { if (!window.confirm("Archive this question? Tests stop drawing it.")) return; await api.delete(`/admin/questions/${q.qid}`); load(); };
  return (
    <div className="space-y-4" data-testid="question-bank">
      <div className="flex flex-wrap gap-2 items-center">
        <input className="field !w-64 !text-xs" placeholder="Search question text" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} data-testid="bank-search" />
        <select className="field !w-auto !text-xs" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} data-testid="bank-domain"><option value="">All domains</option>{data.domains.map((x) => <option key={x}>{x}</option>)}</select>
        <select className="field !w-auto !text-xs" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} data-testid="bank-tag"><option value="">All tags</option>{data.tags.map((x) => <option key={x}>{x}</option>)}</select>
        <select className="field !w-auto !text-xs" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} data-testid="bank-type"><option value="">All types</option><option value="single">Single</option><option value="multi">Multi</option><option value="tf">True/False</option></select>
        <span className="text-xs font-mono text-slate-500 flex-1" data-testid="bank-count">{data.questions.length} questions</span>
        <button className="ghost-btn !text-xs" onClick={() => setImp(!imp)} data-testid="bank-import"><Upload className="h-3.5 w-3.5" />Import</button>
        <button className="glow-btn !text-xs" onClick={() => setForm({})} data-testid="bank-new"><Plus className="h-3.5 w-3.5" />New question</button></div>
      {imp && <Import done={() => { setImp(false); load(); }} />}
      {form && <QForm q={form} scenarios={sc} done={() => { setForm(null); load(); }} />}
      {!data.questions.length && <Empty text="no questions match" />}
      <Glass className="divide-y divide-white/5">{data.questions.map((q) => <div key={q.qid} className="p-3 text-sm" data-testid={`bank-row-${q.qid}`}>
        <div className="flex gap-3 items-start"><button className="flex-1 text-left" onClick={() => setOpen(open === q.qid ? null : q.qid)} data-testid={`bank-preview-${q.qid}`}>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-mono mb-1"><span className="text-cyan-300">{q.qid}</span><span className="text-slate-500">v{q.version}</span><span className="border border-white/10 px-1">{q.type}</span><span className="border border-white/10 px-1">{q.difficulty}</span><span className="text-slate-400">{q.domain}</span>{q.scenario_id && <span className="text-yellow-300">case</span>}{q.tags.map((t) => <span key={t} className="text-slate-500">#{t}</span>)}</div>
          <span className="line-clamp-2">{q.stem}</span></button>
          <button className="text-slate-500 hover:text-cyan-300" onClick={() => setForm(q)} data-testid={`bank-edit-${q.qid}`}><Pencil className="h-4 w-4" /></button>
          <button className="text-slate-500 hover:text-cyan-300" onClick={() => setVer(q.qid)} data-testid={`bank-versions-${q.qid}`}><History className="h-4 w-4" /></button>
          <button className="text-slate-500 hover:text-red-400" onClick={() => archive(q)} data-testid={`bank-archive-${q.qid}`}><Trash2 className="h-4 w-4" /></button></div>
        {open === q.qid && <div className="mt-3 space-y-2">{q.scenario_id && <ScenarioPanel s={scMap[q.scenario_id]} />}<Options q={q} picked={q.correct} onPick={() => {}} reveal disabled />{q.hint && <p className="text-xs text-yellow-200">Hint: {q.hint}</p>}</div>}
      </div>)}</Glass>
      <Scenarios list={sc} reload={load} />
      {ver && <Versions qid={ver} close={(r) => { setVer(null); if (r) load(); }} />}
    </div>);
}
