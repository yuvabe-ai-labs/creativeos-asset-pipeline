# Async image and composite generation: design

**Date:** 2026-10-12  
**Decision:** D366 (supersedes D35's rejection of async image generation; refines D26)  
**Status:** approved in conversation, awaiting spec review

## Problem

Image Gen and Composite generations run inside the browser's request: the route calls the model,
waits for it, saves the image and answers. Slow models (GPT Image at high quality) take long enough
that leaving the canvas or closing the tab loses the result on screen, and a run that outlives the
function's time limit is lost outright. Video does not have this problem: it runs as a Trigger.dev
background job and the browser watches the generation row.

## Goal

Every Image Gen and Composite generation, including edits, runs as a background job like video.
Leaving the canvas, switching canvases or closing the tab never loses a result.

## Scope

In scope:

- Image Gen: generate, and edit (painted region or typed instruction).
- Composite: generate, and edit.
- One generation at a time per node: Generate and Edit are disabled while one is running.

Out of scope:

- Avatar Studio images (D291), prompt-writing generations, video (already async).
- Real-time canvas sync for other viewers (separate design).

## Design

### 1. Routes: `image-generate`, `composite-generate`

Everything up to and including the credit reservation stays as it is: body validation, reference
checks, prompt building, `insertGeneration` (`running`), `reserveCredits`. Then:

1. **Refuse a second run.** If the node already has a `running` generation, answer `409`
   ("This node is already generating."). Checked before anything is inserted or reserved.
2. **Upload the mask first.** A painted mask (base64 PNG, can be several MB) is uploaded to storage
   under the node's image path; the task receives its URL, never the bytes.
3. **Sign the result upload.** The task has no storage credentials (as with D284's voice change).
   The route signs one PUT URL per output type the providers return (`image/png`, `image/jpeg`,
   `image/webp`), each with its public URL, valid for two hours.
4. **Start the task** `image-generate` with the generation id, model, prompt, reference URLs,
   params, mask URL and the signed uploads.
5. **Answer `202 { generationId }`.**

If starting the task fails, the route fails the generation and refunds, as video does.

The composite pipeline (`runCompositeGeneration`) and the image route share the new
"reserve and start the task" step, so a credit-path fix still lands once.

### 2. Task: `trigger/image-generate.ts`

1. Load the model's provider from the image registry (dynamic import, as `video-generate.ts` does).
2. If there is a mask URL, download it and pass it to the provider as base64.
3. Call the provider.
4. Read the image's width and height (sharp is already available to tasks).
5. Upload the bytes with the signed URL matching the result's type.
6. Post to the generation webhook:
   `{ generationId, status: "succeeded", kind: "image", imageUrl, mimeType, width, height,
   fileSizeBytes, tokensUsed, costUsd }`.

On any failure it posts `{ generationId, status: "failed", error }` and rethrows, so the run shows
as failed with the real reason. Retries follow the project default (two attempts) up to and
including the provider call. Once the image is uploaded it has been paid for, so a failure after
that point (the webhook unreachable) aborts the run without a retry (`AbortTaskRunError`) and
names the image URL, so it is never generated, and charged, twice.

### 3. Completion: image branch in `completeGeneration`

The webhook already authenticates (D89), ignores duplicates (`status !== "running"`) and checks the
org (D79). The new branch, for `kind: "image"`:

- **Success:** insert the version (maker, inputs and params from the generation row's snapshots,
  plus `tokensUsed`, width, height and size), make it active, compute the cost (`costUsd` when the
  provider reported one, otherwise `computeImageCost` from tokens), settle credits, mark the
  generation succeeded with the image URL.
- **Failure:** insert a failed version with the error, fail the generation, refund the reservation.

### 4. Browser

- **One status hook for every generating node.** `useVideoGenStatus` becomes a per-node generation
  status hook used by Image Gen, Composite and Video Gen. It already reads a running generation
  from the database on mount and listens for its completion, so a reload or a return to the canvas
  picks the run back up.
- **Image Gen and Composite focus views:** Generate and Edit send the request, then show
  "Generating…" from the status hook and stay disabled until it finishes. On success the versions
  cache refreshes, the card shows the new image and the toast fires. On failure the error shows as
  it does today.
- **Leaving is safe.** The view can be closed, the canvas left or the tab closed; the result is
  saved when the job finishes and shows on return.

### 5. Generation tray

Remove the rule that shows a `running` image as failed after five minutes (D35's stale rule for
synchronous images). A run that never finishes is caught by the stuck-generation sweep, as video is.

## Error handling

| Case | Result |
|---|---|
| Node already generating | `409`, nothing reserved |
| Credit limit reached | `402`, generation failed, nothing started |
| Task could not be started | Generation failed, credits refunded, error shown |
| Provider error | Failed version with the reason, credits refunded, error shown |
| Upload or webhook failure after a successful provider call | Run fails loudly, naming the image URL so it can be recovered |
| Job never reports back | Stuck-generation sweep fails it and refunds |
| Duplicate webhook delivery | Ignored |

## Deployment

- The Trigger.dev projects (staging and production) need the image providers' API keys
  (OpenAI, Gemini, Seedream) in their environment.
- Deploy the task before the routes start calling it.

## Testing

- Route: refuses a second run; uploads the mask; starts the task with the expected payload; answers
  `202`; fails and refunds when the task cannot start.
- Task: success posts the image fields; failure posts the reason and rethrows; a mask is downloaded
  and passed through.
- Completion: the image success branch creates and activates the version and settles; the failure
  branch records the failure and refunds; a duplicate is ignored.
- Tray: a long-running image is no longer shown as failed.
- Manual: generate and edit on both node types, leave the canvas mid-run and come back, close the
  tab mid-run and reopen, run out of credits.

## ADR entry (to append to §7)

### D366 — Image and Composite generations run as background jobs *(recorded 2026-10-12; refines D26, supersedes D35's rejection)*

**Decision.** Image Gen and Composite generations, including edits, run as the `image-generate`
Trigger.dev task, the same pipeline as video: the route reserves and starts the task, the task
uploads through signed URLs and reports to the generation webhook, which graduates the version.
One generation at a time per node.

**Why.** Synchronous image runs were lost when the operator left the canvas or closed the tab, and
slow models (GPT Image high quality) approach the function time limit. D26 anticipated degrading a
slow synchronous path to the asynchronous one; in practice image durations made that the norm.

**Rejected.** Keeping the work in the Vercel function after responding (`after()` / `waitUntil`):
still bound by the function time limit and no retries. A task that writes to the database directly:
duplicates the completion logic outside the authenticated webhook (D89) and its org check (D79).

**Originated →** `2026-10-12-async-image-generation-design.md`.
