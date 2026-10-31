import { useState } from "react";
import { toast } from "sonner";
import { Share2, Linkedin, Download, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { api } from "../lib/api";

export default function ShareCardButton({ endpoint, title, testId, file = "socpro-academy-badge.png" }) {
  const [card, setCard] = useState(null);
  const open = async (e) => {
    e?.stopPropagation();
    try { const { data } = await api.post(endpoint); setCard(data); } catch { toast.error("Couldn't create the share card"); }
  };
  const li = card && `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(card.share_url)}`;
  return (
    <>
      <button className="ghost-btn !py-1.5 !text-xs" onClick={open} data-testid={testId}><Share2 className="h-3.5 w-3.5" />Share</button>
      <Dialog open={!!card} onOpenChange={(o) => !o && setCard(null)}>
        <DialogContent className="bg-[#0B0F1A] border-cyan-500/30 max-w-2xl" data-testid="share-card-dialog">
          <DialogHeader><DialogTitle className="font-mono">{title}</DialogTitle></DialogHeader>
          {card && <>
            <img src={card.image_url} alt="Your badge card" className="w-full border border-cyan-500/20" data-testid="share-card-image" />
            <div className="flex flex-wrap gap-2">
              <a href={li} target="_blank" rel="noreferrer" className="glow-btn" data-testid="share-card-linkedin"><Linkedin className="h-4 w-4" />Share on LinkedIn</a>
              <a href={card.image_url} download={file} target="_blank" rel="noreferrer" className="ghost-btn" data-testid="share-card-download"><Download className="h-4 w-4" />Download image</a>
              <button className="ghost-btn" onClick={() => { navigator.clipboard.writeText(card.share_url); toast.success("Link copied"); }} data-testid="share-card-copy"><Copy className="h-4 w-4" />Copy link</button>
            </div>
            <p className="text-xs text-slate-500 font-mono">LinkedIn shows this card as the link preview. Anyone with the link can see your name and badge.</p>
          </>}
        </DialogContent>
      </Dialog>
    </>
  );
}
