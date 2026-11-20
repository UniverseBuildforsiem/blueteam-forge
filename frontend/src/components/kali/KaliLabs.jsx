import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, RotateCcw, Lightbulb, Terminal as TermIcon } from "lucide-react";
import { api, errMsg } from "../../lib/api";
import { createSession } from "../../lib/bash";
import { seed, HOME } from "../../lib/bash/fs";
import { KALI_LABS } from "../../lib/bash/labs";
import Terminal from "../Terminal";

const groups = ["Linux essentials", "Shell scripting", "Pentest automation"];

function LabList({ cur, setCur, doneMap }) {
  return <div className="space-y-3 text-sm" data-testid="kali-lab-list">
    <button onClick={() => setCur("sandbox")} className={`w-full text-left px-2 py-1.5 border ${cur === "sandbox" ? "border-cyan-400 text-cyan-200" : "border-white/10 text-slate-300"}`} data-testid="kali-lab-sandbox"><TermIcon className="inline h-3.5 w-3.5 mr-1" />Free-play sandbox</button>
    {groups.map((g) => <div key={g}><div className="eyebrow mb-1">{g}</div>{KALI_LABS.filter((l) => l.group === g).map((l) => <button key={l.id} onClick={() => setCur(l.id)} data-testid={`kali-lab-${l.id}`}
      className={`w-full text-left px-2 py-1 text-xs flex justify-between ${cur === l.id ? "bg-cyan-500/10 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}><span>{l.title}</span><span className="font-mono">{(doneMap[l.id] || 0)}/{l.tasks.length}</span></button>)}</div>)}
  </div>;
}

function TaskPanel({ lab, done, hints, onHint, onReset }) {
  const [show, setShow] = useState({});
  if (!lab) return <div className="text-xs text-slate-400 space-y-2" data-testid="kali-sandbox-info"><p>Free-play mode: everything you create is saved for this sandbox.</p><p>Try: <code>vi hello.sh</code>, <code>for i in 1 2 3; do echo $i; done</code>, <code>msfconsole</code>, <code>man awk</code>.</p><button onClick={onReset} className="text-red-300 underline" data-testid="kali-reset">Reset sandbox</button></div>;
  const lvl = hints || 0;
  return <div className="space-y-3" data-testid="kali-task-panel">
    <div><div className="font-semibold text-slate-100">{lab.title}</div><p className="text-xs text-slate-400 mt-1">{lab.intro}</p></div>
    <div className="text-xs font-mono text-cyan-300" data-testid="kali-task-count">{done.length}/{lab.tasks.length} tasks</div>
    <ol className="space-y-2">{lab.tasks.map((t, i) => { const ok = done.includes(String(i)); return <li key={i} className={`border p-2 text-xs ${ok ? "border-green-500/40" : "border-white/10"}`} data-testid={`kali-task-${i}`}>
      <div className="flex gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : <Circle className="h-4 w-4 text-slate-500 shrink-0" />}<div><b className="text-slate-200">{t.title}</b><div className="text-slate-400">{t.instruction}</div>
        <div className="flex gap-2 mt-1"><button className="text-cyan-300 underline" onClick={() => setShow({ ...show, [i]: show[i] === "h" ? null : "h" })} data-testid={`kali-task-hint-${i}`}>hint</button><button className="text-yellow-200 underline" onClick={() => setShow({ ...show, [i]: show[i] === "s" ? null : "s" })} data-testid={`kali-task-solution-${i}`}>solution</button></div>
        {show[i] && <pre className="mt-1 whitespace-pre-wrap text-[11px] text-slate-300 bg-black/40 p-1.5">{show[i] === "h" ? t.hint : t.solution}</pre>}</div></div></li>; })}</ol>
    {lab.ladder && <div className="border border-white/10 p-2 text-xs space-y-1"><button onClick={onHint} disabled={lvl >= 3} className="text-cyan-300 flex items-center gap-1 disabled:opacity-40" data-testid="kali-ladder-next"><Lightbulb className="h-3.5 w-3.5" />{["Show hint", "Show partial script", "Show full solution", "All hints shown"][lvl]}</button>
      {lab.ladder.slice(0, lvl).map((h, i) => <pre key={i} className="whitespace-pre-wrap bg-black/40 p-1.5 text-[11px] text-slate-300" data-testid={`kali-ladder-${i}`}><b>{["Hint", "Partial", "Solution"][i]}:</b>{"\n"}{h}</pre>)}</div>}
    <button onClick={onReset} className="text-xs text-red-300 flex items-center gap-1" data-testid="kali-reset"><RotateCcw className="h-3.5 w-3.5" />Reset lab (restores the starting files)</button>
  </div>;
}

export function KaliWorkbench({ baseLab }) {
  const [cur, setCur] = useState("sandbox");
  const [state, setState] = useState(null);
  const [doneMap, setDoneMap] = useState({});
  const saveT = useRef(null);
  const curKey = useRef(cur);
  const lab = KALI_LABS.find((l) => l.id === state?.key);
  useEffect(() => { api.get("/kali/progress").then((r) => setDoneMap((m) => ({ ...r.data, ...m }))).catch(() => {}); }, []);

  const load = useCallback(async (key) => {
    curKey.current = key;
    clearTimeout(saveT.current);
    setState(null);
    let r;
    try { r = await api.get(`/kali/state/${key}`); } catch (e) { if (curKey.current === key) toast.error(errMsg(e)); return; }
    if (curKey.current !== key) return;
    const l = KALI_LABS.find((x) => x.id === key);
    let nodes = r.data.fs;
    if (!nodes) { nodes = seed(baseLab?.kali?.fs); Object.entries(l?.starter || {}).forEach(([p, c]) => { nodes[p] = { t: "f", c, m: 0o644, o: "kali", mt: Math.floor(Date.now() / 1000) }; }); }
    setState({ key, session: createSession({ lab: baseLab, nodes }), done: r.data.done || [], hints: r.data.hints?.[key] || 0 });
    setDoneMap((m) => ({ ...m, [key]: (r.data.done || []).length }));
  }, [baseLab]);
  useEffect(() => { load(cur); }, [cur, load]);

  const persist = (st) => { clearTimeout(saveT.current); saveT.current = setTimeout(() => api.put(`/kali/state/${st.key}`, { fs: st.session.fs.toJSON(), done: st.done, hints: { [st.key]: st.hints } }).catch((e) => toast.error(errMsg(e))), 600); };
  const onRan = async (last) => {
    if (!state) return;
    const st = state, done = [...st.done];
    if (lab) {
      const run = async (src) => { const sh2 = st.session.sh.clone(); sh2.readLine = async () => null; sh2.hooks = {}; sh2.lim = { steps: 0, out: 0, abort: false }; let o = ""; try { await sh2.run(src, { stdin: null, out: (t) => { o += t; }, err: (t) => { o += t; } }); } catch (e) { o += e.message || ""; } return { out: o }; };
      for (let i = 0; i < lab.tasks.length; i++) {
        if (done.includes(String(i))) continue;
        let ok = false;
        try { ok = await lab.tasks[i].check({ fs: st.session.fs, last, sh: st.session.sh, run, home: HOME }); } catch { ok = false; }
        if (ok) { done.push(String(i)); toast.success(`Task ${i + 1} complete: ${lab.tasks[i].title}`); }
      }
      if (done.length === lab.tasks.length && st.done.length < done.length) toast.success("Lab complete!");
    }
    if (curKey.current !== st.key) return;
    const nx = { ...st, done };
    setState(nx); setDoneMap((m) => ({ ...m, [st.key]: done.length })); persist(nx);
  };
  const reset = async () => { clearTimeout(saveT.current); await api.delete(`/kali/state/${cur}`); toast.success("Lab reset"); load(cur); };
  const hint = () => { const nx = { ...state, hints: Math.min(3, state.hints + 1) }; setState(nx); persist(nx); };

  return <div className="grid xl:grid-cols-[230px_1fr_320px] gap-4">
    <div className="glass p-3"><LabList cur={cur} setCur={setCur} doneMap={doneMap} /></div>
    {state ? <Terminal key={state.key} title={state.key} lab={baseLab} session={state.session} onRan={onRan} height="640px" /> : <div className="h-[640px] grid place-items-center text-slate-500 text-sm">Loading…</div>}
    <div className="glass p-3 max-h-[640px] overflow-auto">{state && <TaskPanel key={state.key} lab={lab} done={state.done} hints={state.hints} onHint={hint} onReset={reset} />}</div>
  </div>;
}
