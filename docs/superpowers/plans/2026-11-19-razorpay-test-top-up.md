# Razorpay Test Top-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An agency owner pays ₹100 in Razorpay test mode on a hidden `/billing-test` page, Razorpay's signed `order.paid` webhook reaches our server, and the agency gets 1,000 more credits this month, once.

**Architecture:** Razorpay Orders API + Checkout.js in the browser. The browser's confirm call only checks the Checkout signature; credits are added only by `POST /api/webhooks/razorpay`, which verifies the signature on the raw body and calls one SQL function that marks the payment paid and writes a negative `adjustment` row to `credit_transactions` in one transaction, once per order. No Razorpay SDK (plain `fetch`).

**Tech Stack:** Next.js 16 route handlers and server components, Supabase (service-role client, plpgsql), TanStack Query mutations, shadcn/Base UI, vitest, Node `crypto`.

**Spec:** `docs/superpowers/specs/2026-11-19-razorpay-test-top-up-design.md`

## Global Constraints

- Work in the worktree `c:/Users/yuvab/OneDrive/Desktop/codes/creativeos-razorpay`, branch `feat/razorpay-test`. Never push.
- Commits carry **no** AI attribution (no `Co-Authored-By`, no "Generated with").
- Migrations are **written, never applied**: the user applies 0066. Never run SQL against any database.
- Settings: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_TEST_PAGE` (`1` only on a developer's machine and the dev deployment). Never print secret values.
- Without `RAZORPAY_TEST_PAGE=1`: `/billing-test`, `POST /api/billing/test-order` and `POST /api/billing/test-confirm` answer 404.
- Test pack: **₹100 (10,000 paise) for 1,000 credits**.
- API routes use `apiError` / `apiOk` from `src/lib/api/route-helpers.ts`, never `NextResponse.json`.
- Browser data goes service (`src/services/`) → query hook (`src/hooks/queries/`) → component. Never `fetch` in a component.
- Controls are shadcn primitives from `src/components/ui/*` only; Lucide icons at 1.5 stroke; plain user-facing copy (no vendor names in errors, no raw errors, no em-dash phrasing).
- Testing: `npx tsc --noEmit` plus the focused vitest files listed per task (not the full suite).

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0066_billing_payments.sql` | Table, owner-read policy, `record_razorpay_payment` |
| `src/lib/billing/constants.ts` | `TEST_PACK` |
| `src/lib/billing/test-mode.ts` | `isBillingTestEnabled()` |
| `src/lib/billing/razorpay.ts` | `createOrder`, `razorpayKeyId`, both signature checks |
| `src/lib/db/billing-payments.ts` | `insertCreatedPayment`, `recordRazorpayPayment` |
| `src/app/api/webhooks/razorpay/route.ts` | The webhook |
| `src/app/api/billing/test-order/route.ts` | Start a test payment |
| `src/app/api/billing/test-confirm/route.ts` | Check the Checkout signature |
| `src/services/billing.service.ts` | Browser calls to the two billing routes |
| `src/hooks/queries/billing.ts` | `useCreateTestOrder`, `useConfirmTestPayment` |
| `src/lib/billing/load-checkout.ts` | Loads Checkout.js once (browser) |
| `src/components/billing/test-top-up.tsx` | The pack card and Pay button |
| `src/app/billing-test/page.tsx` | Gated page |
| `scripts/razorpay-replay.mjs` | Sends a signed `order.paid` to a local server |

---

### Task 1: Migration 0066 and docs

**Files:**
- Create: `supabase/migrations/0066_billing_payments.sql`
- Modify: `docs/database-schema.md`, `docs/auth-production-migration.md`, `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, after D513)

**Interfaces:**
- Produces: table `billing_payments(id, org_id, razorpay_order_id, razorpay_payment_id, amount_paise, credits, status, created_by, created_at, paid_at)`; RPC `record_razorpay_payment(p_order_id text, p_payment_id text) returns boolean`.

- [ ] **Step 1: Write the migration**

```sql
-- Razorpay test top-up (spec 2026-11-19-razorpay-test-top-up-design.md, D514).
-- One row per Razorpay order. Only the server writes (service role); an agency's owners read
-- their own rows, like credit_transactions since 0065.
create table billing_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  amount_paise integer not null check (amount_paise > 0),
  credits integer not null check (credits > 0),
  status text not null default 'created' check (status in ('created', 'paid')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index billing_payments_org_id_idx on billing_payments (org_id);

alter table billing_payments enable row level security;

create policy "owners read" on billing_payments for select
  using (exists (
    select 1 from org_memberships m
     where m.user_id = auth.uid() and m.org_id = billing_payments.org_id and m.is_owner
  ));

-- Called by the Razorpay webhook on order.paid. One transaction: lock the order's row; a
-- missing or already-paid order changes nothing (a repeated webhook adds no credits). Else mark
-- it paid and write minus its credits as an adjustment: reserve_credits sums this month's rows,
-- so the agency can use that many more credits until the month ends. True when credits were added.
create or replace function record_razorpay_payment(p_order_id text, p_payment_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row billing_payments%rowtype;
begin
  select * into v_row from billing_payments where razorpay_order_id = p_order_id for update;
  if not found or v_row.status = 'paid' then
    return false;
  end if;

  update billing_payments
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
   where id = v_row.id;

  insert into credit_transactions (org_id, amount, type)
  values (v_row.org_id, -v_row.credits, 'adjustment');

  return true;
end;
$$;

revoke all on function record_razorpay_payment(text, text) from public, anon, authenticated;
grant execute on function record_razorpay_payment(text, text) to service_role;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Docs**

In `docs/database-schema.md`: bump "up to 0065" to "up to 0066" and add a `billing_payments` entry (columns as above; RLS: owners read, server writes; function `record_razorpay_payment`).

In `docs/auth-production-migration.md`: add a "0066 billing_payments" section after 0065: what it adds, that it is safe to apply (new table and function only, no change to existing rows), and that it can go to production even though the test page stays off there.

In the roadmap §7, after D513, append:

```markdown
### D514 — Razorpay is proven with a hidden test top-up before the billing build *(recorded 2026-11-19; originated → `2026-11-19-razorpay-test-top-up-design.md`)*

**Decision:** A `/billing-test` page (only where `RAZORPAY_TEST_PAGE=1`: a developer's machine and the dev deployment) sells one ₹100 pack of 1,000 credits through Razorpay Orders and Checkout. Only the signed `order.paid` webhook adds credits, through `record_razorpay_payment`, which marks the order paid and writes a negative `adjustment` row once. No SDK; settings `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` carry no test or live in their names.
**Why:** It proves checkout, signatures, webhook delivery and idempotent crediting end to end without designing plans, subscriptions or the billing page; a negative adjustment needs no change to `reserve_credits` and ends with the month like the planned top-ups.
**Rejected:** A button in the credits popover (real UI to design; fake-money credits for every owner on staging); a new `grant` ledger type now (belongs to the billing build, rewrites `reserve_credits`); a payment link (skips Checkout).
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0066_billing_payments.sql docs/database-schema.md docs/auth-production-migration.md docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "feat(billing): billing_payments table and record_razorpay_payment (migration 0066)"
```

---

### Task 2: Razorpay helpers, pack and switch

**Files:**
- Create: `src/lib/billing/constants.ts`, `src/lib/billing/test-mode.ts`, `src/lib/billing/razorpay.ts`
- Test: `src/lib/billing/razorpay.test.ts`

**Interfaces:**
- Produces:
  - `TEST_PACK: { amountPaise: 10000; credits: 1000 }`
  - `isBillingTestEnabled(): boolean`
  - `createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder>` where `RazorpayOrder = { id: string; amount: number; currency: string; status: string }`; throws `Error("Could not start the payment.")` on a refused call or missing keys
  - `razorpayKeyId(): string`
  - `verifyCheckoutSignature(orderId: string, paymentId: string, signature: string | null | undefined): boolean`
  - `verifyWebhookSignature(rawBody: string, signature: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/billing/razorpay.test.ts
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrder, verifyCheckoutSignature, verifyWebhookSignature } from "./razorpay";

const hex = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");

describe("Razorpay signatures", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = "key_secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "hook_secret";
  });

  it("accepts a Checkout signature of order|payment made with the key secret", () => {
    expect(verifyCheckoutSignature("order_1", "pay_1", hex("key_secret", "order_1|pay_1"))).toBe(true);
  });

  it("refuses a Checkout signature for other ids, another secret, or none", () => {
    expect(verifyCheckoutSignature("order_1", "pay_2", hex("key_secret", "order_1|pay_1"))).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", hex("hook_secret", "order_1|pay_1"))).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", undefined)).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", "short")).toBe(false);
  });

  it("accepts a webhook signature of the exact raw body made with the webhook secret", () => {
    const raw = '{"event":"order.paid"}';
    expect(verifyWebhookSignature(raw, hex("hook_secret", raw))).toBe(true);
    expect(verifyWebhookSignature('{"event": "order.paid"}', hex("hook_secret", raw))).toBe(false);
    expect(verifyWebhookSignature(raw, hex("key_secret", raw))).toBe(false);
  });

  it("refuses every webhook when no webhook secret is set", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const raw = "{}";
    expect(verifyWebhookSignature(raw, hex("", raw))).toBe(false);
  });
});

describe("createOrder", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_id";
    process.env.RAZORPAY_KEY_SECRET = "key_secret";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts an INR order with basic auth and returns it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "order_1", amount: 10000, currency: "INR", status: "created" }) });
    const order = await createOrder({ amountPaise: 10000, receipt: "test-1", notes: { org_id: "org-1" } });
    expect(order.id).toBe("order_1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("rzp_test_id:key_secret").toString("base64")}`);
    expect(JSON.parse(init.body)).toEqual({ amount: 10000, currency: "INR", receipt: "test-1", notes: { org_id: "org-1" } });
  });

  it("throws plain words when Razorpay refuses", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "bad key" });
    await expect(createOrder({ amountPaise: 10000, receipt: "r", notes: {} })).rejects.toThrow("Could not start the payment.");
  });

  it("throws plain words when the keys are not set", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    await expect(createOrder({ amountPaise: 10000, receipt: "r", notes: {} })).rejects.toThrow("Could not start the payment.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/billing/razorpay.test.ts`
Expected: FAIL, cannot resolve `./razorpay`.

- [ ] **Step 3: Implement**

```ts
// src/lib/billing/constants.ts
/** The one pack the test page sells (D514): ₹100 for 1,000 credits. */
export const TEST_PACK = { amountPaise: 10_000, credits: 1_000 } as const;
```

```ts
// src/lib/billing/test-mode.ts
import "server-only";

