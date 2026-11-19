import { useEffect, useRef, useState } from "react";
import { api, errMsg } from "../../lib/api";

export function Terminal({ lab, onResult, active }) {
  const [lines, setLines] = useState(() => lab.term.flatMap((t) => [{ p: t.cwd, cmd: t.cmd }, ...(t.out ? [{ out: t.out }] : [])]));
  const [cmd, setCmd] = useState("");
  const [cwd, setCwd] = useState(lab.state.cwd);
  const [busy, setBusy] = useState(false);
  const hist = useRef(lab.term.map((t) => t.cmd));
  const hi = useRef(-1);
  const box = useRef(null);
  const inp = useRef(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [lines]);
  useEffect(() => { if (active) inp.current?.focus({ preventScroll: true }); }, [active]);
  const run = async (e) => {
    e.preventDefault();
    const c = cmd; setCmd(""); hi.current = -1;
    if (c.trim()) hist.current.push(c);
    setLines((l) => [...l, { p: cwd, cmd: c }]);
    if (!c.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/vmlab/labs/${lab.id}/exec`, { command: c });
      setCwd(data.lab.state.cwd);
      setLines((l) => (data.clear ? [] : data.output ? [...l, { out: data.output }] : l));
      onResult(data);
    } catch (er) { setLines((l) => [...l, { out: `Lab error: ${errMsg(er)}` }]); }
    setBusy(false);
    setTimeout(() => inp.current?.focus(), 0);
  };
  const key = (e) => {
    const h = hist.current;
    if (e.key === "ArrowUp" && h.length) { e.preventDefault(); hi.current = hi.current < 0 ? h.length - 1 : Math.max(0, hi.current - 1); setCmd(h[hi.current]); }
    if (e.key === "ArrowDown" && hi.current >= 0) { e.preventDefault(); hi.current += 1; if (hi.current >= h.length) { hi.current = -1; setCmd(""); } else setCmd(h[hi.current]); }
  };
  return <div className="h-full flex flex-col bg-[#0C0C0C] border border-white/10" data-testid="vm-terminal">
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1F1F1F] text-[11px] text-slate-300 border-b border-white/10"><span className="h-2.5 w-2.5 bg-sky-500" />Administrator: Command Prompt <span className="ml-auto text-slate-500 font-mono">{lab.state.installed ? "agent: installed" : "agent: not installed"}</span></div>
    <div ref={box} onClick={() => inp.current?.focus()} className="flex-1 overflow-auto p-3 font-mono text-[12.5px] leading-5 text-slate-200 min-h-[320px]" data-testid="vm-terminal-output">
      <div className="text-slate-500">Microsoft-style Windows [Version 10.0.20348] (simulated)<br />(c) SOCProfessionals training lab. Type 'help' for supported commands.</div>
      {lines.map((l, i) => l.out != null ? <pre key={i} className="whitespace-pre-wrap break-words text-slate-300">{l.out}</pre> : <div key={i} className="break-all"><span className="text-slate-400">{l.p}&gt;</span>{l.cmd}</div>)}
      <form onSubmit={run} className="flex items-center"><label htmlFor="vm-term-input" className="text-slate-400 shrink-0">{cwd}&gt;</label>
        <input id="vm-term-input" ref={inp} value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={key} disabled={busy} autoComplete="off" spellCheck={false} aria-label="Terminal command"
          className="flex-1 min-w-0 bg-transparent outline-none text-slate-100 caret-sky-400 pl-0.5" data-testid="vm-terminal-input" /></form>
    </div>
  </div>;
}
