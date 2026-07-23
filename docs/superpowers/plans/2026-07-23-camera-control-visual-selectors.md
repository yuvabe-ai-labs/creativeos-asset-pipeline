# Camera + Speed Visual Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Video Prompt node's Camera dropdown with a grid of image tiles (6 curated images + 2 placeholders) and its Speed dropdown with a chip group.

**Architecture:** Renderer-only. Camera renders through the existing `ShotTileStrip` (extended with a `columns` grid layout + placeholder-when-no-image), fed by a new pure `camera-preview.ts`; Speed uses the existing `ParamChipGroup`. `video-controls.ts` / `renderVideoControls` are untouched, so the compiled motion prompt is byte-identical.

**Tech Stack:** Next.js (React), TypeScript, Tailwind v4, shadcn/Base-UI `Button`, Lucide icons, Vitest (node env).

## Global Constraints

- **Controls are shadcn primitives only** — `Button`/`ParamChipGroup` from `src/components/ui`/`src/components/nodes`; never a native control. (CLAUDE.md)
- **`<img>` idiom:** raw `<img>` preceded by `{/* eslint-disable-next-line @next/next/no-img-element */}` (repo pattern).
- **Design system:** purple only on the active ring/label/chip; Lucide icons `strokeWidth={1.5}`.
- **Reuse, don't redefine:** option `value`s/`label`s/`prose` come from `VIDEO_CONTROLS`; reuse `ShotTileStrip`, `ParamChipGroup`, `FieldLabel`.
- **Test env is `node`** — pure-logic tests only; components verified by `tsc` + `eslint` + manual QA.
- **Locked image mapping:** push-in→zoom-in, pull-back→zoom-out, orbit→tracking-shot, pan→pan-left, tilt→tilt-up, crane→crane; static/handheld→placeholder. Tiles follow `VIDEO_CONTROLS` order: static, push-in, pull-back, orbit, pan, tilt, handheld, crane.

---

## File Structure

- **Create** `src/lib/nodes/camera-preview.ts` — pure camera helpers (image map, labels, tooltip/caption from `prose`).
- **Create** `src/lib/nodes/camera-preview.test.ts` — Vitest unit tests.
- **Modify** `src/components/nodes/shot-tile-strip.tsx` — add `columns` (grid) + `placeholderIcon` props; default-off so shot controls are unaffected.
- **Create** `src/components/nodes/camera-select.tsx` — thin `ShotTileStrip` wrapper for Camera.
- **Modify** `src/components/nodes/video-controls-row.tsx` — restack: `CameraSelect` above a Speed `ParamChipGroup`; drop the two `Select` dropdowns.

Note: `VideoControlOption` (`{value,label,prose}`) is structurally identical to `ShotControlOption`, so `ShotTileStrip`'s existing `tiles`/`autoOption` prop types accept camera options with no type change.

---

### Task 1: Pure camera-preview helpers

**Files:**
- Create: `src/lib/nodes/camera-preview.ts`
- Test: `src/lib/nodes/camera-preview.test.ts`

**Interfaces:**
- Consumes: `VIDEO_CONTROLS`, `type VideoControlOption` from `./video-controls`.
- Produces (used by Task 3): `CAMERA_TILES: VideoControlOption[]`, `CAMERA_AUTO: VideoControlOption`, `cameraImage(value: string): string`, `cameraLabel(value: string): string`, `cameraTooltip(value: string): string`, `cameraCaption(value: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/camera-preview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CAMERA_TILES,
  CAMERA_AUTO,
  cameraImage,
  cameraLabel,
  cameraTooltip,
  cameraCaption,
} from "./camera-preview";

describe("CAMERA_TILES / CAMERA_AUTO", () => {
  it("exposes the eight camera tiles in VIDEO_CONTROLS order, without auto", () => {
    expect(CAMERA_TILES.map((o) => o.value)).toEqual([
      "static",
      "push-in",
      "pull-back",
      "orbit",
      "pan",
      "tilt",
      "handheld",
      "crane",
    ]);
  });
  it("splits auto out as its own option", () => {
    expect(CAMERA_AUTO.value).toBe("auto");
    expect(CAMERA_TILES.some((o) => o.value === "auto")).toBe(false);
  });
});

describe("cameraImage", () => {
  it("maps the six imaged moves to their webp under /camera-controls", () => {
    expect(cameraImage("push-in")).toBe("/camera-controls/zoom-in.webp");
    expect(cameraImage("pull-back")).toBe("/camera-controls/zoom-out.webp");
    expect(cameraImage("orbit")).toBe("/camera-controls/tracking-shot.webp");
    expect(cameraImage("pan")).toBe("/camera-controls/pan-left.webp");
    expect(cameraImage("tilt")).toBe("/camera-controls/tilt-up.webp");
    expect(cameraImage("crane")).toBe("/camera-controls/crane.webp");
  });
  it("returns empty string (→ placeholder) for moves with no image", () => {
    expect(cameraImage("static")).toBe("");
    expect(cameraImage("handheld")).toBe("");
    expect(cameraImage("auto")).toBe("");
    expect(cameraImage("nope")).toBe("");
  });
});

describe("cameraLabel", () => {
  it("returns the full option label", () => {
    expect(cameraLabel("push-in")).toBe("Push in");
    expect(cameraLabel("crane")).toBe("Crane");
  });
});

describe("cameraCaption", () => {
  it("capitalizes the prose for a move", () => {
    expect(cameraCaption("push-in")).toBe("A slow push-in toward the subject");
  });
  it("names the model for auto", () => {
    expect(cameraCaption("auto")).toBe("Camera move chosen by the model");
  });
});

describe("cameraTooltip", () => {
  it("uses the prose for each tile", () => {
    expect(cameraTooltip("orbit")).toBe("a gentle orbit around the subject");
    for (const t of CAMERA_TILES) {
      expect(cameraTooltip(t.value).length).toBeGreaterThan(0);
    }
  });
  it("gives auto a model hint", () => {
    expect(cameraTooltip("auto")).toMatch(/model/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/camera-preview.test.ts`
