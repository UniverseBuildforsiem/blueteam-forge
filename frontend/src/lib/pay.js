import { api } from "./api";

const loadScript = (src) => new Promise((res, rej) => {
  if (document.querySelector(`script[src="${src}"]`)) return res();
  const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s);
});

export async function payRazorpay(item, description, onPaid, onError, ref) {
  await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  const { data } = await api.post("/payments/razorpay/order", { plan: item, ...(ref ? { ref } : {}) });
  new window.Razorpay({
    key: data.key_id, amount: data.amount, currency: "INR", order_id: data.order_id, name: "SOCProfessionals Academy", description,
    prefill: { name: data.name, email: data.email }, theme: { color: "#00F0FF" },
    handler: async (r) => { try { await api.post("/payments/razorpay/verify", r); onPaid(); } catch (e) { onError(e); } },
  }).open();
}

export async function payCashfree(item, phone, mode, ref) {
  const { data } = await api.post("/payments/cashfree/order", { plan: item, phone, ...(ref ? { ref } : {}) });
  const { load } = await import("@cashfreepayments/cashfree-js");
  const cf = await load({ mode });
  await cf.checkout({ paymentSessionId: data.payment_session_id, redirectTarget: "_self" });
}

export const waLink = (num, text) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
