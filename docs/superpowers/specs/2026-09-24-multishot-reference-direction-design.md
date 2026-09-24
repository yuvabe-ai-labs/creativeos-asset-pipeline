# Multishot Prompt — Direction box and reference roles (D281)

*2026-09-24 · status: design approved, awaiting spec review*

## Problem

An operator attached a three-angle character turnaround (front / profile / back, plain light-grey
studio backdrop) to a Multishot Prompt node as an identity reference. The generated plan pulled
the turnaround's **backdrop and studio light** into the look and atmosphere, so the sequence came
back on a light studio background the script never asked for.

The system prompt already forbids this — `MULTISHOT_LOOK_BLOCK_RULES` says "Never derive the look
from … the reference images" — and the writer did it anyway. Two causes:

1. **The images arrive unlabelled.** `buildUserContent` appends bare `image_url` parts after the
   text. The writer cannot be told *what each image is for*, so it guesses, and a grey-backdrop
   sheet is the loudest visual signal in the request.
2. **The operator has nowhere to say it.** The sequence-level `instruction` is still stored and
   still sent ("For the sequence as a whole: …"), but its editor was removed on 2026-09-08.

## Decision

Give the operator a **Direction** box where they @-mention references and say what each is for, make
those mentions resolvable by numbering the attached images, and add a hard identity-only default
to the prompt as a backstop.

### 1. Direction box (UI)

- In `multishot-prompt-focus-view.tsx`, INPUT column, **between the reference strip and the shots
  list**. Label: `FieldLabel` "Direction".
- A `MentionInstructionEditor` bound to `instructionDraft`, with the default mention dialect
  (stores `@[Label](nodeId)` — already drift-proof per BUG-010), mentionables = the connected
  reference images.
- Writes through `onPatch({ instruction })` on change, the same local-draft pattern the view
  already uses (`instructionDraft` seeded on open / node switch only). It is node input, not plan
  output, so it is NOT gated by the plan's `dirty` Save/Cancel buffer.
- Placeholder: *"e.g. @image is the character — identity only, ignore its backdrop. Take the
  setting and light from @image."*
- Disabled when read-only (D33) or while generating / refining.
- Per-cut instruction editors stay removed (the 2026-09-08 request); only the sequence-level
  field returns. Update the comment at the old removal site to say so.

### 2. Mentions mean something to the writer (server)

- **Number the attachments.** `buildUserContent` gains an optional labelling mode used by the
  multishot route: each image part is preceded by a text part `Reference image N:` (N = 1-based
  position in `visionAttachmentsOf(upstream)` — the single numbering source). Other callers are
  unchanged.
- **Resolve the Direction's chips.** A new pure function `resolveRefMentions(text, refs)` in
  `ref-binding.ts` turns `@[File: man.png](id)` into `reference image 2 (man.png)` using the
  position of `id` in `refEntriesOf(resolved.upstream)`. A mention of an image no longer connected
  becomes its plain display name (same rule as `renderRefs`). The route applies it to
  `instruction` before `buildMultishotUserTurn`, mirroring how `resolvePlanMentions` is applied to
  the refine note.
- The writer still never WRITES reference tokens (D233); it only reads the operator's.

### 3. Backstop (prompt)

In `referenceIdentificationBlock` (shared by both writers):

> A REFERENCE IS IDENTITY ONLY unless the operator's direction says to take something else from
> it. From a reference, carry who or what it shows — face, build, hair, wardrobe, product design.
> Never carry its background, backdrop, studio lighting, colour of the seamless, camera angle or
> framing into the look or into any beat. A sheet showing one subject from several angles on a
> plain background is an identity sheet, never a location.

In `MULTISHOT_LOOK_BLOCK_RULES`, "stated direction" explicitly includes an operator direction that
names a reference as the source of look ("take the setting and light from reference image 2") —
then describe that image's setting as repeatable physical facts. Otherwise unchanged.

Bump `MULTISHOT_PROMPT_ID` → `@10`, `MULTISHOT_KLING_PROMPT_ID` → `@7`, with version notes.

## Out of scope

- Per-reference role pickers (Subject / Product / Look). Rejected for now: the Direction box
  covers the same need with one control; revisit if operators keep typing the same roles.
- Per-cut instruction editors.
- The single-take Video Prompt node (same class of bug may exist there; separate change).

## Testing

- `resolveRefMentions`: connected → numbered with name; disconnected → plain name; no mentions →
  unchanged.
- `buildUserContent` labelled mode: text part before each image, numbering matches
  `visionAttachmentsOf`; unlabelled default output byte-identical to today.
- `buildMultishotUserTurn` / route: the instruction reaches the user turn resolved.
- Prompt tests: both system prompts contain the identity-only rule; IDs bumped.
- Manual: the turnaround + kitchen references from the bug report, direction "@turnaround is the
  character, identity only" → look block does not mention a grey / studio backdrop.

## ADR

Append **D281 — Reference images are identity-only unless the operator's Direction says otherwise**
to the roadmap §7 (Decision / Why / Rejected: role pickers, prompt-only fix / Refines D233, D262).