Expected: FAIL — cannot resolve `./camera-preview`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/nodes/camera-preview.ts`:

```ts
// Presentational helpers for the visual Camera selector — sibling of composition-preview.ts, but
// for the Video Prompt node's motion controls. Pure and React-free so CameraSelect stays thin markup
// and these can be unit-tested in the node env. No prompt/data/API impact: option values come from
// VIDEO_CONTROLS (single source of truth). Each camera move is a distinct clip poster under
// /public/camera-controls; moves with no curated image fall back to a placeholder tile.

import { VIDEO_CONTROLS, type VideoControlOption } from "./video-controls";

const CAMERA_OPTIONS: VideoControlOption[] =
  VIDEO_CONTROLS.find((g) => g.key === "camera")?.options ?? [];

// The eight camera tiles, in VIDEO_CONTROLS order — Auto is pulled out into a header chip.
export const CAMERA_TILES: VideoControlOption[] = CAMERA_OPTIONS.filter((o) => o.value !== "auto");

// The Auto option (drives the header chip's label).
export const CAMERA_AUTO: VideoControlOption =
  CAMERA_OPTIONS.find((o) => o.value === "auto") ?? { value: "auto", label: "Auto", prose: "" };

// Option value -> clip poster. Only the six moves with curated art; the rest render a placeholder.
export const CAMERA_IMAGES: Record<string, string> = {
  "push-in": "/camera-controls/zoom-in.webp",
  "pull-back": "/camera-controls/zoom-out.webp",
  orbit: "/camera-controls/tracking-shot.webp",
  pan: "/camera-controls/pan-left.webp",
  tilt: "/camera-controls/tilt-up.webp",
  crane: "/camera-controls/crane.webp",
};