/** The test page and its routes exist only where RAZORPAY_TEST_PAGE=1: a developer's machine
 *  and the dev deployment. Test-mode payments are not real money (D514). */
export function isBillingTestEnabled(): boolean {
  return process.env.RAZORPAY_TEST_PAGE === "1";
}
```

```ts
// src/lib/billing/razorpay.ts
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay through its REST API, no SDK (D514). Test or live is decided only by which keys are
// set; the names are the same in every environment.

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

const START_FAILED = "Could not start the payment.";

function keys(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

/** The public key id Checkout needs in the browser. */
export function razorpayKeyId(): string {
  const k = keys();
  if (!k) throw new Error(START_FAILED);
  return k.keyId;
}

export async function createOrder(input: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  const k = keys();
  if (!k) {
    console.error("[razorpay] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set");
    throw new Error(START_FAILED);
  }
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${k.keyId}:${k.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes }),
  });
  if (!res.ok) {
    console.error("[razorpay] order refused", res.status, await res.text().catch(() => ""));
    throw new Error(START_FAILED);
  }
  return (await res.json()) as RazorpayOrder;
}

function hmacMatches(secret: string | undefined, message: string, signature: string | null | undefined): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(message).digest("hex"), "utf8");
  const given = Buffer.from(signature, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Checkout's handler signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string | null | undefined): boolean {
  return hmacMatches(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`, signature);
}

/** X-Razorpay-Signature: HMAC-SHA256 of the raw body, unparsed, with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined): boolean {
  return hmacMatches(process.env.RAZORPAY_WEBHOOK_SECRET, rawBody, signature);
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/lib/billing/razorpay.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing
git commit -m "feat(billing): Razorpay order and signature helpers, test pack and switch"
```

---

### Task 3: Payment rows and the webhook

**Files:**
- Create: `src/lib/db/billing-payments.ts`, `src/app/api/webhooks/razorpay/route.ts`, `scripts/razorpay-replay.mjs`
- Test: `src/app/api/webhooks/razorpay/route.test.ts`

**Interfaces:**
- Consumes: `verifyWebhookSignature` (Task 2); RPC `record_razorpay_payment` (Task 1).
- Produces:
  - `insertCreatedPayment(row: { orgId: string; orderId: string; amountPaise: number; credits: number; createdBy: string }): Promise<void>`
  - `recordRazorpayPayment(orderId: string, paymentId: string): Promise<boolean>`
  - `POST /api/webhooks/razorpay` → 401 bad signature; 200 `{ added: boolean }` on `order.paid`; 200 `{ ignored: true }` otherwise; 500 on a database error (Razorpay retries).

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/webhooks/razorpay/route.test.ts
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/lib/db/billing-payments", () => ({ recordRazorpayPayment: m.record }));

import { POST } from "./route";

const SECRET = "hook_secret";
const paid = { event: "order.paid", payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } } };

