import { useEffect, useRef, useState } from "react";
import { Camera, ShieldCheck, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

const RULES = ["I am the registered account holder and will take this exam myself.", "No notes, other people, AI tools or second devices during the exam.", "The timer keeps running on the server if I close the browser.", "Answers auto-submit when time runs out."];

function Webcam({ photo, setPhoto }) {
  const v = useRef(null), stream = useRef(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (photo) return undefined;
    navigator.mediaDevices?.getUserMedia({ video: { width: 480, height: 360 } }).then((s) => { stream.current = s; if (v.current) v.current.srcObject = s; }).catch(() => setErr("Camera blocked — allow camera access in your browser and retry."));
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, [photo]);
  const snap = () => { const c = document.createElement("canvas"); c.width = 480; c.height = 360; c.getContext("2d").drawImage(v.current, 0, 0, 480, 360); setPhoto(c.toDataURL("image/jpeg", 0.8)); };
  return (
    <div className="border border-cyan-500/20 p-2 space-y-2" data-testid="identity-webcam">
      {photo ? <img src={photo} alt="Your verification snapshot" className="w-full aspect-[4/3] object-cover" data-testid="identity-photo" /> : <video ref={v} autoPlay playsInline muted className="w-full aspect-[4/3] bg-black object-cover" />}
      {err && <p className="text-xs text-red-300" data-testid="identity-camera-error">{err}</p>}
      {photo ? <button className="ghost-btn !text-xs w-full justify-center" onClick={() => setPhoto(null)} data-testid="identity-retake"><RefreshCw className="h-3.5 w-3.5" />Retake</button>
        : <button className="ghost-btn !text-xs w-full justify-center" disabled={!!err} onClick={snap} data-testid="identity-capture"><Camera className="h-3.5 w-3.5" />Capture photo</button>}
    </div>);
}

export function IdentityGate({ open, setOpen, method, user, onStart, meta, strict }) {
  const [name, setName] = useState(user?.name || "");
  const [agree, setAgree] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const needName = method !== "account";
  const ok = agree && (!needName || name.trim().length >= 3) && (method !== "webcam" || photo);
  const go = async () => { setBusy(true); await onStart({ name: name.trim(), agree, photo }); setBusy(false); };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-lg" data-testid="identity-gate">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-green-400" />Candidate verification</DialogTitle>
          <DialogDescription className="font-mono text-xs">{meta}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {needName && <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">Full legal name (printed on your certificate)</span>
            <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} data-testid="identity-name" /></label>}
          {method === "webcam" && <Webcam photo={photo} setPhoto={setPhoto} />}
          <ul className="text-xs text-slate-300 space-y-1 border border-white/10 p-3">{RULES.map((r) => <li key={r}>· {r}</li>)}{strict && <li className="text-red-300" data-testid="identity-strict-rule">· Strict mode is on: every switch to another tab or window is logged and reported.</li>}</ul>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="identity-agree" />I confirm my identity and accept the exam rules</label>
          <button className="glow-btn w-full justify-center" disabled={!ok || busy} onClick={go} data-testid="identity-start">{busy ? "Starting…" : "Start certification exam"}</button>
        </div>
      </DialogContent>
    </Dialog>);
}