function cameraProse(value: string): string {
  return CAMERA_OPTIONS.find((o) => o.value === value)?.prose ?? "";
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// Poster for a camera tile. "" for auto/unmapped moves (→ placeholder tile).
export function cameraImage(value: string): string {
  return CAMERA_IMAGES[value] ?? "";
}

// Full option label ("Push in") from the video-controls source.
export function cameraLabel(value: string): string {
  return CAMERA_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// Per-tile tooltip: the option's prose. Auto → a model hint.
export function cameraTooltip(value: string): string {
  if (value === "auto") return "Let the model choose the camera move.";
  return cameraProse(value);
}

// Caption under the strip: the selected move's prose, capitalized. Auto → names the model.
export function cameraCaption(value: string): string {
  if (value === "auto") return "Camera move chosen by the model";
  return capitalize(cameraProse(value));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/camera-preview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/camera-preview.ts src/lib/nodes/camera-preview.test.ts
git commit -m "feat(camera-select): pure helpers for the visual camera selector"
```

---

### Task 2: Extend ShotTileStrip with grid layout + placeholder

**Files:**
- Modify: `src/components/nodes/shot-tile-strip.tsx`

**Interfaces:**
- Produces (used by Task 3): two new optional props on `ShotTileStrip` — `columns?: number` and `placeholderIcon?: LucideIcon`.

> No unit test — markup change. Verified by `tsc` + `eslint` here, and by the unchanged Lens/Composition/Lighting strips (they pass neither new prop → identical single-row, always-image behavior).

- [ ] **Step 1: Add the two props to the type**

In `src/components/nodes/shot-tile-strip.tsx`, replace the `mediaStyle` line at the end of `ShotTileStripProps` (line 28) with:

```tsx
  mediaStyle?: (value: string) => CSSProperties | undefined; // e.g. Lens' focal-length zoom
  columns?: number; // set → CSS-grid layout with N columns; unset → single flex row
  placeholderIcon?: LucideIcon; // shown when a tile's mediaSrc is "" (default: the strip's `icon`)
```

- [ ] **Step 2: Destructure the new props + a placeholder icon**

Replace the destructuring block (lines 36-48, `export function ShotTileStrip({ ... }) {` through `const autoActive = ...`) with:

```tsx
export function ShotTileStrip({
  icon,
  label,
  tiles,
  autoOption,
  value,
  onChange,
  tileLabel,
  tooltip,
  caption,
  mediaSrc,
  mediaStyle,
  columns,
  placeholderIcon,
}: ShotTileStripProps) {
  const autoActive = value === autoOption.value;
  const PlaceholderIcon = placeholderIcon ?? icon;
```

- [ ] **Step 3: Make the tile container grid-or-flex**

Replace the tiles container opening tag (line 79, `<div className="flex gap-1.5">`) with:

```tsx
        <div
          className={cn(columns ? "grid gap-1.5" : "flex gap-1.5")}
          style={
            columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined
          }
        >
```

- [ ] **Step 4: Compute the poster src once + swap tile width class**

Replace the map opening (lines 80-82, `{tiles.map((opt) => {` through the `return (`) with:

```tsx
          {tiles.map((opt) => {
            const active = opt.value === value;
            const src = mediaSrc(opt.value);
            return (
```

Then in that tile `Button`'s `className` (the `cn(...)` at lines 90-94), replace `flex-1` with a conditional so the block reads:

```tsx
                      className={cn(
                        "nodrag h-auto flex-col gap-1 p-1 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        columns ? "w-full" : "flex-1",
                        active &&
                          "z-10 scale-105 border-primary bg-primary/5 shadow-lg ring-2 ring-primary",
                      )}
```

- [ ] **Step 5: Render placeholder when there is no poster**

Replace the media frame `<span>` and its `<img>` (lines 96-105) with:

```tsx
                      <span className="relative block aspect-square w-full overflow-hidden rounded-[6px]">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt=""
                            aria-hidden
                            className="absolute inset-0 block h-full w-full object-cover object-center"
                            style={mediaStyle?.(opt.value)}
                          />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center bg-muted">
                            <PlaceholderIcon
                              className="size-5 text-muted-foreground/60"
                              strokeWidth={1.5}
                            />
                          </span>
                        )}
                      </span>
```

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/nodes/shot-tile-strip.tsx`
Expected: no type errors; no eslint errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/shot-tile-strip.tsx
git commit -m "feat(shot-tile-strip): optional grid layout + placeholder for image-less tiles"
```

---

### Task 3: CameraSelect component

**Files:**
- Create: `src/components/nodes/camera-select.tsx`

**Interfaces:**
- Consumes: `ShotTileStrip` (Task 2 props), `CAMERA_TILES`/`CAMERA_AUTO`/`cameraImage`/`cameraLabel`/`cameraTooltip`/`cameraCaption` (Task 1), `Video` from `lucide-react`.
- Produces (used by Task 4): `CameraSelect({ value, onChange }: { value: string; onChange: (value: string) => void })`.

> No unit test — presentational markup over Task 1's tested helpers. Verified by `tsc` + `eslint` + manual QA.

- [ ] **Step 1: Write the component**

Create `src/components/nodes/camera-select.tsx`:

```tsx
"use client";

import { Video } from "lucide-react";
import { ShotTileStrip } from "./shot-tile-strip";
import {
  CAMERA_TILES,
  CAMERA_AUTO,
  cameraImage,
  cameraLabel,
  cameraTooltip,
  cameraCaption,
} from "@/lib/nodes/camera-preview";

// Visual "show-don't-tell" renderer for the Video Prompt's Camera control. Each camera move is a
// clip poster (or a placeholder for moves with no art), laid out as a 4-column grid via the shared
// ShotTileStrip. Renderer-only — same value/onChange contract as the old dropdown, so the compiled
// motion prompt is unchanged. Spec: docs/superpowers/specs/2026-07-23-camera-control-visual-selectors-design.md.
export function CameraSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ShotTileStrip
      icon={Video}
      label="Camera"
      tiles={CAMERA_TILES}
      autoOption={CAMERA_AUTO}
      value={value}
      onChange={onChange}
      tileLabel={cameraLabel}
      tooltip={cameraTooltip}
      caption={cameraCaption}
      mediaSrc={cameraImage}
      columns={4}
    />
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/nodes/camera-select.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/camera-select.tsx
git commit -m "feat(camera-select): visual camera grid on the shared tile strip"
```

---

### Task 4: Rewrite VideoControlsRow (Camera grid + Speed chips)

**Files:**
- Modify: `src/components/nodes/video-controls-row.tsx`

**Interfaces:**
- Consumes: `CameraSelect` (Task 3), `ParamChipGroup` from `./param-chip-group`, `FieldLabel` from `./field-label`, `VIDEO_CONTROLS`/`VideoControls` from `@/lib/nodes/video-controls`, `Gauge` from `lucide-react`.
- Produces: nothing new — same `{ controls, onChange }` prop shape, so `video-prompt-focus-view.tsx` is untouched.

> No unit test — markup. Verified by `tsc` + `eslint` + manual QA.

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `src/components/nodes/video-controls-row.tsx` with:

```tsx
"use client";

import { Gauge } from "lucide-react";
import { VIDEO_CONTROLS, type VideoControls } from "@/lib/nodes/video-controls";
import { CameraSelect } from "./camera-select";
import { FieldLabel } from "./field-label";
import { ParamChipGroup } from "./param-chip-group";

const SPEED_OPTIONS = (VIDEO_CONTROLS.find((g) => g.key === "speed")?.options ?? []).map((o) => ({
  value: o.value,
  label: o.label,
}));

// Master video controls (camera move / motion speed) for the Video Prompt node (D24). Camera is a
// visual "show-don't-tell" image grid; Speed is a chip group. Set values are injected into the
// compiled motion prompt as constraints the model must honor — renderer-only, so the prompt is
// unchanged. "Auto" = no constraint.
export function VideoControlsRow({
  controls,
  onChange,
}: {
  controls: VideoControls;
  onChange: (next: VideoControls) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <CameraSelect
        value={controls.camera}
        onChange={(v) => onChange({ ...controls, camera: v })}
      />
      <div className="space-y-2">
        <FieldLabel icon={Gauge} label="Speed" />
        <ParamChipGroup
          options={SPEED_OPTIONS}
          value={controls.speed}
          onValueChange={(v) => onChange({ ...controls, speed: v })}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/nodes/video-controls-row.tsx`
Expected: clean. (The old `Video`/`Gauge`/`Select` imports are gone; `Video` now lives in `camera-select.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/video-controls-row.tsx
git commit -m "feat(video-controls): camera image grid + speed chips (was two dropdowns)"
```

---

## Verification

**Automated (repo root):**

- [ ] `npx vitest run` — full suite green (existing + new `camera-preview.test.ts`).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx eslint .` — no new errors.

**Manual QA (`npm run dev` → open a Video/Motion Prompt node's focus view):**

- [ ] Camera shows a **4×2 image grid** — 6 posters + 2 placeholder tiles (Static, Handheld) — plus an **Auto chip**; Speed shows **4 chips** (Auto/Subtle/Moderate/Dynamic).
- [ ] Clicking a camera tile moves the purple ring + inverted label pill and updates the caption; clicking a Speed chip highlights it.
- [ ] Values persist to `nodes.data.controls` (reopen confirms) and **Generate still sends the correct `controls`** — compiled motion prompt unchanged.
- [ ] Auto chip clears the tile ring; caption reads `Camera move chosen by the model`.
- [ ] No horizontal overflow at the real focus-view width; brand purple only on the active ring/label/chip.

## Spec coverage self-check

- Why / visual parity (spec §1) → Tasks 2-4.
- Reuse ShotTileStrip + ParamChipGroup, `columns`+placeholder additions, renderer-only, image mapping, prose copy, stacked layout (spec §2) → Tasks 1-4.
- Layout §3 → Task 4 (stack) + Task 2 (grid) + Task 3 (columns=4).
- Components §4.1-4.4 → Task 1 (`camera-preview`), Task 2 (`ShotTileStrip`), Task 3 (`CameraSelect`), Task 4 (`VideoControlsRow`).
- Tests §5 → Task 1 pure tests; components via tsc/eslint/QA.
- Scope cuts §6 / Verification §7 → honored; Verification section above.