function post(body: unknown, secret: string | null = SECRET) {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["X-Razorpay-Signature"] = createHmac("sha256", secret).update(raw).digest("hex");
  return POST(new Request("http://x/api/webhooks/razorpay", { method: "POST", body: raw, headers }));
}

describe("POST /api/webhooks/razorpay", () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    m.record.mockReset();
    m.record.mockResolvedValue(true);
  });

  it("refuses a wrong or missing signature and records nothing", async () => {
    expect((await post(paid, "other")).status).toBe(401);
    expect((await post(paid, null)).status).toBe(401);
    expect(m.record).not.toHaveBeenCalled();
  });

  it("refuses everything when no webhook secret is set", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect((await post(paid)).status).toBe(401);
  });

  it("records order.paid with the order and payment ids", async () => {
    const res = await post(paid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: true });
    expect(m.record).toHaveBeenCalledWith("order_1", "pay_1");
  });

  it("answers 200 to a repeat that adds nothing, so Razorpay stops sending it", async () => {
    m.record.mockResolvedValue(false);
    const res = await post(paid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: false });
  });

  it("ignores other events with 200", async () => {
    const res = await post({ event: "payment.failed", payload: {} });
    expect(res.status).toBe(200);
    expect(m.record).not.toHaveBeenCalled();
  });

  it("answers 400 to an order.paid without ids", async () => {
    expect((await post({ event: "order.paid", payload: {} })).status).toBe(400);
  });

  it("answers 500 when the database fails, so Razorpay retries", async () => {
    m.record.mockRejectedValue(new Error("db down"));
    const res = await post(paid);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not record the payment." });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/app/api/webhooks/razorpay/route.test.ts`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement**

```ts
// src/lib/db/billing-payments.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

/** The order as started; credits are added only when its webhook arrives (D514). */
export async function insertCreatedPayment(row: {
  orgId: string;
  orderId: string;
  amountPaise: number;
  credits: number;
  createdBy: string;
}): Promise<void> {
  const { error } = await createServerSupabase().from("billing_payments").insert({
    org_id: row.orgId,
    razorpay_order_id: row.orderId,
    amount_paise: row.amountPaise,
    credits: row.credits,
    status: "created",
    created_by: row.createdBy,
  });
  if (error) throw error;
}

/** Migration 0066: marks the order paid and adds its credits, once. False for an unknown or
 *  already-paid order. */
export async function recordRazorpayPayment(orderId: string, paymentId: string): Promise<boolean> {
  const { data, error } = await createServerSupabase().rpc("record_razorpay_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });
  if (error) throw error;
  return data === true;
}
```

```ts
// src/app/api/webhooks/razorpay/route.ts
import { apiError, apiOk, withQuietErrors } from "@/lib/api/route-helpers";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { recordRazorpayPayment } from "@/lib/db/billing-payments";

type RazorpayEvent = {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
};

// D514: the only path that adds credits. No session here (the proxy skips /api/webhooks); the
// signature on the raw body is the check, so the body is read as text before any parsing.
// Answers fast (two database calls) because Razorpay retries anything slower than 5 seconds.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) return apiError("Unauthorized.", 401);

  let body: RazorpayEvent;
  try {
    body = JSON.parse(raw) as RazorpayEvent;
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  if (body.event !== "order.paid") return apiOk({ ignored: true });

  const payment = body.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id) return apiError("Missing payment", 400);
  const { id: paymentId, order_id: orderId } = payment;

  return withQuietErrors("Could not record the payment.", async () => {
    const added = await recordRazorpayPayment(orderId, paymentId);
    if (!added) console.warn("[razorpay] order.paid changed nothing (unknown order or already paid)", orderId);
    return apiOk({ added });
  });
}
```

```js
// scripts/razorpay-replay.mjs
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
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/app/api/webhooks/razorpay/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/billing-payments.ts src/app/api/webhooks/razorpay scripts/razorpay-replay.mjs
git commit -m "feat(billing): Razorpay webhook adds a paid order's credits once"
```

---

### Task 4: Start and confirm routes

**Files:**
- Create: `src/app/api/billing/test-order/route.ts`, `src/app/api/billing/test-confirm/route.ts`
- Test: `src/app/api/billing/test-order/route.test.ts`, `src/app/api/billing/test-confirm/route.test.ts`

**Interfaces:**
- Consumes: `isBillingTestEnabled`, `TEST_PACK`, `createOrder`, `razorpayKeyId`, `verifyCheckoutSignature` (Task 2); `insertCreatedPayment` (Task 3); `withAccess(req, { need: "view_credits" }, (caller, orgId) => …)` (owner only; `caller.userId`).
- Produces:
  - `POST /api/billing/test-order` → `{ orderId: string; amountPaise: number; credits: number; keyId: string }`
  - `POST /api/billing/test-confirm` body `{ orderId, paymentId, signature }` → `{ received: true }` or 400

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/billing/test-order/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  guards: [] as unknown[],
  createOrder: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/api/route-helpers", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers")),
  withAccess: (_req: Request, guard: unknown, fn: (caller: { userId: string }, orgId: string) => Promise<Response>) => {
    m.guards.push(guard);
    return fn({ userId: "user-1" }, "org-1");
  },
}));
vi.mock("@/lib/billing/razorpay", () => ({ createOrder: m.createOrder, razorpayKeyId: () => "rzp_test_id" }));
vi.mock("@/lib/db/billing-payments", () => ({ insertCreatedPayment: m.insert }));

