# KB-Gated Canvas Creation — Design Spec

**Date:** 2026-07-03  
**Status:** Approved

---

## Problem

The previous session built "KB Status Awareness" which allowed canvases to exist without brand context, showing a 4-state KB node with null data. The lead's input reverses this: **canvases must never exist without an approved Brand KB**. The complexity of tracking and displaying "what was created with/without brand context" is unwanted.

---

## Decision

Canvases can only be created when `client.kb_status === 'ready'`. The client home page gates access server-side — if KB isn't ready, the user is redirected to the KB setup page. The KB page itself already handles all sub-states correctly.

---

## Changes

### 1. Revert KB Status Awareness (commits 426120b → 77f993b)

Revert all 6 commits from the KB status awareness feature. This restores:

| File | Restored state |
|---|---|
| `src/lib/canvas-store.ts` | `kbStatus: 'none' \| 'building' \| 'ready'` (no `'in_review'`) |
| `src/components/canvas/canvas-kb-status.tsx` | No `clientKbStatus` prop; original derivation logic |
| `src/components/canvas/canvas.tsx` | No `clientKbStatus` prop |
| `src/app/clients/[id]/canvases/[cid]/page.tsx` | No `clientKbStatus` pass-through |
| `src/lib/actions/canvases.ts` | Only seeds KB+Script+edge when active KB exists |
| `src/components/nodes/kb-node.tsx` | Original single visual state, reads from `data` not store |
| `src/components/clients/kb-status-banner.tsx` | Deleted (new file — revert removes it) |
| `src/app/clients/[id]/page.tsx` | No `KBStatusBanner` import or usage |

**Revert strategy:** `git revert 77f993b 01b4e41 fbf8f5a 2dbe8b7 aac92d6 426120b --no-commit` then a single clean commit. This is cleaner than cherry-picking and avoids touching commits from earlier in the session that must be kept.

---

### 2. Add server-side redirect gate to client home page

In `src/app/clients/[id]/page.tsx`, after fetching the client and before rendering, add:

```typescript
if (client.kb_status !== "ready") {
  redirect(`/clients/${client.slug}/kb`);
}
```

`redirect` is already imported from `next/navigation` (it was there before and was removed during the earlier session — check and re-add if needed).

**Effect:**
- `kb_status === 'pending'` → redirect to KB page → upload step renders
- `kb_status === 'in_review'` → redirect to KB page → review step renders  
- `kb_status === 'ready'` → client home page renders normally with canvases + "New Canvas" button

---

### 3. Fix on-success redirect in KB upload step

In `src/components/kb/kb-onboarding-upload-step.tsx`, the `useEffect` that fires when `job.status === 'succeeded'` currently redirects to:

```typescript
router.push(`/clients/${clientSlug}`);
```

Change to:

```typescript
router.push(`/clients/${clientSlug}/kb`);
```

**Why:** With the gate in place, redirecting to `/clients/${slug}` when `kb_status` is `'in_review'` would immediately redirect back to `/clients/${slug}/kb` — a redirect loop. Staying on the KB page lets the server re-render the review step directly since `kb_status` is now `'in_review'`.

The KB page's existing logic already handles this: `isReviewOrEdit` is `true` when `kb_status === 'in_review'` and `activeKBVersion !== null`, so `KBOnboardingReviewStep` renders automatically.

---

## What Is NOT Changed

These fixes from earlier in the session are correct and must be preserved (they are in commits before `426120b`):

| Commit | What it fixed | File |
|---|---|---|
| `810e69a` | Progress indicator during KB build, hide extract button when running | `kb-onboarding-upload-step.tsx` |
| `f54e50e` | Supabase `23505` duplicate job error handling | `src/lib/actions/kb.ts` |
| `cc8fdca` | Website URL saved synchronously on extract; removed old `kb_status` redirect guard | `kb-onboarding-upload-step.tsx`, `clients/[id]/page.tsx` |
| `179ba07` | Website URL shown/editable in sources panel | `kb-source-panel.tsx`, `kb-onboarding-review-step.tsx` |

---

## User Flow (after this change)

```
New client created
  → User clicks client
  → client home page: kb_status = 'pending' → redirect /clients/[slug]/kb
  → KB page: upload step (KBOnboardingUploadStep)
  → User uploads docs/images, clicks "Extract & Build KB"
  → Job starts, live progress shown (Realtime via useKBJobStatus)
  → Job succeeds → router.push('/clients/[slug]/kb')
  → KB page re-renders: kb_status = 'in_review' → review step (KBOnboardingReviewStep)
  → User reviews fields, clicks "Approve"
  → markKBReadyAction sets kb_status = 'ready', revalidates /clients/[slug]
  → User navigates to /clients/[slug]
  → Client home page renders: canvases list + "New Canvas" button
```

**Returning to a client mid-build:**
```
User on another client's canvas → navigates to /clients/[slug] of a building client
  → kb_status = 'pending' → redirect /clients/[slug]/kb
  → Upload step renders with live progress (initialJob passed from server, Realtime resumes)
```

---

## Out of Scope

- Blocking navigation to existing canvases of a client whose KB is not ready (existing canvases are always accessible via direct URL or breadcrumb — only new canvas creation is gated)
- Any UI on the canvas itself reflecting KB status (the KB node already shows the ready state; no changes needed)
- Re-extracting KB after it's `'ready'` (handled by existing edit mode on the KB page)
