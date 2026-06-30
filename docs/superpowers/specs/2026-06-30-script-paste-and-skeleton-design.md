# Script node — paste option + skeleton wiring

**Date:** 2026-06-30
**Status:** Approved (design), pending implementation plan
**Surface:** `src/components/nodes/script-empty-state.tsx`, `src/components/nodes/script-focus-view.tsx`

## Problem

Two small gaps in the Script node's focus view:

1. **No paste path.** The empty state only accepts a dropped/browsed `.md`/`.txt`
   file. A user who already has the brief on their clipboard has no way to get it in
   without first saving it to a file.
2. **The loading state is a generic spinner.** A purpose-built `ScriptSkeleton`
   (`src/components/nodes/script-skeleton.tsx`) already exists — a content-shaped
   shimmer that mirrors `ScriptDocument`'s gutter layout so it collapses into the real
   document with no layout shift — but it is never imported. The focus view's
   `skeleton` mode renders a centered `Loader2` spinner instead.

## Key existing facts (why this is small)

- Both ingestion flows terminate in a single callback: `onUpload(source: string)`.
  `readFile` in the empty state reads the file as text and calls `onUpload(text)`; the
  parse pipeline never sees a `File`. **Paste reuses this exact path — zero backend
  work.**
- The focus view's `onUpload` handler (`script-focus-view.tsx:275`) already does
  `onPatch({ source: s }); runParse(s);` — so pasted text becomes the "Show original"
  content and fires extraction for free.
- "Replace script" re-enters the `empty` mode, so paste-to-replace works automatically.

## Design

### 1. Paste option — `script-empty-state.tsx`

Below the existing dropzone, above the Title field:

- An `— or paste —` divider (centered label, hairline rules, `text-muted-foreground`).
- A shadcn `Textarea` (`src/components/ui/textarea.tsx` — never a native `<textarea>`),
  `placeholder="Paste your reel brief here…"`, ~6 rows.
- A primary `Extract` button (shadcn `Button`), **disabled when the buffer is empty or
  whitespace-only**. On click: `onUpload(buffer.trim())`.
- ⌘/Ctrl+Enter inside the textarea also submits (same guard).

State: one local `useState<string>` for the textarea buffer. **No new props, no new
types, no change to `ScriptEmptyStateProps`.**

Edge cases:
- Empty / whitespace-only → button disabled (mirrors the existing
  `if (text.trim())` guard in `readFile`).
- Brand-context toggles continue to apply — extraction reads the current `slices`
  regardless of which ingestion path fired.

### 2. Skeleton wiring — `script-focus-view.tsx`

- Replace the `mode === "skeleton"` block (the `Loader2` spinner, lines ~262–267) with
  `<ScriptSkeleton />`, imported from `./script-skeleton`.
- Drop the now-unused `Loader2` import if nothing else in the file uses it.
- No layout shift on parse-land: the skeleton mirrors `ScriptDocument`.

## Out of scope

- The small canvas node card already has its own shimmer bars — unchanged.
- No changes to the parse route, `reel-script`, or any node data shape.

## Testing — open decision

The repo has **no component-test harness today**: `vitest.config.ts` uses
`environment: "node"` and globs only `src/**/*.test.ts`; there is no
`@testing-library/react`, jsdom, or happy-dom, and no existing `.test.tsx`. Rendering
the empty state to assert button-disabled/enabled and the `onUpload` call is therefore
not possible without standing up a DOM-test stack.

Given the change is ~40 lines of presentational UI with no extractable pure logic
(the only "logic" is a `.trim()` non-empty guard), the proposed default is:

- **Verify in the running app** (`/run` or `npm run dev`): paste text → Extract fires
  parse; empty buffer keeps Extract disabled; skeleton shows the content-shaped shimmer
  during extraction and collapses cleanly into the document.

Alternative (if the user wants automated coverage): add jsdom + `@testing-library/react`
and a vitest project that globs `.test.tsx`. This is a larger, repo-wide change than the
feature itself and should be a separate decision — flagged here, not assumed.

## Decisions

- **D-paste-1:** Paste lives as a textarea + Extract button *below* the dropzone (always
  visible), not as a tab toggle. Rejected: tabs (extra chrome for a secondary path),
  paste-into-dropzone (undiscoverable). Keeps the dropzone as the primary action.
- **D-paste-2:** Reuse `onUpload(source)`; no new props or backend. Both paths converge.
- **D-skeleton-1:** Use the existing unused `ScriptSkeleton` rather than building a new
  loading state or keeping the spinner — it morphs into `ScriptDocument` without shift.
