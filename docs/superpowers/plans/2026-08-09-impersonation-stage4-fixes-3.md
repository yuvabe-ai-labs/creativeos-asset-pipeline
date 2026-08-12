# Stage 4 Impersonation — Third Post-Review Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the findings from the third whole-branch review: a Critical billing/data-
integrity bug where elevated-impersonated generations are charged to and stamped with the
*operator's* org instead of the org being acted as, plus two Important gaps (a read-only
impersonating operator silently steals a target org's canvas edit lock; an unauthenticated,
unmetered LLM-spending write endpoint the original design spec put in scope but no round ever
addressed).

**Architecture:** `withNode()` already computes `effectiveOrgId` (via `resolveOrgId()`) for its
isolation check, then discards it and hands the handler the operator's real `CallerContext`
instead. The fix threads that already-computed value through as an additional handler
parameter — no new resolution logic, just stop throwing away a value already in hand. The
canvas-lock fix moves the "don't act while impersonating read-only" decision from the gate
(already correctly exempted in round 2) to the one call site that actually needs it. The
eval-bootstrap fix follows the original design spec's own instruction, four rounds late.

**Tech Stack:** Same as prior plans.

## Global Constraints

- Findings cited are from the third whole-branch review.
- Operator attribution (`caller.userId`, `caller.email`) on generation rows is correct and
  desirable — only the *org* attribution is wrong. Don't remove operator identity from any of
  these call sites while fixing the org.
- `IMPERSONATION_COOKIE_SECRET` fails closed — unchanged, don't touch.

---

### Task 1: Fix org attribution on generation writes (Critical)

**Files:**
- Modify: `src/lib/api/route-helpers.ts`
- Modify: `src/app/api/nodes/[id]/generate/route.ts`
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts`
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts`
- Modify: `src/app/api/nodes/[id]/video-prompt/route.ts`
- Modify: `src/app/api/me/route.ts`
- Test: `src/lib/api/route-helpers.test.ts` (extend)
- Test: `src/lib/actions/with-action-coverage.test.ts` or a new sibling file (regression test
  for the org-attribution class — see Step 5)

**Interfaces:**
- `withNode`'s handler signature gains a 5th parameter: `effectiveOrgId: string` (the same
  value already computed internally for the isolation check). Existing call sites that declare
  fewer than 5 callback parameters are unaffected — TypeScript allows a callback with fewer
  declared parameters to satisfy a type expecting more (the extra argument is simply unused).
  Only the 4 generation routes (which already destructure `caller`/`clientId`) need updating.

