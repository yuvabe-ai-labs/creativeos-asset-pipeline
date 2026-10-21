# Version viewing and media fit — design

**Date:** 2026-10-21
**Decisions:** D383, D384 (roadmap §7)
**Mockup:** https://claude.ai/artifact/6ZzcYtPqCSoErvVZo68u71 (approved 2026-10-21)

Two changes that ship together because both are about seeing generated media properly:

1. **Version viewing.** In a focus view's History tab, clicking a version opens it in the main
   preview. The node's active version does not change until the operator presses **Restore**.
2. **Media fit.** Every node card and focus-view preview shows its image or video at the
   media's own aspect ratio. Nothing is cropped and nothing is forced into a fixed shape.

---

## 1. Version viewing (D383)

### Today

- `VersionHistoryList` (`src/components/nodes/version-history-list.tsx`, D180) is shared by
  Image Gen, Video Gen, Composite and the prompt nodes. A row click only expands its text
  metadata. "Restore this version" sits inside the expanded row.
- Thumbnails are 28px squares with `object-cover`, so every version is cropped.
- Dubbing has its own `DubbingVersionHistory`, where a row click restores immediately.
- The only way to see an older output is to restore it, which changes the node for everyone
  on the canvas and triggers autosave.

### Behaviour

- **Click a row = view it.** The focus view's main preview (the right-hand media column) shows
  that version's output. The clicked row is highlighted ("Viewing") and expands to show its
  metadata, maker and decision thread. The active row keeps its "Active" tag.
- **Viewing bar.** When the viewed version is not the active one, a bar above the preview reads
  `Viewing v3 from 2 days ago. The node still uses v6.` with two buttons:
  **Back to v6** (ghost) and **Restore v3** (primary). A failed version shows only
  **Back to v6**.
- **Restore** calls the node's existing restore handler, unchanged. After it succeeds the
  restored version is both active and viewed, so the bar disappears.
- **Stepping.** A stepper beside the preview heading (`‹ v3 of 6 ›`) moves to the newer or older
  version. ↑ / ↓ do the same while focus is in the list. Rows are a roving-tabindex listbox
  (`role="listbox"`, `role="option"`, `aria-selected`).
- **Failed version.** The preview shows an empty-state frame: "No video from this attempt" /
  "No image from this attempt". The copy is plain and never shows the raw error (see the
  plain-copy rule in memory). The row's expanded detail keeps today's error line.
- **Reset.** Closing the focus view drops the viewed version. Reopening always starts on the
  active version.
- **What follows the viewed version:** the media preview, the "Sent to model" tab (it already
  takes a version) and the viewing bar.
- **What stays on the active version:** the Details tab's approval controls, the annotate
  toggle, Change voice (Video Gen) and Edit mode (Image Gen). These act on the node's current
  output, so while a non-active version is viewed they are **disabled**, with the tooltip
  "Restore this version to annotate it" (or to edit it, or to change its voice). Turning one of
  them on is never possible while viewing an older version, so they never act on a different
  version than the one on screen.
- **Thumbnails** are 48px tall and keep the version's real aspect ratio (`h-12 w-auto
  max-w-20 object-contain`). Videos use `preload="metadata"` with `#t=0.1` for a poster frame
  and a small play mark. A failed version gets a dashed red box with an `XCircle` icon.
- **Restore** is no longer inside rows. It lives only in the viewing bar, so there is one place
  to do it.

### Scope

| Node | In this change |
|---|---|
| Video Gen | Yes |
| Image Gen | Yes |
| Composite | Yes (uses `ImageGenVersionHistory`) |
| Dubbing | Yes. `DubbingVersionHistory` moves onto `VersionHistoryList`: video thumb plus its Original / Dubbed / Lip-synced steps as row meta. A row click views instead of restoring. |
| Prompt, Video Prompt, Multishot Prompt | **No.** Each lays out its result differently. They keep today's expand-and-restore behaviour (see *Shared list API*). Follow-up ticket. |

### Units

