# KB-Gated Canvas Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revert the KB status awareness feature, add a server-side redirect gate on the client home page so canvases can only be created when KB is ready, and fix the on-success redirect in the KB upload step to avoid a redirect loop.

**Architecture:** Three changes in order: (1) revert 6 commits that added the KB status awareness feature, (2) add a `redirect()` call to the client home page server component, (3) change one `router.push` URL in the KB upload step. No new files, no new abstractions.

**Tech Stack:** Next.js App Router (server components, `redirect` from `next/navigation`), Supabase, React

---

## File Map

| Action | File | Change |
|---|---|---|
| Revert via git | 8 files | Remove KB status awareness feature entirely |
| Modify | `src/app/clients/[id]/page.tsx` | Add `redirect` import + KB status gate |
| Modify | `src/components/kb/kb-onboarding-upload-step.tsx` | Change on-success redirect URL |

---

## Task 1: Revert the KB status awareness feature (commits 426120b → 77f993b)

**Files:** 8 files restored to pre-feature state via `git revert`

These 6 commits must be reverted (most recent first):
- `77f993b` feat: add KBStatusBanner component and render on client home page
- `01b4e41` feat: kb-node 4 visual states reading from Zustand kbStatus
- `fbf8f5a` refactor: simplify kbNodeData construction in createCanvasAction
- `2dbe8b7` feat: always seed KB + Script + edge on canvas creation
- `aac92d6` feat: thread clientKbStatus into CanvasKBStatus for in_review derivation
- `426120b` feat: expand kbStatus union to include in_review

- [ ] **Step 1: Revert all 6 commits in one operation (no-commit mode)**

```
git revert 77f993b 01b4e41 fbf8f5a 2dbe8b7 aac92d6 426120b --no-commit
```

This stages the inverse of all 6 commits without creating individual revert commits. If there are conflicts, resolve them by accepting the "before" state (the revert direction).

- [ ] **Step 2: Verify the revert staged correctly**

```
git diff --cached --stat
```

Expected output: 8 files changed — the 8 files listed in the spec's revert table. Confirm none of the "What Is NOT Changed" files (from commits `810e69a`, `f54e50e`, `cc8fdca`, `179ba07`) appear in the diff.

- [ ] **Step 3: Verify key file states after revert**

Check these specific things in the staged diff:

**`src/lib/canvas-store.ts`** — `kbStatus` type must be back to `'none' | 'building' | 'ready'` (no `'in_review'`):
```
git diff --cached src/lib/canvas-store.ts
```

**`src/components/nodes/kb-node.tsx`** — must NOT import `useCanvasStore`; must read state from `data` prop, not store:
```
git diff --cached src/components/nodes/kb-node.tsx
```

**`src/components/clients/kb-status-banner.tsx`** — must be deleted (new file added by the feature):
```
git diff --cached src/components/clients/kb-status-banner.tsx
```

**`src/app/clients/[id]/page.tsx`** — must NOT have `KBStatusBanner` import or usage:
```
git diff --cached "src/app/clients/[id]/page.tsx"
```

- [ ] **Step 4: TypeScript check**

```
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If there are errors, they are likely stale references to `'in_review'` — fix them before committing.

- [ ] **Step 5: Commit the revert**

```
git commit -m "revert: remove KB status awareness feature"
```

---

## Task 2: Add server-side KB redirect gate to the client home page

**Files:**
- Modify: `src/app/clients/[id]/page.tsx`

The client home page currently has no KB status check. After this task, any client whose `kb_status !== 'ready'` will be redirected to `/clients/[slug]/kb` before the page renders.

Note: the `redirect` import from `next/navigation` was removed in an earlier commit (`cc8fdca`). It needs to be re-added.

- [ ] **Step 1: Read the current file to confirm its state after the revert**

Read `src/app/clients/[id]/page.tsx` and confirm:
- No `KBStatusBanner` import (removed by Task 1 revert)
- No `redirect` import from `next/navigation`
- The `if (!client)` guard exists (lines ~39-53)

- [ ] **Step 2: Add the `redirect` import**

The imports section currently starts with:
```typescript
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getClientBySlug } from "@/lib/db/clients";
```

Change to:
```typescript
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { getClientBySlug } from "@/lib/db/clients";
```

- [ ] **Step 3: Add the KB status gate**

After the `if (!client)` guard (which returns early with "Client not found"), add the redirect gate. The current code after the guard is:

```typescript
  const canvases = await listCanvases(client.id);
