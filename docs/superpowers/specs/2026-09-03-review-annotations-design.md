# Review Annotations — region + note feedback on the approval flow

**Date:** 2026-09-03 · **Status:** Draft for review · **Author:** brainstormed with Claude
**Visual companion:** https://claude.ai/code/artifact/4775fc80-3716-4d16-b0ae-124f0be67a9c (wireframes of both focus views, decisions ledger)
**Builds on:** `2026-08-21-internal-approval-workflow-design.md` (D159–D167), `2026-08-24-approval-audit-trail-design.md` (D168–D172), `2026-08-24-decision-history-panel-design.md` (D173–D175)
**ADRs introduced:** D209–D214 (appended to the §7 log in `2026-05-30-creativeos-staging-roadmap.md`)

## 1. Problem

When a senior sends work back today, the entire feedback channel is one mandatory
text note on the `changes_requested` decision. "The logo in the top-left, sort of
behind the hand" is described in prose, and the maker reverse-engineers which
pixels the senior meant. Meanwhile the codebase already contains a proven
region-painting stack — the OpenAI edit-mode mask canvas — that is used for
telling a *model* which pixels to change, but never for telling a *person*.

Review Annotations lets the senior paint region + note pairs directly on the
reviewed image (or on paused video frames) as part of the existing
"Request changes" action. The pairs persist on the decision record, and the
maker reads them in place — pins on the media, notes a click away.

## 2. Goals

- Positional feedback: every note can point at the pixels it is about.
- Zero new review surfaces: composing and reading happen in the focus views the
  approval flow already routes to (R6.4: "the drawer routes").
- Replay-ready storage: each pair's mask + note is stored in the shape a future
  V2 could hand to the OpenAI image-edit pipeline (D27/D91) as an automated fix.
- Video included: annotations on paused frames with timecodes (the review queue
  is image-gen **and** video-gen, per `0031_review_queue.sql`).

**Non-goals (V1):** maker replies/threads on pins; annotations on approvals;
triggering AI edits from review; timeline-range video marks; editing an
annotation after the decision is sent; filmstrip frame pickers.

## 3. Decisions (summary — full rationale in §7 ADRs D209–D214)

| # | Decision | Rejected |
|---|---|---|
| D209 | Annotations are **feedback now, AI later**: persisted with the decision, stored replay-ready, no generation from review in V1 | Driving an edit directly; text-only feedback |
| D210 | Scope is **images + paused video frames** (captured still + timecode); image is the degenerate case | Image-only V1; timeline-aware video review |
| D211 | Granularity is a **list of region + note pairs** per decision; the existing mandatory note remains the summary | One mask + one note; pins without regions |
| D212 | Annotations attach to **"Request changes" only**; Approve discards drafts behind a confirm | Annotated approvals |
| D213 | Composing UI is **anchored popover** (paint → note beside the region → commit); the Review column lists committed pairs live | Side-rail list; docked note bar |
| D214 | The maker reads **the same surface read-only**; video timecodes seek the player; the captured frame (not the live seek) is ground truth | Baked thread snapshot; dedicated review viewer |

## 4. UX

### 4.1 Senior — composing (image)

1. In the focus view's Review section (`InlineApprovalBar`), "Request changes"
   opens the existing note composer, now with an **Annotate** affordance.
2. Entering annotate mode mounts the annotation canvas over the media pane's
   image. The senior paints a region (same brush/eraser rail as edit mode).
3. On stroke end, an **anchored popover** opens at the region's bounding box:
   a `Textarea` + "Add note" commit. Committing assigns the next pin number,
   clears the brush, and appends the pair to the draft list rendered in the
   Review column ("Annotations · n").
4. Repeat for further regions. Draft pins/regions stay visible on the image.
5. "Request changes" submits the decision note + all draft pairs together.
   Pin numbers are one continuous sequence per decision.
6. Approve (or leaving the focus view) with drafts present → confirm dialog
   ("Discard n annotations?"). Undo-to-pending does not touch past decisions.

### 4.2 Senior — composing (video)

Same loop with one extra step: the senior pauses the player where the problem
is; a **"Annotate frame"** button (visible only while paused, in the
Request-changes composer, for approvers) freezes the current frame — captured
client-side via `drawImage` into a canvas at the video's intrinsic size — and
the image flow above runs against that still. The pair records `timecode_ms`.
Multiple pairs on one frame are allowed (one capture, several regions).
The Review column groups pairs under timecode chips; clicking a chip (or a
numbered timeline dot) seeks the player. CORS note: capture requires
`crossOrigin="anonymous"` on the `<video>` and CORS-permissive storage URLs —
same-origin Supabase storage already qualifies. If capture fails (CORS,
decoder), a toast explains that this frame can't be annotated and the senior
falls back to the overall decision note — no partial row shapes.

### 4.3 Maker — reading

The "Sent back" inbox item routes to the focus view as today (D165/D203). If
the active version's latest decision is `changes_requested` with annotations:

- The media pane shows the regions + numbered pins, toggleable
  ("Annotations ✓"), auto-on on arrival. Clicking a pin opens its note popover
  (author, time, text) — the mirror of the composing view.
- The Review column lists the pairs (image: flat list; video: timecode groups
  with the captured-frame thumbnail). Video entries seek the player.
- `VersionDecisionThread` rows for decisions with annotations show "n
  annotations"; the per-version history remains the audit trail (D173).
- Read-only for everyone in V1, including the author after sending.
- Regenerating moves the active pointer to a fresh `pending` version (R3.6);
  old annotations stay attached to their decision in history, and the overlay
  never renders on a version other than the one that was annotated.

### 4.4 Roles & gating