- **`src/hooks/use-version-viewing.ts`** (new). Pure client state, no fetching:
  ```ts
  useVersionViewing<V extends { id: string }>(versions: V[], activeVersionId: string | null, open: boolean)
    → { viewedId: string | null; viewed: V | null; isViewingOther: boolean;
        view(id: string): void; step(delta: 1 | -1): void; backToActive(): void;
        position: { index: number; total: number } }
  ```
  - `viewedId` is `null` while following the active version. `viewed` resolves to the active
    version in that case.
  - Resets to `null` when `open` goes false (compare-during-render, the same idiom as
    `VersionHistoryList`'s `seenActiveId`. No effect, no ref read during render).
  - When `activeVersionId` changes to the viewed id (a restore), `viewedId` resets to `null`.
  - A `viewedId` that is no longer in `versions` falls back to the active version.
- **`src/components/nodes/version-viewing-bar.tsx`** (new). The bar: message, Back, Restore.
  Props: `viewedLabel`, `viewedWhen`, `activeLabel`, `canRestore`, `restoring`, `onBack`,
  `onRestore`.
- **`src/components/nodes/version-stepper.tsx`** (new). `‹ vN of M ›`, two icon `Button`s.
- **`VersionHistoryList`** (changed). New optional props `viewedVersionId` and `onView(id)`.
  - When `onView` is given: a row click calls `onView`, the viewed row is highlighted and
    expanded, no restore button renders in rows, and ↑ / ↓ step.
  - When `onView` is absent (prompt nodes): today's behaviour, unchanged, including the in-row
    restore button. This is the only reason the old path stays, and it goes when the prompt
    nodes move over.
- **`ImageGenVersionHistory`, `VideoGenVersionHistory`** pass the new props through and render
  the new thumbnails. **`DubbingVersionHistory`** becomes a thin adapter onto
  `VersionHistoryList`, like the other two.
- **Focus views** (`video-gen-focus-view.tsx`, `image-gen-focus-view.tsx`,
  `composite-focus-view.tsx`, `dubbing-focus-view.tsx`) call `useVersionViewing`, render the
  viewed version's output in the preview, mount the bar and stepper, and disable the
  active-only controls while `isViewingOther`.

### Performance

Viewing makes **zero** requests: every version, including its output URL, is already in the
versions query. Nothing is written, so no autosave. History thumbnails exist only while the
History tab is open (as today) and load metadata only.

---

## 2. Media fit (D384)

### Today

| Surface | Today |
|---|---|
| Image Gen node | `aspect-video w-full object-cover`: 16:9 crop |
| Composite node | `aspect-video w-full object-cover`: 16:9 crop |
| Video Gen node | `h-16 w-full object-cover`: 64px strip |
| File node (image or video) | `h-16 w-full object-cover`: 64px strip |
| Draw node | `h-24 w-full object-cover`: 96px strip |
| Dubbing node | `h-16 w-full object-cover`: 64px strip |
| Video Gen focus-view player | `aspect-[9/16]`: landscape video sits in a tall box |
| Image Gen and Video Gen loading placeholders | always 9:16 |

### Rule: the card hugs the media

- The media box takes the media's own aspect ratio and shows the whole picture
  (`object-contain` inside a box of exactly that ratio, so there are no bands).
- **Media width** = `clamp(254, 500 × ratio, 454)` px; **card width** = media width + 26
  (12px body padding each side, plus the 1px borders). Media height = media width ÷ ratio.
  - 16:9 → card 480, media 270 tall. 1:1 → card 480, media 454. 4:5 → card 426, media 500.
    9:16 → card 307, media 500.
  - Very wide media (21:9 and beyond) stays at 480 and is simply shorter. Media taller than
    about 1:2 hits the 280 minimum card width, so its height goes past 500. Once the ratio drops
    below 254 ÷ 600 (about 1:2.4), the box is capped at 600 tall and the media is letterboxed
    inside it. That is the only case with bands.
- **Before any media exists** the card keeps today's width (480) and shows no media box, as now.
- Card hover, border, radius and `shadow-card` are unchanged.

### Knowing the ratio

- **Measured, then saved.** The media element reads `naturalWidth/naturalHeight` (image `onLoad`) or
  `videoWidth/videoHeight` (video `onLoadedMetadata`). If they differ from the node's saved
  `mediaWidth`/`mediaHeight`, it calls `updateNodeData(id, { mediaWidth, mediaHeight })`.
  - Only when they differ (performance rule 4). Opening a canvas whose sizes are already saved
    writes nothing.
  - Only when the canvas is editable (the D33 lock holder). A read-only viewer keeps the
    measured size in local state and writes nothing.
- **On reload** the saved size is used immediately, so the canvas lays out at its final size
  with no jump.
- **File nodes** already store `imageWidth`/`imageHeight` at upload. Those are read first, and
  videos measure into `mediaWidth`/`mediaHeight`.
- **Restoring** a version with a different shape changes the output URL. The new media
  measures on load and the saved size updates. That is one write, caused by the user's own
  action.
- Until the first measurement of a never-measured node lands, the box uses the node's
  `aspect_ratio` param when it has one, else 16:9. Old canvases therefore settle once on first
  open (one write per node, only for the editor).

### Units

- **`src/lib/canvas/media-fit.ts`** (new, pure): `parseAspectRatio("9:16") → 0.5625 | null`,
  `nodeMediaBox(ratio) → { cardWidth, mediaWidth, mediaHeight, letterboxed }`, constants
  `NODE_CARD_MAX_WIDTH = 480`, `NODE_CARD_MIN_WIDTH = 280`, `NODE_MEDIA_MAX_HEIGHT = 500`,
  `NODE_MEDIA_HARD_MAX_HEIGHT = 600`.
- **`src/hooks/use-node-media-size.ts`** (new). `useNodeMediaSize(nodeId, saved, fallbackAspect, editable)
  → { ratio, onMeasured(w, h) }`. Holds the measured size in local state, saves it to node data
  under the rules above, and resolves the ratio from measured, then saved, then fallback, then
  16:9. The node calls it once, computes `nodeMediaBox(ratio)` for its card width, and passes the
  box and `onMeasured` down. One source of size, no extra render.
- **`src/components/nodes/node-media.tsx`** (new, presentational). Props:
  `{ kind: "image" | "video", src, alt, box, onMeasured }`. Renders the bordered media box at
  `box`'s size and calls `onMeasured` from `onLoad` / `onLoadedMetadata`. Video shows a poster
  frame (`preload="metadata"`, `#t=0.1`, muted, no controls) with a decorative play mark.
- **Nodes changed:** `image-gen-node`, `composite-node`, `video-gen-node`, `file-node`,
  `draw-node`, `dubbing-node`. Each swaps its `<img>`/`<video>` for `NodeMedia` and sets its
  card `style={{ width: cardWidth }}` in place of `w-[480px]`.
- **Node data types** (`src/lib/canvas-nodes.ts`): add optional `mediaWidth`/`mediaHeight` to
  the Image Gen, Composite, Video Gen, Draw, Dubbing and File node data.
- **Focus views:**
  - Video Gen player: drop `aspect-[9/16]`. The `<video>` gets `style={{ aspectRatio }}` from
    the viewed version's measured size, else its `params_used.aspect_ratio`, else 9:16, inside
    the existing height-driven `h-full w-fit max-w-full` frame.
  - Image Gen and Video Gen skeletons use the chosen `aspect_ratio` param instead of 9:16.
  - The Image Gen result already uses `object-contain` and its natural size. Unchanged.

### Out of scope

- **Avatar node.** It keeps its 3:4 head-and-shoulders crop on purpose; it is a designed
  portrait layout, not generated output.
- **Existing canvases.** Nodes are never moved. A card that grows taller may overlap the node
  below on canvases built before this change, and the operator drags it if needed.

---

## Testing

- `media-fit.ts`: `parseAspectRatio` (valid, malformed, zero) and `nodeMediaBox` at 21:9,
  16:9, 1:1, 4:5, 9:16 and 1:4 (letterboxed).
- `useVersionViewing`: starts on active; `view` / `step` bounds; resets on close; follows
  active after a restore; falls back when the viewed id disappears.
- `VersionHistoryList`: with `onView`, a row click calls `onView` and never `onRestore`, and
  ↑ / ↓ move the selection; without `onView`, today's restore button still works.
- `VersionViewingBar`: Restore is hidden for a failed version; Back calls `onBack`.
- `useNodeMediaSize`: writes `mediaWidth`/`mediaHeight` once when they differ, never when they
  match, never when not editable; ratio falls back measured → saved → param → 16:9.
- Video Gen focus view: while viewing a non-active version, annotate, Change voice and approval
  controls are disabled; the preview shows the viewed output.
- Manual: on a staging canvas, a 9:16 Kling video, a 16:9 image and a 1:1 image each render
  uncropped on the card and in the focus view; a reload does not jump; opening a fully measured
  canvas causes no autosave.
