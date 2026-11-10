# Video Gen: Edit mode (video in, video out)

**Date:** 2026-11-10
**Status:** Approved, to be planned. Recorded as **D483** in
`2026-05-30-creativeos-staging-roadmap.md` §7.
**Relates to:** D27 / D37 (Image Gen edit), D284 (Edit voice as a version action), D390 (Editor
lock), D217 (Omni request shape).
**Grounded in:** live tests of `gemini-omni-1.1-flash` with `video_config.task: "edit"` on
Chupps and Jackfruit 365 takes, November 2026 (results page kept outside the repo).

---

## 1. Problem

Most review feedback on a finished take asks for a small change, not a new take: the flour
should be beige, she should smile, the pan should fit in the frame. Today the only route is to
change the prompt and generate again, which costs a full take and often loses what was already
right. Omni can take a video and return the same video with one change applied.

## 2. Scope

In:

- An **Edit video** tool on the Video Gen focus view, beside **Change voice** (D487).
- Editing the **whole active take**, with a typed instruction and chosen reference images.
- The result is a **new version** of the same node.

Out (this version):

- Editing a section of a take.
- Review comments offered as starting points.
- Editing inside the Rough Cut Editor.
- A separate edit node.

## 3. Layout

Edit video and Change voice are tools on the take, not main actions (D487). Two small icon
buttons sit at the right of the VIDEO heading: a sparkle for Edit video, a waveform for Change
voice. Their names show on hover, the one whose panel is open stays tinted, and a small dot shows
while its job runs. Opening one swaps the centre column for its panel under a slim header ("Edit
this video" / "Change the voice") with a Close that returns to the generate settings; opening one
closes the other. Moving off the active version closes both (D383).

While an edit runs, Edit stays open, the right column keeps the take under an "Editing the
video…" veil (as Change voice does), the button reads "Editing…", and reopening the node lands
back in Edit. The canvas card reads "Editing…".

The Edit video panel's button sits in the same pinned footer as Generate, with the reason it is
disabled shown above it.

Centre column:

1. **Model and resolution.** The generate settings' own controls: the model picker offering
   Omni 1.2 (default) and Omni 1.1 only, and the Resolution chips (360p · 720p · 1080p · 4k,
   default 720p) inside its card. Each model's limits apply: 1.2 takes up to 15 s and 6
   references, 1.1 up to 10 s and 12 references. 1080p and 4k are upscaled from 720p (see
   `cost.ts`), so they cost more for the same edit.
2. **References for this edit.** Thumbnails of the connected image inputs, each with a check.
   The images the take was generated with start checked. Same model as Image Gen's
   `editReferenceNodeIds` (D37): a reference must be a connected node; no upload here.
3. **Edit this video.** A `Textarea`. Placeholder: "Describe what to change and where: remove
   the cups… · replace the pot with the product reference… · make the light warmer…"
4. **Edit video** button with the credit estimate. Disabled while the instruction is empty, while
   the node is working, or while the node is locked by an Editor (D390).

All controls are shadcn primitives (`Button`, `Textarea`, `Tooltip`).

## 4. Request

One Omni interaction, `task: "edit"`:

```
input: [
  { type: "text",  text: <instruction, references written as <IMAGE_REF_n>> },
  { type: "video", data: <take, base64>, mime_type: "video/mp4" },
  { type: "image", ... }   // one per checked reference, in order
]
response_format: { type: "video", resolution, delivery: "uri" }
```

- The instruction is sent with a fixed suffix that asks the model to keep everything not named
  as it is (people, product, setting, lighting, camera). The literal text sent is recorded.
- Reference order follows the thumbnail order; `<IMAGE_REF_0>` is the first checked one. The
  reference cap is Omni's `maxReferenceImages`.
- No `duration` or `aspect_ratio`: the edit API rejects them. The output has the take's length
  and shape.
- The take is fetched server-side in the task, never sent through the route body (performance
  rule 8).

## 5. Data

No migration.

- **Generation:** a `generations` row of type `edit` (its own type, as a voice change is
  `voice`, so the view can tell an edit from a new take) with `model_used` set to the chosen Omni and
  `params_snapshot` `{ resolution, durationSeconds }`. It is billed by `computeVideoCost` at the
  chosen resolution for the take's length, the same rate as an Omni generation. Credits are
  reserved on start and refunded on failure.
- **Task:** the existing `video-generate` task, with one new payload field, `editVideoUrl`. The
  Omni provider sees it and sends an edit request instead of a generation. Waiting for the file,
  downloading it, storing it, appending the version and settling credits all stay on the existing
  path (`completeGeneration`). The task runs once and never retries (rule 12).
- **Length and reference caps:** the chosen model's own (1.2: 15 s, 6 references; 1.1: 10 s, 12
  references), read off its client spec. Our tests edited 3 to 6 second takes on 1.1; longer
  edits are untested.
- **Version:** appended with `insertVersion`, set active. `inputs_used.videoEdit`:

```
{
  baseVersionId,        // the take that was edited
  rootVersionId,        // the first generated take in the chain
  instruction,          // what the operator typed
  editPrompt,           // the literal text sent
  referenceNodeIds,     // the checked connected nodes
  referenceUrls,        // what was sent, in order
  resolution,
  modelId               // the Omni the edit ran on (absent on edits made before D485: those ran on 1.1)
}
```

- **Node data:** one `videoEdit` object, `{ instruction, referenceNodeIds, resolution, modelId }`, rides
  `nodes.data`, so a half-written edit survives closing the view.

## 6. Failures

| Case | What the operator sees | Charge | Version |
|---|---|---|---|
| Refused (children, swapping one person for another) | "This edit can't be made. Takes with children, or changing one person into another, are refused." | Refunded | None |
| Omni or network failure | "The edit didn't finish. Try again." | Refunded | None |
| Node feeds an Editor | Button disabled with the existing D390 reason | n/a | n/a |
| Node already working | Button disabled | n/a | n/a |

No vendor names or raw errors reach the UI. The provider maps a refusal to the plain message
before it reaches the generation row; the raw response stays in the task's log.

## 7. Limits shown under the instruction

One line, small: "The edit keeps the take's length and shape. It works best on a single
continuous shot. Captions on the video may change."

## 8. Testing

- Route: rejects an empty instruction, a locked node, a running node, and
  references from nodes not connected to this one (rule 14); reserves and refunds credits.
- Task: builds the request body (video part, image parts in order, no duration/aspect); maps a
  refusal to the refused message and refunds; appends a version with `inputs_used.videoEdit`.
- Focus view: the two tools are exclusive; switching versions closes both; Edit video is
  disabled with an empty instruction.
