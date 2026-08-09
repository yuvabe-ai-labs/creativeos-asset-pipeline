# Stage 4 Impersonation — Second Post-Review Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining findings from the second whole-branch review of Stage 4
impersonation: a 20th ungated mutating action that writes to the wrong org even in read-only
mode, a false "offline" badge + audit-log flood caused by gating canvas-lock bookkeeping as if
it were tenant-data writes, and the structural gap that let both slip past a green 810-test
suite.

**Architecture:** No new structural pieces — this closes gaps in what Fix Round 1 already
built. `createClientAction` gets the same `withAction()` + `resolveOrgId()` treatment every
other mutating action got. The three canvas-lock actions get explicitly EXEMPTED from
`withAction()` (session bookkeeping, not tenant data — matching `getCanvasLockAction`'s
existing read exemption) rather than wrapped. Two new structural tests make both classes of gap
impossible to reintroduce silently.

**Tech Stack:** Same as prior plans.

## Global Constraints

- Findings cited are from the second whole-branch review (dispatched after Fix Round 1's 8
  tasks all landed and were individually approved).
- `IMPERSONATION_COOKIE_SECRET` fails closed — unchanged, don't touch.
- This project's reuse rule: "two call sites = extract" — not relevant to this small a plan,
  noted for completeness only.

---

### Task 1: Gate `createClientAction` (Critical — C2 gap)

**Files:**
- Modify: `src/lib/actions/clients.ts`
- Test: `src/lib/actions/clients.test.ts` (new)

**Interfaces:**
- Consumes: `withAction` from `@/lib/actions/with-action`, `resolveOrgId` from `@/lib/dal`.

The review found `createClientAction` (`src/lib/actions/clients.ts:7-15`) has no write-gate and
uses `caller.orgId` instead of `resolveOrgId()` — meaning an operator impersonating org B in
read-only mode can still create a client, and it silently lands in the OPERATOR's own org
(never visible in the org B client list they're looking at), with no audit trail.

- [ ] **Step 1: Read the current file in full.**

- [ ] **Step 2: Apply both fixes — the write-gate AND the org-resolution bug — in one edit.**

Change (adapt to the file's actual current shape — this is the fix's intent, not necessarily
verbatim current code):
```typescript
export async function createClientAction(input: { name: string }) {
  const caller = await resolveCallerContext();
  const client = await createClient({ name: input.name, orgId: caller.orgId });
  // ...
}
```
to:
```typescript
export async function createClientAction(input: { name: string }) {
  return withAction("createClientAction", async () => {
    const orgId = await resolveOrgId();
    const client = await createClient({ name: input.name, orgId });
    // ...rest of the original body, unchanged
  });
}
```
If the function currently also reads `caller` for something other than `orgId` (e.g.
`caller.userId`), keep `resolveCallerContext()` for that — only the org-scoping source changes
to `resolveOrgId()`, matching Fix Round 1 Task 1's pattern for pages.

- [ ] **Step 3: Add a regression test.**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveImpersonationStateMock, resolveOrgIdMock, logMock, createClientMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(async () => ({ isImpersonating: false }) as const),
  resolveOrgIdMock: vi.fn(async () => "yuvabe-org"),
  logMock: vi.fn(async () => undefined),
  createClientMock: vi.fn(async (args: { name: string; orgId: string }) => ({ id: "client-1", ...args })),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: resolveImpersonationStateMock }));
vi.mock("@/lib/dal", () => ({ resolveOrgId: resolveOrgIdMock }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));
vi.mock("@/lib/db/clients", () => ({ createClient: createClientMock }));

import { createClientAction } from "./clients";

