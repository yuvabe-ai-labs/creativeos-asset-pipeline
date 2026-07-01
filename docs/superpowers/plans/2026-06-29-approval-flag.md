# Approval Flag (maker-checker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a maker-checker **approval flag** to every LLM-generated output — set/displayed with full who+when attribution — as a flag only (no gating, triggering, or enforcement).

**Architecture:** The flag lives on the uniform `node_versions` envelope (D4), so all node types get it at once. A pure helper computes the DB update payload (unit-tested à la `planReconcile`); a thin server action mirrors `setVersionLabelAction`. Identity is soft (localStorage `{name, role}`), captured once at app start via `useIdentity()`, upgradeable to real auth via the same seam (spec §5). Approval attaches to the **active version** (D18); a re-generate resets it to `pending`.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (Postgres), React, Tailwind v4 + shadcn (Base UI), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-29-approval-flag-design.md` · **ADR:** D29.

## Global Constraints

- **Flag only.** No connection gating, no auto-trigger, no RBAC enforcement, no notifications (spec §3/§7).
- **Approval attaches to the version, not the node** (D18). "Approve node" = "approve its `active_version_id`". Re-generate → new version → `pending`.
- **Three states:** `'pending' | 'approved' | 'changes_requested'` (default `'pending'`).
- **`note`** (existing column) carries changes-requested feedback — no new note column.
- **Maker** recorded in existing `operator`; **checker** in new `approved_by`. Both from `useIdentity()`.
- **`approval_status` is distinct from `decision`** (pass/fail eval). Never write one from the other.
- **Soft identity is spoofable by design** — audit trail, not security. Role hint is cosmetic.
- **Design system:** reuse `KBStatusBadge` styling for the pill; reuse the `InlineEvalBar` structure for the control. Lucide icons (1.5 stroke). Motion easing `cubic-bezier(0.22,1,0.36,1)`. Never hardcode colors outside the established status palettes already used by `kb-status-badge`.
- **Open defaults (flip if the user says so):** `approved_by` is reused to record the change-requester; the Approve control is visible only when `role === 'senior'` (cosmetic).

---

### Task 1: Migration + row type — add approval columns

**Files:**
- Create: `supabase/migrations/0009_approval_flag.sql`
- Modify: `src/lib/db/types.ts:68-83` (extend `NodeVersionRow`)

**Interfaces:**
- Produces: `NodeVersionRow` now has `approval_status: ApprovalStatus`, `approved_by: string | null`, `approved_at: string | null` (the `ApprovalStatus` type itself is defined in Task 2).

- [ ] **Step 1: Write the migration**

`supabase/migrations/0009_approval_flag.sql`:

```sql
-- D29: maker-checker approval flag on the uniform version envelope (D4), so every
-- node type gets sign-off at once. Flag only — no gating/triggering/enforcement yet
-- (see docs/superpowers/specs/2026-06-29-approval-flag-design.md).
--
-- approval_status: the sign-off gate (distinct from `decision`, the D22 quality signal).
-- approved_by: soft identity of the CHECKER (name now; upgrades to a user_id FK with auth).
-- approved_at: when the current status was set.
-- The existing `note` column carries "changes requested" feedback; the existing `operator`
-- column now records the MAKER (filled at generation time).

alter table node_versions
  add column approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'changes_requested')),
  add column approved_by text,
  add column approved_at timestamptz;

