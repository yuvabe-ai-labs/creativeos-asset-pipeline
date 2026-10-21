# Version viewing and media fit — design

**Date:** 2026-10-21
**Decisions:** D383, D384 (roadmap §7)
**Mockup:** https://claude.ai/artifact/6ZzcYtPqCSoErvVZo68u71 (approved 2026-10-21)

Two changes that ship together because both are about seeing generated media properly. Both
apply to **every** node they can apply to, with no per-node exceptions. Consistency is the
point: an operator learns one History and one card shape and never re-learns them per node.

1. **Version viewing.** Every versioned node's focus view has the same History: clicking a
   version opens it in the output column. The node's active version does not change until the
   operator presses **Restore**.
2. **Media fit.** Every node card and focus-view preview shows its image or video at the
   media's own aspect ratio. Nothing is cropped and nothing is forced into a fixed shape.

### The shared pattern (every versioned node)

1. **History in the rail**, same icon, with the version count beside it.
2. **List beside output.** The version list sits in the middle column. The output column on
   the right always shows the version on screen.
3. **Same row everywhere.** Thumbnail in its real shape (a text tile for prompt nodes), `vN`,
   relative time, model, review status, Active tag.
4. **Click views, never restores.** A row click, the `‹ vN of M ›` stepper or ↑ / ↓ only change
   what is on screen.
5. **One viewing bar**, with one wording and the only Restore button.
6. **Active-only tools wait.** Anything that acts on the node's current output is disabled
   while an older version is on screen.

---

## 1. Version viewing (D383)

### Today

- `VersionHistoryList` (`src/components/nodes/version-history-list.tsx`, D180) is shared by
  Image Gen, Video Gen, Composite and the prompt nodes. A row click only expands its text
  metadata. "Restore this version" sits inside the expanded row.
- Thumbnails are 28px squares with `object-cover`, so every version is cropped.
- Dubbing has its own `DubbingVersionHistory`, where a row click restores immediately.
- Video Prompt and Multishot Prompt (on `prompt-focus-shell.tsx`) have History as a full-width
  pane that replaces the output. The image Prompt node (`prompt-focus-view.tsx`, its own copy
  of the shell) has no History at all. All three have a row of `v1 v2 v3` chips
  (`PromptVersionChips`) where a click restores ("Click to switch").
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
  toggle, Change voice (Video Gen), Edit mode (Image Gen, Composite), the dub and lip-sync
  actions (Dubbing) and prompt editing and regenerating (prompt nodes). These act on the
  node's current output, so while a non-active version is viewed they are **disabled**, and one
  muted line sits above them: "You're viewing v3. Restore it to review or change it." (A visible
  line rather than a tooltip: tooltips on disabled controls do not open reliably.) Turning one of them on is never
  possible while viewing an older version, so they never act on a different version than the
  one on screen.
- **Thumbnails** are 48px tall and keep the version's real aspect ratio (`h-12 w-auto
  max-w-20 object-contain`). Videos use `preload="metadata"` with `#t=0.1` for a poster frame
  and a small play mark. Prompt versions get a 40px text tile (`FileText` icon). A failed
  version gets a dashed red box with an `XCircle` icon.
- **Restore** is no longer inside rows or chips. It lives only in the viewing bar, so there is
  one place to do it on every node.

### Scope: every versioned node

| Node | What changes |
|---|---|
| Video Gen | Shared pattern. |
| Image Gen | Shared pattern. |
| Composite | Shared pattern (uses `ImageGenVersionHistory`). |
| Dubbing | Shared pattern. `DubbingVersionHistory` becomes an adapter onto `VersionHistoryList`: video thumb, with its Original / Dubbed / Lip-synced steps as row meta. A row click views instead of restoring. `DubbingPlayer` plays the viewed version. |
| Prompt (image) | Shared pattern. Its focus view (`prompt-focus-view.tsx`) is not on `PromptFocusShell` and has **no History tab today**, only chips. It gains the History rail item and uses the same `PromptHistoryPane` the shell uses. |
| Video Prompt, Multishot Prompt | Shared pattern. `prompt-focus-shell.tsx`'s History pane becomes two columns, list on the left and the viewed version's output on the right, read-only, matching the media nodes. `PromptVersionChips` is deleted. The `VersionStepper` takes its place in the result header and views instead of restoring. When the prompt pane shows an older version (stepped there), the result is that version, read-only, under the viewing bar. |

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
- **`VersionHistoryList`** (changed). `onRestore`/`restoring` are replaced by required
  `viewedVersionId` and `onView(id)`. A row click calls `onView`; the viewed row is highlighted
  and expanded; rows render no restore button; ↑ / ↓ step. There is one behaviour, with no
  legacy mode.
- **Adapters.** `ImageGenVersionHistory`, `VideoGenVersionHistory` and
  `PromptVersionHistory` pass the new props through and render their thumbnails.
  `DubbingVersionHistory` becomes an adapter of the same kind. Each adapter only maps a version
  to `{ thumb, meta }` (D180).
- **`src/components/nodes/version-output-empty.tsx`** (new). The failed-version frame,
  "No {video|image|prompt|dub} from this attempt", shared by every output column.
- **Media focus views** (`video-gen-focus-view.tsx`, `image-gen-focus-view.tsx`,
  `composite-focus-view.tsx` + `CompositeOutputPane`, `dubbing-focus-view.tsx` +
  `DubbingPlayer`) call `useVersionViewing`, render the viewed version's output in the output
  column, mount the bar and stepper above it, and disable the active-only controls while
  `isViewingOther`.
