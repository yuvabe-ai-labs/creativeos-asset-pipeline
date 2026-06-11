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
sections**, each owning both its control and its content, with no duplication. Keep
a way to see the exact string sent to the model.

## The three contexts

| Context | Source | Control it owns | Content it shows |
|---|---|---|---|
| **Ambient** | Client's active Brand KB (auto-resolved, no edge) | `SliceToggles` (Tone / Personality / Compliance / Brand profile) | The resolved KB text for the selected slices |
| **Connected** | Upstream Script/Note nodes via graph edges | *(none — driven by canvas edges)* | Each upstream node: label + its output text |
| **Inline** | The operator | The editable instruction `textarea` | *(the textarea is the content)* |

## Layout

The focus-view body drops the `<aside>`/`<main>` two-column split. It becomes a
single inputs column of three stacked cards, followed by a collapsible full-prompt
disclosure, the Generate button, then the generated-output area.

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
└───────────────────────────────────────────────┘

▸ View full compiled prompt          ← collapsed; exact string sent to the model (D3)

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

The cards need the three parts **separately**. The
[compile-preview route](../../../src/app/api/nodes/[id]/compile-preview/route.ts)
already resolves all of them via `resolvePromptInputs` and today discards them into
one `compiled` string. Reshape its response to also return the structured parts:

```ts
// POST /api/nodes/:id/compile-preview  →
{
  ambient: string,                          // resolved.clientContext
  connected: { nodeId: string; label: string; text: string }[], // resolved.upstream (minus versionId)
  inline: string,                           // the operator instruction (raw, as typed)
  compiled: string,                         // compilePrompt(...).user — the full assembled string
}
```

- **No change** to `resolvePromptInputs` ([src/lib/nodes/resolve-inputs.ts](../../../src/lib/nodes/resolve-inputs.ts))
  or `compilePrompt` ([src/lib/nodes/prompt.ts](../../../src/lib/nodes/prompt.ts)).
- `compilePrompt` remains the **single producer** of the full `compiled` string, so
  the "View full compiled prompt" disclosure can never drift from what `/generate`
  actually sends — both call the same pure function.
- No new DB queries: the route already has every field.

The generate route's response keeps returning `compiled` (already does); the focus
view will reuse it to refresh the disclosure after a generation, same as today.

## Component change

`prompt-focus-view.tsx`:
- Replace the single `compiled` string state with a `preview` object holding
  `{ ambient, connected, inline, compiled }` (the debounced compile-preview fetch
  populates it; best-effort, unchanged debounce/cancel logic).
- Replace the `<aside>` + `<main>` grid with the three cards + collapsible disclosure
  + Generate + generated-output (the output/skeleton/empty/dirty/Save logic is
  unchanged).
- **Ambient card:** `SliceToggles` (existing `selected`/`onToggle` props) + `preview.ambient`.
- **Connected card:** renders `preview.connected` (label + text per node). The
  store-derived `upstream` prop (id + label, instant) drives the header count so the
  card reacts immediately to edge changes even before the preview round-trips.
- **Inline card:** the existing instruction `textarea` (`onPatch({ instruction })`).
- **Disclosure:** a collapsed section (native `<details>` or a small `useState`
  toggle) showing `preview.compiled` in the same `<pre>` style as today.

If the cards' file grows past the component-structure ~200-line guidance, extract a
small `context-card.tsx` (label + icon + badge + children) and reuse it for all
three — decide during implementation based on actual size.

## Testing

- `compilePrompt` is already unit-tested and unchanged.
- The route change is a response reshape with no new logic (the assembly stays in
  `compilePrompt`); it follows the repo's existing pattern of not unit-testing route
  handlers. Verified via `tsc` + the manual e2e below.
- Manual e2e: open a Prompt node → confirm Ambient card shows KB text and reacts to
  slice toggles; connect a Note + Script → Connected card lists both with their text;
  type an instruction in the Inline card; expand "View full compiled prompt" → it
  equals ambient + connected + `Instruction:` framing; Generate still works.

## Out of scope (YAGNI)

Per-card collapse/expand, editing connected-node text from the Prompt view,
reordering contexts, persisting which cards are expanded.