-- NOT NULL DEFAULT backfills existing rows to 'pending' automatically; no data step needed.
```

- [ ] **Step 2: Extend the row type**

In `src/lib/db/types.ts`, change the `NodeVersionRow` type (lines 68-83) to add three fields after `operator`:

```ts
export type NodeVersionRow = {
  id: string;
  node_id: string;
  inputs_used: Record<string, unknown>;
  params_used: Record<string, unknown>;
  model_used: string | null;
  output: unknown;
  generated_output: unknown;
  error: string | null;
  decision: string | null;
  note: string | null;
  operator: string | null;
  // D29 maker-checker approval flag (distinct from `decision`).
  approval_status: "pending" | "approved" | "changes_requested";
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors from `types.ts` (pre-existing unrelated errors, if any, are noted in `docs/superpowers/specs/project-image-editing-feature` context — do not fix them here).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_approval_flag.sql src/lib/db/types.ts
git commit -m "feat(db): add approval flag columns to node_versions (D29)"
```

---

### Task 2: Pure approval-update helper + server action

**Files:**
- Create: `src/lib/approval.ts`
- Create: `src/lib/approval.test.ts`
- Create: `src/lib/actions/approval.ts`

**Interfaces:**
- Produces: `type ApprovalStatus = "pending" | "approved" | "changes_requested"`; `buildApprovalUpdate(input) → ApprovalUpdate`; server action `setVersionApprovalAction(versionId, { status, approvedBy, note? })`.
- Consumes: `NodeVersionRow` fields from Task 1; `createServerSupabase` from `@/lib/supabase/server`.

- [ ] **Step 1: Write the failing test**

`src/lib/approval.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildApprovalUpdate } from "./approval";

const AT = "2026-06-29T10:00:00.000Z";