The bug: `withNode` resolves `effectiveOrgId = await resolveOrgId()` for its access-control
check (correctly returns the impersonation target when active), then calls
`handler(nodeId, node, caller, clientId)` — `caller` comes from `resolveCallerContext()`, the
OPERATOR's real membership org, not the effective one. The four generation routes destructure
that `caller` and use `caller.orgId` for `insertGeneration`, `reserveCredits`,
`settleGeneration`/whatever completes the reservation, and `refundReservation`. Result: an
operator elevated-impersonating org X who runs a generation on X's canvas gets the generation
row stamped `org_id = <operator's own org>` (while `client_id` correctly points into org X),
the credit reservation debited from the OPERATOR's org's monthly limit (not org X's), and the
run invisible in org X's admin usage view while appearing in the operator's own org's.

- [ ] **Step 1: Add `effectiveOrgId` to `withNode`'s handler signature.**

Read the current `src/lib/api/route-helpers.ts` in full first (already read during planning —
reproduced here, re-confirm before editing since it's a security-relevant shared helper).
Change:
```typescript
export async function withNode(
  req: Request,
  params: Promise<{ id: string }>,
  handler: (
    nodeId: string,
    node: NodeRow,
    caller: CallerContext,
    clientId: string,
  ) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  // ...
  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const caller = await resolveCallerContext();
  const { canvases: _canvases, ...node } = row;
  return handler(nodeId, node as NodeRow, caller, canvas.client_id);
}
```
to:
```typescript
export async function withNode(
  req: Request,
  params: Promise<{ id: string }>,
  handler: (
    nodeId: string,
    node: NodeRow,
    caller: CallerContext,
    clientId: string,
    effectiveOrgId: string,
  ) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  // ...
  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const caller = await resolveCallerContext();
  const { canvases: _canvases, ...node } = row;
  return handler(nodeId, node as NodeRow, caller, canvas.client_id, effectiveOrgId);
}
```
(`effectiveOrgId` is already in scope from the isolation check a few lines above — no new
resolution call, just don't let it go out of scope unused.)

- [ ] **Step 2: Update the 4 generation routes to destructure and use `effectiveOrgId`.**

In each of `src/app/api/nodes/[id]/generate/route.ts`,
`src/app/api/nodes/[id]/image-generate/route.ts`,
`src/app/api/nodes/[id]/video-generate/route.ts`,
`src/app/api/nodes/[id]/video-prompt/route.ts`:

1. Change the `withNode` callback signature from
   `async (nodeId, _node, caller, clientId) => {` to
   `async (nodeId, _node, caller, clientId, effectiveOrgId) => {`.
2. Replace every `caller.orgId` used for an `insertGeneration`/`reserveCredits`/
   `settleGeneration`/`refundReservation`-style call with `effectiveOrgId`. Read each file
   first — line numbers below are from the review, re-confirm against current content:
   - `generate/route.ts`: lines ~70, ~81, ~132, ~162 (the `insertGeneration({ orgId:
     caller.orgId, ... })` calls, the `reserveCredits(caller.orgId, ...)` call, and the
     `refundReservation({ orgId: caller.orgId, ... })` call).
   - `image-generate/route.ts`: lines ~258, ~282, ~334, ~363 (same shape).
   - `video-generate/route.ts`: lines ~123, ~149, ~170 (same shape).
   - `video-prompt/route.ts`: lines ~76, ~87, ~139, ~170 (same shape).
   **Do NOT touch** `caller.userId`, `caller.email`, or any other `caller.X` field — operator
   identity attribution is correct and should stay exactly as-is. Only the `orgId` argument to
   these four DB/credit functions changes.
3. Confirm no other use of `caller.orgId` remains in the file for anything write-related (a
   read-only diagnostic log line, if any, is fine to leave alone — but if you find one, note it
   in your report; don't silently change something outside this task's scope).

- [ ] **Step 3: Fix `/api/me` (the same fact, surfaced differently — I2 from the same review).**

Read `src/app/api/me/route.ts` in full (small file). This route doesn't go through
`withNode`/`withClient` — it's a standalone route reading the caller's own identity. Right now
it reports `orgId`/`orgName`/`creditsUsed`/`monthlyCreditLimit` from `caller.orgId`, which,
while impersonating, shows the OPERATOR's own org's numbers in the header — inconsistent with
the impersonation banner directly above it saying "Viewing as {other org}", and, once Step 1-2
land, actively misleading (the header's credit meter would sit still while the actual org being
billed, resolved via `resolveOrgId()`, drains).

Change:
```typescript
export async function GET() {
  const caller = await resolveCallerContext();
  const db = createServerSupabase();
  const [{ data, error }, org, creditsUsed] = await Promise.all([
    db.from("profiles").select("display_name").eq("user_id", caller.userId).maybeSingle(),
    getOrgById(caller.orgId),
    getOrgCreditUsage(caller.orgId),
  ]);
  if (error) return apiError("Failed to load profile.", 500);

  return apiOk({
    name: (data?.display_name as string) ?? "User",
    role: orgRoleToIdentityRole(caller.orgRole),
    platformRole: caller.platformRole,
    orgId: caller.orgId,
    orgName: org?.name ?? null,
    creditsUsed,
    monthlyCreditLimit: org?.monthly_credit_limit ?? null,
  });
}
```
to:
```typescript
export async function GET() {
  const caller = await resolveCallerContext();
  const effectiveOrgId = await resolveOrgId();
  const db = createServerSupabase();
  const [{ data, error }, org, creditsUsed] = await Promise.all([
    db.from("profiles").select("display_name").eq("user_id", caller.userId).maybeSingle(),
    getOrgById(effectiveOrgId),
    getOrgCreditUsage(effectiveOrgId),
  ]);
  if (error) return apiError("Failed to load profile.", 500);

  return apiOk({
    name: (data?.display_name as string) ?? "User",
    role: orgRoleToIdentityRole(caller.orgRole),
    platformRole: caller.platformRole,
    orgId: effectiveOrgId,
    orgName: org?.name ?? null,
    creditsUsed,
    monthlyCreditLimit: org?.monthly_credit_limit ?? null,
  });
}
```
Add the `resolveOrgId` import from `@/lib/dal` alongside the existing `resolveCallerContext`
import. Keep `role`/`platformRole` sourced from `caller` (the operator's real identity/role —
correct as-is, only org-scoped fields change).

- [ ] **Step 4: Update `route-helpers.test.ts` for the new `withNode` signature.**

Read the current test file. Any existing `withNode` test needs its handler callback and any
assertions updated to account for the new 5th `effectiveOrgId` parameter. Add (or extend an
existing test) asserting `withNode` passes the impersonation-resolved org (not the caller's
real org) as the 5th argument when impersonating — mirroring the existing `withClient` write-
gate tests' mocking pattern (`resolveOrgId` mocked to a different value than the caller's own
`orgId`, confirm the handler receives the mocked `resolveOrgId` value in the 5th position).

- [ ] **Step 5: Add a source-level regression test for the org-attribution class.**

This is now the third occurrence of "gated correctly, wrong org" (page-level in round 1,
`createClientAction`/`createCanvasAction` in round 2, generation routes here). Per the review's
own recommendation, add a cheap source-grep test that would catch a fourth occurrence
automatically. Create `src/lib/api/generation-org-attribution.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The org-attribution class of bug (round 1: pages read caller.orgId instead of
// resolveOrgId(); round 2: createClientAction/createCanvasAction wrote caller.orgId;
// round 3: all four generation routes billed/stamped caller.orgId despite withNode
// already resolving the correct effectiveOrgId for its own isolation check) keeps
// recurring because unit tests prove each function correct in isolation without ever
// asserting WHICH org value it was fed. This test reads the generation routes' own
// source and fails if any of them passes caller.orgId into a credit/generation
// DB call — regardless of whether that specific call's unit test happens to pass.
const GENERATION_ROUTES = [
  "src/app/api/nodes/[id]/generate/route.ts",
  "src/app/api/nodes/[id]/image-generate/route.ts",
  "src/app/api/nodes/[id]/video-generate/route.ts",
  "src/app/api/nodes/[id]/video-prompt/route.ts",
];

const ORG_SCOPED_WRITE_FUNCTIONS = [
  "insertGeneration",
  "reserveCredits",
  "settleGeneration",
  "refundReservation",
];

describe("generation routes attribute org-scoped writes to the effective org, not the caller's own org", () => {
  for (const relPath of GENERATION_ROUTES) {
    it(`${relPath} never passes caller.orgId into a credit/generation write`, () => {
      const source = readFileSync(join(process.cwd(), relPath), "utf8");
      for (const fnName of ORG_SCOPED_WRITE_FUNCTIONS) {
        // Look at each call site of fnName and confirm none of its nearby argument
        // text contains the literal "caller.orgId" — deliberately blunt (source-text,
        // not AST-based), matching this branch's existing coverage-test philosophy:
        // cheap, fails loudly on the exact regression pattern, not a general-purpose
        // static analyzer.
        const callSites = [...source.matchAll(new RegExp(`${fnName}\\(([^;]*?)\\)`, "gs"))];
        for (const [, args] of callSites) {
          expect(
            args.includes("caller.orgId"),
            `${relPath}: a ${fnName}(...) call passes caller.orgId — use effectiveOrgId ` +
              `instead (caller.orgId is the operator's real org, not the org being acted as).`,
          ).toBe(false);
        }
      }
    });
  }
});
```

- [ ] **Step 6: Run everything.**

Run: `npx vitest run src/lib/api/route-helpers.test.ts src/lib/api/generation-org-attribution.test.ts`
Then: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: new/extended tests pass; no new failures.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api/route-helpers.ts src/lib/api/route-helpers.test.ts \
  src/app/api/nodes/[id]/generate/route.ts src/app/api/nodes/[id]/image-generate/route.ts \
  src/app/api/nodes/[id]/video-generate/route.ts src/app/api/nodes/[id]/video-prompt/route.ts \
  src/app/api/me/route.ts src/lib/api/generation-org-attribution.test.ts
git commit -m "fix(api): attribute impersonated generations to the effective org, not the operator's own org (Stage 4 review round 3, Critical)"
```