```

Change to:

```typescript
  if (client.kb_status !== "ready") {
    redirect(`/clients/${client.slug}/kb`);
  }

  const canvases = await listCanvases(client.id);
```

The redirect must come **before** `listCanvases` — no point fetching canvases if we're about to redirect.

- [ ] **Step 4: TypeScript check**

```
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

With the dev server running (`npm run dev`):
1. Navigate to a client whose `kb_status === 'pending'` → should land on KB page (upload step)
2. Navigate to a client whose `kb_status === 'in_review'` → should land on KB page (review step)
3. Navigate to a client whose `kb_status === 'ready'` → should land on client home page with canvases

- [ ] **Step 6: Commit**

```
git add "src/app/clients/[id]/page.tsx"
git commit -m "feat: redirect to KB setup when kb_status is not ready"
```

---

## Task 3: Fix on-success redirect in KB upload step

**Files:**
- Modify: `src/components/kb/kb-onboarding-upload-step.tsx` (around line 103-106)

Currently when the KB build job succeeds, the upload step redirects to `/clients/${clientSlug}`. With the gate added in Task 2, that would trigger: client home → redirect back to KB page (since `kb_status` is `'in_review'` at that moment, not `'ready'`). This is a redirect loop.

Fix: redirect to `/clients/${clientSlug}/kb` instead, so the KB page re-renders server-side and shows the review step directly.

- [ ] **Step 1: Locate the on-success useEffect**

The relevant code is around lines 102-110:

```typescript
  // Auto-redirect to client page when job succeeds
  useEffect(() => {
    if (job?.status === "succeeded") {
      router.push(`/clients/${clientSlug}`);
    }
    if (job?.status === "failed") {
      toast.error(job.error ?? "KB build failed");
    }
  }, [job?.status, job?.error, clientSlug, router]);
```

- [ ] **Step 2: Change the redirect URL**

Replace only the `router.push` line:

```typescript
  // Redirect to KB page on success — the page re-renders with review step
  // since kb_status will be 'in_review' at this point. Going to the client
  // home would redirect back here anyway (kb_status !== 'ready'), creating a loop.
  useEffect(() => {
    if (job?.status === "succeeded") {
      router.push(`/clients/${clientSlug}/kb`);
    }
    if (job?.status === "failed") {
      toast.error(job.error ?? "KB build failed");
    }
  }, [job?.status, job?.error, clientSlug, router]);
```

- [ ] **Step 3: TypeScript check**

```
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

With the dev server running, trigger a KB build (or simulate by manually updating a job row in Supabase to `succeeded` and `kb_status` to `'in_review'`):
1. Should land on the KB page showing the review step (`KBOnboardingReviewStep`)
2. Should NOT briefly flash the client home page before redirecting back

- [ ] **Step 5: Commit**

```
git add src/components/kb/kb-onboarding-upload-step.tsx
git commit -m "fix: redirect to KB review step after build succeeds, not client home"
```

---

## Self-Review Checklist

- [ ] `src/lib/canvas-store.ts` — `kbStatus` is `'none' | 'building' | 'ready'` (no `'in_review'`) after Task 1
- [ ] `src/components/clients/kb-status-banner.tsx` — file does not exist after Task 1
- [ ] `src/components/nodes/kb-node.tsx` — reads from `data` prop, no `useCanvasStore` import after Task 1
- [ ] `src/lib/actions/canvases.ts` — only seeds KB+Script+edge when `activeKB` exists (no always-seed) after Task 1
- [ ] `src/app/clients/[id]/page.tsx` — has `redirect` import and KB gate before `listCanvases` after Task 2
- [ ] `src/components/kb/kb-onboarding-upload-step.tsx` — on-success redirect goes to `/clients/${clientSlug}/kb` after Task 3
- [ ] TypeScript passes with no errors after all three tasks
- [ ] Commits from `810e69a`, `f54e50e`, `cc8fdca`, `179ba07` are untouched (progress indicator, error handling, website URL fixes remain)