describe("buildApprovalUpdate", () => {
  it("approved: stamps status + who + when, clears note", () => {
    expect(buildApprovalUpdate({ status: "approved", by: "Asha", at: AT, note: "ignored" }))
      .toEqual({ approval_status: "approved", approved_by: "Asha", approved_at: AT, note: null });
  });

  it("changes_requested: stamps who + when + keeps note", () => {
    expect(buildApprovalUpdate({ status: "changes_requested", by: "Asha", at: AT, note: "fix label" }))
      .toEqual({ approval_status: "changes_requested", approved_by: "Asha", approved_at: AT, note: "fix label" });
  });

  it("changes_requested with no note stores null", () => {
    expect(buildApprovalUpdate({ status: "changes_requested", by: "Asha", at: AT }))
      .toEqual({ approval_status: "changes_requested", approved_by: "Asha", approved_at: AT, note: null });
  });

  it("pending: resets everything (who/when/note cleared)", () => {
    expect(buildApprovalUpdate({ status: "pending", by: "Asha", at: AT, note: "x" }))
      .toEqual({ approval_status: "pending", approved_by: null, approved_at: null, note: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/approval.test.ts`
Expected: FAIL — "Failed to resolve import ./approval" / `buildApprovalUpdate is not a function`.

- [ ] **Step 3: Write the pure helper**

`src/lib/approval.ts`:

```ts
// D29: pure computation of the approval update payload from an action. Kept separate
// from the server action (which does the Supabase write) so it is unit-testable, the
// same split as planReconcile. `at` is injected (ISO string) for deterministic tests.
export type ApprovalStatus = "pending" | "approved" | "changes_requested";

export type ApprovalUpdate = {
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  note: string | null;
};

export function buildApprovalUpdate(input: {
  status: ApprovalStatus;
  by: string | null;
  at: string;
  note?: string | null;
}): ApprovalUpdate {
  // Reset to pending clears attribution and feedback — the version is un-reviewed again.
  if (input.status === "pending") {
    return { approval_status: "pending", approved_by: null, approved_at: null, note: null };
  }
  return {
    approval_status: input.status,
    approved_by: input.by,
    approved_at: input.at,
    // note is feedback for the maker — only meaningful for changes_requested.
    note: input.status === "changes_requested" ? (input.note ?? null) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/approval.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the server action**

`src/lib/actions/approval.ts`:

```ts
"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { buildApprovalUpdate, type ApprovalStatus } from "@/lib/approval";

// D29: set the approval flag on a SPECIFIC version (the caller passes the node's active
// version id). Annotates an attempt — never a new attempt — so no new version row, mirroring
// setVersionLabelAction (D18). Distinct field from `decision`; never touches it.
export async function setVersionApprovalAction(
  versionId: string,
  input: { status: ApprovalStatus; approvedBy: string | null; note?: string | null },
) {
  const supabase = createServerSupabase();
  const update = buildApprovalUpdate({
    status: input.status,
    by: input.approvedBy,
    at: new Date().toISOString(),
    note: input.note ?? null,
  });
  const { error } = await supabase
    .from("node_versions")
    .update(update)
    .eq("id", versionId);
  if (error) throw error;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/approval.ts src/lib/approval.test.ts src/lib/actions/approval.ts
git commit -m "feat(approval): pure update helper + setVersionApprovalAction (D29)"
```

---

### Task 3: Soft identity — parse/serialize + useIdentity hook

**Files:**
- Create: `src/lib/identity.ts`
- Create: `src/lib/identity.test.ts`
- Create: `src/hooks/use-identity.ts`

**Interfaces:**
- Produces: `type Identity = { name: string; role: "senior" | "designer" }`; `IDENTITY_KEY`; `parseIdentity(raw) → Identity | null`; `serializeIdentity(id) → string`; hook `useIdentity() → { identity: Identity | null; setIdentity: (id: Identity) => void }`.

- [ ] **Step 1: Write the failing test**

`src/lib/identity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseIdentity, serializeIdentity } from "./identity";

describe("parseIdentity", () => {
  it("returns null for null / empty / garbage", () => {
    expect(parseIdentity(null)).toBeNull();
    expect(parseIdentity("")).toBeNull();
    expect(parseIdentity("not-json")).toBeNull();
  });

  it("returns null when role is invalid or name is blank", () => {
    expect(parseIdentity(JSON.stringify({ name: "Asha", role: "boss" }))).toBeNull();
    expect(parseIdentity(JSON.stringify({ name: "  ", role: "senior" }))).toBeNull();
  });

  it("parses a valid identity and trims the name", () => {
    expect(parseIdentity(JSON.stringify({ name: " Asha ", role: "senior" })))
      .toEqual({ name: "Asha", role: "senior" });
  });

  it("round-trips through serializeIdentity", () => {
    const id = { name: "Ravi", role: "designer" as const };
    expect(parseIdentity(serializeIdentity(id))).toEqual(id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/identity.test.ts`
Expected: FAIL — cannot resolve `./identity`.

- [ ] **Step 3: Write the pure identity module**

`src/lib/identity.ts`:

```ts
// D29 soft identity: a name + role persisted in localStorage. Spoofable by design — it is
// an audit trail, not security. Upgrades to a real auth session later with no shape change
// (spec §5): only the SOURCE of Identity changes, not this type.
export type Identity = { name: string; role: "senior" | "designer" };

export const IDENTITY_KEY = "creativeos.identity";

export function parseIdentity(raw: string | null): Identity | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { name?: unknown; role?: unknown };
    if (
      typeof v.name === "string" &&
      v.name.trim() &&
      (v.role === "senior" || v.role === "designer")
    ) {
      return { name: v.name.trim(), role: v.role };
    }
  } catch {
    // fall through
  }
  return null;
}

export function serializeIdentity(id: Identity): string {
  return JSON.stringify(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/identity.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the client hook**

`src/hooks/use-identity.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IDENTITY_KEY,
  parseIdentity,
  serializeIdentity,
  type Identity,
} from "@/lib/identity";

// Reads the soft identity from localStorage and keeps it in sync across tabs. When auth
// lands (spec §5.2) this hook's innards swap to read the session — call sites stay put.
export function useIdentity(): {
  identity: Identity | null;
  setIdentity: (id: Identity) => void;
} {
  const [identity, setState] = useState<Identity | null>(null);

  useEffect(() => {
    setState(parseIdentity(localStorage.getItem(IDENTITY_KEY)));
    function onStorage(e: StorageEvent) {
      if (e.key === IDENTITY_KEY) setState(parseIdentity(e.newValue));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setIdentity = useCallback((id: Identity) => {
    localStorage.setItem(IDENTITY_KEY, serializeIdentity(id));
    setState(id);
  }, []);

  return { identity, setIdentity };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/identity.ts src/lib/identity.test.ts src/hooks/use-identity.ts
git commit -m "feat(identity): soft localStorage identity + useIdentity hook (D29)"
```

---

### Task 4: App-start identity gate + top-bar chip

**Files:**
- Create: `src/components/identity/identity-dialog.tsx` (shared name+role form dialog)
- Create: `src/components/identity/identity-gate.tsx` (blocks until identity set)
- Create: `src/components/identity/identity-chip.tsx` (shows/switches identity)
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx` (mount the gate + chip in the canvas shell)

**Interfaces:**
- Consumes: `useIdentity()` (Task 3), shadcn `Dialog`, `Input`, `Select`, `Button` from `src/components/ui/*`.
- Produces: `<IdentityGate>{children}</IdentityGate>`, `<IdentityChip />`, `<IdentityDialog open onSubmit onOpenChange />`.

- [ ] **Step 1: Write the failing test for gate logic**

The gate's only branching logic is "identity present?". Extract it as a pure predicate so it is testable without rendering.

`src/components/identity/identity-gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { needsIdentityGate } from "./gate-logic";

describe("needsIdentityGate", () => {
  it("gates when identity is null", () => {
    expect(needsIdentityGate(null)).toBe(true);
  });
  it("does not gate when identity is set", () => {
    expect(needsIdentityGate({ name: "Asha", role: "senior" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/identity/identity-gate.test.ts`
Expected: FAIL — cannot resolve `./gate-logic`.

- [ ] **Step 3: Write the predicate**

`src/components/identity/gate-logic.ts`:

```ts
import type { Identity } from "@/lib/identity";

// True when the app-start gate must block (no identity chosen yet).
export function needsIdentityGate(identity: Identity | null): boolean {
  return identity === null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/identity/identity-gate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the shared dialog**

`src/components/identity/identity-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Identity } from "@/lib/identity";

export function IdentityDialog({
  open,
  initial,
  dismissable,
  onSubmit,
  onOpenChange,
}: {
  open: boolean;
  initial?: Identity | null;
  dismissable?: boolean;
  onSubmit: (id: Identity) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<Identity["role"]>(initial?.role ?? "designer");
  const valid = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={dismissable ? onOpenChange : undefined}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Who are you?</DialogTitle>
          <DialogDescription>
            Used to record who generated and who approved each output.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select value={role} onValueChange={(v) => setRole(v as Identity["role"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="designer">Designer</SelectItem>
              <SelectItem value="senior">Senior designer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            className="w-full"
            disabled={!valid}
            onClick={() => onSubmit({ name: name.trim(), role })}
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

> Note: confirm the exact export names in `src/components/ui/dialog.tsx` and `select.tsx` before importing — this repo uses the shadcn Base UI registry (`render` prop, not `asChild`). If a component is missing, add it via the project's shadcn workflow (see `docs/component-structure.md`), do not hand-roll a native control.

- [ ] **Step 6: Write the gate**

`src/components/identity/identity-gate.tsx`:

```tsx
"use client";

import { useIdentity } from "@/hooks/use-identity";
import { needsIdentityGate } from "./gate-logic";
import { IdentityDialog } from "./identity-dialog";

// Renders children, but overlays a blocking "who are you?" dialog until an identity is set.
// One-time per browser (persisted); switching later is via IdentityChip.
export function IdentityGate({ children }: { children: React.ReactNode }) {
  const { identity, setIdentity } = useIdentity();
  return (
    <>
      {children}
      <IdentityDialog
        open={needsIdentityGate(identity)}
        dismissable={false}
        onSubmit={setIdentity}
      />
    </>
  );
}
```

- [ ] **Step 7: Write the chip**

`src/components/identity/identity-chip.tsx`:

```tsx
"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { useIdentity } from "@/hooks/use-identity";
import { IdentityDialog } from "./identity-dialog";

// Shows the current identity; click to switch (e.g. a senior at the intern's machine).
export function IdentityChip() {
  const { identity, setIdentity } = useIdentity();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <UserRound className="size-3.5" strokeWidth={1.5} />
        {identity ? `${identity.name} · ${identity.role === "senior" ? "Senior" : "Designer"}` : "Set who you are"}
      </button>
      <IdentityDialog
        open={open}
        initial={identity}
        dismissable
        onOpenChange={setOpen}
        onSubmit={(id) => {
          setIdentity(id);
          setOpen(false);
        }}
      />
    </>
  );
}
```

- [ ] **Step 8: Mount gate + chip in the canvas shell**

In `src/app/clients/[id]/canvases/[cid]/page.tsx`, wrap the canvas content with `<IdentityGate>` and place `<IdentityChip />` in the existing top bar of that page. Read the file first to find the top-bar element and the content wrapper; add:

```tsx
import { IdentityGate } from "@/components/identity/identity-gate";
import { IdentityChip } from "@/components/identity/identity-chip";
```

Wrap the rendered canvas: `<IdentityGate>…existing canvas…</IdentityGate>`, and render `<IdentityChip />` inside the top bar's right-hand controls group.

- [ ] **Step 9: Run tests + typecheck**

Run: `npx vitest run src/components/identity && npx tsc --noEmit`
Expected: gate-logic tests PASS; no new type errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/identity src/app/clients/**/canvases/**/page.tsx
git commit -m "feat(identity): app-start gate + top-bar chip (D29)"
```

---

### Task 5: Approval control in the focus view + version API fields

**Files:**
- Create: `src/components/nodes/inline-approval-bar.tsx`
- Modify: `src/app/api/nodes/[id]/versions/route.ts` (add approval fields to the mapped summary)
- Modify: `src/components/nodes/image-gen-focus-view.tsx` (wire the control next to the eval bar)

**Interfaces:**
- Consumes: `setVersionApprovalAction` (Task 2), `useIdentity` (Task 3), `type ApprovalStatus` (Task 2).
- Produces: `<InlineApprovalBar status saving canApprove onSet />` where `onSet: (status: ApprovalStatus, note: string | null) => void`. The versions API now returns `approvalStatus`, `approvedBy`, `approvedAt` per version.

- [ ] **Step 1: Add approval fields to the versions API**

In `src/app/api/nodes/[id]/versions/route.ts`, extend the per-version mapped object (inside `versions: rows.map(...)`) with three fields alongside `decision`/`note`:

```ts
      decision: (v.decision as "pass" | "fail" | null) ?? null,
      note: typeof v.note === "string" ? v.note : null,
      // D29 approval flag (distinct from decision).
      approvalStatus: (v.approval_status as "pending" | "approved" | "changes_requested"),
      approvedBy: typeof v.approved_by === "string" ? v.approved_by : null,
      approvedAt: typeof v.approved_at === "string" ? v.approved_at : null,
```

- [ ] **Step 2: Write the approval bar component**

`src/components/nodes/inline-approval-bar.tsx`:

```tsx
"use client";

import { Check, MessageSquareWarning, RotateCcw, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@/lib/approval";

// Sign-off control — sibling of InlineEvalBar. Distinct signal from pass/fail (D29).
export function InlineApprovalBar({
  status,
  note,
  saving,
  canApprove,
  onSet,
}: {
  status: ApprovalStatus;
  note: string;
  saving: boolean;
  canApprove: boolean; // cosmetic role hint (spec §4.4); NOT security
  onSet: (status: ApprovalStatus, note: string | null) => void;
}) {
  const [draftNote, setDraftNote] = useState(note);
  const [showNote, setShowNote] = useState(status === "changes_requested");

  if (!canApprove) {
    return <ApprovalReadout status={status} />;
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow">Approval</span>
        <div className="flex items-center gap-1">
          <ActionButton
            active={status === "approved"}
            saving={saving}
            title="Approve"
            tone="emerald"
            onClick={() => onSet(status === "approved" ? "pending" : "approved", null)}
          >
            <Check className="size-3.5" strokeWidth={1.5} />
          </ActionButton>
          <ActionButton
            active={status === "changes_requested"}
            saving={saving}
            title="Request changes"
            tone="amber"
            onClick={() => setShowNote((s) => !s || status !== "changes_requested")}
          >
            <MessageSquareWarning className="size-3.5" strokeWidth={1.5} />
          </ActionButton>
          {status !== "pending" && (
            <ActionButton active={false} saving={saving} title="Reset to pending" tone="muted"
              onClick={() => { setShowNote(false); onSet("pending", null); }}>
              <RotateCcw className="size-3.5" strokeWidth={1.5} />
            </ActionButton>
          )}
        </div>
      </div>

      <div
        className={cn("grid transition-all duration-200",
          showNote ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
        style={{ transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
      >
        <div className="min-h-0 overflow-hidden">
          <textarea
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            onBlur={() => onSet("changes_requested", draftNote.trim() || null)}
            placeholder="What needs to change?"
            rows={1}
            className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton({ active, saving, title, tone, onClick, children }: {
  active: boolean; saving: boolean; title: string;
  tone: "emerald" | "amber" | "muted"; onClick: () => void; children: React.ReactNode;
}) {
  const activeTone = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    muted: "border-border bg-muted text-foreground",
  }[tone];
  return (
    <button type="button" disabled={saving} onClick={onClick} title={title}
      className={cn(
        "inline-flex items-center justify-center rounded-md border p-1.5 transition-colors disabled:opacity-50",
        active ? activeTone : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}>
      {saving ? <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} /> : children}
    </button>
  );
}

function ApprovalReadout({ status }: { status: ApprovalStatus }) {
  const label = { pending: "Awaiting approval", approved: "Approved", changes_requested: "Changes requested" }[status];
  return (
    <div className="flex items-center justify-between">
      <span className="text-eyebrow">Approval</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the image-gen focus view**

In `src/components/nodes/image-gen-focus-view.tsx`:

1. Add imports:
```ts
import { InlineApprovalBar } from "./inline-approval-bar";
import { setVersionApprovalAction } from "@/lib/actions/approval";
import { useIdentity } from "@/hooks/use-identity";
import type { ApprovalStatus } from "@/lib/approval";
```
2. Add state next to the existing eval state (near line 196-200):
```ts
const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
const [approvalNote, setApprovalNote] = useState("");
const [approvalSaving, setApprovalSaving] = useState(false);
const { identity } = useIdentity();
```
3. Wherever the code sets `evalDecision`/`evalNote` from the active version (the `.find((v) => v.id === json.activeVersionId)` blocks — lines ~230-233, ~362-365), also set approval state from the same `active` object:
```ts
setApprovalStatus(active?.approvalStatus ?? "pending");
setApprovalNote(active?.note ?? "");
```
(the version summary type in this file must gain `approvalStatus`/`approvedBy`/`approvedAt` — mirror the eval `decision` field you see there.)
4. Add a save handler mirroring the eval one (near line 486):
```ts
async function saveApproval(status: ApprovalStatus, note: string | null) {
  if (!activeVersionId) return;
  setApprovalSaving(true);
  try {
    await setVersionApprovalAction(activeVersionId, {
      status,
      approvedBy: identity?.name ?? null,
      note,
    });
    setApprovalStatus(status);
    setApprovalNote(note ?? "");
  } catch {
    toast.error("Failed to save approval");
  } finally {
    setApprovalSaving(false);
  }
}
```
5. Render `<InlineApprovalBar>` directly below the existing `<InlineEvalBar>` in the JSX:
```tsx
<InlineApprovalBar
  status={approvalStatus}
  note={approvalNote}
  saving={approvalSaving}
  canApprove={identity?.role === "senior"}
  onSet={saveApproval}
/>
```

- [ ] **Step 4: Typecheck + run existing tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new type errors; existing suite still green.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/inline-approval-bar.tsx src/app/api/nodes/**/versions/route.ts src/components/nodes/image-gen-focus-view.tsx
git commit -m "feat(approval): approval control in image-gen focus view + API fields (D29)"
```

- [ ] **Step 6: Replicate into the other focus views (same pattern)**

Repeat Step 3 for each focus view that renders `InlineEvalBar` (`prompt-focus-view.tsx`, `video-prompt-focus-view.tsx`, and the eval `review-screen.tsx` if it should sign off). Commit each:
```bash
git commit -am "feat(approval): approval control in <view> (D29)"
```

---

### Task 6: On-canvas approval badge

**Files:**
- Create: `src/components/nodes/approval-badge.tsx`
- Modify: `src/lib/canvas-nodes.ts:127-149` (`NodeWithActive` type + `nodeRowToFlow`)
- Modify: `src/lib/db/nodes.ts:75` (embed `approval_status` in the active-version FK select)
- Modify: node components that show the header status dot (e.g. `image-gen-node.tsx`, `video-gen-node.tsx`, `prompt-node.tsx`) to render the badge

**Interfaces:**
- Consumes: `ApprovalStatus` (Task 2).
- Produces: `<ApprovalBadge status />`; `AppNode.data.approvalStatus?: ApprovalStatus` populated on load.

- [ ] **Step 1: Write the failing test for the load mapping**

`src/lib/canvas-nodes.test.ts` — add a case (this file already tests `nodeRowToFlow`):

```ts
it("surfaces the active version's approval_status onto data (D29)", () => {
  const node = nodeRowToFlow({
    id: "n1", type: "image-gen", position: { x: 0, y: 0 }, data: {},
    active_version_id: "v1",
    active: { output: "http://img", approval_status: "approved" },
  } as never);
  expect((node.data as { approvalStatus?: string }).approvalStatus).toBe("approved");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: FAIL — `approvalStatus` is `undefined`.

- [ ] **Step 3: Extend the type + mapping**

In `src/lib/canvas-nodes.ts`, update `NodeWithActive` (line 127-129) and `nodeRowToFlow` (line 140-141):

```ts
export type NodeWithActive = NodeRow & {
  active: { output: unknown; approval_status?: "pending" | "approved" | "changes_requested" } | null;
};
```
```ts
  const output = row.active?.output;
  const approvalStatus = row.active?.approval_status;
  const data = {
    ...own,
    ...(output != null ? { parsed: output } : {}),
    ...(approvalStatus ? { approvalStatus } : {}),
  };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: PASS.

- [ ] **Step 5: Embed the column in the DB select**

In `src/lib/db/nodes.ts` line 75, change the embed:
```ts
    .select("*, active:node_versions!nodes_active_version_fk(output, approval_status)")
```

- [ ] **Step 6: Write the badge**

`src/components/nodes/approval-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@/lib/approval";

const STYLES: Record<ApprovalStatus, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  changes_requested: { label: "Changes requested", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const { label, className } = STYLES[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {label}
    </span>
  );
}
```

- [ ] **Step 7: Render the badge in node headers**

In each generation node component (`image-gen-node.tsx`, `video-gen-node.tsx`, `prompt-node.tsx`, `video-prompt-node.tsx`), read `data.approvalStatus` and render `<ApprovalBadge status={data.approvalStatus ?? "pending"} />` in the header near the existing status dot. Only show it once the node has an active version (i.e. when `data.parsed`/output exists) so empty nodes stay clean:
```tsx
{data.parsed != null && <ApprovalBadge status={(data.approvalStatus as ApprovalStatus) ?? "pending"} />}
```

- [ ] **Step 8: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add src/components/nodes/approval-badge.tsx src/lib/canvas-nodes.ts src/lib/canvas-nodes.test.ts src/lib/db/nodes.ts src/components/nodes/*-node.tsx
git commit -m "feat(approval): on-canvas approval badge + load mapping (D29)"
```

---

### Task 7: Stamp the maker (operator) at generation time

**Files:**
- Modify: `src/lib/db/versions.ts` (already accepts `operator` — no change needed; verify)
- Modify: one sync generate route as the pattern, e.g. `src/app/api/nodes/[id]/generate/route.ts` (accept `operator` in the request body, pass to `insertVersion`)
- Modify: the client caller of that route (the focus view / node action that POSTs to it) to include `operator` from `useIdentity()`

**Interfaces:**
- Consumes: `useIdentity()` (Task 3), `insertVersion({ …, operator })` (already supported, `versions.ts`).
- Produces: generated versions now carry `operator = <maker name>`.

- [ ] **Step 1: Thread operator through the generate route**

Read `src/app/api/nodes/[id]/generate/route.ts`. Where it parses the request body, read `operator` (optional string); pass it into the existing `insertVersion({ ... })` call as `operator`.

```ts
const body = await req.json().catch(() => ({}));
const operator = typeof body.operator === "string" ? body.operator : null;
// …
await insertVersion({ nodeId, inputsUsed, paramsUsed, modelUsed, output, operator });
```

- [ ] **Step 2: Send identity from the client caller**

Find the client fetch that POSTs to `/api/nodes/${id}/generate` (in the prompt node/focus view). Include the maker in the body:
```ts
const { identity } = useIdentity(); // add near other hooks
// in the POST body:
body: JSON.stringify({ ...existingFields, operator: identity?.name ?? null }),
```

- [ ] **Step 3: Verify with a manual check + typecheck**

Run: `npx tsc --noEmit`
Then manually (dev server): set identity via the gate, generate a prompt, and confirm the new `node_versions` row has `operator` set:
```bash
# in Supabase SQL editor or psql:
# select id, operator, approval_status from node_versions order by created_at desc limit 1;
```
Expected: newest row shows your name in `operator`, `approval_status = 'pending'`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/nodes/[id]/generate/route.ts" src/components/nodes/prompt-focus-view.tsx
git commit -m "feat(approval): stamp maker identity into operator at generation (D29)"
```

- [ ] **Step 5: Replicate to the other generate routes (same two-line pattern)**

Apply Steps 1-2 to the remaining generate routes and their callers (`image-generate`, `video-generate`, `video-prompt`, `parse`). Commit per route.

---

## Self-Review

**Spec coverage:**
- §4.1 approval on active version + regenerate resets → Task 2 (action writes the passed active version id) + inherent (new version defaults `pending` via Task 1 migration). ✅
- §4.2 columns on the envelope, `note` reuse, `operator` = maker → Task 1 (columns), Task 2 (note handling), Task 7 (operator). ✅
- §4.2 three states, distinct from `decision` → Task 1 (check constraint), Task 2 (separate action, never touches decision). ✅
- §4.3 approve / request-changes / reset control → Task 5 (`InlineApprovalBar`). ✅
- §4.4 soft identity at app start + chip, spoofable, cosmetic role hint → Task 3 + Task 4 + Task 5 (`canApprove`). ✅
- §4.5 node badge + version-history status → Task 6 (badge) + Task 5 (API returns `approvalStatus`; version-history panel consumes it — note: if a per-type version-history component renders its own list, add the badge there too). ✅
- §5 upgrade path → documentation only; no task (correct — it's a future project). ✅
- §7 out of scope (gating/trigger/RBAC/notifications) → not implemented (correct). ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. Task 5 Step 6 and Task 7 Step 5 are explicit "repeat this exact pattern for these named files" (the pattern's code is fully shown above them) — acceptable, not a placeholder.

**Type consistency:** `ApprovalStatus` defined once in `src/lib/approval.ts`, imported everywhere. `Identity` defined once in `src/lib/identity.ts`. `buildApprovalUpdate` signature matches its test and its single caller (`setVersionApprovalAction`). API field names (`approvalStatus`/`approvedBy`/`approvedAt`) consistent between the route (Task 5 Step 1) and the focus-view consumer (Task 5 Step 3) and the load mapping (`approval_status` snake_case only at the DB boundary in Tasks 1/6).

**Note on DB-write tests:** the repo unit-tests pure functions (e.g. `planReconcile`) and does not mock Supabase for write paths. Following that convention, the pure `buildApprovalUpdate` / `parseIdentity` / `needsIdentityGate` / `nodeRowToFlow` mapping carry the automated coverage; the thin Supabase wrappers and UI are verified by typecheck + manual dev-server check (Task 7 Step 3).
