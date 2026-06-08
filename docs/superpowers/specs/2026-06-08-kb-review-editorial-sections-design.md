# Brand KB review — editorial gutter sections design

**Date:** 2026-06-08
**Status:** Implemented

## Context

The Script node's focus view ([script-focus-view.tsx](../../../src/components/nodes/script-focus-view.tsx) →
[script-document.tsx](../../../src/components/nodes/script-document.tsx)) renders the parsed reel script
as an "editorial document": each field group is a `Section` with a **left gutter** holding a short
purple kicker rule + a tracked `text-eyebrow` label, the content in a right column, and generous
vertical rhythm between sections. It reads like a premium document, matching the Yuvabe Studios design
system ("light editorial premium").

The Brand KB review page at `/kb`
([kb-onboarding-review-step.tsx](../../../src/components/kb/kb-onboarding-review-step.tsx)) used an
older look: a left module-card nav and a right detail pane where each field was a self-contained
**bordered card** ([kb-field-row.tsx](../../../src/components/kb/kb-field-row.tsx)) with an inline
header of label + status/confidence pills + action buttons.

**Goal:** make the right detail pane match the Script focus view's editorial **sections**, and add a
**tick mark in the gutter** when a field is reviewed.

## Decisions

- **Keep the left module-card nav.** Only the right detail pane is restyled.
- **Tick mark lives in the gutter, per section.** The detail pane shows one module at a time, so the
  natural mapping is **one field = one section**; the gutter cue flips to a tick once the field is
  reviewed.
- **No behavior change.** Same props, handlers, and review flow (edit / approve / reject / restore /
  re-analyze / approve-all / mark-ready). This is a purely presentational restyle.
- **Action buttons stay always-visible** (not hover-revealed) to preserve discoverability and match
  prior behavior.

## Design

### `kb-field-row.tsx` — card → gutter section

Each field renders as a two-column section (`grid gap-x-10 gap-y-2.5 sm:grid-cols-[160px_1fr]`,
gutter `self-start sm:sticky sm:top-2`), copying the visual pattern of `script-document.tsx`'s
`Section`.

**Gutter (left column):**
- **Reviewed cue** in a fixed-height slot (`h-3.5`, so labels stay aligned across states):
  - `needs_review` → purple kicker rule (`h-0.5 w-6 rounded-full bg-primary/70`)
  - `approved` → emerald `CheckCircle2` tick
  - `edited` → blue `CheckCircle2` tick
  - `rejected` → muted dash (`bg-muted-foreground/40`)
- **Label** as the shared `.text-eyebrow` utility; `rejected` adds `line-through` + muted.
- **Confidence chip** (`CONFIDENCE_CLASSES`) and the `inferred` note beneath the label, small and muted,
  so review signal is preserved.

**Content (right column):** the three existing branches, unchanged in behavior, moved out of a card body:
- **Reanalyzing:** spinner + "Re-analyzing…".
- **Editing:** manual `textarea` + Save/Cancel + AI-guidance block.
- **Display:** value text, or italic "No data extracted" when empty; `rejected` keeps `line-through`.
- **Action buttons** (approve-empty / edit / reject / restore) `float-right` at the top of the content
  column so the value text wraps around them; always visible.

**Dropped:** the per-row `STATUS_CLASSES` border/background tint and the `STATUS_TAG_CLASSES` status
pill — the gutter tick now carries "reviewed" state. (`rejected`'s muted `line-through` is retained.)

`formatValue`, all keyboard handlers, and the edit/AI textareas are untouched.

### `kb-onboarding-review-step.tsx` — detail rhythm

The detail fields container changes from `space-y-3` to a sectioned document rhythm with hairline
dividers: `divide-y divide-border/60 [&>*]:py-6 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0`. The
module header (title + reviewed count + Approve All), the `allImageAnalysisNull` empty state, the left
nav, dialogs, and source panel are unchanged.

### On sharing the `Section` primitive

`script-document.tsx`'s `Section` is local and its gutter has no tick/confidence. Rather than couple
the two domains, the gutter is re-implemented inline in `kb-field-row.tsx` (it needs the tick +
confidence the script version doesn't). The shared contract is the *visual pattern* (`text-eyebrow` +
`bg-primary/70` kicker + `sm:grid-cols-[160px_1fr]`), not a shared component.

## Files

| File | Change |
|---|---|
| [src/components/kb/kb-field-row.tsx](../../../src/components/kb/kb-field-row.tsx) | Card → editorial gutter section; gutter tick when reviewed; eyebrow label; keep all actions/states |
| [src/components/kb/kb-onboarding-review-step.tsx](../../../src/components/kb/kb-onboarding-review-step.tsx) | Detail fields container `space-y-3` → hairline-divided sections |

## Verification

1. `npx tsc --noEmit` — clean. ✅
2. `npx eslint <the two files>` — clean. ✅
3. Manual: `npm run dev`, open `/clients/<slug>/kb` for a client whose KB is `in_review` or `ready`:
   - Each field renders as a section: left gutter with `text-eyebrow` label + purple kicker rule,
     value/actions in the right column, generous spacing — matching the Script focus view.
   - Approve → emerald gutter tick; edit → blue tick; reject → muted dash + `line-through`; restore
     brings it back.
   - Edit (manual + AI guidance), Re-analyze spinner, "No data extracted" empty value, and the
     image-analysis empty state all still render and work.
   - Left module nav, Approve All, Mark KB Ready, and the source-documents panel are unchanged.