describe("createClientAction", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates the client under the effective org (resolveOrgId), not a hardcoded caller org", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    resolveOrgIdMock.mockResolvedValue("target-org");
    createClientMock.mockResolvedValue({ id: "client-1", name: "Acme", orgId: "target-org" });
    await createClientAction({ name: "Acme" });
    expect(createClientMock).toHaveBeenCalledWith(expect.objectContaining({ orgId: "target-org" }));
  });

  it("blocks the write while impersonating non-elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "target-org", elevated: false,
    });
    await expect(createClientAction({ name: "Acme" })).rejects.toThrow("Read-only while impersonating");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("allows the write and logs it while impersonating elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "target-org", elevated: true,
    });
    resolveOrgIdMock.mockResolvedValue("target-org");
    await createClientAction({ name: "Acme" });
    expect(createClientMock).toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ eventType: "write_action" }));
  });
});
```
(Adjust the mock shape for `createClient`'s actual signature/module path — read
`src/lib/db/clients.ts` first to confirm.)

- [ ] **Step 4: Run the test, then the full suite + tsc.**

Run: `npx vitest run src/lib/actions/clients.test.ts`
Then: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: new tests pass; no new failures elsewhere.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/clients.ts src/lib/actions/clients.test.ts
git commit -m "fix(actions): gate createClientAction and fix its org resolution (Stage 4 review round 2)"
```

---

### Task 2: Exempt canvas-lock actions from the write-gate (Important)

**Files:**
- Modify: `src/lib/actions/canvas-lock.ts`
- Test: `src/lib/actions/canvas-lock.test.ts` (new, if none exists — check first)

**Interfaces:**
- Removes the `withAction` wrapping Fix Round 1 Task 3 added to
  `acquireCanvasLockAction`/`heartbeatCanvasLockAction`/`releaseCanvasLockAction`.

The review found that wrapping canvas-lock actions in `withAction()` was over-broad: they're
per-editor-session bookkeeping (who currently holds the edit lock), not tenant business data.
Two concrete breakages: (a) `acquireCanvasLockAction` now throws while impersonating
non-elevated, and the calling hook (`use-canvas-lock.ts`) catches that and flips the connection
badge to "offline" — so simply OPENING a canvas while impersonating read-only (the feature's
primary flow) shows a false disconnected state; (b) `heartbeatCanvasLockAction` fires every 15
seconds and, while elevated, logs a `write_action` audit row every time — 240/hour per open
canvas, drowning out the real audit trail D81 exists to capture.

- [ ] **Step 1: Read the current `src/lib/actions/canvas-lock.ts` in full** (Fix Round 1 Task 3
  wrapped 3 of its 4 functions in `withAction`).

- [ ] **Step 2: Remove the `withAction` wrapping from all three, restoring their original
  direct-call bodies** (same shape as `getCanvasLockAction`, which was never wrapped). Keep the
  `withAction` import removed if nothing else in the file uses it.

- [ ] **Step 3: Add a one-line comment explaining the exemption**, next to the functions or at
  the top of the file:
```typescript
// Lock actions are per-editor-session bookkeeping (who currently holds the edit lock),
// not tenant business data — deliberately NOT gated by withAction() (Stage 4). Gating
// acquireCanvasLockAction would throw on every canvas open while impersonating
// read-only, breaking the primary "just look around" flow; gating the 15s heartbeat
// would flood the audit trail. See docs/superpowers/plans/2026-08-09-impersonation-stage4-fixes-2.md.
```

