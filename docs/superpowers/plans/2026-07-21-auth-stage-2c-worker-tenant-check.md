# Auth Stage 2C — Async Worker Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the two async completion webhooks (`/api/webhooks/generation`, `/api/webhooks/kb-build`) — the only entry points into this app that run under the service-role key with no user session, so none of Stage 1/2A/2B's session-based checks reach them. Two distinct gaps, both touching the same two files, done together: **(1)** the generation webhook has **no authentication at all** — found while scoping this plan — and **(2)** neither webhook re-validates that the job's target resource still belongs to the org it was created for (D79), now possible since `generations.org_id`/`client_kb_jobs.org_id` exist (2B).

**Architecture:** `kb-build`'s webhook already does this correctly for auth — `Authorization: Bearer TRIGGER_WEBHOOK_SECRET`, checked before any processing. The generation webhook gets the same treatment, in two forms: the internal Trigger.dev path (`video-generate.ts` → this app's own webhook) gets the identical header pattern; the Kling path (an external provider calling back a URL, unlikely to support custom headers) gets the secret embedded in the callback URL itself instead. Both checks share one helper. The D79 tenant check is a second, independent addition: each webhook re-fetches its job row's immutable `org_id` (set at creation, never changes) and compares it against the *current* org of the resource that row points to — a mismatch is dropped and logged, never processed. In practice this should never fire (nothing in this app ever moves a client between orgs), but it's cheap defense-in-depth against a class of bug this exact session already found three times.

**Tech Stack:** Next.js Route Handlers, Trigger.dev v3 tasks, existing `route-helpers.ts` patterns.

**Parent:** `docs/superpowers/plans/2026-07-21-auth-stage-2-index.md` · **Spec:** rollout plan Stage 2 · **ADR:** D79 (worker tenant check, design), this plan's own auth-gap finding (record as new ADR on completion)

## Global Constraints

- **Both webhooks stay service-role, no session.** This is not about adding `resolveCallerContext()` — there is no caller. Auth here means "is this actually the provider/our own task calling," not "who is this user."
- **Reuse `TRIGGER_WEBHOOK_SECRET`** — it already exists (`kb-build`'s auth) and is already a required env var. Don't introduce a second secret without a real reason to rotate them independently; there isn't one here.
- **Fail closed, log loudly.** An auth failure or org mismatch returns a clear error status and a server-side log line — never a silent 200 that hides what happened (that would make the next debugging session redo this investigation from scratch).
- **Don't touch generation/KB-job business logic** — this plan adds a guard clause at the top of each handler, not a rewrite of what happens after.

## File Structure

**New**
| File | Responsibility |
|---|---|
| none — everything below modifies existing files | |

**Modified**
| File | Change |
|---|---|
| `src/lib/api/route-helpers.ts` | Add `isAuthorizedWebhook(req)` — shared secret check, extracted from `kb-build`'s existing inline version |
| `src/app/api/webhooks/kb-build/route.ts` | Use the shared helper instead of its local `isAuthorized` |
| `src/app/api/webhooks/generation/route.ts` | Add auth (header for internal path, URL token for Kling) + D79 tenant check |
| `trigger/video-generate.ts` | Send `Authorization: Bearer TRIGGER_WEBHOOK_SECRET` when posting to the generation webhook (matches `kb-build.ts`'s existing pattern exactly) |
| `src/lib/video-gen/providers/kling.ts` | Embed the secret as a `token` query param in the `callback_url` sent to Kling |
| `src/lib/generations/complete.ts` | D79 tenant check before processing |

---

## Task 1: Authenticate the generation webhook

**Files:**
- Modify: `src/lib/api/route-helpers.ts`
- Modify: `src/app/api/webhooks/kb-build/route.ts`
- Modify: `src/app/api/webhooks/generation/route.ts`
- Modify: `trigger/video-generate.ts`
- Modify: `src/lib/video-gen/providers/kling.ts`

**Interfaces:**
- Produces: `isAuthorizedWebhook(req: Request): boolean` — checks `Authorization: Bearer <TRIGGER_WEBHOOK_SECRET>`.

- [ ] **Step 1: Extract the shared helper**

In `src/lib/api/route-helpers.ts`, add:

```ts
// ── Webhook auth ──────────────────────────────────────────────────────────────

// Shared-secret check for server-to-server webhooks (Trigger.dev tasks calling back
// into this app). No user session exists at this boundary — this answers "is this
// actually our own task/a trusted caller," not "who is this user."
export function isAuthorizedWebhook(req: Request): boolean {
  const secret = process.env.TRIGGER_WEBHOOK_SECRET;
  if (!secret) {
    console.error("TRIGGER_WEBHOOK_SECRET is not set — all webhook calls will be rejected");
    return false;
  }
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}
```

- [ ] **Step 2: Switch `kb-build`'s route to the shared helper**

In `src/app/api/webhooks/kb-build/route.ts`, delete the local `isAuthorized` function and its
use; import and call the shared one instead:

```ts
import { apiError, apiOk, isAuthorizedWebhook } from "@/lib/api/route-helpers";
// ...
export async function POST(req: Request) {
  if (!isAuthorizedWebhook(req)) return apiError("Unauthorized.", 401);
  // ...unchanged...
```

- [ ] **Step 3: Add header auth to the generation webhook's internal path**

In `src/app/api/webhooks/generation/route.ts`, the "existing internal webhook (Veo, Sora via
Trigger.dev)" branch (the `if (!body?.generationId)` block, not the `provider === "kling"`
block) needs the header check. Add near the top of `POST`:

