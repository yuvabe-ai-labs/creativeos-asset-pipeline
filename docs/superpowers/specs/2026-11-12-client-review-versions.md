# Client review versions — one review node per canvas, a link per version

*Recorded 2026-11-12. Decisions: D495–D499 in the staging roadmap §7. Prototype:
https://claude.ai/artifact/CLkZ3jxSvuDW8vmn7PNmuQ (team journey, client pages, older canvas).*

## Problem

A Client review node held one cut (D309: "a new cut is a new node"). Each round of feedback
meant a new node, a new upload and a new link, and a canvas filled up with review nodes whose
comments no one could follow from one place.

## Decisions

1. **One Client review node per canvas.** A new cut is uploaded into it and becomes the next
   version (v1, v2, …). Versions are never removed.
2. **A link per version.** `/r/<title-slug>-<code>-v<n>`. The client sees only that version
   (never a mention of newer ones), only that version's comments, and comments on it.
   A link without a suffix means v1, so every link sent before versions keeps working.
3. **Comments stay on their version.** No Done marks, no client approval (for now).
4. **Allow download per version.** On by default for every version, new or migrated. Off: the
   client page has no Download button and `/api/r/:token/download` answers 404. A page already
   open keeps its button until it reloads; a click on it is refused (no live update).
5. **Focus view.** Clicking the node opens a focus view like other nodes (replaces the D309
   drawer). Header: Back to canvas, the viewed version's title, then icon buttons for that
   version (Copy link, Open as client, Allow download toggle) and **Upload first version /
   Upload new version**. Left: the shared `VersionList`. Centre: the video at its own aspect
   ratio, then "vN · uploaded <date>". Right: the version's comments; a timecode seeks the
   video. The upload dialog has the file and the Allow download switch (on). The header's
   Client feedback chip lists every version with its comment count; a row opens that version
   (D500).
6. **Older canvases.** Every existing review node is kept. Each becomes a node with one version
   (v1, download on) carrying all its comments; v1 keeps the exact link the client already has
   (no `-v1`). No combining. A canvas that has any review node cannot get another.
7. **Add menu.** No review node: "Client review". One: "Open Client review" (focuses it).
   Several (older canvases): greyed out with "This canvas already has review nodes. Upload a
   new cut into one of them."

## Data model

- `canvas_reviews` stays one row per node (share code, node, canvas). `video_path` becomes
  nullable and is no longer read; the cut lives on the version.
- `canvas_review_versions (id, review_id, version_no, video_path, allow_download default true,
  legacy_link default false, created_by, created_at)`, unique `(review_id, version_no)`.
- `canvas_review_comments.version_id` (not null after backfill). `review_id` stays, for the
  canvas-wide count in the header chip.
- Migration 0062 backfills one v1 per review (`legacy_link = true`) and points every comment at it.

## One per canvas — where it is enforced

- Client: the add menu, `addNode`, duplicate (single and batch skip it like `kb`), the copilot's
  `add_node` (opens the existing node instead).
- Server: duplicate routes refuse it; the canvas save drops a *new* second review node and tells
  the client to remove it; a `before insert` trigger on `nodes` is the backstop. Existing ids
  always pass, so older canvases with several keep saving. A unique index is impossible
  (older canvases already have several).