---

### Task 2: Read-only impersonating operators must not acquire the canvas edit lock (Important)

**Files:**
- Modify: `src/hooks/use-canvas-lock.ts`
- Test: matching test file if one exists (check first)

**Interfaces:**
- Consumes: `resolveImpersonationState` is server-only and can't be called from this client
  hook directly — the fix needs the impersonation state available client-side. Check whether
  `useIdentity()` or a similar existing client hook already surfaces `isImpersonating`/
  `elevated` (the banner components render this server-side and pass props down — check
  `src/components/layout/impersonation-banner-actions.tsx` for the prop shape it already
  receives, and whether an equivalent is available to `use-canvas-lock.ts`'s call site). If
  nothing client-accessible currently exposes this, the simplest fix is server-side: gate
  `acquireCanvasLockAction` itself (not with the removed `withAction()` wrapper — a narrower,
  purpose-built check) to no-op (return a "not acquired, read-only" result) when impersonating
  non-elevated, rather than trying to thread client-side impersonation state through the hook.

Round 2 correctly exempted the three canvas-lock actions from `withAction()` (gating them broke
normal browsing). But the review found this went too far in the other direction: nothing stops
`acquireCanvasLockAction` from actually running while impersonating read-only, and the hook
calls it unconditionally on mount — so a read-only "just looking" operator silently takes the
edit lock on a live customer canvas, locking out the tenant's real users, with their own name
now shown as "editing" in that org's UI. No audit trail either, since the exemption also
removed the write_action log.

- [ ] **Step 1: Read `src/lib/actions/canvas-lock.ts` and `src/hooks/use-canvas-lock.ts`
  (and `src/lib/db/canvas-lock.ts` for `acquireCanvasLock`'s exact return shape) in full.**

- [ ] **Step 2: Add a narrow, server-side check inside `acquireCanvasLockAction` specifically**
  (not a re-adoption of `withAction()`, which the D101 amendment correctly ruled out for the
  reasons in round 2's fix). Import `resolveImpersonationState` from `@/lib/auth/impersonation`
  directly:
```typescript
export async function acquireCanvasLockAction(
  canvasId: string,
  sessionId: string,
  name: string | null,
) {
  const impersonation = await resolveImpersonationState();
  if (impersonation.isImpersonating && !impersonation.elevated) {
    // Read-only impersonation must never take a real tenant's edit lock — return the
    // same shape acquireCanvasLock returns for "someone else holds it," so the caller's
    // existing denied-lock UI handles this without new branching. No audit event: this
    // is a no-op, not a write.
    return getCanvasLock(canvasId);
  }
  return acquireCanvasLock(canvasId, sessionId, name);
}
```
(Adapt to `acquireCanvasLock`'s and `getCanvasLock`'s actual return types — read
`src/lib/db/canvas-lock.ts` first to confirm `getCanvasLock`'s shape genuinely matches what a
"lock denied, held by someone/nothing else" caller expects; if the shapes don't line up cleanly,
return an explicit `{ granted: false, ... }`-shaped value matching whatever
`acquireCanvasLock` returns on a denial, not `getCanvasLock`'s raw shape, if they differ.)

- [ ] **Step 3: Confirm the calling hook's existing "lock denied" path already produces sane
  UI** (per the file comment above: "the hook already has that path for the denied case"). Read
  `src/hooks/use-canvas-lock.ts` and `src/components/canvas/connection-status.ts` (or wherever
  `markOffline`/the badge state lives) to confirm a "not granted" result from
  `acquireCanvasLockAction` does NOT trigger the same false-"offline" badge round 2 already
  fixed — it should read as "someone else (or no one) holds the lock," not "connection failed."
  If it currently conflates the two, that's a pre-existing UI gap worth noting in your report,
  but only fix it if it's a small, obviously-correct change; otherwise flag it rather than
  scope-creeping into a UI refactor.

- [ ] **Step 4: Add a test.** In whatever test file covers `canvas-lock.ts` actions (from round
  2's Task 2 — `src/lib/actions/canvas-lock.test.ts`), add:
```typescript
it("does not acquire the lock while impersonating read-only (returns the current lock state instead)", async () => {
  // mock resolveImpersonationState to { isImpersonating: true, elevated: false, ... }
  // mock getCanvasLock to a known "no lock held" shape, mock acquireCanvasLock as a spy
  // assert acquireCanvasLock was NOT called, and the action returned getCanvasLock's result
});
it("still acquires the lock normally when not impersonating", async () => {
  // mock resolveImpersonationState to { isImpersonating: false }
  // assert acquireCanvasLock WAS called
});
it("still acquires the lock when impersonating elevated", async () => {
  // mock resolveImpersonationState to { isImpersonating: true, elevated: true, ... }
  // assert acquireCanvasLock WAS called — elevated mode is allowed to act normally
});
```

- [ ] **Step 5: Run tests + full suite + tsc.**

Run: `npx vitest run src/lib/actions/canvas-lock.test.ts`
Then: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: pass; no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/canvas-lock.ts src/lib/actions/canvas-lock.test.ts
git commit -m "fix(actions): don't acquire the canvas edit lock while impersonating read-only (Stage 4 review round 3)"
```

---

### Task 3: Remove or guard the unauthenticated `eval-bootstrap` route (Important)

**Files:**
- Delete or modify: `src/app/api/eval-bootstrap/route.ts`

The original design spec (§4.3) explicitly named this route as needing
`assertImpersonationWriteAllowed()` alongside `copilot/actions` and `nodes/duplicate-batch` —
the other two were resolved (one gated via `withCanvas`, one found to need nothing since it
never writes); this one was never addressed in any of the three review rounds. Independent of
impersonation, it has NO authentication check at all, creates real DB rows (canvases, node
versions), and issues real OpenAI API calls — reachable by anyone with the URL, unauthenticated,
in production. Its own header comment says "DELETE THIS ROUTE after the traces are generated."

- [ ] **Step 1: Determine whether this route's one-time purpose (generating ~20 eval traces
  for the Prakriti Sattva reel scripts, per its header comment) has already been served.** Check
  `docs/evals/` for any reference to whether this route's traces were already captured (search
  for "eval-bootstrap" or "eval flywheel" in `docs/`). If there's clear evidence its job is
  done, delete the route entirely (`git rm`).

- [ ] **Step 2: If you can't confirm it's safe to delete** (its output might still be needed for
  ongoing eval work), guard it instead — add an environment check at the top of the `POST`
  handler:
```typescript
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return apiError("This route is disabled in production.", 404);
  }
  // ...existing body unchanged
```
(Import `apiError` from `@/lib/api/route-helpers` if not already imported.) This is a narrower,
faster fix than full auth — it closes the "unauthenticated production write endpoint" gap
without needing to understand the route's eval-tooling auth requirements, and matches the
route's own framing as a dev-only tool that was never meant to reach production.

- [ ] **Step 3: Whichever path taken, run the full suite + tsc.**

Run: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: no new failures (this route has no existing tests to break, per earlier rounds'
findings — confirm that's still true).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/eval-bootstrap/route.ts
git commit -m "fix(api): disable eval-bootstrap in production, or remove it if its one-time purpose is served (Stage 4 review round 3)"
```
(Adjust the commit message to match whichever path — delete vs. guard — was actually taken.)

---

## After all tasks

Re-run the final whole-branch review a fourth time. Given the pattern of this specific review
process (task-scoped review missing whole-app-wiring bugs three times running), the fourth
review should specifically re-verify: (1) Task 1's fix doesn't miss a 5th call site somewhere
that also reads `caller.orgId` for a credit/generation write (re-grep, don't just trust the 4
files named here); (2) the new source-level regression test genuinely fails if sabotaged
(quick manual check, then revert); (3) whether canvas/moodboard write paths have any equivalent
org-attribution gap this plan didn't think to check (the review should actively hunt, not just
confirm the named fixes).
