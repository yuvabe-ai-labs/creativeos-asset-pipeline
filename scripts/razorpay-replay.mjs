// Sends signed Razorpay webhooks to a running server, as Razorpay would, with no tunnel. Test mode only.
//
// A top-up's order:
//   node --env-file=.env scripts/razorpay-replay.mjs <order_id> [base_url]
// A monthly plan, while Razorpay's test mode can't save cards (no card mandate):
//   node --env-file=.env --env-file=.env.dev scripts/razorpay-replay.mjs <sub_id> [base_url] [event]
//   event: paid (default: activated, then charged for this month), renew (charged for the next
//   month), pending, halted, cancelled, completed, resumed.
// The subscription and its plan are read from Razorpay, so the ids and amount are real; only the
// payment is made up. Each run is a new event; a repeat of the same charge is recorded once.
import { createHmac, randomBytes } from "node:crypto";

const [id, base = "http://localhost:3000", kind = "paid"] = process.argv.slice(2);
if (!id || !/^(order|sub)_/.test(id)) {
  console.error("Usage: razorpay-replay.mjs <order_id | sub_id> [base_url] [paid|renew|pending|halted|cancelled|completed|resumed]");
  process.exit(1);
}
const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
if (!secret) {
  console.error("RAZORPAY_WEBHOOK_SECRET is not set");
  process.exit(1);
}
const keyId = process.env.RAZORPAY_KEY_ID ?? "";
if (keyId.startsWith("rzp_live_") || process.env.RAZORPAY_LIVE === "1") {
  console.error("Live keys: this script is for test mode only");
  process.exit(1);
}

const now = () => Math.floor(Date.now() / 1000);
const fakeId = (prefix) => `${prefix}_replay${randomBytes(6).toString("hex")}`;

async function send(event, payload) {
  const body = JSON.stringify({ entity: "event", event, contains: Object.keys(payload), payload, created_at: now() });
  const res = await fetch(`${base}/api/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Razorpay-Signature": createHmac("sha256", secret).update(body).digest("hex"),
      "X-Razorpay-Event-Id": fakeId("evt"),
    },
    body,
  });
  console.log(event, res.status, await res.text());
  if (!res.ok) process.exit(1);
}

async function razorpay(path) {
  const auth = Buffer.from(`${keyId}:${process.env.RAZORPAY_KEY_SECRET ?? ""}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    console.error("Razorpay refused", path, res.status, await res.text());
    process.exit(1);
  }
  return res.json();
}

if (id.startsWith("order_")) {
  await send("order.paid", {
    payment: { entity: { id: `pay_replay_${id.replace(/^order_/, "")}`, order_id: id, status: "captured" } },
    order: { entity: { id, status: "paid" } },
  });
  process.exit(0);
}

if (!keyId.startsWith("rzp_test_")) {
  console.error("RAZORPAY_KEY_ID must be a test key to read the subscription");
  process.exit(1);
}
const rz = await razorpay(`/subscriptions/${encodeURIComponent(id)}`);
const plan = await razorpay(`/plans/${encodeURIComponent(rz.plan_id)}`);

// This month from now, or the month after the last recorded one for a renewal.
const monthAfter = (unix) => {
  const d = new Date(unix * 1000);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return Math.floor(d.getTime() / 1000);
};
const start = kind === "renew" ? Number(process.env.REPLAY_FROM ?? 0) || monthAfter(now()) : now();
const subscription = (status) => ({
  entity: { ...rz, status, current_start: start, current_end: monthAfter(start) },
});

if (kind === "paid" || kind === "renew") {
  if (kind === "paid") await send("subscription.activated", { subscription: subscription("active") });
  await send("subscription.charged", {
    subscription: subscription("active"),
    payment: {
      entity: { id: fakeId("pay"), order_id: fakeId("order"), amount: plan.item.amount, currency: "INR", status: "captured", method: "card" },
    },
  });
} else {
  const status = { pending: "pending", halted: "halted", cancelled: "cancelled", completed: "completed", resumed: "active" }[kind];
  if (!status) {
    console.error(`Unknown event "${kind}"`);
    process.exit(1);
  }
  await send(`subscription.${kind}`, { subscription: subscription(status) });
}
