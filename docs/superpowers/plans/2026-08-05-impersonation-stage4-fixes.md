# Stage 4 Impersonation — Post-Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every gap the final whole-branch review found in the original 10-task Stage 4
plan (`2026-08-04-impersonation-stage4.md`) before that branch is merge-ready: the "view as"
read path was never wired into any page, the write-gate covers only 4 of ~26 mutating
surfaces, sign-out while impersonating causes a redirect loop, and the branch doesn't
typecheck cleanly.

**Architecture:** Two structural additions — (1) five page-level org resolutions switch from
`caller.orgId` to `resolveOrgId()`, actually activating impersonation for the first time; (2) a
new `withAction()` wrapper (mirroring the existing `withClient`/`withCanvas`/`withNode`/
`withMoodboard` pattern for API routes) becomes mandatory for every mutating server action, so
the write-gate can't be silently skipped by new code going forward — recorded as ADR D101.
Everything else is a scoped bug fix.

**Tech Stack:** Same as the original plan (Next.js 16, Supabase, TypeScript, Vitest).

## Global Constraints

- Every finding below is cited from the final review at
  `.superpowers/sdd/` review output (task ids `a0a417f23b6b7412c`) — file:line references in
  each task are the review's own, re-verify them since the codebase may have moved slightly.
- `IMPERSONATION_COOKIE_SECRET` fails closed (already correct, don't change) — every new check
  added by this plan must preserve that: an unset secret means impersonation is simply
  unavailable, never a crash.
- Design-system/shadcn rules from the original plan's Global Constraints still apply to any UI
  touched here (Task 3's banner degrade-gracefully change).
- This project's reuse rule: "two call sites = extract." `withAction()` (Task 2) is exactly
  this rule applied at 18-call-site scale.

---

### Task 1: Wire `resolveOrgId()` into the page-level org resolutions (C1 — the headline bug)

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/clients/[id]/page.tsx`
- Modify: `src/app/clients/[id]/kb/page.tsx`
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx`
- Modify: `src/app/eval/[canvasId]/page.tsx`
- Test: `src/app/page.test.tsx` (new — this repo has no existing page-level tests; see Step 3
  below for why this one is worth adding despite that)

**Interfaces:**
- Consumes: `resolveOrgId()` from `@/lib/dal` (already impersonation-aware since the original
  plan's Task 5 — this task is the first thing that actually calls it from a page).

This is the one bug that makes "view as" not work at all. Every one of these five files
currently does `const caller = await resolveCallerContext(); ...caller.orgId...` for its
org-isolation check or list-query scoping. `resolveOrgId()` already exists, already resolves to
the impersonation target when active, and already falls back to `caller.orgId` otherwise — it
was simply never plugged in anywhere a human actually navigates.

- [ ] **Step 1: Read all five files fresh (line numbers below are from the review, may have
  drifted) and identify every `caller.orgId` read used for org scoping/isolation.**

Known sites from the review (re-confirm each by reading the file):
- `src/app/page.tsx:11-13` — three `caller.orgId` args to `listClients`/`listArchivedClients`/
  `listRecentCanvases`.
- `src/app/clients/[id]/page.tsx:43` — `client.org_id !== caller.orgId` isolation check.
- `src/app/clients/[id]/kb/page.tsx:36` — same shape.
- `src/app/clients/[id]/canvases/[cid]/page.tsx:40` — same shape.
- `src/app/eval/[canvasId]/page.tsx:26` — same shape. **Judgment call:** the eval harness page
  is a dev/QA tool, not customer-facing support surface — confirm by reading it whether it
  makes sense for it to resolve the impersonation target too (consistency) or deliberately stay
  on `caller.orgId` (an operator's eval tooling shouldn't accidentally point at a customer's
  eval data). Default to consistency (`resolveOrgId()`) unless the file's own context makes a
  strong case otherwise; note whichever you pick and why in your report.

- [ ] **Step 2: Apply the swap.** In each file, add the import
  `import { resolveOrgId, resolveCallerContext } from "@/lib/dal";` (both may already be
  imported in some form — check first) and replace each org-scoping `caller.orgId` read with
  `await resolveOrgId()`. `resolveCallerContext()` may still be needed in some of these files
  for other fields (e.g. `caller.userId`) — don't remove it if so, just stop using
  `caller.orgId` specifically for the scoping/isolation check.

Example (`src/app/clients/[id]/page.tsx`), the isolation check changes from:
```typescript
const client = await getClientBySlug(id);
const caller = await resolveCallerContext();

if (!client || client.org_id !== caller.orgId) {
```
to:
```typescript
const client = await getClientBySlug(id);
const effectiveOrgId = await resolveOrgId();

if (!client || client.org_id !== effectiveOrgId) {
```
(If `caller` isn't used for anything else in that file after this change, remove the now-dead
`resolveCallerContext()` call and its import — don't leave an unused variable. Verify per-file;
`clients/[id]/page.tsx` as shown above has no other use of `caller`, so it should be removed
entirely there.)

Apply the same pattern to `src/app/page.tsx`'s three `listClients(caller.orgId)`-shaped calls
and the other two detail pages' isolation checks.

- [ ] **Step 3: Add a regression test proving this actually works.**

This repo has no page-component test harness (confirmed in the original plan's Task 9), so
don't attempt to render these Server Components in Vitest. Instead, add a focused unit test
directly against the org-resolution logic these pages now depend on, colocated with the DAL:

Create `src/lib/dal-org-resolution.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

vi.mock("@/lib/supabase/ssr-server", () => ({
  createSSRServerClient: vi.fn(async () => ({})),
}));
vi.mock("@/lib/supabase/get-user-with-retry", () => ({
  getUserWithRetry: vi.fn(async () => ({ id: "op-1", email: "op@yuvabe.com", app_metadata: { platform_role: "super_admin" } })),
}));
const membershipMock = vi.fn(async () => ({
  data: { org_id: "yuvabe-org", org_role: "owner" },
  error: null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: membershipMock }) }) }),
  })),
}));

import { encodeImpersonationCookie } from "@/lib/auth/impersonation-logic";

const SECRET = "test-secret";

describe("page-level org resolution uses resolveOrgId(), not caller.orgId", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
    membershipMock.mockResolvedValue({ data: { org_id: "yuvabe-org", org_role: "owner" }, error: null });
  });

  it("resolves the operator's own org when not impersonating", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const { resolveOrgId } = await import("@/lib/dal");
    await expect(resolveOrgId()).resolves.toBe("yuvabe-org");
  });

  it("resolves the impersonation target org when a valid session cookie is present", async () => {
    const cookie = encodeImpersonationCookie(
      {
        operatorId: "op-1",
        targetOrgId: "target-org",
        elevated: false,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      SECRET,
    );
    cookieStore.get.mockReturnValue({ value: cookie });
    const { resolveOrgId } = await import("@/lib/dal");
    await expect(resolveOrgId()).resolves.toBe("target-org");
  });
});
```

This directly tests the exact function every page now calls, proving the wiring is live — it's
the test that would have caught C1 before merge. (`vi.resetModules()` + dynamic `import()`
inside each test is needed because `resolveOrgId`/`resolveCallerContext` are wrapped in React's
`cache()`, which memoizes per-module-instance; resetting modules between tests avoids one
test's cached result leaking into the next.)

- [ ] **Step 4: Run it.**

Run: `npx vitest run src/lib/dal-org-resolution.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full suite + tsc, confirm nothing broke.**

Run: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: no new errors/failures attributable to this task (baseline note: `tsc` currently
shows pre-existing errors in 4 test files — see Task 7 of this plan, not yours to fix here).

- [ ] **Step 6: Commit.**

```bash
git add src/app/page.tsx src/app/clients/[id]/page.tsx src/app/clients/[id]/kb/page.tsx \
  src/app/clients/[id]/canvases/[cid]/page.tsx src/app/eval/[canvasId]/page.tsx \
  src/lib/dal-org-resolution.test.ts
git commit -m "fix(auth): wire resolveOrgId() into page-level org resolution (Stage 4 C1)"
```

---

### Task 2: `withAction()` wrapper + ADR entry (D101)

**Files:**
- Create: `src/lib/actions/with-action.ts`
- Test: `src/lib/actions/with-action.test.ts`
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append ADR D101)

**Interfaces:**
- Consumes: `resolveImpersonationState` from `@/lib/auth/impersonation`, `logImpersonationEvent`
  from `@/lib/db/impersonation-audit`.
- Produces: `withAction<T>(actionName: string, handler: () => Promise<T>): Promise<T>` —
  consumed by Task 3 (wraps all ~18 mutating server actions).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveImpersonationStateMock, logMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(async () => ({ isImpersonating: false }) as const),
  logMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: resolveImpersonationStateMock,
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));

import { withAction } from "./with-action";

describe("withAction", () => {
  beforeEach(() => vi.resetAllMocks());

  it("runs the handler and returns its result when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    const handler = vi.fn(async () => "result");
    await expect(withAction("testAction", handler)).resolves.toBe("result");
    expect(handler).toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it("throws before calling the handler when impersonating and not elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    const handler = vi.fn(async () => "result");
    await expect(withAction("testAction", handler)).rejects.toThrow(
      "Read-only while impersonating",
    );
    expect(handler).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it("runs the handler and logs a write_action when impersonating and elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true,
    });
    const handler = vi.fn(async () => "result");
    await expect(withAction("testAction", handler)).resolves.toBe("result");
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "org-1",
      eventType: "write_action",
      detail: { action: "testAction" },
    });
  });

  it("does not log a write_action if the handler itself throws", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true,
    });
    const handler = vi.fn(async () => { throw new Error("db error"); });
    await expect(withAction("testAction", handler)).rejects.toThrow("db error");
    expect(logMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/actions/with-action.test.ts`
Expected: FAIL — `Cannot find module './with-action'`

- [ ] **Step 3: Write the implementation**

```typescript
import "server-only";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { logImpersonationEvent } from "@/lib/db/impersonation-audit";

// Stage 4 write-gate for server actions (D101) — the action-side counterpart to
// route-helpers.ts's assertImpersonationWriteAllowed(). Server actions have no
// req.method to branch on (every action IS a write by convention), so this
// unconditionally blocks non-elevated impersonation and logs elevated writes.
// Unlike the route-helper gate, this THROWS rather than returning an error value,
// matching this codebase's existing convention of server actions throwing plain
// Errors for invalid states (see renameCanvasAction, deleteKBDocumentAction, etc).
export async function withAction<T>(
  actionName: string,
  handler: () => Promise<T>,
): Promise<T> {
  const impersonation = await resolveImpersonationState();

  if (impersonation.isImpersonating && !impersonation.elevated) {
    throw new Error(
      "Read-only while impersonating — enter elevated mode to make changes.",
    );
  }

  const result = await handler();

  if (impersonation.isImpersonating && impersonation.elevated) {
    await logImpersonationEvent({
      operatorId: impersonation.operatorId,
      targetOrgId: impersonation.targetOrgId,
      eventType: "write_action",
      detail: { action: actionName },
    });
  }

  return result;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/actions/with-action.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Append ADR D101 to the roadmap doc**

Append to `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7, after the last
existing decision (currently D100 — confirm by reading the file's tail, the number may have
moved):

```markdown
### D101 — Server actions get a mandatory `withAction()` wrapper for the Stage 4 write-gate *(recorded 2026-08-05; refines D81)*

**Decision.** Every `"use server"` mutating action calls through a new
`src/lib/actions/with-action.ts` `withAction()` wrapper, which throws before the handler runs
if the caller is impersonating without elevated mode, and audit-logs the write via
`logImpersonationEvent` on success. Mirrors the `withClient`/`withCanvas`/`withNode`/
`withMoodboard` pattern already used for API routes.

**Why.** The whole-branch review that closed out Stage 4's initial implementation found the
write-gate covered only the 4 API-route helpers — roughly 18 server actions and 5 additional
API routes had no gate at all, including the canvas editor's autosave and two destructive
delete paths. A per-call-site retrofit closes today's gap but leaves the same hole for the
next mutating action anyone adds. A mandatory wrapper, mirroring this project's existing
`apiError`/`apiOk` convention for API routes, makes the gate structurally hard to skip rather
than relying on every future PR remembering it.

**Rejected.** Leaving the gate as a per-call-site opt-in (matches the existing route-helper
pattern, less code today) — rejected because the review's own finding is that spec-time
enumeration of call sites reliably misses some, and a passive convention doesn't prevent the
next miss.

**Originated →** `2026-08-05-impersonation-stage4-fixes.md`.
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/with-action.ts src/lib/actions/with-action.test.ts \
  docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "feat(actions): add withAction() write-gate wrapper for server actions (D101)"
```

---

### Task 3: Apply `withAction()` to every mutating server action (C2)

**Files:**
- Modify: `src/lib/actions/nodes.ts`
- Modify: `src/lib/actions/canvases.ts`
- Modify: `src/lib/actions/kb.ts`
- Modify: `src/lib/actions/approval.ts`
- Modify: `src/lib/actions/eval.ts`
- Modify: `src/lib/actions/canvas-lock.ts`

**Interfaces:**
- Consumes: `withAction` from `@/lib/actions/with-action` (Task 2).

This is a mechanical wrap-the-body task, one function at a time, across 6 files and 18
functions. The transformation: change the function body from doing its work directly to
calling `return withAction("<actionName>", () => <original body as an arrow function>);` — the
action name string is just the function's own name, for the audit trail.

- [ ] **Step 1: Read each file fresh (they may have changed slightly since planning) and
  confirm the full list of mutating actions.** Known list (18 functions, confirm each still
  exists with this shape):

  `src/lib/actions/nodes.ts`: `saveCanvasNodesAction`, `saveCanvasAction`,
  `saveScriptOutputAction`, `savePromptOutputAction`

  `src/lib/actions/canvases.ts`: `createCanvasAction`, `renameCanvasAction`,
  `deleteCanvasAction`

  `src/lib/actions/kb.ts`: `patchKBFieldAction`, `saveKBOutputAction`, `markKBReadyAction`,
  `deleteKBDocumentAction`, `deleteBrandImageAction`, `startKBBuildJob`, `markStuckJobFailed`

  `src/lib/actions/approval.ts`: `setVersionApprovalAction`

  `src/lib/actions/eval.ts`: `setVersionLabelAction`

  `src/lib/actions/canvas-lock.ts`: `acquireCanvasLockAction`, `heartbeatCanvasLockAction`,
  `releaseCanvasLockAction` (NOT `getCanvasLockAction` — that's a read, leave it alone)

- [ ] **Step 2: Apply the wrap to each.** Add
  `import { withAction } from "@/lib/actions/with-action";` to each file's imports. For each
  function, wrap its existing body.

  Example — `src/lib/actions/canvases.ts`'s `renameCanvasAction`, changes from:
  ```typescript
  export async function renameCanvasAction(input: {
    canvasId: string;
    clientSlug: string;
    name: string;
  }): Promise<void> {
    const name = input.name?.trim();
    if (!name) throw new Error("Canvas needs a name");
    if (name.length > 100) throw new Error("Canvas name is too long (max 100 characters)");
    await renameCanvas(input.canvasId, name);
    revalidatePath(`/clients/${input.clientSlug}`);
  }
  ```
  to:
  ```typescript
  export async function renameCanvasAction(input: {
    canvasId: string;
    clientSlug: string;
    name: string;
  }): Promise<void> {
    return withAction("renameCanvasAction", async () => {
      const name = input.name?.trim();
      if (!name) throw new Error("Canvas needs a name");
      if (name.length > 100) throw new Error("Canvas name is too long (max 100 characters)");
      await renameCanvas(input.canvasId, name);
      revalidatePath(`/clients/${input.clientSlug}`);
    });
  }
  ```
  Apply the same shape (wrap the existing body in an `async () => { ... }` passed to
  `withAction("<functionName>", ...)`, keep the outer function's signature and return type
  exactly as-is) to all 18 functions listed in Step 1. For functions with an early-return
  validation (like `renameCanvasAction`'s name checks above), the validation stays *inside* the
  wrapped body — those checks are input validation, not something that should run before the
  impersonation gate; letting the gate run first (outside, implicitly, since it's the first
  thing `withAction` does) is correct and requires no special handling, since `withAction`
  itself checks impersonation state before ever calling the handler you pass it.

- [ ] **Step 3: Verify completeness with a grep, not just visual inspection.**

Run: `grep -rln "^export async function.*Action\b\|^export async function startKBBuildJob\|^export async function markStuckJobFailed" src/lib/actions/nodes.ts src/lib/actions/canvases.ts src/lib/actions/kb.ts src/lib/actions/approval.ts src/lib/actions/eval.ts src/lib/actions/canvas-lock.ts`

Then for each of the 18 function names from Step 1, confirm `withAction(` appears between its
`export async function` line and its closing brace (a quick per-function grep or manual read is
fine — there's no automated arity check like Task 7's `tsc` had, since `withAction` is
optional-by-type, not enforced by the type system; this is exactly the gap D101 exists to close
architecturally over time, but for *this* pass, careful manual verification is the check).

- [ ] **Step 4: Run the full suite + tsc.**

Run: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: no new failures. (This repo has no existing tests for these action files — confirm
that's still true; if you find any, make sure they still pass since `withAction` changes each
function's control flow, even though it's a no-op pass-through when not impersonating.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/nodes.ts src/lib/actions/canvases.ts src/lib/actions/kb.ts \
  src/lib/actions/approval.ts src/lib/actions/eval.ts src/lib/actions/canvas-lock.ts
git commit -m "feat(actions): gate all mutating server actions behind withAction() (D101, Stage 4 C2)"
```

---

### Task 4: Gate the 5 remaining ungated API routes (C3)

**Files:**
- Modify: `src/lib/api/route-helpers.ts` (export `assertImpersonationWriteAllowed`)
- Modify: `src/app/api/clients/[id]/kb/re-analyze/route.ts`
- Modify: `src/app/api/nodes/[id]/file/finalize/route.ts`
- Modify: `src/app/api/nodes/[id]/file/from-url/route.ts`
- Modify: `src/app/api/nodes/[id]/file/sign/route.ts`
- Delete: `src/app/api/clients/[id]/kb/field/route.ts` (confirmed dead — see Step 1)

**Interfaces:**
- Produces: `assertImpersonationWriteAllowed` becomes a named export of
  `src/lib/api/route-helpers.ts` (currently module-private) — consumed by the four modified
  routes below.

- [ ] **Step 1: Confirm `kb/field/route.ts` is genuinely unreferenced before deleting it.**

Run: `grep -rn "kb/field" src/ --include="*.ts" --include="*.tsx"`
Expected: only `src/app/api/clients/[id]/kb/field/route.ts` itself and a comment in
`src/lib/actions/kb.ts` (`patchKBFieldAction`'s doc comment says "Replaces PATCH
/api/clients/:id/kb/field" — a historical note, not a live reference). If you find an actual
fetch call to this path anywhere (a client component, another server action), STOP — don't
delete it, fall back to gating it the same way as the other four routes in this task instead,
and note the discrepancy in your report.

If confirmed dead: `git rm src/app/api/clients/[id]/kb/field/route.ts`.

- [ ] **Step 2: Export the gate function.**

In `src/lib/api/route-helpers.ts`, change:
```typescript
async function assertImpersonationWriteAllowed(req: Request): Promise<AnyResponse | null> {
```
to:
```typescript
export async function assertImpersonationWriteAllowed(req: Request): Promise<AnyResponse | null> {
```
(Read the file first to confirm the exact current text — it may differ slightly if formatting
changed.)

- [ ] **Step 3: Add the gate to each of the four remaining routes.**

Import `import { assertImpersonationWriteAllowed } from "@/lib/api/route-helpers";` (add to the
existing import line from that module if one exists) in each file, and add the check as the
first statement inside the exported `POST`/`PATCH` handler, before any other work:

```typescript
const blocked = await assertImpersonationWriteAllowed(req);
if (blocked) return blocked;
```

Apply to:
- `src/app/api/clients/[id]/kb/re-analyze/route.ts`'s `POST` — insert right after
  `await params;` (the existing first line that discards the unused clientId param).
- `src/app/api/nodes/[id]/file/finalize/route.ts`'s `POST` — insert right after
  `const { id: nodeId } = await params;`.
- `src/app/api/nodes/[id]/file/from-url/route.ts`'s `POST` — insert right after
  `const { id: nodeId } = await params;`.
- `src/app/api/nodes/[id]/file/sign/route.ts`'s `POST` — insert right after
  `const { id: nodeId } = await params;`.

- [ ] **Step 4: Run the full suite + tsc.**

Run: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: no new failures. Note: none of these four routes currently have test files (confirm
this is still true) — this task doesn't add new ones (Task 6 of this plan covers integration
coverage for the gate broadly; adding a dedicated test per route here would be four
near-identical tests of the same already-tested `assertImpersonationWriteAllowed` logic, which
Task 6's broader regression test subsumes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/route-helpers.ts \
  src/app/api/clients/[id]/kb/re-analyze/route.ts \
  src/app/api/nodes/[id]/file/finalize/route.ts \
  src/app/api/nodes/[id]/file/from-url/route.ts \
  src/app/api/nodes/[id]/file/sign/route.ts
git rm src/app/api/clients/[id]/kb/field/route.ts 2>/dev/null || true
git commit -m "fix(api): gate the remaining ungated mutating routes (Stage 4 C3)"
```

---

### Task 5: Fix the sign-out redirect loop (C4)

**Files:**
- Modify: `src/lib/actions/auth.ts`
- Modify: `src/lib/auth/impersonation.ts`
- Test: `src/lib/auth/impersonation.test.ts` (extend existing)

**Interfaces:**
- Consumes: `endImpersonation` (already exists, Task 4 of the original plan).
- Produces: a new non-redirecting caller check used internally by
  `resolveImpersonationState()` — no change to its existing exported signature.

Two independent fixes, both needed (per the review: fixing only the trigger leaves the root
cause; fixing only the root cause leaves a stale cookie orphaned across sign-out).

- [ ] **Step 1: `logoutAction` clears the impersonation cookie.**

Read `src/lib/actions/auth.ts` first (already read during planning — reproduced here for
reference, re-confirm before editing):

```typescript
export async function logoutAction(): Promise<void> {
  const supabase = await createSSRServerClient();
  await supabase.auth.signOut();
}
```

Change to:

```typescript
export async function logoutAction(): Promise<void> {
  const supabase = await createSSRServerClient();
  await supabase.auth.signOut();
  await endImpersonation();
}
```

Add the import: `import { endImpersonation } from "@/lib/auth/impersonation";`. Order matters
only cosmetically here — `endImpersonation()` operates purely on the HttpOnly cookie via
`cookies()` and doesn't depend on the Supabase session, so it's safe either side of
`signOut()`; placing it after matches "finish signing out, then clean up impersonation state."

- [ ] **Step 2: Make `resolveImpersonationState()` tolerant of no active session, instead of
  inheriting `resolveCallerContext()`'s `redirect("/login")`.**

This is the root-cause fix — Step 1 alone still leaves the banner capable of triggering the
same loop for any OTHER reason a session might be missing (expired token, cleared cookies
mid-visit while somehow still carrying a stale-but-not-yet-expired impersonation cookie, etc).

Read `src/lib/auth/impersonation.ts` first (full current content, since Step 3 of this task
extends its test file and you need the exact current shape). Currently
`resolveImpersonationState()` calls `resolveCallerContext()` for the live role re-check —
that function's contract (used correctly everywhere else in the app) is "redirect to /login if
unauthenticated," which is wrong for a passive background state check.

Add a new function to `src/lib/dal.ts` (not `impersonation.ts` — it belongs next to
`resolveCallerContext` since it's a variant of the same logic) — first read `src/lib/dal.ts`'s
current `resolveCallerContext` in full, then add immediately after it:

```typescript
// Non-redirecting variant of resolveCallerContext(), for callers that must never trigger a
// navigation as a side effect of checking who's logged in — e.g. the impersonation banner,
// which renders on every page including /login itself. Returns null instead of redirecting
// when there's no session; do not use this for anything that gates access to real data (use
// resolveCallerContext() for that — its redirect is the correct behavior everywhere else).
export const resolveCallerContextOrNull = cache(async (): Promise<CallerContext | null> => {
  const supabase = await createSSRServerClient();
  const user = await getUserWithRetry(supabase);
  if (!user) return null;

  const platformRole = mapAppMetadataToPlatformRole(user.app_metadata);
  const mustChangePassword = mapAppMetadataToMustChangePassword(user.app_metadata);

  const db = createServerSupabase();
  const { data: membership, error } = await db
    .from("org_memberships")
    .select("org_id, org_role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!membership) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    platformRole,
    orgId: membership.org_id as string,
    orgRole: membership.org_role as OrgRole,
    mustChangePassword,
  };
});
```

Then in `src/lib/auth/impersonation.ts`, change `resolveImpersonationState()`'s live-check
section from:
```typescript
const caller = await resolveCallerContext();
if (caller.userId !== payload.operatorId || caller.platformRole !== "super_admin") {
  return { isImpersonating: false };
}
```
to:
```typescript
const caller = await resolveCallerContextOrNull();
if (!caller || caller.userId !== payload.operatorId || caller.platformRole !== "super_admin") {
  return { isImpersonating: false };
}
```
Update the import from `@/lib/dal` accordingly (add `resolveCallerContextOrNull` alongside the
existing `resolveCallerContext` import, or replace it if `resolveCallerContext` is no longer
used elsewhere in this file — check before removing).

- [ ] **Step 3: Add tests for both fixes.**

In `src/lib/actions/auth.test.ts` (create if it doesn't exist — check first; if it does,
extend it):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const signOutMock = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/ssr-server", () => ({
  createSSRServerClient: vi.fn(async () => ({ auth: { signOut: signOutMock } })),
}));
const endImpersonationMock = vi.fn(async () => undefined);
vi.mock("@/lib/auth/impersonation", () => ({ endImpersonation: endImpersonationMock }));

import { logoutAction } from "./auth";

describe("logoutAction", () => {
  beforeEach(() => vi.resetAllMocks());

  it("signs out and ends any active impersonation session", async () => {
    await logoutAction();
    expect(signOutMock).toHaveBeenCalled();
    expect(endImpersonationMock).toHaveBeenCalled();
  });
});
```

In `src/lib/auth/impersonation.test.ts`, add one test to the existing
`describe("resolveImpersonationState", ...)` block (extend the file's existing mocks rather
than duplicating them — read the current file first): mock `resolveCallerContextOrNull` (update
the existing `vi.mock("@/lib/dal", ...)` to export this instead of/alongside
`resolveCallerContext`, matching whatever this file's mock currently exports) to resolve `null`,
set a valid cookie, and assert `resolveImpersonationState()` resolves to
`{ isImpersonating: false }` without throwing — proving the "no session" path no longer
propagates a redirect-shaped error.

- [ ] **Step 4: Run both test files + full suite.**

Run: `npx vitest run src/lib/actions/auth.test.ts src/lib/auth/impersonation.test.ts`
Then: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: new tests pass; no new failures elsewhere.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/auth.ts src/lib/actions/auth.test.ts src/lib/dal.ts \
  src/lib/auth/impersonation.ts src/lib/auth/impersonation.test.ts
git commit -m "fix(auth): clear impersonation cookie on logout, stop banner from redirecting (Stage 4 C4)"
```

---

### Task 6: Session-lifecycle hardening (I2, I3, I4)

**Files:**
- Modify: `src/lib/auth/impersonation.ts`
- Modify: `src/components/layout/impersonation-banner.tsx`
- Modify: `src/lib/actions/impersonation.ts`
- Modify: `src/components/layout/impersonation-banner-actions.tsx`
- Test: `src/lib/auth/impersonation.test.ts` (extend)

Three independent findings, bundled into one task since they all touch the same small cluster
of files.

- [ ] **Step 1 (I2): `startImpersonation()` ends any existing session before starting a new
  one, so re-entering never orphans an unterminated audit trail.**

Read `src/lib/auth/impersonation.ts`'s current `startImpersonation()` in full. Add a call to
end any existing session at the top, before building the new payload:
```typescript
export async function startImpersonation(targetOrgId: string): Promise<void> {
  const secret = getSecret();
  if (!secret) return;
  await endImpersonation(); // close out any prior session's audit trail first (I2)
  const caller = await resolveCallerContext();
  // ...rest unchanged
```
(`endImpersonation()` already no-ops safely if there's nothing to end — confirmed by its
existing "no-ops when there is no active impersonation session" test from the original plan.)

- [ ] **Step 2 (I4): `endImpersonation()` deletes the cookie unconditionally, even if the
  secret is unset or the payload can't be decoded — never orphan an unclearable cookie.**

Read the current implementation. Change from (roughly):
```typescript
export async function endImpersonation(): Promise<void> {
  const secret = getSecret();
  const payload = secret ? await readPayload() : null;
  if (!payload) return;
  const store = await cookies();
  store.delete(COOKIE_NAME);
  await logImpersonationEvent({ ... });
}
```
to:
```typescript
export async function endImpersonation(): Promise<void> {
  const secret = getSecret();
  const payload = secret ? await readPayload() : null;
  const store = await cookies();
  store.delete(COOKIE_NAME); // unconditional — never leave an unclearable cookie behind (I4)
  if (payload) {
    await logImpersonationEvent({
      operatorId: payload.operatorId,
      targetOrgId: payload.targetOrgId,
      eventType: "session_ended",
    });
  }
}
```
This changes the "no-ops when there is no active impersonation session" test from the original
plan's Task 4 — that test asserted `cookieStore.delete` was NOT called in that case. Update it:
the correct behavior now is that `delete` IS always called (it's harmless to delete a
non-existent cookie), but `logImpersonationEvent` is still only called when there was a real
payload. Find that test in `src/lib/auth/impersonation.test.ts` and update its assertion from
`expect(cookieStore.delete).not.toHaveBeenCalled()` to `expect(cookieStore.delete).toHaveBeenCalled()`
paired with `expect(logMock).not.toHaveBeenCalled()` (keep that second assertion — it's still
correct and is the more important guarantee).

- [ ] **Step 3 (I3): `startImpersonation()` validates the target org exists before setting the
  cookie, and the banner degrades gracefully instead of disappearing if the org is ever
  missing anyway (defense in depth for a race, not the primary guard).**

In `src/lib/auth/impersonation.ts`, `startImpersonation()` needs to check the org exists.
Import `getOrgById` from `@/lib/db/organizations` (already used elsewhere in this codebase,
e.g. the admin org-detail page). Add the check after the secret check:
```typescript
export async function startImpersonation(targetOrgId: string): Promise<void> {
  const secret = getSecret();
  if (!secret) return;
  const org = await getOrgById(targetOrgId);
  if (!org) throw new Error("Organization not found.");
  await endImpersonation();
  // ...rest unchanged
```
This means `enterImpersonationAction` (in `src/lib/actions/impersonation.ts`) can now throw.
Read that file's current `enterImpersonationAction` — since it currently has no try/catch and
just calls `startImpersonation()` then `redirect("/")`, a thrown error here will surface as an
unhandled action error to whatever calls it. Check `src/app/admin/orgs/[id]/enter-impersonation-button.tsx`
(the only caller) — it currently does `startTransition(() => enterImpersonationAction(orgId))`
with no error handling. Add minimal error handling there so a thrown "Organization not found"
doesn't produce an unhandled promise rejection in the browser console with no user-visible
feedback:
```typescript
const [error, setError] = useState<string | null>(null);
// ...
onClick={() =>
  startTransition(async () => {
    setError(null);
    try {
      await enterImpersonationAction(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enter impersonation.");
    }
  })
}
```
(Read the current file first — it's small, apply this pattern matching its existing structure
and the sibling `ImpersonationBannerActions` component's existing error-handling shape from the
original plan's Task 9, for consistency.) Render `{error && <span className="text-destructive">{error}</span>}`
near the button.

Now for the banner's degrade-gracefully behavior (defense in depth, for the case where an org
is deleted *during* an already-active session, which this new validation doesn't and can't
prevent): read `src/components/layout/impersonation-banner.tsx`'s current
`if (!org) return null;` line. Change it to render a degraded state instead of nothing:
```typescript
if (!org) {
  return (
    <div className="flex h-9 items-center justify-center gap-3 bg-muted px-4 text-sm text-foreground">
      <span>Viewing as (organization no longer exists)</span>
      <ImpersonationBannerActions orgId={state.targetOrgId} elevated={state.elevated} />
    </div>
  );
}
```
(`ImpersonationBannerActions`'s `exitImpersonationAction` takes an `orgId` only to build its
post-exit redirect target `/admin/orgs/${orgId}` — redirecting to a deleted org's admin page
will itself 404 via `requireSuperAdmin`'s existing not-found handling, which is an acceptable
terminal state; the important thing is the operator always has a working Exit button.)

- [ ] **Step 4: Extend tests.**

Add to `src/lib/auth/impersonation.test.ts`'s `describe("startImpersonation", ...)` block: a
test that `startImpersonation` throws when the target org doesn't exist (mock `getOrgById` to
return `null`), and a test that it calls `endImpersonation`-equivalent cleanup first when a
prior session exists (mock a pre-existing cookie, call `startImpersonation` again with a
different org, assert the cookie set for the new org and that a `session_ended` audit event
was logged for the old one before `session_started` for the new one — check call order via
`logMock.mock.invocationCallOrder` or by asserting on the sequence of `logMock.mock.calls`).

- [ ] **Step 5: Run all touched tests + full suite.**

Run: `npx vitest run src/lib/auth/impersonation.test.ts`
Then: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: all pass, no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/impersonation.ts src/lib/auth/impersonation.test.ts \
  src/components/layout/impersonation-banner.tsx src/lib/actions/impersonation.ts \
  src/app/admin/orgs/[id]/enter-impersonation-button.tsx
git commit -m "fix(auth): harden impersonation session lifecycle (Stage 4 I2/I3/I4)"
```

---

### Task 7: Fix the 23 pre-existing `tsc --noEmit` errors (I1)

**Files:**
- Modify: `src/lib/api/route-helpers.test.ts`
- Modify: `src/lib/auth/impersonation.test.ts`
- Modify: `src/lib/auth/impersonation-flow.test.ts`
- Modify: `src/lib/db/impersonation-audit.test.ts`

All four files are test-only; no production code changes. Four distinct, mechanical fixes.

- [ ] **Step 1: `route-helpers.test.ts` — 11 errors.**

Two sub-patterns:
1. Handler mocks return `new Response(...)` where `Promise<AnyResponse>` (i.e.
   `NextResponse<any>`) is expected. Read the file, find every
   `vi.fn(async () => new Response(...))`-shaped handler passed to `withClient`, and change
   `new Response(...)` to `NextResponse.json(...)` (import `NextResponse` from `next/server` if
   not already imported) — e.g. `new Response(null, { status: 200 })` becomes
   `NextResponse.json(null, { status: 200 })`.
2. `Type 'true' is not assignable to type 'false'` — the
   `resolveImpersonationStateMock` is declared with `as const` on a literal
   `{ isImpersonating: false }`, which locks its inferred type to exactly that shape;
   `mockResolvedValue({ isImpersonating: true, ... })` calls elsewhere in the file then fail to
   typecheck. Fix at the declaration: change
   ```typescript
   const resolveImpersonationStateMock = vi.fn(async () => ({ isImpersonating: false }) as const);
   ```
   to
   ```typescript
   const resolveImpersonationStateMock = vi.fn(async (): Promise<
     { isImpersonating: false } | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean }
   > => ({ isImpersonating: false }));
   ```
   giving the mock an explicit return type covering both branches instead of relying on
   inference from a single literal.

- [ ] **Step 2: `impersonation.test.ts` — 1 error.**

`CallerContext` literal missing required `email` field on one `mockResolvedValueOnce` call.
Read the file, find the object literal missing `email` (per the original plan's Task 4 review,
this was supposed to already be fixed — if it's still missing, add
`email: "op-1@yuvabe.com",` matching the pattern used in the file's other mock objects).

- [ ] **Step 3: `impersonation-flow.test.ts` — 3 errors.**

Same `Response` vs `NextResponse` pattern as Step 1's first sub-pattern. Find the three
`withClient(req, params, async () => new Response("ok"))`-shaped calls and change to
`NextResponse.json({ ok: true })` (import `NextResponse` from `next/server`).

- [ ] **Step 4: `impersonation-audit.test.ts` — 1 error.**

`Type '{ message: string }' is not assignable to type 'null'` — the mocked Supabase `insert`
resolves `{ error: { message: "db down" } }`, but the mock's inferred return type from an
earlier successful call locked `error` to `null`. Read the file, find the
`insertMock.mockResolvedValueOnce({ error: null })`/`insertMock = vi.fn(async () => ({ error:
null }))` declaration, and give it an explicit return type covering both shapes:
```typescript
const insertMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
```

- [ ] **Step 5: Verify.**

Run: `npx tsc --noEmit`
Expected: 0 errors, anywhere.

Run: `npx vitest run --no-file-parallelism`
Expected: same pass count as before this task (these are type-only fixes — no runtime behavior
changes, so if any test's actual result changes, that's a red flag to investigate, not commit
through).

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/route-helpers.test.ts src/lib/auth/impersonation.test.ts \
  src/lib/auth/impersonation-flow.test.ts src/lib/db/impersonation-audit.test.ts
git commit -m "fix(test): resolve all tsc --noEmit errors introduced by Stage 4 (I1)"
```

---

### Task 8: Doc sync (I6)

**Files:**
- Modify: `docs/auth-production-migration.md`

- [ ] **Step 1: Update the Stage 4 status note.**

Read the file's current final section (around the "Not covered here (by design)" heading — the
original plan's Task 1 quoted it as: *"Stage 4 (impersonation) — not yet built as of this doc's
last update (2026-07-27)."*). Replace that line with an accurate status reflecting this
branch's actual state at the time this task runs, and add the two production deployment steps
this stage needs beyond what's already documented for Stages 1-3:

```markdown
- Stage 4 (impersonation) — built on `feat/impersonation-stage4`, migration `0027_impersonation.sql`
  not yet applied to production. Before deploying Stage 4's app code: (1) apply
  `supabase/migrations/0027_impersonation.sql` via the Supabase dashboard SQL editor, same
  process as every other migration in this doc; (2) set `IMPERSONATION_COOKIE_SECRET` in
  production's environment (generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — a missing value
  fails closed, so this can technically be deployed without it, but impersonation will silently
  be unavailable until it's set).
```

- [ ] **Step 2: Commit**

```bash
git add docs/auth-production-migration.md
git commit -m "docs(auth): record Stage 4 migration + env var in the production deploy runbook"
```

---

## After all tasks: re-run the final whole-branch review

This plan closes every Critical and Important finding from the first whole-branch review
(C1-C4, I1-I6; I7's regression-test intent is satisfied by Task 1 Step 3, Task 2's own tests,
and Task 6 Step 4 — all of which now exercise page/action-level enforcement directly, the
exact gap I7 identified). Once all 8 tasks are complete and reviewed individually, dispatch a
fresh final whole-branch review (same process as the original plan) before considering this
branch merge-ready. Do not skip this — the whole point of the first one was that task-scoped
review alone missed C1.
