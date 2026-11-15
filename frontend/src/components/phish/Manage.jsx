import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Trash2, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, Empty } from "../common";
import { Switch } from "../ui/switch";

export function PhishManage({ types }) {
  const [list, setList] = useState(null);
  const [f, setF] = useState({ type: "email", difficulty: "Medium" });
  const load = () => api.get("/phish/manage").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!list?.some((c) => c.status === "generating")) return; const i = setInterval(load, 5000); return () => clearInterval(i); }, [list]);
  const gen = async () => { try { await api.post("/phish/manage/generate", f); toast.success("AI is drafting the case (about a minute)"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const pub = async (c) => { try { await api.post(`/phish/manage/${c.id}/publish`, { published: !c.published }); load(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async (c) => { if (!window.confirm(`Delete "${c.title}"?`)) return; try { await api.delete(`/phish/manage/${c.id}`); load(); } catch (e) { toast.error(errMsg(e)); } };
  const name = (id) => types.find((t) => t.id === id)?.name || id;
  return <div className="space-y-4" data-testid="phish-manage">
    <Glass className="p-5 flex flex-wrap items-end gap-3">
      <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">Phishing type</span>
        <select className="field mt-1" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} data-testid="phish-gen-type">{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="block"><span className="text-[11px] font-mono uppercase text-slate-500">Difficulty</span>
        <select className="field mt-1" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })} data-testid="phish-gen-difficulty">{["Easy", "Medium", "Hard"].map((x) => <option key={x}>{x}</option>)}</select></label>
      <button className="glow-btn !text-xs" onClick={gen} data-testid="phish-gen-btn"><Sparkles className="h-3.5 w-3.5" />Draft case with AI</button>
      <p className="text-[11px] font-mono text-slate-500 basis-full">Drafts stay hidden until you preview and publish them. AI cases are for paid members.</p>
    </Glass>
    {list && !list.length && <Empty text="No AI cases yet" />}
    <Glass className="divide-y divide-white/5">{(list || []).map((c) => <div key={c.id} className="p-3 flex flex-wrap items-center gap-3 text-sm" data-testid={`phish-manage-row-${c.id}`}>
      <div className="flex-1 min-w-[220px]"><div className="font-bold">{c.status === "generating" && <Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1.5" />}{c.title}</div>
        <div className="text-[11px] font-mono text-slate-500">{name(c.type)} · {c.difficulty} · {c.created_by} · {fmtDate(c.created_at)}{c.status === "failed" && <span className="text-red-300"> · failed: {c.error}</span>}</div></div>
      {c.status === "ready" && <><Link to={`/app/phishing/case/${c.id}`} className="text-slate-400 hover:text-cyan-300" data-testid={`phish-preview-${c.id}`}><Eye className="h-4 w-4" /></Link>
        <span className="text-[11px] font-mono text-slate-400">{c.published ? "published" : "draft"}</span><Switch checked={!!c.published} onCheckedChange={() => pub(c)} data-testid={`phish-publish-${c.id}`} /></>}
      <button className="text-slate-500 hover:text-red-400" onClick={() => del(c)} data-testid={`phish-delete-${c.id}`}><Trash2 className="h-4 w-4" /></button>
    </div>)}</Glass>
  </div>;
}
