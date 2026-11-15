import { useEffect, useState } from "react";
import { api } from "./api";

let cache = null;
const fetchCampaign = () => (cache ||= api.get("/public/campaign").then((r) => r.data).catch(() => null));

export function useCampaign() {
  const [c, setC] = useState(null);
  useEffect(() => { let on = true; fetchCampaign().then((v) => on && setC(v)); return () => { on = false; }; }, []);
  return c;
}

export const campaignOff = (c) => (c.coupon_kind === "percent" ? `${c.coupon_value}% off` : `₹${c.coupon_value.toLocaleString("en-IN")} off`);
