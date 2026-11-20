import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { createSession } from "../lib/bash";
import { Editor } from "./kali/Editor";

const isMsf = (p) => p.startsWith("msf") || p.startsWith("meterpreter");

const Terminal = forwardRef(function Terminal({ lab, title, height = "520px", session: ext, onRan }, ref) {
  const pendRead = useRef(null), pendEdit = useRef(null);
  const [editor, setEditor] = useState(null);
  const [readP, setReadP] = useState(null);
  const own = useMemo(() => (ext ? null : createSession({ lab })), [lab?.id, ext]); // eslint-disable-line
  const s = ext || own;
  const [lines, setLines] = useState([{ t: "out", v: "SOCProfessionals Academy Kali simulator: offline sandbox with a bash-like shell. Type 'help', 'man <cmd>', or 'cat README.txt' to start." }]);
  const [cmd, setCmd] = useState("");
  const [buf, setBuf] = useState("");
  const [busy, setBusy] = useState(false);
  const [hi, setHi] = useState(-1);
  const hist = useRef([]), box = useRef(null), inp = useRef(null);

  useEffect(() => {
    s.sh.readLine = (prompt) => new Promise((res) => { pendRead.current = res; setReadP(prompt ?? ""); });
    s.sh.hooks.edit = (path, content, kind) => new Promise((res) => { pendEdit.current = res; setEditor({ path, content, kind }); });
  }, [s]);
  useImperativeHandle(ref, () => ({ insert: (c) => { setCmd(c); inp.current?.focus(); }, clear: () => setLines([]) }));
  useEffect(() => { box.current && (box.current.scrollTop = box.current.scrollHeight); }, [lines, readP]);
  useEffect(() => { if (!editor) inp.current?.focus(); }, [editor, busy, readP]);

  const push = (t, v) => setLines((l) => { if (v.includes("\x1bCLEAR")) return []; const last = l[l.length - 1]; if (last && last.t === t && last.open) return [...l.slice(0, -1), { ...last, v: last.v + v }]; return [...l, { t, v, open: true }]; });
  const exec = async () => {
    const c = cmd; setCmd(""); setHi(-1);
    if (readP !== null) {
      const r = pendRead.current; pendRead.current = null; const pr = readP; setReadP(null);
      if (!isMsf(pr)) setLines((l) => { const last = l[l.length - 1]; return last?.open ? [...l.slice(0, -1), { ...last, v: last.v + c + "\n" }] : [...l, { t: "out", v: c + "\n", open: true }]; });
      r(c); return;
    }
    const src = buf ? `${buf}\n${c}` : c;
    setLines((l) => [...l.map((x) => ({ ...x, open: false })), { t: "cmd", p: buf ? ">" : s.prompt(), v: c }]);
    if (s.needsMore(src)) { setBuf(src.replace(/\\$/, "")); return; }
    setBuf("");
    if (c.trim()) hist.current.push(src);
    setBusy(true);
    await s.runLine(src, (t) => push("out", t), (t) => push("err", t));
    setLines((l) => l.map((x) => ({ ...x, open: false })));
    setBusy(false);
    onRan?.(s.last);
  };
  const onKey = (e) => {
    if (e.ctrlKey && e.key === "c") {
      e.preventDefault();
      if (busy) { s.sh.lim.abort = true; if (pendRead.current) { const r = pendRead.current; pendRead.current = null; setReadP(null); r(null); } }
      else { setLines((l) => [...l, { t: "cmd", p: buf ? ">" : s.prompt(), v: `${cmd}^C` }]); setCmd(""); setBuf(""); }
      return;
    }
    if (e.ctrlKey && e.key === "l") { e.preventDefault(); setLines([]); return; }
    if (e.key === "Enter") { e.preventDefault(); exec(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.min(hi + 1, hist.current.length - 1); if (n >= 0) { setHi(n); setCmd(hist.current[hist.current.length - 1 - n]); } }
    else if (e.key === "ArrowDown") { e.preventDefault(); const n = hi - 1; setHi(n); setCmd(n >= 0 ? hist.current[hist.current.length - 1 - n] : ""); }
    else if (e.key === "Tab") {
      e.preventDefault(); if (readP !== null) return;
      const w = cmd.split(/\s+/).pop() || "", m = s.complete(cmd), head = cmd.slice(0, cmd.length - w.length);
      if (m.length === 1) setCmd(head + m[0] + (m[0].endsWith("/") ? "" : " "));
      else if (m.length > 1) { const pre = m.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); }); if (pre.length > w.length) setCmd(head + pre); else setLines((l) => [...l, { t: "cmd", p: s.prompt(), v: cmd }, { t: "out", v: m.join("  ") }]); }
    }
  };
  const prompt = readP !== null ? (isMsf(readP) ? readP.trim() : "") : busy ? "" : buf ? ">" : s.prompt();

  return (
    <div className="bg-[#05070D] border border-cyan-500/25 rounded-sm font-mono text-[13px] relative scanlines flex flex-col" style={{ height }} onClick={() => !editor && inp.current?.focus()} data-testid="kali-terminal">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-cyan-500/15 text-xs text-slate-500">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" /><span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
        <span className="ml-2">kali@{title || lab?.id || "sandbox"} — bash</span><span className="ml-auto hidden sm:inline">{busy && readP === null ? "running… Ctrl+C to abort" : "Tab complete · ↑↓ history · Ctrl+L clear"}</span>
      </div>
      <div ref={box} className="flex-1 overflow-y-auto p-3 space-y-0.5" data-testid="kali-output">
        {lines.map((l, i) => l.t === "cmd" ? <div key={i} className="whitespace-pre-wrap break-words"><span className="text-green-400">{l.p}</span> <span className="text-slate-100">{l.v}</span></div>
          : <pre key={i} className={`whitespace-pre-wrap break-words ${l.t === "err" ? "text-red-400" : "text-slate-300"}`}>{l.v.replace(/\x1b/g, "").replace(/\n$/, "")}</pre>)}
        <div className={`flex ${busy && readP === null ? "h-0 overflow-hidden" : ""}`}><span className="text-green-400 shrink-0">{prompt}</span>{prompt && <>&nbsp;</>}
          <input ref={inp} value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={onKey} spellCheck={false} autoComplete="off"
            className="flex-1 bg-transparent outline-none text-slate-100 caret-green-400" data-testid="kali-input" autoFocus /></div>
      </div>
      {editor && <Editor path={editor.path} initial={editor.content} kind={editor.kind} onClose={(txt) => { setEditor(null); const r = pendEdit.current; pendEdit.current = null; r(txt && !txt.endsWith("\n") ? txt + "\n" : txt); }} />}
    </div>
  );
});

export default Terminal;
