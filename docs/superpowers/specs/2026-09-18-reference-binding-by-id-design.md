# Reference binding by id — design

**Status:** approved in brainstorm 2026-09-18 · **Bug:** BUG-010 (`docs/qa/bugs.md`) · **ADR:** D272

## Problem

A generated prompt stores image citations as **positions** — `<IMAGE_REF_0>` (Gemini Omni),
`@Image 1` (Seedance), `@image_1` (Kling) — in two places: the single-take Video Prompt output and
multishot beats. Every reader resolves a position against the images connected **now**
(`visionAttachmentsOf(promptUpstream)`). Disconnect image A of A, B, C and B's citation silently
binds to C; Video Gen generates and bills with the wrong picture. The Instruction field never drifts
because it stores `@[Label](nodeId)` — by id.

## Decisions (from the brainstorm)

1. **Store ids, number at the edge.** Persisted prompt text carries `@[Label](nodeId)`. Positions
   exist only at the two LLM/model boundaries: text going TO a writer or a video model is rendered to
   the model's numbers over the images connected at that moment; text coming BACK from a writer is
   converted to ids using the order that writer saw.
2. **A cited image that is gone blocks Generate.** Its chip renders broken (the editor's existing
   orphan style), the prompt node shows a warning, and the Video Gen route refuses before any
   generation row or credit reservation: *"'Sandals.png' is cited in the prompt but no longer
   connected — reconnect it or regenerate the prompt."*
3. **Old data is not migrated.** Positional text keeps today's behaviour (read against the current
   order). It becomes id-based the next time it is saved or regenerated — a side effect of
   `storedRefDialect` reading positions and writing ids, not a migration.
4. **Scope: token dialects only.** Omni and Seedance single-take prompts, and all three multishot
   dialects. Veo / Kling single-take prompts cite images in prose ("the first image") — unchanged.

## Design

### Unit: `src/lib/nodes/ref-binding.ts` (new, pure)

- `storedRefDialect(modelDialect)` — a `TokenDialect` whose `parse` reads BOTH `@[Label](id)` and
  the model's positional tokens (positional resolved via the model dialect, i.e. current order), and
  whose `tokenOf`/`tokenForId` always write `@[Label](id)`. Used by every editor on generated
  output. Loading an old prompt shows chips as today; saving it writes ids.
- `toStoredRefs(text, modelDialect, orderedIds, labelFor)` — writer output → stored form.
- `renderRefs(text, modelDialect, orderedIds)` → `{ text, missing: { id, label }[] }` — stored form
  → model numbers over `orderedIds`. A mention whose id is not in `orderedIds` is reported in
  `missing` (and left as its label in `text`, never renumbered onto a neighbour).

The three model dialects are unchanged; `ref-binding` composes them.

### Save path (writer output → ids)

- `api/nodes/[id]/video-prompt/route.ts` — for Omni / Seedance targets, convert the writer's output
  with `toStoredRefs` over the vision attachments the writer was sent, before the version is written.
- `api/nodes/[id]/multishot-prompt/route.ts` — beats sent to the writer (refines carry the existing
  plan) are rendered with `renderRefs`; the returned plan's beats and look go through
  `toStoredRefs`. Same order both ways.
- Hand edits need no conversion: the editors use `storedRefDialect`, so chips serialize as ids and
  `savePromptOutputAction` stores them as-is.

### Send path (ids → numbers)

- `lib/video-gen/resolve-prompt.ts` renders both lanes with `renderRefs` over the prompt node's
  vision attachments — the order `orderImagesForPromptTokens` already puts first — and returns
  `missing`. `renderPlan` gains the ordered ids so the multishot ladder is rendered the same way.
- `api/nodes/[id]/video-generate/route.ts` refuses with the message in Decision 2 when `missing` is
  non-empty — before `insertGeneration` and `reserveCredits`, beside the existing D97/D236 guards.
- `checkPlanLimits` measures the rendered text (ids are longer than numbers; the budget is the
  vendor's, on what is sent).

### Display path

- Video Prompt and Multishot Prompt focus views pass `storedRefDialect(...)` to
  `MentionInstructionEditor`. Missing images render as orphan chips (existing style).
- A warning line on each prompt focus view when any citation is missing, same shape as the D237
  model-mismatch line.
- "Prompt" tab / `GeneratedPromptBody`, the `upstream-images` preview route and "Sent to model"
  read `renderRefs` output, so the preview is exactly what ships.
- `refsCitedIn` returns cited ids (via the stored dialect); `uncitedIndices` maps ids to strip
  positions.

## Testing

- `ref-binding` unit tests per dialect: store→render round trip; A,B,C with A removed renders B and C
  to the right numbers; a cited missing id is reported and never renumbered; legacy positional text
  passes through unchanged; mixed legacy + id text.
- Route tests: video-generate refuses with the missing-image message and writes no generation or
  reservation; multishot-prompt stores ids from a writer's positional output.
- Existing multishot / video-prompt / resolve-prompt suites stay green.

## Out of scope

Veo / Kling single-take prose; migrating stored prompts; start-frame role shifting numbering (a
separate, pre-existing concern documented in `assign-image-roles.ts`).
