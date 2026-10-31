import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { createShell } from "../lib/kali";

const Terminal = forwardRef(function Terminal({ lab, height = "520px" }, ref) {
  const shell = useMemo(() => createShell(lab), [lab]);
  const [lines, setLines] = useState([{ t: "out", v: "SOCForge Kali simulator — offline sandbox. Type 'help' to list commands, 'cat README.txt' to start." }]);
  const [cmd, setCmd] = useState("");
  const [hi, setHi] = useState(-1);
  const hist = useRef([]);
  const box = useRef(null);
  const inp = useRef(null);

  useImperativeHandle(ref, () => ({ insert: (c) => { setCmd(c); inp.current?.focus(); } }));
  useEffect(() => { box.current && (box.current.scrollTop = box.current.scrollHeight); }, [lines]);

  const exec = async () => {
    const p = shell.prompt();
    const c = cmd;
    setCmd(""); setHi(-1);
    if (c.trim()) hist.current.push(c);
    try {
      const out = await shell.run(c);
      if (out === "\x1bCLEAR") return setLines([]);
      setLines((l) => [...l, { t: "cmd", p, v: c }, ...(out ? [{ t: "out", v: out }] : [])]);
    } catch (e) {
      setLines((l) => [...l, { t: "cmd", p, v: c }, { t: "err", v: e.message }]);
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter") exec();
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.min(hi + 1, hist.current.length - 1); if (n >= 0) { setHi(n); setCmd(hist.current[hist.current.length - 1 - n]); } }
    else if (e.key === "ArrowDown") { e.preventDefault(); const n = hi - 1; setHi(n); setCmd(n >= 0 ? hist.current[hist.current.length - 1 - n] : ""); }
    else if (e.key === "Tab") { e.preventDefault(); const parts = cmd.split(" "); const w = parts.pop(); const m = shell.complete(w); if (m.length === 1) setCmd([...parts, m[0]].join(" ")); }
  };

  return (
    <div className="bg-[#05070D] border border-cyan-500/25 rounded-sm font-mono text-[13px] relative scanlines flex flex-col" style={{ height }} onClick={() => inp.current?.focus()} data-testid="kali-terminal">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-cyan-500/15 text-xs text-slate-500">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" /><span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
        <span className="ml-2">kali@{lab?.id || "sandbox"} — bash</span>
      </div>
      <div ref={box} className="flex-1 overflow-y-auto p-3 space-y-0.5" data-testid="kali-output">
        {lines.map((l, i) => l.t === "cmd" ? <div key={i}><span className="text-green-400">{l.p}</span> <span className="text-slate-100">{l.v}</span></div>
          : <pre key={i} className={`whitespace-pre-wrap break-words ${l.t === "err" ? "text-red-400" : "text-slate-300"}`}>{l.v.replace(/\x1b/g, "")}</pre>)}
        <div className="flex"><span className="text-green-400 shrink-0">{shell.prompt()}</span>&nbsp;
          <input ref={inp} value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={onKey} spellCheck={false} autoComplete="off"
            className="flex-1 bg-transparent outline-none text-slate-100 caret-green-400" data-testid="kali-input" autoFocus /></div>
      </div>
    </div>
  );
});

export default Terminal;