```ts
import { apiError, apiOk, isAuthorizedWebhook } from "@/lib/api/route-helpers";
```

Then, guard the internal path specifically (Kling is handled separately in Step 4 — do not
gate the Kling branch with this same check, it uses a different mechanism):

```ts
// Kling branch stays as-is here — its own auth is added in Step 4.
if (provider === "kling") {
  // ...unchanged Kling handling...
}

// Internal webhook (Veo, Sora via Trigger.dev) — this app calling itself back.
if (!isAuthorizedWebhook(req)) return apiError("Unauthorized.", 401);
if (!body?.generationId) return apiError("Missing generationId", 400);
// ...unchanged...
```

- [ ] **Step 4: Add URL-token auth to the Kling path**

Kling calls back a URL it was given at job-submission time — it's an external provider, not
guaranteed to forward custom headers, so the secret travels in the URL instead. In the same
file, at the top of the `provider === "kling"` branch:

```ts
if (provider === "kling") {
  const secret = process.env.TRIGGER_WEBHOOK_SECRET;
  const token = url.searchParams.get("token");
  if (!secret || token !== secret) return apiError("Unauthorized.", 401);

  const mapped = mapKlingWebhookPayload(body);
  // ...unchanged...
```

Note: `url` here is the `new URL(req.url)` already constructed earlier in the function for
reading `provider` — reuse it, don't re-parse.

- [ ] **Step 5: Send the header from `video-generate.ts`**

In `trigger/video-generate.ts`, mirror `kb-build.ts`'s existing pattern exactly:

```ts
const appUrl = process.env.APP_URL;
if (!appUrl) throw new Error("APP_URL env var not set");
const secret = process.env.TRIGGER_WEBHOOK_SECRET;
if (!secret) throw new Error("TRIGGER_WEBHOOK_SECRET env var not set");

const webhookUrl = `${appUrl}/api/webhooks/generation`;

const postWebhook = async (body: object) => {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  // ...unchanged error handling...
```

- [ ] **Step 6: Embed the token in Kling's callback URL**

In `src/lib/video-gen/providers/kling.ts`, where `callbackUrl` is built:

```ts
const secret = process.env.TRIGGER_WEBHOOK_SECRET;
if (!secret) throw new Error("Missing TRIGGER_WEBHOOK_SECRET");
const callbackUrl = `${appUrl}/api/webhooks/generation?provider=kling&token=${encodeURIComponent(secret)}`;
```

- [ ] **Step 7: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 8: Run the existing test suites for both webhooks**

Run: `npx vitest run kling-webhook kling-provider`
Expected: PASS. If either test posts to the generation webhook or calls
`buildKlingRequestBody`/the webhook handler directly without the new auth, it will now fail
with 401 or a callback-URL mismatch — fix the test's request construction (add the header /
expect the `token` param), don't loosen the check to make the test pass.

- [ ] **Step 9: Manual verification — the internal path end-to-end**

