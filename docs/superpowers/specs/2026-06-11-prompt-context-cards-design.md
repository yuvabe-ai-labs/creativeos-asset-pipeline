# Prompt focus view — categorized context cards

**Date:** 2026-06-11
**Branch:** `feat/stage-2-prompt-node` (continues the Stage 2a Prompt-node work)
**Status:** Approved design

## Problem

The Prompt focus view ([src/components/nodes/prompt-focus-view.tsx](../../../src/components/nodes/prompt-focus-view.tsx))
shows the assembled prompt as a single undifferentiated `<pre>` ("Final compiled
prompt"). Three conceptually distinct inputs — the ambient brand KB, the
connected upstream nodes, and the operator's inline instruction — are concatenated
into one scrolling blob. The instruction is also duplicated: an editable textarea
in the left sidebar **and** an `Instruction:` line at the tail of the blob. There
is no label telling the user which part of the text came from where.

## Goal

Present the prompt's context as **three clearly categorized, individually viewable
sections**, each owning both its control and its content, with no duplication.

A separate concatenated "full compiled prompt" view is **deliberately not kept**:
once each part is shown in its own labeled card, the joined string is the same text
with framing labels added — redundant. The one thing it would otherwise hide is the
empty-instruction fallback, which the Inline card surfaces directly instead (see
below).

## The three contexts

| Context | Source | Control it owns | Content it shows |
|---|---|---|---|
| **Ambient** | Client's active Brand KB (auto-resolved, no edge) | `SliceToggles` (Tone / Personality / Compliance / Brand profile) | The resolved KB text for the selected slices |
| **Connected** | Upstream Script/Note nodes via graph edges | *(none — driven by canvas edges)* | Each upstream node: label + its output text |
| **Inline** | The operator | The editable instruction `textarea` | The textarea; when blank, muted helper text shows the effective fallback that will be sent |

## Layout

The focus-view body drops the `<aside>`/`<main>` two-column split. It becomes a
single inputs column of three stacked cards, then the Generate button, then the
generated-output area.

```
┌─ ◆ AMBIENT · Brand KB ──────────────────────┐
│ [Tone] [Personality] [Compliance] [Profile]  │  ← SliceToggles
│ Tone of voice: Calm, warm…                    │  ← resolved KB text (read-only)
└───────────────────────────────────────────────┘
┌─ ⛓ CONNECTED · 2 inputs ────────────────────┐
│ Script — Title: Reel A…                       │  ← each upstream node, label + text
│ Note — Hero product: turmeric latte           │
└───────────────────────────────────────────────┘
┌─ ✎ INLINE · Instruction ────────────────────┐
│ [ editable textarea… ]                        │  ← the only authored field
│ Will send: Write an image-generation prompt…  │  ← muted, only when textarea is blank
└───────────────────────────────────────────────┘

[ Generate prompt ]

GENERATED PROMPT
[ editable result / skeleton / empty state ]
```

Each card uses the system card treatment (white, `border-border`, `shadow-card`,
generous padding, Lucide icon at 1.5 stroke, `.text-eyebrow` label). Header shows
the context name + a small source badge ("Brand KB", "N inputs", "Instruction").

### Empty states
- **Ambient:** "No brand context selected." (when no slices toggled / KB empty)
- **Connected:** "Connect a Script or Note node to feed this prompt."
- **Inline:** placeholder `e.g. cinematic product hero shot, warm Ayurvedic palette…`

## Data flow

The cards need the **server-resolved** parts separately. The inline instruction is
already client-side state (the textarea), so it is **not** part of the response —
only the two parts the server computes are. The
[compile-preview route](../../../src/app/api/nodes/[id]/compile-preview/route.ts)
already resolves both via `resolvePromptInputs` and today discards them into one
`compiled` string. Reshape its response to the structured parts:

```ts
// POST /api/nodes/:id/compile-preview  →
{
  ambient: string,                                              // resolved.clientContext
  connected: { nodeId: string; label: string; text: string }[], // resolved.upstream (minus versionId)
}
```

- **No change** to `resolvePromptInputs` ([src/lib/nodes/resolve-inputs.ts](../../../src/lib/nodes/resolve-inputs.ts)).
- `compilePrompt` ([src/lib/nodes/prompt.ts](../../../src/lib/nodes/prompt.ts)) is no
  longer called by this route (nothing consumes the full string now), but stays the
  single producer used by `/generate`.
- The empty-instruction fallback string currently lives inline inside `compilePrompt`
  (`input.instruction.trim() || "Write an image-generation prompt from the material
  above."`). Extract it to an exported constant (e.g. `DEFAULT_INSTRUCTION` in
  `src/lib/nodes/prompt.ts`) so the Inline card and `compilePrompt` show/send the
  exact same sentence — one source of truth, no drift.
- No new DB queries: the route already has every field.

## Component change

`prompt-focus-view.tsx`:
- Replace the single `compiled` string state with a `preview` object holding
  `{ ambient, connected }` (the debounced compile-preview fetch populates it;
  best-effort, unchanged debounce/cancel logic).
- Replace the `<aside>` + `<main>` grid with the three cards + Generate +
  generated-output (the output/skeleton/empty/dirty/Save logic is unchanged).
- **Ambient card:** `SliceToggles` (existing `selected`/`onToggle` props) + `preview.ambient`.
- **Connected card:** renders `preview.connected` (label + text per node). The
  store-derived `upstream` prop (id + label, instant) drives the header count so the
  card reacts immediately to edge changes even before the preview round-trips.
- **Inline card:** the existing instruction `textarea` (`onPatch({ instruction })`);
  when `instruction.trim()` is empty, render muted helper text
  `Will send: {DEFAULT_INSTRUCTION}` beneath it.

If the cards' file grows past the component-structure ~200-line guidance, extract a
small `context-card.tsx` (label + icon + badge + children) and reuse it for all
three — decide during implementation based on actual size.

## Testing

- `compilePrompt` keeps its unit tests; extracting `DEFAULT_INSTRUCTION` is a
  refactor (the existing "defaults a missing instruction" test still passes, and can
  assert against the exported constant).
- The route change is a response reshape with no new logic; it follows the repo's
  existing pattern of not unit-testing route handlers. Verified via `tsc` + the
  manual e2e below.
- Manual e2e: open a Prompt node → confirm Ambient card shows KB text and reacts to
  slice toggles; connect a Note + Script → Connected card lists both with their text;
  leave the Inline instruction blank → the muted "Will send: …" fallback appears;
  type an instruction → the fallback disappears; Generate still works.

## Out of scope (YAGNI)

Per-card collapse/expand, editing connected-node text from the Prompt view,
reordering contexts, a raw concatenated full-prompt view.
