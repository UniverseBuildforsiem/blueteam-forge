import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";

export function WishlistButton({ kind, id, on, signedIn, hidden, onChange }) {
  const [w, setW] = useState(!!on);
  const nav = useNavigate();
  if (hidden) return null;
  const toggle = async () => {
    if (!signedIn) { localStorage.setItem("pending_course", JSON.stringify({ id, kind, at: Date.now() })); nav("/login"); return; }
    try { const { data } = await api.post("/wishlist/toggle", { kind, id }); setW(data.wishlisted); onChange?.(data.wishlisted);
      toast.success(data.wishlisted ? "Added to wishlist — we'll email you before the sale ends or when the price drops" : "Removed from wishlist"); } catch (e) { toast.error(errMsg(e)); }
  };
  return <button onClick={toggle} className="ghost-btn w-full justify-center !text-xs" data-testid={`wishlist-toggle-${kind}`}>
    <Heart className={`h-3.5 w-3.5 ${w ? "fill-pink-400 text-pink-400" : ""}`} />{w ? "Wishlisted" : "Add to wishlist"}</button>;
}