import { POST } from "./route";

const req = () => new Request("http://x/api/billing/test-order", { method: "POST" });

describe("POST /api/billing/test-order", () => {
  beforeEach(() => {
    process.env.RAZORPAY_TEST_PAGE = "1";
    m.guards = [];
    m.createOrder.mockReset();
    m.createOrder.mockResolvedValue({ id: "order_1", amount: 10000, currency: "INR", status: "created" });
    m.insert.mockReset();
    m.insert.mockResolvedValue(undefined);
  });

  it("is 404 without the test switch and creates nothing", async () => {
    delete process.env.RAZORPAY_TEST_PAGE;
    expect((await POST(req())).status).toBe(404);
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it("is owner only (view_credits)", async () => {
    await POST(req());
    expect(m.guards).toEqual([{ need: "view_credits" }]);
  });

  it("creates the pack's order for the agency and saves it as created", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: "order_1", amountPaise: 10000, credits: 1000, keyId: "rzp_test_id" });
    expect(m.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 10000, notes: { org_id: "org-1" } }));
    expect(m.insert).toHaveBeenCalledWith({ orgId: "org-1", orderId: "order_1", amountPaise: 10000, credits: 1000, createdBy: "user-1" });
  });

  it("answers plain words and saves nothing when the order fails", async () => {
    m.createOrder.mockRejectedValue(new Error("Could not start the payment."));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not start the payment." });
    expect(m.insert).not.toHaveBeenCalled();
  });
});
```

```ts
// src/app/api/billing/test-confirm/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ guards: [] as unknown[], verify: vi.fn() }));
vi.mock("@/lib/api/route-helpers", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers")),
  withAccess: (_req: Request, guard: unknown, fn: (caller: { userId: string }, orgId: string) => Promise<Response>) => {
    m.guards.push(guard);
    return fn({ userId: "user-1" }, "org-1");
  },
}));
vi.mock("@/lib/billing/razorpay", () => ({ verifyCheckoutSignature: m.verify }));

