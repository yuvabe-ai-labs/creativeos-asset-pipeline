// Sends a signed order.paid for an order to a running server, as Razorpay would, with no tunnel.
// Usage: node --env-file=.env scripts/razorpay-replay.mjs <order_id> [base_url]
// Run it twice: the second answers {"added":false}.
import { createHmac } from "node:crypto";

const [orderId, base = "http://localhost:3000"] = process.argv.slice(2);
if (!orderId) {
  console.error("Usage: node --env-file=.env scripts/razorpay-replay.mjs <order_id> [base_url]");
  process.exit(1);
}
const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
if (!secret) {
  console.error("RAZORPAY_WEBHOOK_SECRET is not set");
  process.exit(1);
}

const body = JSON.stringify({
  entity: "event",
  event: "order.paid",
  contains: ["payment", "order"],
  payload: {
    payment: { entity: { id: `pay_replay_${orderId.replace(/^order_/, "")}`, order_id: orderId, status: "captured" } },
    order: { entity: { id: orderId, status: "paid" } },
  },
  created_at: Math.floor(Date.now() / 1000),
});
const signature = createHmac("sha256", secret).update(body).digest("hex");
const res = await fetch(`${base}/api/webhooks/razorpay`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Razorpay-Signature": signature },
  body,
});
console.log(res.status, await res.text());