Annotate affordances follow `canSetApproval(orgRole)` exactly (owner/senior).
Designers see the read-only rendering only. Enforcement is server-side in the
action, as with all approval writes (D166).

## 5. Architecture

### 5.1 Components (new/changed)

| Piece | What |
|---|---|
| `src/components/review-annotations/review-annotation-canvas.tsx` | Extraction of `ImageGenAnnotationCanvas` (props `{ baseUrl, alt, onRegionCommitted }` + handle). The edit-mode consumer switches to the extracted component; behavior there is unchanged. |
| `src/components/review-annotations/annotation-pin.tsx`, `annotation-popover.tsx` | Numbered pin + anchored note popover (compose and read variants). shadcn primitives only (`Popover`, `Textarea`, `Button`). |
| `src/components/review-annotations/annotation-list.tsx` | The Review-column list: flat for images, timecode-grouped with frame thumbs for video. Used in both compose (draft) and read modes. |
| `src/components/review-annotations/use-frame-capture.ts` | `captureFrame(videoEl) → { blob, timecodeMs }` with the CORS fallback. |
| `InlineApprovalBar` | Gains the Annotate entry point and draft state; submits drafts with the decision. |
| `image-gen-focus-view.tsx` / `video-gen-focus-view.tsx` | Mount the overlay on the existing media element (`~L1383` / `~L1334`); render the read-only layer. |

Reused as-is: `use-drawing-canvas.ts`, `draw-canvas.ts` (brush engine),
`overlayToMaskRGBA` in `src/lib/image-gen/mask.ts` (mask rasterization),
natural-pixel overlay sizing from the annotation canvas.

### 5.2 Data model

Migration `0035_review_annotations.sql` (verify 0035 is still free at
implementation time; 0034 is the latest on staging):

```sql
create table node_version_annotations (
  id            uuid primary key default gen_random_uuid(),
  decision_id   uuid not null references node_version_decisions(id) on delete cascade,
  org_id        uuid not null,
  seq           int  not null,                          -- pin number within the decision
  kind          text not null check (kind in ('image','video-frame')),
  timecode_ms   int,                                     -- null for kind='image'
  frame_path    text,                                    -- storage path of captured still (video)
  mask_path     text not null,                           -- storage path of region PNG
  note          text not null,
  created_at    timestamptz not null default now(),
  unique (decision_id, seq)
);
```

Same posture as `0033_node_version_decisions.sql`: RLS org-isolation SELECT
policy; writes via service role only; index on `(decision_id)`. Masks and
frames go to a `review-annotations` storage bucket
(`{org_id}/{decision_id}/{seq}-mask.png`, `…-frame.png`) — never inline in rows,
so decision queries and Realtime stay light. The mask PNG uses the existing
`EDIT_ALPHA`/`KEEP_ALPHA` convention from `mask.ts` so V2 replay needs no
translation.

### 5.3 Server action

`setVersionApprovalAction(versionId, { status, note, annotations? })` — the
existing action (`src/lib/actions/approval.ts`) accepts an optional draft array
`{ seq, kind, timecodeMs?, maskBase64, frameBase64?, note }` only when
`status === 'changes_requested'`. Order of operations:

1. Resolve caller + role-gate + tenancy check (unchanged, D166).
2. Upload masks/frames to storage (service role). Any upload failure fails the
   whole action **before** the decision is written — the senior's drafts are
   still local, so retry is lossless. (Unlike `insertDecision`'s best-effort
   append, annotations are the feedback itself, not a byproduct.)
3. Write the approval update, then `insertDecision`, then the annotation rows
   referencing the decision id.

Payload caps: mask ≤ 1 MB and frame ≤ 2 MB each, ≤ 20 annotations per
decision, and total action payload ≤ 8 MB (raise `serverActions.bodySizeLimit`
to match). Brush masks compress to tens of KB in practice; the caps are
guardrails, not targets.

Reading rides the existing derivations: `getDecisionsByVersionIds`
(`src/lib/db/decisions.ts`) gains a sibling
`getAnnotationsByDecisionIds`, and the focus-view review payload includes the
annotation rows with short-lived signed URLs for mask/frame assets.

### 5.4 Liveness

No new Realtime wiring. The decision write already bumps the org
`node_versions` channel (D179/D202); subscribers re-derive from the server and
pick up annotations with the decision. The maker's "Sent back" badge flow
(D170) is untouched.

## 6. Error handling

- **Upload failure** → action fails atomically before any DB write; toast +
  drafts intact (see §5.3).
- **Frame capture failure** (CORS/decoder) → toast; no annotation row is
  created for that frame (§4.2) — the senior's recourse is the overall
  decision note. Every stored row therefore always has a real mask.
- **Signed-URL expiry** on read → refetch on 403, matching existing media
  handling.
- **Version mismatch** — annotations render only on the version whose decision
  carries them; restores/regenerations show them in history, never overlaid on
  newer output.

## 7. Testing

- Unit: draft-list reducer (seq assignment, discard-on-approve), timecode
  grouping, `captureFrame` fallback, action validation (role, status gate,
  caps, upload-failure atomicity) with mocked storage.
- Component: canvas → popover → commit loop; read-only pin/popover rendering;
  video seek-on-click.
- Existing suites must stay green: edit-mode masking (the extraction must not
  change `ImageGenAnnotationCanvas` behavior), approval action tests.

## 8. Milestones

1. **M1 — Extraction + image compose/read** (canvas extraction, pins/popovers,
   table + storage + action, image focus view end-to-end).
2. **M2 — Video** (frame capture, timecode grouping, seek wiring).
3. **M3 — Polish** (discard confirms, thread counts, signed-URL refresh, caps).