On staging, trigger a real video generation (mock mode is fine:
`POST /api/nodes/<id>/video-generate` with `mock: true` in the body, per
`video-generate.ts`'s `MOCK_MODE` branch). Expected: completes normally — confirms the task
now sends the header and the route accepts it.

- [ ] **Step 10: Manual verification — auth actually rejects an unauthenticated call**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/webhooks/generation \
  -H "Content-Type: application/json" \
  -d '{"generationId":"00000000-0000-0000-0000-000000000000","status":"succeeded","videoUrl":"https://example.com/x.mp4"}'
```
Expected: `401`, not `404`/`500` (confirms the auth check fires before any DB lookup).

- [ ] **Step 11: Commit**

```bash
git add src/lib/api/route-helpers.ts "src/app/api/webhooks/kb-build/route.ts" "src/app/api/webhooks/generation/route.ts" trigger/video-generate.ts src/lib/video-gen/providers/kling.ts
git commit -m "feat(auth): authenticate the generation webhook (was completely open)"
```

---

## Task 2: Async worker tenant check (D79)

**Files:**
- Modify: `src/lib/generations/complete.ts`
- Modify: `src/app/api/webhooks/kb-build/route.ts`

**Interfaces:**
- Consumes: `generations.org_id`, `client_kb_jobs.org_id` (2B), `getClientById` (existing).
- Produces: both webhooks drop (log + no-op, not an error response — the provider/task
  already succeeded from its own point of view) a job whose target resource's current org
  no longer matches the org recorded on the job at creation.

- [ ] **Step 1: Add the check to `completeGeneration`**

In `src/lib/generations/complete.ts`, right after the existing idempotency check:

```ts
export async function completeGeneration(
  input: CompleteGenerationInput,
): Promise<void> {
  const generation = await getGeneration(input.generationId);

  // Idempotency: skip if already resolved (duplicate webhook delivery)
  if (generation.status !== "running") return;

  // D79: the org recorded on the job at creation must still match the current org of
  // the node it targets. Should be impossible in practice (nothing in this app moves a
  // client between orgs) — this is a backstop against exactly the class of bug this
  // rollout already found three times, not a response to a real observed drift.
  const { data: currentChain, error: chainError } = await createServerSupabase()
    .from("nodes")
    .select("canvases!inner(clients!inner(org_id))")
    .eq("id", generation.node_id)
    .maybeSingle();
  if (chainError) throw chainError;
  const canvas = currentChain
    ? Array.isArray(currentChain.canvases) ? currentChain.canvases[0] : currentChain.canvases
    : null;
  const client = canvas
    ? Array.isArray(canvas.clients) ? canvas.clients[0] : canvas.clients
    : null;
  if (!client || client.org_id !== generation.org_id) {
    console.error("[completeGeneration] org mismatch — dropping", {
      generationId: input.generationId,
      recordedOrgId: generation.org_id,
      currentOrgId: client?.org_id ?? null,
    });
    return;
  }

  // ...unchanged from here...
```

Add the `createServerSupabase` import if not already present in this file.

- [ ] **Step 2: Add the check to the kb-build webhook**

In `src/app/api/webhooks/kb-build/route.ts`, after the auth check and body parsing, before
the `kind`-based branching, fetch the job once and check it for every kind (not just
`succeeded`):

```ts
if (!body?.jobId || !body?.kind) return apiError("Missing jobId or kind.", 400);

// D79: same backstop as the generation webhook — the job's recorded org must still
// match its client's current org.
const jobForCheck = await getKBJob(body.jobId);
if (!jobForCheck) return apiError("Job not found.", 404);
const client = await getClientById(jobForCheck.client_id);
if (!client || client.org_id !== jobForCheck.org_id) {
  console.error("[webhooks/kb-build] org mismatch — dropping", {
    jobId: body.jobId,
    recordedOrgId: jobForCheck.org_id,
    currentOrgId: client?.org_id ?? null,
  });
  return apiOk({ ok: true, dropped: "org mismatch" });
}

try {
  if (body.kind === "phase") {
  // ...unchanged...
```

Add the `getClientById` import from `@/lib/db/clients` if not already present. Note: the
existing `"succeeded"` branch's own `getKBJob(body.jobId)` call becomes redundant with
`jobForCheck` fetched above — replace that inner call with the already-fetched `jobForCheck`
rather than querying twice for the same row.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 5: Manual verification — same-org completion still works**

Trigger a real (or mock-mode) video generation and a real KB build on staging, signed in as
Yuvabe. Expected: both complete normally — confirms the added check doesn't false-positive
on the only case that actually happens today (same org throughout).

- [ ] **Step 6: Commit**

```bash
git add src/lib/generations/complete.ts "src/app/api/webhooks/kb-build/route.ts"
git commit -m "feat(auth): async worker tenant check on both completion webhooks (D79)"
```

---

## Final verification (2C shippable checklist)

- [ ] `npm run build` — clean
- [ ] `npx vitest run` — all pass
- [ ] Unauthenticated POST to `/api/webhooks/generation` → 401, not 404/500
- [ ] Kling-path callback URL now includes `token=`; internal path now sends the
      `Authorization` header
- [ ] Real (or mock-mode) video generation completes end-to-end with the new auth in place
- [ ] Real KB build completes end-to-end with the new tenant check in place
- [ ] Two commits made (auth, tenant check)

**On completion:** update `2026-07-21-auth-stage-2-index.md` — 2C → ✅. This closes **Stage
2** as a whole (2A, 2B, 2C all done). Record the generation-webhook auth gap as its own ADR
entry (next available number) — it's a distinct finding from D79, found while scoping this
plan, not something D79 already covered.

---

## Self-Review notes (traceability)

- **The auth gap is the bigger finding, sequenced first** → Task 1 comes before Task 2;
  "is this call legitimate" logically precedes "does the org match," and the plan's
  Architecture section says so explicitly rather than doing them in discovery order.
- **Reused the existing secret, existing pattern** → Global Constraints states why a second
  secret isn't warranted; Task 1 Step 2 explicitly refactors `kb-build`'s already-correct
  inline check into the shared helper rather than leaving two implementations to drift.
- **Kling gets different treatment for a stated reason** → Task 1 Step 4's comment explains
  *why* URL-token instead of header (external provider, header support not guaranteed) —
  not an unexplained inconsistency between the two paths.
- **D79 framed honestly** → Task 2's own doc comment says this should be unreachable in
  practice today, not oversold as closing an active exploit — distinct from Task 1, which
  is a real, currently-open gap.
- **No duplicate query left behind** → Task 2 Step 2 explicitly calls out reusing
  `jobForCheck` instead of leaving the pre-existing redundant `getKBJob` call in the
  `succeeded` branch.
