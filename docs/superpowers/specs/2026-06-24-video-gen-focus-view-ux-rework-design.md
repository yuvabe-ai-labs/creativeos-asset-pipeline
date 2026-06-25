# Video Gen Focus View UX Rework

**Date:** 2026-06-24
**File:** `src/components/nodes/video-gen-focus-view.tsx`

## Goal

Rework the left panel of `VideoGenFocusView` to be neater and cleaner, matching the editorial premium aesthetic established by `prompt-focus-view.tsx`. Key changes: collapsible sections with per-section defaults, and a single unified Connected section that merges the current "Motion prompt" and "Image inputs" panels.

---

## Left Panel Structure

Three collapsible `LeftSection` blocks, stacked vertically in a scrollable left panel. Each section has a chevron toggle button in its header.

| Section | Icon | Default state | Badge |
|---|---|---|---|
| History | `History` | Collapsed | "N versions" (hidden when 0 versions) |
| Output settings | `Settings2` | Open | — |
| Connected | `Link2` | Open | "N inputs" (prompt node + images) |

Collapse state is local `useState` per section — no shared primitive or new abstraction needed.

---

## LeftSection Component Update

Extend the existing `LeftSection` component inside the file with two new optional props:

- `open?: boolean` — controls expanded/collapsed state
- `onToggle?: () => void` — called when the chevron is clicked

When `onToggle` is provided, a `ChevronDown` icon renders in the header right side, rotating 180° when open. When `open` is false, children are hidden (`display: none` or conditional render).

---

## History Section

**Collapsed state (default):**
- Section header chevron is the toggle (same as other sections)
- Content area shows one compact row: tiny video thumbnail (if available) + model name + relative time + `Active` pill
- If no active version but versions exist: shows the most recent row instead

**Expanded state:**
- Renders the existing `VideoGenVersionHistory` component unchanged

**Hidden:** when `versions.length === 0`

---

## Output Settings Section

- Open by default
- Contains `VideoGenParamsPanel` (model selector + param rows) unchanged
- Collapsible via chevron

---

## Connected Section

**New component:** `VideoGenConnectedSection`

Props:
```ts
type Props = {
  promptNode: UpstreamPromptNode | null;
  images: UpstreamImage[];
  imageRoles: Record<string, ImageRole>;
  imageInputs: { startFrame: boolean; endFrame: boolean; maxReferenceImages: number };
  onRoleChange: (imageId: string, role: ImageRole) => void;
};
```

**Badge count:** `(promptNode ? 1 : 0) + images.length`

**Layout (stacked vertically, gap-3):**

### Prompt node card
Shown only when `promptNode` is not null.
- Bordered card (`rounded-lg border border-border p-3`)
- If `promptNode.text`: renders text, clamped to 4 lines (`line-clamp-4`), `text-xs leading-relaxed`
- If no text: italic placeholder "No motion prompt generated yet — generate from the video-prompt node first."

### Image grid
Shown only when `images.length > 0`.
- 2-column CSS grid (`grid grid-cols-2 gap-2`)
- Each cell:
  - `relative rounded-lg overflow-hidden border border-border`
  - `aspect-video` ratio with `object-cover` image
  - **Role overlay strip** — absolute, `bottom-0 left-0 right-0`, semi-transparent dark background (`bg-black/60 backdrop-blur-sm`), `flex gap-1 p-1.5 justify-center`
  - Three role pills: **S** (start_frame) · **E** (end_frame) · **R** (reference)
  - Pill sizing: `px-2 py-0.5 rounded text-[0.65rem] font-semibold`
  - Active role: `bg-primary text-primary-foreground`
  - Inactive role: `bg-white/20 text-white/80 hover:bg-white/30`
  - Unsupported role (model capability off, or at reference limit): `opacity-30 cursor-not-allowed pointer-events-none`

### Empty state
When both `promptNode` is null and `images.length === 0`:
- Italic muted text: "Connect a video-prompt node or image nodes."

---

## Right Panel

No changes — skeleton / empty / video result states remain identical.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/nodes/video-gen-focus-view.tsx` | Extend `LeftSection`, add per-section collapse state, replace "Motion prompt" + "Image inputs" with `VideoGenConnectedSection` |
| `src/components/nodes/video-gen-connected-section.tsx` | New component |

`VideoGenVersionHistory` and `VideoGenParamsPanel` are **not modified** — they remain as-is, reused internally.

`VideoGenImageRoles` is **no longer used** — `VideoGenConnectedSection` reimplements the image+role UI with the new overlay design. The old component is not deleted (it may be used elsewhere) but is not imported in the focus view.

---

## Out of Scope

- Right panel changes
- Mock toggle changes
- Generate button changes
- Any changes to version history data fetching