import { POST } from "./route";

const req = (body: unknown) =>
  new Request("http://x/api/billing/test-confirm", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const good = { orderId: "order_1", paymentId: "pay_1", signature: "sig" };

describe("POST /api/billing/test-confirm", () => {
  beforeEach(() => {
    process.env.RAZORPAY_TEST_PAGE = "1";
    m.guards = [];
    m.verify.mockReset();
    m.verify.mockReturnValue(true);
  });

  it("is 404 without the test switch", async () => {
    delete process.env.RAZORPAY_TEST_PAGE;
    expect((await POST(req(good))).status).toBe(404);
  });

  it("is owner only and answers received for a good signature", async () => {
    const res = await POST(req(good));
    expect(m.guards).toEqual([{ need: "view_credits" }]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(m.verify).toHaveBeenCalledWith("order_1", "pay_1", "sig");
  });

  it("answers 400 for a bad signature or missing details", async () => {
    m.verify.mockReturnValue(false);
    expect((await POST(req(good))).status).toBe(400);
    expect((await POST(req({ orderId: "order_1" }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/app/api/billing`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement**

```ts
// src/app/api/billing/test-order/route.ts
import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { TEST_PACK } from "@/lib/billing/constants";
import { createOrder, razorpayKeyId } from "@/lib/billing/razorpay";
import { isBillingTestEnabled } from "@/lib/billing/test-mode";
import { insertCreatedPayment } from "@/lib/db/billing-payments";

// D514: starts a test payment for the owner's agency. The amount and credits come from TEST_PACK,
// never from the browser. Credits are added only by the webhook.
export async function POST(req: Request) {
  if (!isBillingTestEnabled()) return apiError("Not found.", 404);
  return withAccess(req, { need: "view_credits" }, (caller, orgId) =>
    withQuietErrors("Could not start the payment.", async () => {
      const order = await createOrder({
        amountPaise: TEST_PACK.amountPaise,
        receipt: `test-${Date.now()}`,
        notes: { org_id: orgId },
      });
      await insertCreatedPayment({
        orgId,
        orderId: order.id,
        amountPaise: TEST_PACK.amountPaise,
        credits: TEST_PACK.credits,
        createdBy: caller.userId,
      });
      return apiOk({ orderId: order.id, amountPaise: TEST_PACK.amountPaise, credits: TEST_PACK.credits, keyId: razorpayKeyId() });
    }),
  );
}
```

```ts
// src/app/api/billing/test-confirm/route.ts
import { apiError, apiOk, withAccess } from "@/lib/api/route-helpers";
import { verifyCheckoutSignature } from "@/lib/billing/razorpay";
import { isBillingTestEnabled } from "@/lib/billing/test-mode";

type ConfirmBody = { orderId?: string; paymentId?: string; signature?: string };

// D514: checks Checkout's signature so the page can say "payment received". It never adds
// credits: a closed tab or a forged call can't change a balance; the webhook does that.
export async function POST(req: Request) {
  if (!isBillingTestEnabled()) return apiError("Not found.", 404);
  return withAccess(req, { need: "view_credits" }, async () => {
    const body = (await req.json().catch(() => null)) as ConfirmBody | null;
    if (!body?.orderId || !body.paymentId || !body.signature) return apiError("Missing payment details.", 400);
    if (!verifyCheckoutSignature(body.orderId, body.paymentId, body.signature)) {
      return apiError("The payment couldn't be confirmed.", 400);
    }
    return apiOk({ received: true });
  });
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/app/api/billing`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/billing
git commit -m "feat(billing): owner-only routes to start and confirm a test payment"
```

---

### Task 5: The test page

**Files:**
- Create: `src/services/billing.service.ts`, `src/hooks/queries/billing.ts`, `src/lib/billing/load-checkout.ts`, `src/components/billing/test-top-up.tsx`, `src/app/billing-test/page.tsx`

**Interfaces:**
- Consumes: the two routes (Task 4); `isBillingTestEnabled` (Task 2); `resolveActingCaller`, `accessOf` from `@/lib/permissions/server`; `check` from `@/lib/permissions/check`; `PAGE_CONTAINER` from `@/components/shared/page-header`; `readJson` from `@/services/read-json`.
- Produces: `billingService.createTestOrder(): Promise<TestOrder>`, `billingService.confirmTestPayment(input: CheckoutResult): Promise<{ received: true }>`, `useCreateTestOrder()`, `useConfirmTestPayment()`, `loadCheckout(): Promise<void>`, `<TestTopUp />`.

- [ ] **Step 1: Service and hooks**

```ts
// src/services/billing.service.ts
import { readJson } from "./read-json";

export type TestOrder = { orderId: string; amountPaise: number; credits: number; keyId: string };
export type CheckoutResult = { orderId: string; paymentId: string; signature: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

class BillingService {
  async createTestOrder(): Promise<TestOrder> {
    return readJson<TestOrder>(await fetch("/api/billing/test-order", { method: "POST" }), "Could not start the payment.");
  }

  async confirmTestPayment(input: CheckoutResult): Promise<{ received: true }> {
    const res = await fetch("/api/billing/test-confirm", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) });
    return readJson<{ received: true }>(res, "The payment couldn't be confirmed.");
  }
}

export const billingService = new BillingService();
```

```ts
// src/hooks/queries/billing.ts
"use client";

import { useMutation } from "@tanstack/react-query";
import { billingService, type CheckoutResult } from "@/services/billing.service";

// D514: the test page only writes. The credits it adds reach the profile popover through that
// popover's own realtime channel on credit_transactions, so nothing here is cached or invalidated.
export function useCreateTestOrder() {
  return useMutation({ mutationFn: () => billingService.createTestOrder() });
}

export function useConfirmTestPayment() {
  return useMutation({ mutationFn: (input: CheckoutResult) => billingService.confirmTestPayment(input) });
}
```

- [ ] **Step 2: Checkout loader**

```ts
// src/lib/billing/load-checkout.ts
"use client";

export type CheckoutSuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

export type CheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  handler: (response: CheckoutSuccess) => void;
  modal?: { ondismiss?: () => void };
};

type CheckoutInstance = {
  open(): void;
  on(event: "payment.failed", callback: () => void): void;
};

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => CheckoutInstance;
  }
}

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<void> | null = null;

/** Loads Razorpay Checkout once per page; a failed load can be tried again. */
export function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("Could not open the payment window."));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export function openCheckout(options: CheckoutOptions, onFailed: () => void): void {
  if (!window.Razorpay) throw new Error("Could not open the payment window.");
  const checkout = new window.Razorpay(options);
  checkout.on("payment.failed", onFailed);
  checkout.open();
}
```

- [ ] **Step 3: Component and page**

```tsx
// src/components/billing/test-top-up.tsx
"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmTestPayment, useCreateTestOrder } from "@/hooks/queries/billing";
import { loadCheckout, openCheckout } from "@/lib/billing/load-checkout";

type Status = { tone: "info" | "ok" | "error"; text: string } | null;

const TONE_CLASS = { info: "text-muted-foreground", ok: "text-foreground", error: "text-destructive" } as const;

// D514: one test pack, paid in Razorpay Checkout. Confirm only reports "received"; the webhook
// adds the credits, and the profile popover shows them as they arrive.
export function TestTopUp() {
  const createOrder = useCreateTestOrder();
  const confirm = useConfirmTestPayment();
  const [status, setStatus] = useState<Status>(null);
  const busy = createOrder.isPending || confirm.isPending;

  async function pay() {
    setStatus(null);
    try {
      const [order] = await Promise.all([createOrder.mutateAsync(), loadCheckout()]);
      openCheckout(
        {
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amountPaise,
          currency: "INR",
          name: "CreativeOS",
          description: `${order.credits.toLocaleString("en-IN")} credits (test)`,
          handler: async (r) => {
            try {
              await confirm.mutateAsync({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
              setStatus({ tone: "ok", text: "Payment received. The credits are added as soon as it's confirmed." });
            } catch {
              setStatus({ tone: "error", text: "The payment couldn't be confirmed." });
            }
          },
          modal: { ondismiss: () => setStatus((s) => s ?? { tone: "info", text: "Payment window closed. Nothing was charged." }) },
        },
        () => setStatus({ tone: "error", text: "The payment didn't go through. No credits were added." }),
      );
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "Could not start the payment." });
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <p className="text-eyebrow">Test mode</p>
        <h1 className="font-display text-2xl font-semibold">Buy credits</h1>
        <p className="text-sm text-muted-foreground">A test payment. No real money is taken.</p>
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-card">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">1,000 credits</span>
          <span className="font-medium">₹100</span>
        </div>
        <Button className="w-full" onClick={pay} disabled={busy}>
          <CreditCard strokeWidth={1.5} />
          {busy ? "Starting…" : "Pay ₹100"}
        </Button>
        {status && <p className={`text-sm ${TONE_CLASS[status.tone]}`}>{status.text}</p>}
      </div>
    </div>
  );
}
```

```tsx
// src/app/billing-test/page.tsx
import { notFound } from "next/navigation";
import { check } from "@/lib/permissions/check";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { isBillingTestEnabled } from "@/lib/billing/test-mode";
import { PAGE_CONTAINER } from "@/components/shared/page-header";
import { TestTopUp } from "@/components/billing/test-top-up";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buy credits (test) — CreativeOS" };

// D514: only where RAZORPAY_TEST_PAGE=1, and only for the agency's owner (view_credits);
// anyone else gets the 404 page.
export default async function BillingTestPage() {
  if (!isBillingTestEnabled()) notFound();
  const { caller, effectiveOrgId } = await resolveActingCaller();
  if (check(accessOf(caller), "view_credits", { orgId: effectiveOrgId, clientId: null }) !== "allow") notFound();
  return (
    <main className={PAGE_CONTAINER}>
      <TestTopUp />
    </main>
  );
}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit` then `npx eslint src/app/billing-test src/components/billing src/lib/billing src/hooks/queries/billing.ts src/services/billing.service.ts`
Expected: no errors. If `text-destructive`, `bg-card` or `shadow-card` are not defined tokens in `src/app/globals.css`, use the nearest existing token (grep `globals.css`) rather than a raw colour.

- [ ] **Step 5: Commit**

```bash
git add src/services/billing.service.ts src/hooks/queries/billing.ts src/lib/billing/load-checkout.ts src/components/billing src/app/billing-test
git commit -m "feat(billing): hidden test page to buy credits with Razorpay Checkout"
```

---

### Task 6: Settings and the end-to-end run

**Files:**
- Modify: `.env` in this worktree (not committed)

- [ ] **Step 1: Settings.** In this worktree's `.env`, add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` with the values of `RAZOR_PAY_TEST_API_KEY` and `RAZOR_PAY_TEST_API_SECRET` (copy by script; never print them), `RAZORPAY_WEBHOOK_SECRET` set to a new random 32-character hex string, and `RAZORPAY_TEST_PAGE=1`. Confirm by printing only the names present.

- [ ] **Step 2: Focused tests.** Run `npx vitest run src/lib/billing src/app/api/billing src/app/api/webhooks/razorpay` and `npx tsc --noEmit`. Expected: all pass.

- [ ] **Step 3: Hand-off to the user** (they act; nothing here is automated):
  1. Apply migration 0066 to the dev database.
  2. Run this worktree's dev server on a free port (e.g. `npx next dev -p 3003`) and point the tunnel at it (`ngrok http 3003`).
  3. Razorpay Dashboard → Test mode → Webhooks → add `<tunnel>/api/webhooks/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET` from `.env`, event `order.paid` (OTP `754081` if asked).
  4. Sign in as the owner of an agency **with** a monthly limit, open `/billing-test`, pay with UPI `success@razorpay`: the popover's credits move by 1,000. Pay again with `failure@razorpay`: nothing moves.
  5. Without the tunnel: start a payment, close the window, then `node --env-file=.env scripts/razorpay-replay.mjs <order_id> http://localhost:3003` twice: `{"added":true}` then `{"added":false}`.
