import { useEffect, useRef, useState } from "react";

export function Editor({ path, initial, kind, onClose }) {
  const [text, setText] = useState(initial ?? "");
  const [mode, setMode] = useState(kind === "vi" ? "NORMAL" : "NANO");
  const [cmd, setCmd] = useState("");
  const [msg, setMsg] = useState(initial == null ? `"${path}" [New]` : `"${path}" ${(initial.match(/\n/g) || []).length}L`);
  const [dirty, setDirty] = useState(false);
  const ta = useRef(null), cmdRef = useRef(null), reg = useRef(""), pend = useRef("");
  useEffect(() => { (mode === "CMD" ? cmdRef : ta).current?.focus(); }, [mode]);
  const edit = (v, caret) => { setText(v); setDirty(true); requestAnimationFrame(() => { if (ta.current && caret != null) ta.current.selectionStart = ta.current.selectionEnd = caret; }); };
  const lineAt = (pos) => { const s = text.lastIndexOf("\n", pos - 1) + 1; let e = text.indexOf("\n", pos); if (e < 0) e = text.length; return [s, e]; };
  const save = () => { setDirty(false); setMsg(`"${path}" written`); };
  const normal = (e) => {
    if (e.ctrlKey || e.metaKey) return;
    if (e.key.length !== 1 && e.key !== "Escape") return;
    e.preventDefault();
    const k = e.key, pos = ta.current.selectionStart, [s, en] = lineAt(pos);
    const two = pend.current + k; pend.current = "";
    if (two === "dd") { reg.current = text.slice(s, Math.min(en + 1, text.length)); edit(text.slice(0, s) + text.slice(Math.min(en + 1, text.length)), s); return; }
    if (two === "yy") { reg.current = text.slice(s, en) + "\n"; setMsg("1 line yanked"); return; }
    if (two === "gg") { ta.current.selectionStart = ta.current.selectionEnd = 0; return; }
    if ("dyg".includes(k)) { pend.current = k; return; }
    if (k === "i") setMode("INSERT");
    else if (k === "a") { ta.current.selectionStart = ta.current.selectionEnd = Math.min(pos + 1, en); setMode("INSERT"); }
    else if (k === "A") { ta.current.selectionStart = ta.current.selectionEnd = en; setMode("INSERT"); }
    else if (k === "o") { edit(text.slice(0, en) + "\n" + text.slice(en), en + 1); setMode("INSERT"); }
    else if (k === "O") { edit(text.slice(0, s) + "\n" + text.slice(s), s); setMode("INSERT"); }
    else if (k === "x") { if (pos < en) edit(text.slice(0, pos) + text.slice(pos + 1), pos); }
    else if (k === "p") { const r = reg.current.endsWith("\n") ? reg.current : reg.current + "\n"; const at = Math.min(en + 1, text.length); edit(text.slice(0, at) + (at === text.length && text && !text.endsWith("\n") ? "\n" : "") + r + text.slice(at), at); }
    else if (k === "G") { ta.current.selectionStart = ta.current.selectionEnd = text.length; }
    else if (k === "h") ta.current.selectionStart = ta.current.selectionEnd = Math.max(s, pos - 1);
    else if (k === "l") ta.current.selectionStart = ta.current.selectionEnd = Math.min(en, pos + 1);
    else if (k === "j") ta.current.selectionStart = ta.current.selectionEnd = Math.min(text.length, en + 1 + (pos - s));
    else if (k === "k") { const [ps] = lineAt(Math.max(0, s - 1)); ta.current.selectionStart = ta.current.selectionEnd = s ? Math.min(ps + (pos - s), s - 1) : pos; }
    else if (k === ":" || k === "/") { setCmd(k); setMode("CMD"); }
  };
  const runCmd = () => {
    const c = cmd; setCmd(""); setMode("NORMAL");
    if (c.startsWith("/")) { const i = text.indexOf(c.slice(1), ta.current.selectionStart + 1); const j = i < 0 ? text.indexOf(c.slice(1)) : i; if (j < 0) setMsg(`E486: Pattern not found: ${c.slice(1)}`); else requestAnimationFrame(() => { ta.current.selectionStart = ta.current.selectionEnd = j; }); return; }
    const x = c.slice(1).trim();
    if (x === "w") save();
    else if (x === "wq" || x === "x") onClose(text);
    else if (x === "q") { if (dirty) setMsg("E37: No write since last change (add ! to override)"); else onClose(initial == null ? null : initial); }
    else if (x === "q!") onClose(null);
    else setMsg(`E492: Not an editor command: ${x}`);
  };
  const nanoKey = (e) => {
    if (!e.ctrlKey) return;
    if (e.key === "o" || e.key === "s") { e.preventDefault(); save(); }
    if (e.key === "x") { e.preventDefault(); onClose(dirty ? text : initial == null && !text ? null : text); }
  };
  return <div className="absolute inset-0 z-20 flex flex-col bg-[#05070D] font-mono text-[13px]" data-testid="kali-editor">
    <div className="px-3 py-1 text-xs bg-cyan-900/40 text-cyan-100 flex justify-between"><span>{kind === "vi" ? "VIM (simulated)" : "GNU nano (simulated)"} · {path}{dirty ? " [+]" : ""}</span><span data-testid="kali-editor-mode">{mode === "NANO" ? "" : `-- ${mode} --`}</span></div>
    <textarea ref={ta} value={text} onChange={(e) => { if (mode !== "NORMAL") edit(e.target.value); }} onKeyDown={(e) => { if (mode === "INSERT" && e.key === "Escape") { e.preventDefault(); setMode("NORMAL"); } else if (mode === "NORMAL") normal(e); else if (mode === "NANO") nanoKey(e); }}
      spellCheck={false} className={`flex-1 bg-transparent p-3 outline-none resize-none text-slate-100 ${mode === "NORMAL" ? "caret-cyan-300" : "caret-green-400"}`} data-testid="kali-editor-text" />
    {mode === "CMD" ? <input ref={cmdRef} value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runCmd(); if (e.key === "Escape") { setCmd(""); setMode("NORMAL"); } }} className="px-3 py-1 bg-black text-slate-100 outline-none" data-testid="kali-editor-cmd" />
      : <div className="px-3 py-1 text-xs text-slate-400 border-t border-cyan-500/20" data-testid="kali-editor-status">{mode === "NANO" ? "^O Write Out   ^X Exit" : `${msg}   ·   i insert · Esc normal · :w :q :wq :q! · dd yy p x o G gg /find`}</div>}
  </div>;
}