- **Prompt focus shell** (`prompt-focus-shell.tsx`) owns `useVersionViewing` for all three
  prompt views and passes `{ viewed, isViewingOther, stepper, viewingBar }` to `children` in
  place of `versionChips`. Each prompt view adds a `renderVersionOutput(version)` prop, the
  read-only rendering of one version's result, built from the code that already renders the
  active result. The shell uses it in the History pane's right column, and the view uses it in
  its own result area while `isViewingOther`. `PromptVersionChips` and
  `buildVersionChips` are deleted.

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
| Avatar node | `aspect-[3/4] object-cover object-top`: cropped to the head |
| Client review node | `h-32 object-contain`: 128px box with black bars |
| Post node | full card width, box shaped by the format, `object-contain` (no crop, but a Story card is very tall) |
| KB node brand images | `size-16 object-cover`: 64px squares, cropped |
| Video Gen focus-view player | `aspect-[9/16]`: landscape video sits in a tall box |
| Image Gen and Video Gen loading placeholders | always 9:16 |

### Rule: the card hugs the media

- The media box takes the media's own aspect ratio and shows the whole picture
  (`object-contain` inside a box of exactly that ratio, so there are no bands).
- **One rule, two size tiers.** Today input nodes are small reference tiles (File, Draw and
  Avatar at 176px; Post and Client review at 224px) and output nodes are large. Putting every node
  in one size range would make reference tiles 2–3× larger and crowd existing canvases, so the
  same rule runs at two scales:

  | Tier | Nodes | Card width | Media height cap | Hard cap (letterbox) | Media inset |
  |---|---|---|---|---|---|
  | `output` | Image Gen, Composite, Video Gen, Dubbing | 280–480 | 500 | 600 | 26 (inside the `px-3` body) |
  | `input` | File, Draw, Avatar, Post, Client review | 176–280 | 300 | 360 | 2 (edge to edge under the header, borders only) |

- **Media width** = `clamp(minCard − inset, cap × ratio, maxCard − inset)`; **card width** =
  media width + inset. Media height = media width ÷ ratio. The numbers below are for the output
  tier.
  - 16:9 → card 480, media 255 tall. 1:1 → card 480, media 454. 4:5 → card 426, media 500.
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
  `nodeMediaBox(ratio, tier) → { cardWidth, mediaWidth, mediaHeight, letterboxed }`, and the
  `MEDIA_TIERS` table above as a constant.
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
  `draw-node`, `dubbing-node`, `avatar-node`, `client-review-node`, `post-node`. Each swaps its
  `<img>`/`<video>` for `NodeMedia` and sets its card `style={{ width: cardWidth }}` in place
  of its fixed width class.
  - **Avatar** shows the whole front view.
  - **Client review** shows the cut at its own shape on the card's neutral media box. The black
    bar background goes.
  - **Post** knows its ratio from its format spec (`spec.width / spec.height`), so it never
    measures. Its existing live-layer and thumbnail fallbacks render inside the same box.
- **KB node brand images** are a contact strip, not a hero, so they follow the History
  thumbnail rule instead: 64px tall, real shape (`h-16 w-auto max-w-32 object-contain`), with no
  measurement or saving.
- **Node data types** (`src/lib/canvas-nodes.ts`): add optional `mediaWidth`/`mediaHeight` to
  the Image Gen, Composite, Video Gen, Draw, Dubbing, File, Avatar and Client review node
  data.
- **Focus views:**
  - Video Gen player: drop `aspect-[9/16]`. The `<video>` gets `style={{ aspectRatio }}` from
    the viewed version's measured size, else its `params_used.aspect_ratio`, else 9:16, inside
    the existing height-driven `h-full w-fit max-w-full` frame.
  - Image Gen and Video Gen skeletons use the chosen `aspect_ratio` param instead of 9:16.
  - The Image Gen result already uses `object-contain` and its natural size. Unchanged.

### Out of scope

- **Nodes with no media**, such as Script, Shot and Text. They are unchanged.
- **Existing canvases.** Nodes are never moved. A card that grows taller may overlap the node
  below on canvases built before this change, and the operator drags it if needed.

---

## Testing

- `media-fit.ts`: `parseAspectRatio` (valid, malformed, zero) and `nodeMediaBox` at 21:9,
  16:9, 1:1, 4:5, 9:16 and 1:4 (letterboxed).
- `useVersionViewing`: starts on active; `view` / `step` bounds; resets on close; follows
  active after a restore; falls back when the viewed id disappears.
- `VersionHistoryList`: a row click calls `onView`, rows render no restore button, and
  ↑ / ↓ move the selection.
- Prompt focus shell: the History pane shows list and read-only output side by side; the
  stepper views, never restores; editing and Generate are disabled while viewing another
  version. One test per prompt view checks that `renderVersionOutput` renders a non-active
  version.
- Dubbing focus view: a row click no longer restores; the player plays the viewed dub.
- `VersionViewingBar`: Restore is hidden for a failed version; Back calls `onBack`.
- `useNodeMediaSize`: writes `mediaWidth`/`mediaHeight` once when they differ, never when they
  match, never when not editable; ratio falls back measured → saved → param → 16:9.
- Video Gen focus view: while viewing a non-active version, annotate, Change voice and approval
  controls are disabled; the preview shows the viewed output.
- Manual: on a staging canvas, a 9:16 Kling video, a 16:9 image, a 1:1 image, an avatar, a
  Story post and a client-review cut each render uncropped on the card and in the focus view;
  History looks and behaves the same on a Video Gen, an Image Gen, a Dubbing and a Video Prompt
  node; a reload does not jump; opening a fully measured
  canvas causes no autosave.
