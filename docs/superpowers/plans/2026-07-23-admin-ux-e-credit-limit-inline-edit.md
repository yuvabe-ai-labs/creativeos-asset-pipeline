# AX-E: Credit-Limit Inline Edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permanently-visible `Input` + `Save` button credit-limit editor with an
inline click-to-edit control, matching this app's existing inline-edit convention.

**Architecture:** Full rewrite of `src/app/admin/orgs/[id]/credit-limit-editor.tsx` (the same
file, same exported component name and props — the Settings tab in `OrgDetailTabs`, from
AX-C, doesn't change). Displays the committed value (or "Unlimited") as text with a dotted
underline on hover; clicking swaps it for an `Input` (autofocus); blur or Enter commits via
the existing `updateOrgCreditLimitAction`; Esc cancels and reverts the draft. Same
error-surfacing as today, just without permanent input chrome.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, shadcn `Input`.

## Global Constraints

- This is a visual-behavior change only — `updateOrgCreditLimitAction` (`src/lib/actions/admin.ts`)
  is unchanged and must be called with the exact same signature: `(orgId: string, rawLimit:
  string) => Promise<{ error?: string }>`.
- Follow `src/components/nodes/editable-field.tsx`'s established click-to-edit convention
  exactly: dotted underline on hover (`underline decoration-transparent decoration-dotted
  decoration-2 underline-offset-4`, `hover:decoration-primary/50`), faint `hover:bg-primary/5`
  background, `cursor-pointer`. That file's trigger element is a raw `<button>` — this is a
  **pre-existing, deliberate exception** to the shadcn-only-controls rule for exactly this
  inline-text-edit-trigger pattern (the same raw `<button>` already exists in
  `editable-field.tsx` today); mirror it, don't introduce a new violation by inventing a
  different pattern.
- No dependency on `useCanvasEditable()` / the canvas lock context — this page has no canvas,
  so the new component must be self-contained, not a reuse of `editable-field.tsx` itself.
- Testing convention: no jsdom/RTL in this repo — build check + manual verification, no
  fabricated component test.

---

### Task 1: Rewrite `CreditLimitEditor` as inline click-to-edit

**Files:**
- Modify: `src/app/admin/orgs/[id]/credit-limit-editor.tsx`

**Interfaces:**
- Consumes: `updateOrgCreditLimitAction` from `@/lib/actions/admin` (unchanged signature).
- Produces: `CreditLimitEditor({ orgId, initial }: { orgId: string; initial: number | null
  })` — same export name and props as today, so `OrgDetailTabs`'s existing
  `<CreditLimitEditor orgId={org.id} initial={org.monthly_credit_limit} />` call
  (`src/app/admin/orgs/[id]/org-detail-tabs.tsx`) needs no changes.

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/app/admin/orgs/[id]/credit-limit-editor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { updateOrgCreditLimitAction } from "@/lib/actions/admin";
import { Input } from "@/components/ui/input";

// Inline click-to-edit, following the app's editable-field.tsx convention (dotted
// underline on hover, click to reveal an input) rather than a permanently-visible
// input+button — this component is standalone (no canvas, so no useCanvasEditable lock).
export function CreditLimitEditor({
  orgId,
  initial,
}: {
  orgId: string;
  initial: number | null;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setEditing(false);
    if (draft === value) return;
    setSaving(true);
    setError(null);
    const res = await updateOrgCreditLimitAction(orgId, draft);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      setDraft(value);
    } else {
      setValue(draft);
    }
  }

  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Unlimited"
          className="max-w-40"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to edit"
        className="w-fit cursor-pointer rounded-md px-1.5 py-1 text-left underline decoration-transparent decoration-dotted decoration-2 underline-offset-4 transition-colors hover:bg-primary/5 hover:decoration-primary/50 disabled:cursor-default disabled:opacity-60"
      >
        {saving ? "Saving…" : value === "" ? "Unlimited" : value}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verification**

Run: `npm run build`
Expected: builds successfully.

Manual check (staging): on `/admin/orgs/[id]`'s Settings tab, the credit limit shows as text
with a dotted underline on hover; clicking it reveals an input; typing a new value and
pressing Enter (or blurring) saves it and shows the new value as text again; typing an
invalid value shows the error text below; pressing Esc while editing reverts without saving.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/orgs/[id]/credit-limit-editor.tsx
git commit -m "feat(admin): make credit-limit editor inline click-to-edit"
```

---

## Self-Review Notes

- **Spec coverage:** spec §6 in full — this is the last of the five AX sub-plans; all of
  spec §2-§6 are now covered across AX-A through AX-E.
- **Type consistency:** component name/props unchanged from today, so no cross-file update
  is needed anywhere else — verified `OrgDetailTabs`' existing call site matches as-is.
- **No placeholders:** complete, exact code in the one step that changes code.
