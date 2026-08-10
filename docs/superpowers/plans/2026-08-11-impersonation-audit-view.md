# Impersonation Audit View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/admin/orgs/[id]` a "Support activity" tab that answers "what did a support operator actually do inside this org?" — sessions, not rows; generations legible; autosave noise counted rather than listed.

**Architecture:** All classification and grouping lives in one pure module (`impersonation-audit-view.ts`) so it is testable under this repo's node-environment vitest setup. The DB layer returns raw rows; a thin composer joins them through the pure module. The UI is a paginated list of session cards, mirroring `GenerationsTable`'s established server-first-page + API-route-for-the-rest pattern.

**Tech Stack:** Next.js App Router (RSC + route handlers), React 19, Tailwind v4, Base UI via shadcn (`render` prop, never `asChild`), Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-08-11-impersonation-audit-view-design.md`
**ADR:** D141 (`2026-05-30-creativeos-staging-roadmap.md` §7)

## Global Constraints

- **Controls must be shadcn primitives** from `src/components/ui/*`. Never a raw `<button>`. Base UI composes via `render`, never `asChild`.
- **Reuse, don't redefine.** `initials` → `@/lib/format/initials`. `cn` → `@/lib/utils`. `formatRelativeTime` → `@/lib/format/relative-time`. `Pagination` → `@/components/ui/pagination`. `apiOk`/`withTryCatch` → `@/lib/api/route-helpers`.
- **Design system:** Clash Display (`font-display`) for headings, Gilroy default. Purple used sparingly, **never a large fill**. Yellow `#ffca2d` only as a soft ~10% tint, reused from D139's banner to mark sessions where editing was enabled. `.text-eyebrow` for tracked small-caps. Cards: white, 1px `neutral-200`, `shadow-card`. Motion: `cubic-bezier(0.22,1,0.36,1)` only, 200ms — no springs.
- **Icons:** Lucide only, `strokeWidth={1.5}`.
- **Never list autosaves individually** — counting them is the entire point (spec §1).
- **The unmapped fallback must stay visible** (`METHOD /path`). A gated route added later must appear in the trail, never vanish (spec §4.2).
- **No migration, no new columns, no change to the write path** (spec §2).
- **Testing convention:** `vitest.config.ts` is `environment: "node"` with no `@testing-library/react`. Do **not** add a DOM test stack. Test pure functions; verify rendering by hand.
- Run one file with `npx vitest run <path> --testTimeout=30000`. The full suite is flaky on slow filesystems at the default 5s timeout — always pass `--testTimeout=30000`.

---

### Task 1: Classify a single audit row

The `detail` jsonb has exactly two shapes in the wild: `{ action }` from `withAction`, and `{ method, path }` from `assertImpersonationWriteAllowed`.

**Files:**
- Create: `src/lib/auth/impersonation-audit-view.ts`
- Create: `src/lib/auth/impersonation-audit-view.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `@/lib/auth/impersonation-audit-view`:
  - `type WriteClassification = { kind: "quiet" } | { kind: "generate"; nodeId: string } | { kind: "action"; label: string }`
  - `classifyWriteAction(detail: Record<string, unknown> | null): WriteClassification`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/impersonation-audit-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyWriteAction } from "./impersonation-audit-view";

describe("classifyWriteAction", () => {
  it("treats autosaves as quiet — the flood this whole view exists to suppress", () => {
    expect(classifyWriteAction({ action: "saveCanvasAction" })).toEqual({ kind: "quiet" });
    expect(classifyWriteAction({ action: "saveCanvasNodesAction" })).toEqual({ kind: "quiet" });
  });

  it("treats upload signing handshakes and compute-only POSTs as quiet", () => {
    for (const path of [
      "/api/nodes/abc/file/sign",
      "/api/clients/abc/logo/sign",
      "/api/nodes/abc/cost",
      "/api/nodes/abc/compile-preview",
      "/api/nodes/abc/upstream-images",
    ]) {
      expect(classifyWriteAction({ method: "POST", path })).toEqual({ kind: "quiet" });
    }
  });

  it("gives known server actions a human label", () => {
    expect(classifyWriteAction({ action: "deleteCanvasAction" })).toEqual({
      kind: "action",
      label: "Deleted a canvas",
    });
    expect(classifyWriteAction({ action: "setVersionLabelAction" })).toEqual({
      kind: "action",
      label: "Labelled a version",
    });
  });

  it("extracts the node id from a generate path so it can be matched exactly", () => {
    const nodeId = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(classifyWriteAction({ method: "POST", path: `/api/nodes/${nodeId}/generate` })).toEqual({
      kind: "generate",
      nodeId,
    });
    expect(
      classifyWriteAction({ method: "POST", path: `/api/nodes/${nodeId}/video-generate` }),
    ).toEqual({ kind: "generate", nodeId });
  });

  it("labels deletes by the resource they target", () => {
    expect(
      classifyWriteAction({ method: "DELETE", path: "/api/moodboards/m1/items/i1" }),
    ).toEqual({ kind: "action", label: "Deleted a moodboard item" });
    expect(
      classifyWriteAction({ method: "DELETE", path: "/api/clients/c1/kb/documents" }),
    ).toEqual({ kind: "action", label: "Deleted a knowledge-base document" });
  });

  it("labels known route families", () => {
    expect(
      classifyWriteAction({ method: "POST", path: "/api/nodes/n1/file/finalize" }),
    ).toEqual({ kind: "action", label: "Uploaded a file" });
    expect(
      classifyWriteAction({ method: "POST", path: "/api/clients/c1/kb/re-extract" }),
    ).toEqual({ kind: "action", label: "Re-ran knowledge-base extraction" });
  });

  // The audit guarantee: a route nobody mapped must still SHOW UP.
  it("falls back to a visible METHOD /path for anything unmapped", () => {
    expect(
      classifyWriteAction({ method: "PATCH", path: "/api/clients/c1/something-new" }),
    ).toEqual({ kind: "action", label: "PATCH /api/clients/c1/something-new" });
  });

  it("never throws on a malformed or missing detail", () => {
    expect(classifyWriteAction(null)).toEqual({ kind: "action", label: "Unknown action" });
    expect(classifyWriteAction({})).toEqual({ kind: "action", label: "Unknown action" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth/impersonation-audit-view.test.ts --testTimeout=30000`
Expected: FAIL — cannot resolve `./impersonation-audit-view`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/impersonation-audit-view.ts`:

```ts
// Pure read-side interpretation of impersonation_audit_log (D141). No DB, no React, so
// it is unit-testable under this repo's node-environment vitest setup.
//
// `detail` has exactly two shapes in the wild:
//   { action: "deleteCanvasAction" }        — from withAction (server actions)
//   { method: "POST", path: "/api/..." }    — from assertImpersonationWriteAllowed (routes)

export type WriteClassification =
  | { kind: "quiet" }
  | { kind: "generate"; nodeId: string }
  | { kind: "action"; label: string };

// High-frequency plumbing that carries no operator intent. Counted, never listed —
// suppressing this is the entire reason the view is legible.
const QUIET_ACTIONS = new Set(["saveCanvasAction", "saveCanvasNodesAction"]);

const QUIET_PATH_SUFFIXES = ["/sign", "/cost", "/compile-preview", "/upstream-images"];

const ACTION_LABELS: Record<string, string> = {
  createCanvasAction: "Created a canvas",
  deleteCanvasAction: "Deleted a canvas",
  renameCanvasAction: "Renamed a canvas",
  createClientAction: "Created a client",
  deleteKBDocumentAction: "Deleted a knowledge-base document",
  deleteBrandImageAction: "Deleted a brand image",
  patchKBFieldAction: "Edited the knowledge base",
  saveKBOutputAction: "Edited the knowledge base",
  startKBBuildJob: "Started a knowledge-base build",
  markKBReadyAction: "Completed a knowledge-base build",
  savePromptOutputAction: "Edited a prompt's output",
  saveScriptOutputAction: "Edited a script's output",
  setVersionApprovalAction: "Changed a version's approval",
  setVersionLabelAction: "Labelled a version",
  markStuckJobFailed: "Marked a stuck job failed",
};

// The node uuid in the path is what makes exact correlation with generations.node_id
// possible — no timestamp fuzzing (spec §4.1).
const GENERATE_PATH =
  /\/api\/nodes\/([0-9a-fA-F-]{36})\/(generate|image-generate|video-generate|video-prompt|compose)$/;

// Ordered specific → general; first match wins.
const PATH_LABELS: Array<[RegExp, string]> = [
  [/\/finalize$/, "Uploaded a file"],
  [/\/kb\/re-(analyze|extract)$/, "Re-ran knowledge-base extraction"],
  [/\/restore-version$/, "Restored a version"],
  [/\/duplicate(-batch)?$/, "Duplicated a node"],
  [/\/parse$/, "Parsed a document"],
  [/\/file\/drive$/, "Imported a file from Drive"],
  [/\/file\/from-url$/, "Imported a file from a URL"],
  [/\/versions$/, "Created a version"],
  [/\/website-url$/, "Set the client's website"],
  [/\/drive-folder$/, "Linked a Drive folder"],
];

function resourceNoun(path: string): string {
  if (path.includes("/moodboards")) return "a moodboard item";
  if (path.includes("/brand-kit/assets")) return "a brand asset";
  if (path.includes("/kb/documents")) return "a knowledge-base document";
  if (path.includes("/kb/images")) return "a knowledge-base image";
  if (path.includes("/nodes/")) return "a node";
  if (path.includes("/clients/")) return "a client";
  return "a resource";
}

export function classifyWriteAction(
  detail: Record<string, unknown> | null,
): WriteClassification {
  const action = typeof detail?.action === "string" ? detail.action : null;
  if (action) {
    if (QUIET_ACTIONS.has(action)) return { kind: "quiet" };
    // An unmapped action still shows, using its own name — never silently dropped.
    return { kind: "action", label: ACTION_LABELS[action] ?? action };
  }

  const path = typeof detail?.path === "string" ? detail.path : null;
  const method = typeof detail?.method === "string" ? detail.method : null;
  if (!path || !method) return { kind: "action", label: "Unknown action" };

  const generate = GENERATE_PATH.exec(path);
  if (generate) return { kind: "generate", nodeId: generate[1] };

  if (QUIET_PATH_SUFFIXES.some((s) => path.endsWith(s))) return { kind: "quiet" };

  if (method.toUpperCase() === "DELETE") {
    return { kind: "action", label: `Deleted ${resourceNoun(path)}` };
  }

  for (const [pattern, label] of PATH_LABELS) {
    if (pattern.test(path)) return { kind: "action", label };
  }

  // The audit guarantee: anything unmapped is still visible, verbatim.
  return { kind: "action", label: `${method} ${path}` };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/auth/impersonation-audit-view.test.ts --testTimeout=30000`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/impersonation-audit-view.ts src/lib/auth/impersonation-audit-view.test.ts
git commit -m "feat(audit): classify impersonation write_action rows"
```

---

### Task 2: Group rows into sessions

**Files:**
- Modify: `src/lib/auth/impersonation-audit-view.ts` (append)
- Modify: `src/lib/auth/impersonation-audit-view.test.ts` (append)

**Interfaces:**
- Consumes: `classifyWriteAction` (Task 1).
- Produces, from `@/lib/auth/impersonation-audit-view`:

```ts
type AuditEventRow = {
  id: string;
  operator_id: string;
  event_type: "session_started" | "elevated_mode_entered" | "write_action" | "session_ended";
  detail: Record<string, unknown> | null;
  occurred_at: string;
};

type GenerationRow = {
  node_id: string;
  type: string;
  model_used: string | null;
  status: string;
  credits_consumed: number | null;
  user_id: string | null;
  created_at: string;
};

type SessionEntry =
  | { kind: "elevated"; at: string }
  | { kind: "generation"; at: string; genType: string; model: string | null;
      status: string; credits: number | null }
  | { kind: "action"; at: string; label: string };

type ImpersonationSession = {
  id: string; operatorId: string; operatorName: string;
  startedAt: string; endedAt: string | null; elevated: boolean;
  entries: SessionEntry[]; quietCount: number;
};

groupIntoSessions(
  events: AuditEventRow[],
  generations: GenerationRow[],
  nameByUserId: Record<string, string>,
): ImpersonationSession[]
```

Returned newest-first.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/auth/impersonation-audit-view.test.ts`:

```ts
import { groupIntoSessions } from "./impersonation-audit-view";

const NODE = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OP = "op-1";
const NAMES = { [OP]: "Adarsh" };

function ev(
  event_type: string,
  occurred_at: string,
  detail: Record<string, unknown> | null = null,
  operator_id = OP,
) {
  return { id: `${event_type}-${occurred_at}`, operator_id, event_type, detail, occurred_at } as never;
}

describe("groupIntoSessions", () => {
  it("groups a complete session in order and names the operator", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("elevated_mode_entered", "2026-08-11T00:14:00Z"),
        ev("write_action", "2026-08-11T00:31:00Z", { action: "deleteCanvasAction" }),
        ev("session_ended", "2026-08-11T00:48:00Z"),
      ],
      [],
      NAMES,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].operatorName).toBe("Adarsh");
    expect(sessions[0].elevated).toBe(true);
    expect(sessions[0].endedAt).toBe("2026-08-11T00:48:00Z");
    expect(sessions[0].entries.map((e) => e.kind)).toEqual(["elevated", "action"]);
  });

  it("returns an unterminated session as still active rather than dropping it", () => {
    const sessions = groupIntoSessions(
      [ev("session_started", "2026-08-11T00:12:00Z")],
      [],
      NAMES,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].endedAt).toBeNull();
  });

  it("collapses autosaves into quietCount and lists none of them", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("write_action", "2026-08-11T00:13:00Z", { action: "saveCanvasAction" }),
        ev("write_action", "2026-08-11T00:14:00Z", { action: "saveCanvasAction" }),
        ev("write_action", "2026-08-11T00:15:00Z", { action: "saveCanvasAction" }),
      ],
      [],
      NAMES,
    );
    expect(sessions[0].quietCount).toBe(3);
    expect(sessions[0].entries).toHaveLength(0);
  });

  it("replaces a generate row with the matching generation, by node id", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("write_action", "2026-08-11T00:19:00Z", {
          method: "POST",
          path: `/api/nodes/${NODE}/generate`,
        }),
      ],
      [
        {
          node_id: NODE,
          type: "image",
          model_used: "kling-o1",
          status: "succeeded",
          credits_consumed: 4,
          user_id: OP,
          created_at: "2026-08-11T00:19:02Z",
        },
      ],
      NAMES,
    );
    expect(sessions[0].entries).toEqual([
      {
        kind: "generation",
        at: "2026-08-11T00:19:02Z",
        genType: "image",
        model: "kling-o1",
        status: "succeeded",
        credits: 4,
      },
    ]);
  });

  // A generation that failed before its row was inserted must not vanish.
  it("keeps an unmatched generate row as an attempt", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("write_action", "2026-08-11T00:19:00Z", {
          method: "POST",
          path: `/api/nodes/${NODE}/generate`,
        }),
      ],
      [],
      NAMES,
    );
    expect(sessions[0].entries).toEqual([
      { kind: "action", at: "2026-08-11T00:19:00Z", label: "Attempted a generation" },
    ]);
  });

  it("does not claim a generation made by a different operator", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("write_action", "2026-08-11T00:19:00Z", {
          method: "POST",
          path: `/api/nodes/${NODE}/generate`,
        }),
      ],
      [
        {
          node_id: NODE,
          type: "image",
          model_used: "kling-o1",
          status: "succeeded",
          credits_consumed: 4,
          user_id: "someone-else",
          created_at: "2026-08-11T00:19:02Z",
        },
      ],
      NAMES,
    );
    expect(sessions[0].entries[0]).toMatchObject({ label: "Attempted a generation" });
  });

  it("matches two generations on the same node to their own rows, in order", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("write_action", "2026-08-11T00:19:00Z", {
          method: "POST",
          path: `/api/nodes/${NODE}/generate`,
        }),
        ev("write_action", "2026-08-11T00:25:00Z", {
          method: "POST",
          path: `/api/nodes/${NODE}/generate`,
        }),
      ],
      [
        { node_id: NODE, type: "image", model_used: "a", status: "succeeded",
          credits_consumed: 1, user_id: OP, created_at: "2026-08-11T00:19:02Z" },
        { node_id: NODE, type: "image", model_used: "b", status: "failed",
          credits_consumed: null, user_id: OP, created_at: "2026-08-11T00:25:03Z" },
      ],
      NAMES,
    );
    expect(sessions[0].entries.map((e) => (e as { model: string }).model)).toEqual(["a", "b"]);
  });

  it("discards events that precede the first session_started", () => {
    const sessions = groupIntoSessions(
      [
        ev("write_action", "2026-08-11T00:01:00Z", { action: "deleteCanvasAction" }),
        ev("session_started", "2026-08-11T00:12:00Z"),
      ],
      [],
      NAMES,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].entries).toHaveLength(0);
  });

  it("returns sessions newest-first", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-10T10:00:00Z"),
        ev("session_ended", "2026-08-10T10:30:00Z"),
        ev("session_started", "2026-08-11T10:00:00Z"),
      ],
      [],
      NAMES,
    );
    expect(sessions.map((s) => s.startedAt)).toEqual([
      "2026-08-11T10:00:00Z",
      "2026-08-10T10:00:00Z",
    ]);
  });

  it("falls back to a placeholder when the operator has no profile row", () => {
    const sessions = groupIntoSessions([ev("session_started", "2026-08-11T00:12:00Z")], [], {});
    expect(sessions[0].operatorName).toBe("Unknown operator");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth/impersonation-audit-view.test.ts --testTimeout=30000`
Expected: FAIL — `groupIntoSessions` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/auth/impersonation-audit-view.ts`:

```ts
export type AuditEventType =
  | "session_started"
  | "elevated_mode_entered"
  | "write_action"
  | "session_ended";

export type AuditEventRow = {
  id: string;
  operator_id: string;
  event_type: AuditEventType;
  detail: Record<string, unknown> | null;
  occurred_at: string;
};

export type GenerationRow = {
  node_id: string;
  type: string;
  model_used: string | null;
  status: string;
  credits_consumed: number | null;
  user_id: string | null;
  created_at: string;
};

export type SessionEntry =
  | { kind: "elevated"; at: string }
  | {
      kind: "generation";
      at: string;
      genType: string;
      model: string | null;
      status: string;
      credits: number | null;
    }
  | { kind: "action"; at: string; label: string };

export type ImpersonationSession = {
  id: string;
  operatorId: string;
  operatorName: string;
  startedAt: string;
  endedAt: string | null;
  elevated: boolean;
  entries: SessionEntry[];
  quietCount: number;
};

export function groupIntoSessions(
  events: AuditEventRow[],
  generations: GenerationRow[],
  nameByUserId: Record<string, string>,
): ImpersonationSession[] {
  const ordered = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  // Consumed as they are matched, so two generations on the SAME node during one session
  // map to their own rows in order rather than both claiming the first.
  const unconsumed = [...generations].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const sessions: ImpersonationSession[] = [];
  let open: ImpersonationSession | null = null;

  for (const event of ordered) {
    if (event.event_type === "session_started") {
      open = {
        id: event.id,
        operatorId: event.operator_id,
        operatorName: nameByUserId[event.operator_id] ?? "Unknown operator",
        startedAt: event.occurred_at,
        endedAt: null,
        elevated: false,
        entries: [],
        quietCount: 0,
      };
      sessions.push(open);
      continue;
    }

    // Only possible when the page's window truncates mid-session. Synthesising a session
    // for these would invent a start time we do not have.
    if (!open) continue;

    if (event.event_type === "session_ended") {
      open.endedAt = event.occurred_at;
      open = null;
      continue;
    }

    if (event.event_type === "elevated_mode_entered") {
      open.elevated = true;
      open.entries.push({ kind: "elevated", at: event.occurred_at });
      continue;
    }

    const classification = classifyWriteAction(event.detail);

    if (classification.kind === "quiet") {
      open.quietCount += 1;
      continue;
    }

    if (classification.kind === "action") {
      open.entries.push({ kind: "action", at: event.occurred_at, label: classification.label });
      continue;
    }

    // kind === "generate": match exactly on node id, by the same operator, at or after
    // the audit row (the gate logs before the handler runs, so the generation follows).
    const index = unconsumed.findIndex(
      (g) =>
        g.node_id === classification.nodeId &&
        g.user_id === event.operator_id &&
        g.created_at >= event.occurred_at,
    );

    if (index === -1) {
      // No generations row — the generation failed before it was inserted. Keeping this
      // is the whole reason correlation is not a path blacklist.
      open.entries.push({
        kind: "action",
        at: event.occurred_at,
        label: "Attempted a generation",
      });
      continue;
    }

    const [generation] = unconsumed.splice(index, 1);
    open.entries.push({
      kind: "generation",
      at: generation.created_at,
      genType: generation.type,
      model: generation.model_used,
      status: generation.status,
      credits: generation.credits_consumed,
    });
  }

  return sessions.reverse(); // newest first
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/auth/impersonation-audit-view.test.ts --testTimeout=30000`
Expected: PASS, 18 tests (8 from Task 1 + 10 here).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/impersonation-audit-view.ts src/lib/auth/impersonation-audit-view.test.ts
git commit -m "feat(audit): group impersonation events into sessions"
```

---

### Task 3: The read layer

**Files:**
- Modify: `src/lib/db/impersonation-audit.ts` (append)
- Modify: `src/lib/db/generations.ts` (append)

**Interfaces:**
- Consumes: `groupIntoSessions`, `ImpersonationSession`, `GenerationRow` (Task 2).
- Produces:
  - from `@/lib/db/generations`: `listGenerationsInWindowForOrg(orgId: string, fromISO: string): Promise<GenerationRow[]>`
  - from `@/lib/db/impersonation-audit`: `type ImpersonationSessionPage = { sessions: ImpersonationSession[]; total: number }` and `listImpersonationSessionPage(orgId: string, opts: { page: number; pageSize: number }): Promise<ImpersonationSessionPage>`

- [ ] **Step 1: Add the generations window query**

Append to `src/lib/db/generations.ts`:

```ts
// Generations for an org since a point in time — the read side of the impersonation
// audit view (D141). generations.user_id is the REAL operator even while impersonating,
// which is what makes correlating them to an impersonation session possible at all.
export async function listGenerationsInWindowForOrg(
  orgId: string,
  fromISO: string,
): Promise<GenerationRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select(
      "node_id, type, model_used, status, credits_consumed, user_id, created_at, nodes!inner(canvases!inner(clients!inner(org_id)))",
    )
    .eq("nodes.canvases.clients.org_id", orgId)
    .gte("created_at", fromISO)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as GenerationRow[];
}
```

Add the import at the top of the file, alongside the existing imports:

```ts
import type { GenerationRow } from "@/lib/auth/impersonation-audit-view";
```

**Before writing this, verify the join path.** Run:

```bash
grep -n "nodes!inner\|canvases!inner\|clients!inner\|org_id" src/lib/db/generations.ts | head
```

`listGenerationsForOrgPage` in the same file already scopes generations to an org. **Copy its join expression verbatim** rather than the one above if it differs — it is the proven one, and PostgREST embed syntax is unforgiving.

- [ ] **Step 2: Add the session page query**

Append to `src/lib/db/impersonation-audit.ts`:

```ts
import {
  groupIntoSessions,
  type AuditEventRow,
  type ImpersonationSession,
} from "@/lib/auth/impersonation-audit-view";
import { listGenerationsInWindowForOrg } from "@/lib/db/generations";

export type ImpersonationSessionPage = {
  sessions: ImpersonationSession[];
  total: number;
};

// One page of impersonation sessions for an org, newest first. Three bounded queries:
// the session anchors (which define the page's time window), every audit row inside that
// window, and the org's generations inside it. Grouping itself is pure — see
// impersonation-audit-view.ts.
export async function listImpersonationSessionPage(
  orgId: string,
  { page, pageSize }: { page: number; pageSize: number },
): Promise<ImpersonationSessionPage> {
  const supabase = createServerSupabase();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: anchors, error: anchorErr, count } = await supabase
    .from("impersonation_audit_log")
    .select("id, occurred_at", { count: "exact" })
    .eq("target_org_id", orgId)
    .eq("event_type", "session_started")
    .order("occurred_at", { ascending: false })
    .range(from, to);
  if (anchorErr) throw anchorErr;

  const anchorRows = (anchors ?? []) as { id: string; occurred_at: string }[];
  if (anchorRows.length === 0) return { sessions: [], total: count ?? 0 };

  // The oldest anchor on this page opens the window. A session's events run past its own
  // start (to its session_ended), so the window cannot be closed by a timestamp — on
  // page 2+ it therefore also sweeps in every NEWER session. The anchor id set below is
  // what actually selects this page; the window only bounds how much is fetched.
  const windowStart = anchorRows[anchorRows.length - 1].occurred_at;
  const anchorIds = new Set(anchorRows.map((a) => a.id));

  const { data: events, error: eventErr } = await supabase
    .from("impersonation_audit_log")
    .select("id, operator_id, event_type, detail, occurred_at")
    .eq("target_org_id", orgId)
    .gte("occurred_at", windowStart)
    .order("occurred_at", { ascending: true });
  if (eventErr) throw eventErr;

  const eventRows = (events ?? []) as AuditEventRow[];

  const operatorIds = [...new Set(eventRows.map((e) => e.operator_id))];
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", operatorIds);
  if (profileErr) throw profileErr;

  const nameByUserId = Object.fromEntries(
    ((profiles ?? []) as { user_id: string; display_name: string }[]).map((p) => [
      p.user_id,
      p.display_name,
    ]),
  );

  const generations = await listGenerationsInWindowForOrg(orgId, windowStart);

  // A session's id IS its session_started row's id (see groupIntoSessions), so filtering
  // on the anchor set keeps exactly this page's sessions and drops the newer ones the
  // open-ended window dragged in.
  const sessions = groupIntoSessions(eventRows, generations, nameByUserId).filter((s) =>
    anchorIds.has(s.id),
  );

  return { sessions, total: count ?? 0 };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors under `src/`. Errors under `.next/types/` are pre-existing stale build artifacts — ignore them.

- [ ] **Step 4: Test the page-window logic**

This repo **does** mock Supabase at the db layer — `src/lib/db/impersonation-audit.test.ts`,
`recent-canvas.test.ts`, `client-with-count.test.ts` and others all do. **Read the existing
`src/lib/db/impersonation-audit.test.ts` first and follow its mocking style**, extending its
`createServerSupabase` mock to return a chainable query builder.

The behaviour that must be covered is the one the plan's own self-review caught: the event
window is open-ended (a session's events run past its start, so it cannot be closed by a
timestamp), which means **on page 2 the window also sweeps in every newer session**. The
anchor-id filter is what actually selects the page. Append to
`src/lib/db/impersonation-audit.test.ts`:

```ts
describe("listImpersonationSessionPage", () => {
  it("returns only the requested page's sessions, not the newer ones the open-ended window drags in", async () => {
    // Page 2's anchor is the OLD session. The event query, being open-ended from that
    // anchor, also returns the NEW session's rows — which must not appear in the result.
    // Arrange the mock so the anchor query yields only the old session_started row while
    // the event query yields both sessions' rows, then assert one session comes back.
  });

  it("reports total from the anchor query's exact count", async () => {
    // total must count every session_started row for the org, not just the page.
  });

  it("short-circuits to an empty page when the org has no sessions", async () => {
    // No anchors → no follow-up queries, sessions: [].
  });
});
```

Replace each comment with a real arrangement and assertion — a test that asserts nothing is
worse than no test. The first case is the important one; it is a bug this plan already had
once.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/db/impersonation-audit.test.ts src/lib/auth/impersonation-audit-view.test.ts --testTimeout=30000`
Expected: PASS — the 18 pure tests plus the existing `logImpersonationEvent` tests plus the 3 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/impersonation-audit.ts src/lib/db/generations.ts
git commit -m "feat(audit): read layer for paginated impersonation sessions"
```

---

### Task 4: The admin API route

**Files:**
- Create: `src/app/api/admin/orgs/[id]/impersonation-sessions/route.ts`

**Interfaces:**
- Consumes: `listImpersonationSessionPage` (Task 3).
- Produces: `GET /api/admin/orgs/:id/impersonation-sessions?page=&pageSize=` → `ImpersonationSessionPage`.

- [ ] **Step 1: Write the route**

Create `src/app/api/admin/orgs/[id]/impersonation-sessions/route.ts`:

```ts
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listImpersonationSessionPage } from "@/lib/db/impersonation-audit";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";

const PAGE_SIZES = [10, 20, 50];

// GET /api/admin/orgs/:id/impersonation-sessions — on-demand page fetch for the Support
// activity tab (src/components/admin/impersonation-audit/). Super-admin only, mirroring
// the sibling generations route.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSuperAdmin();
  const { id: orgId } = await params;
  const url = new URL(req.url);

  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const rawPageSize = Number(url.searchParams.get("pageSize") ?? 20) || 20;
  const pageSize = PAGE_SIZES.includes(rawPageSize) ? rawPageSize : 20;

  return withTryCatch("Failed to load support activity.", async () => {
    const result = await listImpersonationSessionPage(orgId, { page, pageSize });
    return apiOk(result);
  });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors under `src/`.

Run: `npx eslint "src/app/api/admin/orgs/[id]/impersonation-sessions/route.ts"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/admin/orgs/[id]/impersonation-sessions/route.ts"
git commit -m "feat(audit): admin route for paginated impersonation sessions"
```

---

### Task 5: Session card and entry row

Presentational only — no data fetching. Split into two files per the ~200-line rule.

**Files:**
- Create: `src/components/admin/impersonation-audit/session-entry-row.tsx`
- Create: `src/components/admin/impersonation-audit/session-card.tsx`

**Interfaces:**
- Consumes: `ImpersonationSession`, `SessionEntry` (Task 2).
- Produces: `<SessionEntryRow entry={SessionEntry} />` and `<SessionCard session={ImpersonationSession} />`.

- [ ] **Step 1: Write the entry row**

Create `src/components/admin/impersonation-audit/session-entry-row.tsx`:

```tsx
import { Unlock, Sparkles, PenLine } from "lucide-react";
import type { SessionEntry } from "@/lib/auth/impersonation-audit-view";

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// One line on a session's timeline. Times sit in a fixed, tabular column so they align
// down the list regardless of label length.
export function SessionEntryRow({ entry }: { entry: SessionEntry }) {
  const Icon =
    entry.kind === "elevated" ? Unlock : entry.kind === "generation" ? Sparkles : PenLine;

  return (
    <li className="flex items-baseline gap-3 py-1.5">
      <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-neutral-500">
        {timeOf(entry.at)}
      </span>
      <Icon className="size-3.5 shrink-0 translate-y-0.5 text-neutral-400" strokeWidth={1.5} />
      {entry.kind === "generation" ? (
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm text-neutral-900">
          Generated {entry.genType}
          {entry.model && <span className="text-neutral-500">· {entry.model}</span>}
          {entry.credits !== null && (
            <span className="text-neutral-500">· {entry.credits} credits</span>
          )}
          {entry.status !== "succeeded" && (
            <span className="text-eyebrow text-destructive">{entry.status}</span>
          )}
        </span>
      ) : (
        <span className="text-sm text-neutral-900">
          {entry.kind === "elevated" ? "Enabled editing" : entry.label}
        </span>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Write the session card**

Create `src/components/admin/impersonation-audit/session-card.tsx`:

```tsx
"use client";

import { Eye, Unlock } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { initials } from "@/lib/format/initials";
import { cn } from "@/lib/utils";
import type { ImpersonationSession } from "@/lib/auth/impersonation-audit-view";
import { SessionEntryRow } from "./session-entry-row";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function durationLabel(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "In progress";
  const minutes = Math.max(
    1,
    Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// A collapsed card still has to answer "did anything happen here" — hence the counts.
function summarize(session: ImpersonationSession): string {
  const generations = session.entries.filter((e) => e.kind === "generation").length;
  const actions = session.entries.filter((e) => e.kind === "action").length;
  const parts: string[] = [];
  if (generations) parts.push(`${generations} generation${generations === 1 ? "" : "s"}`);
  if (actions) parts.push(`${actions} action${actions === 1 ? "" : "s"}`);
  if (session.quietCount) parts.push(`${session.quietCount} quiet writes`);
  return parts.length ? parts.join(" · ") : "No changes recorded";
}

export function SessionCard({ session }: { session: ImpersonationSession }) {
  const StateIcon = session.elevated ? Unlock : Eye;

  return (
    <div
      className={cn(
        "rounded-xl border bg-background shadow-card",
        session.elevated ? "border-[#ffca2d]/40 bg-[#ffca2d]/5" : "border-border",
      )}
    >
      <Accordion>
        <AccordionItem value={session.id}>
          <AccordionTrigger className="px-5 py-4">
            <div className="flex w-full items-center gap-3 text-left">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-semibold text-white">
                {initials(session.operatorName)}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-neutral-900">
                  {session.operatorName}
                </span>
                <span className="truncate text-xs text-neutral-500">
                  {summarize(session)}
                </span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <span className="text-sm text-neutral-500">
                  {formatDay(session.startedAt)}, {formatTime(session.startedAt)} ·{" "}
                  {durationLabel(session.startedAt, session.endedAt)}
                </span>
                <span
                  className={cn(
                    "text-eyebrow flex items-center gap-1.5 rounded-full px-2 py-1",
                    session.elevated
                      ? "bg-[#ffca2d]/20 text-neutral-900"
                      : "bg-muted text-neutral-500",
                  )}
                >
                  <StateIcon className="size-3" strokeWidth={1.5} />
                  {session.elevated ? "Editing" : "Read-only"}
                </span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-4">
            <ul className="ml-3 border-l border-border pl-4">
              {session.entries.map((entry, i) => (
                <SessionEntryRow key={`${entry.kind}-${entry.at}-${i}`} entry={entry} />
              ))}
              {session.quietCount > 0 && (
                <li className="flex items-baseline gap-3 py-1.5 text-sm text-neutral-400">
                  <span className="w-12 shrink-0" />
                  <span>
                    {session.quietCount} quiet writes (autosaves, upload handshakes)
                  </span>
                </li>
              )}
              {session.endedAt && (
                <li className="flex items-baseline gap-3 py-1.5">
                  <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-neutral-500">
                    {formatTime(session.endedAt)}
                  </span>
                  <span className="text-sm text-neutral-500">Exited</span>
                </li>
              )}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors under `src/`.

Run: `npx eslint src/components/admin/impersonation-audit/`
Expected: no errors.

**If `AccordionTrigger` rejects `children` typed as a `<div>`,** check `src/components/ui/accordion.tsx` — it wraps Base UI's `Trigger`, which renders a `<button>`. Nesting a `<div>` inside is valid HTML here (no interactive descendants), but if the component forces its own layout, pass the content through its `render` prop instead of as children — Base UI composes via `render`, never `asChild`.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/impersonation-audit/
git commit -m "feat(audit): session card and timeline entry row"
```

---

### Task 6: The tab, wired end to end

**Files:**
- Create: `src/components/admin/impersonation-audit/impersonation-audit.tsx`
- Modify: `src/app/admin/orgs/[id]/org-detail-tabs.tsx`
- Modify: `src/app/admin/orgs/[id]/page.tsx`

**Interfaces:**
- Consumes: `SessionCard` (Task 5), `ImpersonationSessionPage` + `listImpersonationSessionPage` (Task 3), the route from Task 4.
- Produces: `<ImpersonationAudit orgId={string} initial={ImpersonationSessionPage} />`.

- [ ] **Step 1: Write the list component**

Create `src/components/admin/impersonation-audit/impersonation-audit.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { ImpersonationSessionPage } from "@/lib/db/impersonation-audit";
import type { ImpersonationSession } from "@/lib/auth/impersonation-audit-view";
import { SessionCard } from "./session-card";

const PAGE_SIZES = [10, 20, 50];

export function ImpersonationAudit({
  orgId,
  initial,
}: {
  orgId: string;
  initial: ImpersonationSessionPage;
}) {
  const [sessions, setSessions] = useState<ImpersonationSession[]>(initial.sessions);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Page 1 was already fetched server-side — skip the first effect pass so mount does
  // not immediately re-fetch what we already have.
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    void fetch(`/api/admin/orgs/${orgId}/impersonation-sessions?${params}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ImpersonationSessionPage | null) => {
        if (cancelled || !data) return;
        setSessions(data.sessions);
        setTotal(data.total);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, pageCount);

  if (total === 0) {
    return (
      <p className="py-14 text-center text-sm text-muted-foreground">
        No support sessions recorded for this organization.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sessions per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-20" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Pagination page={clampedPage} pageCount={pageCount} onPageChange={setPage} />
      </div>
    </div>
  );
}
```

**Before writing the `Select` block, copy the exact usage from `src/components/admin/generations-table.tsx`** (its rows-per-page control) — this repo's `Select` is a Base UI wrapper and its sub-component names and props must match what that file already does.

- [ ] **Step 2: Add the tab**

In `src/app/admin/orgs/[id]/org-detail-tabs.tsx`, add the import:

```tsx
import { ImpersonationAudit } from "@/components/admin/impersonation-audit/impersonation-audit";
import type { ImpersonationSessionPage } from "@/lib/db/impersonation-audit";
```

Add to the component's props type:

```tsx
  impersonationSessions: ImpersonationSessionPage;
```

and to its destructured parameter list:

```tsx
  impersonationSessions,
```

Add the trigger after the existing `generations` trigger:

```tsx
        <TabsTrigger value="support" className={triggerClass}>
          Support activity
        </TabsTrigger>
```

Add the panel after the existing `generations` panel:

```tsx
      <TabsContent value="support" className="animate-rise flex flex-col gap-8">
        <ImpersonationAudit orgId={org.id} initial={impersonationSessions} />
      </TabsContent>
```

- [ ] **Step 3: Fetch page 1 server-side**

In `src/app/admin/orgs/[id]/page.tsx`, add the import:

```tsx
import { listImpersonationSessionPage } from "@/lib/db/impersonation-audit";
```

Add to the existing `Promise.all([...])` array, as a new final entry:

```tsx
    listImpersonationSessionPage(id, { page: 1, pageSize: 20 }),
```

Add the matching name to the destructuring array that receives it, as its final element:

```tsx
    impersonationSessions,
```

Pass it to the tabs:

```tsx
        impersonationSessions={impersonationSessions}
```

- [ ] **Step 4: Typecheck, lint, and run the pure tests**

Run: `npx tsc --noEmit`
Expected: no errors under `src/`.

Run: `npx eslint src/components/admin/impersonation-audit/ "src/app/admin/orgs/[id]/org-detail-tabs.tsx" "src/app/admin/orgs/[id]/page.tsx"`
Expected: no errors.

Run: `npx vitest run src/lib/auth/ --testTimeout=30000`
Expected: PASS.

- [ ] **Step 5: Verify against the running app**

Run: `npm run dev`

Sign in as a `super_admin`, then:
1. Open `/admin/orgs/<id>` for an org you have **never** impersonated → the Support activity tab shows the empty state, not a broken table.
2. Enter that org, enable editing, run one image generation, delete a canvas, edit a canvas so autosave fires several times, then exit.
3. Return to `/admin/orgs/<id>` → Support activity. Confirm one card, amber `Editing` pill, and a summary line reading like `1 generation · 1 action · N quiet writes`.
4. Expand it. Confirm: `Enabled editing`, the generation showing **type, model and credits** (not `POST /api/nodes/…`), `Deleted a canvas`, one muted quiet-writes line, and `Exited`. Times aligned in their column.
5. Enter and exit twice more, set page size to 10, and confirm pagination pages through correctly and never strands you past the last page.

Fix anything that misbehaves before committing. If the generation shows as "Attempted a generation", the node-id correlation is failing — check that the audit row's path really carries the node uuid and that `listGenerationsInWindowForOrg`'s org join returns rows.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/impersonation-audit/ "src/app/admin/orgs/[id]/org-detail-tabs.tsx" "src/app/admin/orgs/[id]/page.tsx"
git commit -m "feat(audit): Support activity tab on the org detail page"
```

---

## Notes for the implementer

- **Do not add `@testing-library/react` or a jsdom environment.** This repo tests pure logic under `environment: "node"`. All the decision-making here lives in `impersonation-audit-view.ts` precisely so it is testable without a DOM; the components are deliberately thin. The db layer IS unit-tested, by mocking `createServerSupabase` — see `src/lib/db/impersonation-audit.test.ts`.
- **Two PostgREST joins are copy-from-neighbour, not invent-from-scratch**: the generations org scope (Task 3, copy from `listGenerationsForOrgPage`) and the `Select` sub-components (Task 6, copy from `generations-table.tsx`). Both are called out in their steps.
- **`.next/types/validator.ts` errors are pre-existing** stale build artifacts and unrelated to this work. Only errors under `src/` matter.