- [ ] **Step 4: Extend ADR D101 with a one-line amendment** noting this explicit exclusion, so
  a future reader doesn't mistake it for drift. Read
  `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`'s D101 entry (appended by
  Fix Round 1 Task 2) and append a short paragraph after its existing "Why"/"Rejected" text
  (don't create a whole new decision number for an amendment to an existing one — just extend
  D101's own text):
```markdown
**Amendment (2026-08-09):** Canvas-lock bookkeeping actions
(`acquireCanvasLockAction`/`heartbeatCanvasLockAction`/`releaseCanvasLockAction` in
`canvas-lock.ts`) are explicitly exempt from `withAction()` — they're per-editor-session state,
not tenant data, and gating the 15s heartbeat would flood the audit trail while gating lock
acquisition would break read-only impersonation's primary "browse a canvas" flow. Matches
`getCanvasLockAction`'s existing read exemption.
```

- [ ] **Step 5: Add/extend tests confirming the exemption is intentional and stays that way.**

If `src/lib/actions/canvas-lock.test.ts` doesn't exist, create it:
```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const acquireMock = vi.fn(async () => ({ granted: true }));
vi.mock("@/lib/db/canvas-lock", () => ({
  acquireCanvasLock: acquireMock,
  heartbeatCanvasLock: vi.fn(async () => undefined),
  releaseCanvasLock: vi.fn(async () => undefined),
  getCanvasLock: vi.fn(async () => null),
}));

import { acquireCanvasLockAction } from "./canvas-lock";

describe("acquireCanvasLockAction", () => {
  it("is not gated by impersonation state — no @/lib/auth/impersonation import needed to call it", async () => {
    // No resolveImpersonationState mock is registered at all; if this action were
    // wrapped in withAction(), calling it would throw "Cannot find module" or a
    // resolution error for the unmocked import, since withAction() imports
    // resolveImpersonationState internally. Success here proves the exemption holds.
    await expect(acquireCanvasLockAction("canvas-1", "session-1", "Op")).resolves.toEqual({ granted: true });
  });
});
```

- [ ] **Step 6: Run tests + full suite + tsc.**

Run: `npx vitest run src/lib/actions/canvas-lock.test.ts`
Then: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: pass; no new failures.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/canvas-lock.ts src/lib/actions/canvas-lock.test.ts \
  docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "fix(actions): exempt canvas-lock bookkeeping from withAction() (Stage 4 review round 2)"
```

---

### Task 3: Structural regression tests closing the I7 gap for real

**Files:**
- Test: `src/lib/actions/with-action-coverage.test.ts` (new)
- Test: `src/lib/dal-org-resolution.test.ts` (extend — created in Fix Round 1 Task 1)

**Interfaces:**
- None new — these are pure test-suite additions that read the codebase's own source files.

The review's core observation: Task 1 and 2's unit tests each proved their own piece works in
isolation, but neither would fail if the WIRING were removed (a page reverted to
`caller.orgId`, or a new action shipped unwrapped) — which is exactly the shape of bug that let
C1 and this round's `createClientAction` gap both hide behind a fully green suite. This task
adds two tests that read source files directly and would fail if that wiring regresses,
independent of any specific function's unit-level correctness.

- [ ] **Step 1: Write the action-coverage test.**

Create `src/lib/actions/with-action-coverage.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Enumerates every exported `*Action` function across src/lib/actions/*.ts and asserts
// each is either wrapped in withAction(...) or explicitly allowlisted below with a
// stated reason. This is the test that makes D101 an enforced invariant instead of a
// convention someone has to remember — it fails the moment a new mutating action ships
// unwrapped, which is exactly the class of bug (createClientAction, Stage 4 review
// round 2) that a green test suite full of unit tests didn't catch.
const ACTIONS_DIR = join(__dirname);

// Functions deliberately NOT gated, with the reason — extend this list only with a
// one-line justification, the same way canvas-lock.ts's own file comment explains it.
const ALLOWLIST: Record<string, string> = {
  getCanvasLockAction: "read, not a write",
  acquireCanvasLockAction: "per-editor-session bookkeeping, not tenant data (D101 amendment)",
  heartbeatCanvasLockAction: "per-editor-session bookkeeping, not tenant data (D101 amendment)",
  releaseCanvasLockAction: "per-editor-session bookkeeping, not tenant data (D101 amendment)",
  loginAction: "runs before any session/impersonation state exists",
  logoutAction: "runs after signOut(); also directly calls endImpersonation() itself",
  enterImpersonationAction: "impersonation session-control, not tenant data",
  enterElevatedModeAction: "impersonation session-control, not tenant data",
  exitImpersonationAction: "impersonation session-control, not tenant data",
};

function findActionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && e.name !== "with-action.ts")
    .map((e) => join(dir, e.name));
}

function extractExportedActionFunctions(source: string): { name: string; body: string }[] {
  const results: { name: string; body: string }[] = [];
  const re = /export async function (\w*Action\w*|startKBBuildJob|markStuckJobFailed)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const name = match[1];
    // Grab a generous slice of the function body for a `withAction(` substring check —
    // not a full parser, but sufficient for this file's straightforward function shapes.
    const start = match.index;
    const slice = source.slice(start, start + 2000);
    results.push({ name, body: slice });
  }
  return results;
}

describe("every mutating server action is gated by withAction() or explicitly allowlisted", () => {
  const files = findActionFiles(ACTIONS_DIR);
  expect(files.length).toBeGreaterThan(0); // sanity: the glob itself didn't silently match nothing

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const actions = extractExportedActionFunctions(source);

    for (const { name, body } of actions) {
      it(`${name} (${file.split(/[\\/]/).pop()}) is wrapped in withAction() or allowlisted`, () => {
        const isWrapped = body.includes("withAction(");
        const isAllowlisted = name in ALLOWLIST;
        expect(
          isWrapped || isAllowlisted,
          `${name} is neither wrapped in withAction() nor in the ALLOWLIST — ` +
            `either wrap it, or add it to ALLOWLIST with a one-line reason.`,
        ).toBe(true);
      });
    }
  }
});
```

- [ ] **Step 2: Run it against the CURRENT codebase and fix any real gap it finds.**

Run: `npx vitest run src/lib/actions/with-action-coverage.test.ts`
This should pass cleanly now that Task 1 and Task 2 of this plan have landed — if it finds
another ungated, non-allowlisted action, that's a real gap: go gate it (same `withAction()`
pattern as Fix Round 1 Task 3) before proceeding, don't just add it to the allowlist to make
the test pass.

- [ ] **Step 3: Extend the page org-resolution coverage test.**

Read the current `src/lib/dal-org-resolution.test.ts` (from Fix Round 1 Task 1). Add a second
`describe` block, source-grep style, matching the action-coverage test's approach:
```typescript
describe("every org-scoped page resolves its org via resolveOrgId(), not caller.orgId", () => {
  const pageFiles = [
    "src/app/page.tsx",
    "src/app/clients/[id]/page.tsx",
    "src/app/clients/[id]/kb/page.tsx",
    "src/app/clients/[id]/canvases/[cid]/page.tsx",
    "src/app/eval/[canvasId]/page.tsx",
  ];

  for (const relPath of pageFiles) {
    it(`${relPath} calls resolveOrgId(), not caller.orgId, for org scoping`, () => {
      const source = readFileSync(join(process.cwd(), relPath), "utf8");
      expect(source).toContain("resolveOrgId()");
      // A page using caller.orgId for org-scoping (not some other field) is exactly
      // the C1 regression — this substring check is deliberately blunt, matching the
      // action-coverage test's own philosophy: cheap, source-level, and it fails loudly
      // the moment the wiring reverts, regardless of whether resolveOrgId() itself
      // still works correctly in isolation.
      expect(source).not.toMatch(/caller\.orgId/);
    });
  }
});
```
(Add the needed `readFileSync`/`join` imports from `node:fs`/`node:path` at the top of the
file if not already present.)

- [ ] **Step 4: Run both new/extended test files, then the full suite + tsc.**

Run: `npx vitest run src/lib/actions/with-action-coverage.test.ts src/lib/dal-org-resolution.test.ts`
Then: `npx tsc --noEmit && npx vitest run --no-file-parallelism`
Expected: all pass; no new failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/with-action-coverage.test.ts src/lib/dal-org-resolution.test.ts
git commit -m "test(actions): add structural regression tests closing the I7 wiring gap"
```

---

## After all tasks

Re-run the final whole-branch review a third time. Given the second review's remaining Minor
items (pre-existing org-isolation gaps on 4 file/KB routes, the unauthenticated `eval-bootstrap`
route, copilot routes with no org check, test-suite parallelism flakiness, the degraded-banner
exit redirect target) are pre-existing, out-of-scope, or truly cosmetic per that review's own
assessment, this round doesn't need to re-litigate them — but the third review should confirm
Critical finding #1 (`createClientAction`) and both Important findings (#2/#3, canvas-lock) are
genuinely closed, and that the two new structural tests actually fail if you temporarily revert
one of the fixes (a quick manual sanity check worth doing once, not something to automate).
