# Visual Lens Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Lens shot-control's text pills with a strip of five image tiles showing one demo photo cropped progressively tighter (wide → macro), plus an Auto header chip.

**Architecture:** Renderer-only. A pure, React-free helper module (`src/lib/nodes/lens-preview.ts`) derives tiles / zoom / labels / caption from the existing `SHOT_CONTROLS` source of truth; a thin `LensSelect` component draws them; `ShotControlsRow` special-cases the lens group. No change to `shot-controls.ts`, `compilePrompt`, `params_used.controls`, or the generate route — `value`/`onChange` contract is unchanged, so compiled-prompt output is byte-for-byte identical.

**Tech Stack:** Next.js (React), TypeScript, Tailwind v4, shadcn/Base-UI `Button`, Lucide icons, Vitest (node env).

## Global Constraints

- **Controls are shadcn primitives only** — every interactive control is `Button` from `src/components/ui/*` (Base UI). Never a native `<button>`. (CLAUDE.md)
- **Design system:** purple `#5829c7` used *sparingly* — only the active tile ring/label; neutrals do the heavy lifting; Lucide icons at `strokeWidth={1.5}`. (AGENTS.md)
- **`<img>` idiom:** raw `<img>` is the repo pattern (never `next/image`); precede each with `{/* eslint-disable-next-line @next/next/no-img-element */}` exactly as the existing tile components do.
- **Reuse, don't redefine:** option `value`s/`label`s come from `SHOT_CONTROLS` (`src/lib/nodes/shot-controls.ts`); reuse `FieldLabel` and `cn`. (CLAUDE.md reusability rules)
- **Test env is `node`** — no `@testing-library/react`/jsdom in the repo. Automated tests are **pure-logic only**; component wiring is verified by `tsc` + `eslint` + manual QA.

### Deviations from the design spec (2026-07-21-visual-lens-selector-design.md) — approved rationale

1. **Pure helpers live in `src/lib/nodes/lens-preview.ts`**, not co-located inside `lens-select.tsx` (spec §4.2). *Why:* CLAUDE.md's canonical-sources rule puts pure utilities in `src/lib/<feature>/`, and it keeps the unit test free of React/Base-UI imports so it runs in the `node` test env.
2. **No jsdom/RTL component-interaction test** (spec §5, 2nd bullet). *Why:* the suite has zero rendering tests and no RTL/jsdom dependency; adding a test framework is out of scope (YAGNI). The behavior the spec's test targeted (5 tiles, auto split out, correct labels/captions) is covered by pure tests on the helpers; the click→`onChange` / `aria-pressed` wiring is verified in the manual-QA checklist (§ Verification).
3. **Placeholder asset is `public/lens-preview.svg`**, not `.jpg` (spec §4.4). *Why:* `public/` currently holds only SVGs and a vector placeholder can be authored + committed directly and scales crisply under `scale()`. The path is a one-line module constant (`LENS_PREVIEW_SRC`) — swapping to the operator's real `/lens-preview.jpg` is a single edit, exactly as the spec intends.

---

## File Structure

- **Create** `src/lib/nodes/lens-preview.ts` — pure, React-free presentational helpers + the asset-path constant. One responsibility: derive everything the renderer needs from `SHOT_CONTROLS`.
- **Create** `src/lib/nodes/lens-preview.test.ts` — Vitest unit tests for the helpers.
- **Create** `public/lens-preview.svg` — committed placeholder image (centered subject so center-crop lands on detail at macro).
- **Create** `src/components/nodes/lens-select.tsx` — the `LensSelect` presentational component (thin markup over the helpers).
- **Modify** `src/components/nodes/shot-controls-row.tsx` — special-case the `lens` group to render `LensSelect`; composition/lighting unchanged.

---

### Task 1: Pure lens-preview helpers

**Files:**
- Create: `src/lib/nodes/lens-preview.ts`
- Test: `src/lib/nodes/lens-preview.test.ts`

**Interfaces:**
- Consumes: `SHOT_CONTROLS`, `type ShotControlOption` from `./shot-controls`.
- Produces (relied on by Task 3):
  - `LENS_PREVIEW_SRC: string`
  - `LENS_TILES: ShotControlOption[]` — the 5 focal tiles in order (no `auto`)
  - `LENS_AUTO: ShotControlOption` — the `auto` option
  - `lensFocalMm(value: string): number | null`
  - `lensZoom(value: string): number`
  - `lensTileLabel(value: string): string`
  - `lensLabel(value: string): string`
  - `lensCaption(value: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/lens-preview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  LENS_TILES,
  LENS_AUTO,
  lensFocalMm,
  lensZoom,
  lensTileLabel,
  lensCaption,
} from "./lens-preview";

describe("lensFocalMm", () => {
  it("parses the focal length from the option value", () => {
    expect(lensFocalMm("wide-24")).toBe(24);
    expect(lensFocalMm("standard-50")).toBe(50);
    expect(lensFocalMm("macro-100")).toBe(100);
  });
  it("returns null for auto and malformed values", () => {
    expect(lensFocalMm("auto")).toBeNull();
    expect(lensFocalMm("")).toBeNull();
    expect(lensFocalMm("garbage")).toBeNull();
  });
});

describe("lensZoom", () => {
  it("scales by focal length over the 24mm baseline", () => {
    expect(lensZoom("wide-24")).toBe(1);
    expect(lensZoom("standard-50")).toBeCloseTo(2.083, 3);
    expect(lensZoom("macro-100")).toBeCloseTo(4.167, 3);
  });
  it("is 1 (no crop) for auto and malformed values", () => {
    expect(lensZoom("auto")).toBe(1);
    expect(lensZoom("nonsense")).toBe(1);
  });
});

describe("LENS_TILES / LENS_AUTO", () => {
  it("exposes exactly the five focal tiles, in order, without auto", () => {
    expect(LENS_TILES.map((o) => o.value)).toEqual([
      "wide-24",
      "wide-35",
      "standard-50",
      "portrait-85",
      "macro-100",
    ]);
  });
  it("splits auto out as its own option", () => {
    expect(LENS_AUTO.value).toBe("auto");
    expect(LENS_TILES.some((o) => o.value === "auto")).toBe(false);
  });
});

describe("lensTileLabel", () => {
  it("renders the terse focal label", () => {
    expect(lensTileLabel("wide-24")).toBe("24mm");
    expect(lensTileLabel("standard-50")).toBe("50mm");
    expect(lensTileLabel("macro-100")).toBe("100mm");
  });
});

describe("lensCaption", () => {
  it("joins the full label with its descriptor", () => {
    expect(lensCaption("standard-50")).toBe("Standard 50mm · Natural perspective");
    expect(lensCaption("macro-100")).toBe("Macro 100mm · Extreme close detail");
  });
  it("describes auto as model-chosen", () => {
    expect(lensCaption("auto")).toBe("Auto · lens chosen by the model");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/lens-preview.test.ts`
Expected: FAIL — cannot resolve `./lens-preview` (module not created yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/nodes/lens-preview.ts`:

```ts
// Presentational helpers for the visual Lens selector (spec:
// docs/superpowers/specs/2026-07-21-visual-lens-selector-design.md). Pure and React-free so the
// LensSelect component stays thin markup and these can be unit-tested in the node env. No
// prompt/data/API impact: option values come straight from SHOT_CONTROLS (single source of truth).

import { SHOT_CONTROLS, type ShotControlOption } from "./shot-controls";

// The demo asset cropped five ways. Swap this one constant to the operator's real product shot
// (e.g. "/lens-preview.jpg") — nothing else changes.
export const LENS_PREVIEW_SRC = "/lens-preview.svg";

const LENS_OPTIONS: ShotControlOption[] =
  SHOT_CONTROLS.find((g) => g.key === "lens")?.options ?? [];

// The five focal-length tiles, in order — Auto is pulled out into a header chip, not a tile.
export const LENS_TILES: ShotControlOption[] = LENS_OPTIONS.filter((o) => o.value !== "auto");

// The Auto option (drives the header chip's label).
export const LENS_AUTO: ShotControlOption =
  LENS_OPTIONS.find((o) => o.value === "auto") ?? { value: "auto", label: "Auto", prose: "" };

// Short descriptor shown in the caption under the strip. UI-only presentational copy.
export const LENS_DESCRIPTORS: Record<string, string> = {
  "wide-24": "Wide angle",
  "wide-35": "Wide",
  "standard-50": "Natural perspective",
  "portrait-85": "Telephoto, shallow depth",
  "macro-100": "Extreme close detail",
  auto: "lens chosen by the model",
};

// Focal length in mm parsed from the option value ("standard-50" -> 50). null for auto/malformed.
export function lensFocalMm(value: string): number | null {
  const n = Number(value.split("-").pop());
  return Number.isFinite(n) ? n : null;
}

// CSS zoom for a tile's <img>: how much the lens magnifies vs. the 24mm baseline.
// 24 -> 1.0, 50 -> ~2.08, 100 -> ~4.17. auto/malformed -> 1 (no crop).
export function lensZoom(value: string): number {
  const mm = lensFocalMm(value);
  return mm ? mm / 24 : 1;
}

// Full option label ("Standard 50mm") from the shot-controls source.
export function lensLabel(value: string): string {
  return LENS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// Terse label under each tile ("50mm"). Falls back to the full label for non-focal values.
export function lensTileLabel(value: string): string {
  const mm = lensFocalMm(value);
  return mm ? `${mm}mm` : lensLabel(value);
}

// Caption under the strip: "Standard 50mm · Natural perspective" / "Auto · lens chosen by the model".
export function lensCaption(value: string): string {
  const descriptor = LENS_DESCRIPTORS[value] ?? "";
  return descriptor ? `${lensLabel(value)} · ${descriptor}` : lensLabel(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/lens-preview.test.ts`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/lens-preview.ts src/lib/nodes/lens-preview.test.ts
git commit -m "feat(lens-select): pure helpers for the visual lens selector"
```

---

### Task 2: Placeholder preview asset

**Files:**
- Create: `public/lens-preview.svg`

**Interfaces:**
- Consumes: nothing.
- Produces: the file served at `LENS_PREVIEW_SRC` (`/lens-preview.svg`) so `LensSelect` (Task 3) renders a real image and the center-crop lands on subject detail at macro zoom.

- [ ] **Step 1: Create the placeholder SVG**

Create `public/lens-preview.svg` (square viewBox, centered subject with fine center detail so the 4.17× macro crop still shows something; neutrals + sparing purple + a soft yellow glow, per the design system):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img" aria-label="Lens preview placeholder">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f5f5f4"/>
      <stop offset="1" stop-color="#e7e5e4"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="#ffca2d" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#ffca2d" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1000" height="1000" fill="url(#bg)"/>
  <rect width="1000" height="1000" fill="url(#glow)"/>
  <ellipse cx="500" cy="760" rx="230" ry="46" fill="#0b0f19" opacity="0.10"/>
  <rect x="392" y="300" width="216" height="420" rx="40" fill="#1c1917"/>
  <rect x="392" y="300" width="216" height="420" rx="40" fill="#000000" opacity="0.06"/>
  <rect x="446" y="238" width="108" height="86" rx="18" fill="#5829c7"/>
  <circle cx="500" cy="500" r="60" fill="#f5f5f4"/>
  <circle cx="500" cy="500" r="60" fill="none" stroke="#5829c7" stroke-width="6"/>
  <circle cx="500" cy="500" r="16" fill="#5829c7"/>
</svg>
```

- [ ] **Step 2: Verify it is valid + served**

Run: `npx vitest run` (fast sanity that nothing broke) and open `public/lens-preview.svg` in a browser/editor to confirm it renders (a centered bottle with a purple emblem at the exact center).
Expected: valid SVG, subject centered.

- [ ] **Step 3: Commit**

```bash
git add public/lens-preview.svg
git commit -m "feat(lens-select): add placeholder lens-preview asset"
```

---

### Task 3: LensSelect component

**Files:**
- Create: `src/components/nodes/lens-select.tsx`

**Interfaces:**
- Consumes: `LENS_TILES`, `LENS_AUTO`, `LENS_PREVIEW_SRC`, `lensZoom`, `lensTileLabel`, `lensCaption` from `@/lib/nodes/lens-preview`; `FieldLabel` from `./field-label`; `Button` from `@/components/ui/button`; `cn` from `@/lib/utils`; `Aperture`, `Sparkles` from `lucide-react`.
- Produces (relied on by Task 4): `LensSelect({ value, onChange }: { value: string; onChange: (value: string) => void })`.

> No unit test — the suite has no jsdom/RTL and this is presentational markup over Task 1's (already-tested) helpers. Verified by `tsc` + `eslint` here and manual QA in the final section.

- [ ] **Step 1: Write the component**

Create `src/components/nodes/lens-select.tsx`:

```tsx
"use client";

import { Aperture, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FieldLabel } from "./field-label";
import {
  LENS_TILES,
  LENS_AUTO,
  LENS_PREVIEW_SRC,
  lensZoom,
  lensTileLabel,
  lensCaption,
} from "@/lib/nodes/lens-preview";

// Visual "show-don't-tell" renderer for the Lens shot control: one demo photo cropped
// progressively tighter across five focal-length tiles, with Auto pulled out into a header chip.
// Renderer-only — same value/onChange contract as the other shot controls, so compilePrompt output
// is unchanged. Spec: docs/superpowers/specs/2026-07-21-visual-lens-selector-design.md.
export function LensSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const autoActive = value === "auto";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel icon={Aperture} label="Lens" />
        <Button
          variant="outline"
          size="sm"
          aria-pressed={autoActive}
          onClick={() => onChange("auto")}
          className={cn(
            "nodrag",
            autoActive &&
              "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary",
          )}
        >
          <Sparkles className="size-3.5" strokeWidth={1.5} />
          {LENS_AUTO.label}
        </Button>
      </div>

      <div className="flex gap-1.5">
        {LENS_TILES.map((opt) => {
          const active = opt.value === value;
          return (
            <Button
              key={opt.value}
              variant="outline"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                "nodrag h-auto flex-1 flex-col gap-1 p-1",
                active && "border-primary/50 bg-primary/5",
              )}
            >
              <span className="relative block aspect-square w-full overflow-hidden rounded-[6px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={LENS_PREVIEW_SRC}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 block h-full w-full object-cover object-center"
                  style={{ transform: `scale(${lensZoom(opt.value)})` }}
                />
              </span>
              <span
                className={cn(
                  "text-[11px] leading-none",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {lensTileLabel(opt.value)}
              </span>
            </Button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">{lensCaption(value)}</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint the new file**

Run: `npx tsc --noEmit` and `npx eslint src/components/nodes/lens-select.tsx`
Expected: no type errors; no eslint errors (the `no-img-element` warning is suppressed by the inline disable, matching the repo idiom).

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/lens-select.tsx
git commit -m "feat(lens-select): visual lens tile-strip component"
```

---

### Task 4: Wire LensSelect into ShotControlsRow

**Files:**
- Modify: `src/components/nodes/shot-controls-row.tsx`

**Interfaces:**
- Consumes: `LensSelect` from `./lens-select`. No prop-shape change to `ShotControlsRow` — same `{ controls, onChange }`.
- Produces: nothing new.

> No unit test (see Task 3 rationale). Verified by `tsc` + `eslint` + the manual-QA checklist below.

- [ ] **Step 1: Add the import**

In `src/components/nodes/shot-controls-row.tsx`, add after the `FieldLabel` import (line 10):

```tsx
import { LensSelect } from "./lens-select";
```

- [ ] **Step 2: Special-case the lens group in the map**

Replace the `SHOT_CONTROLS.map(...)` body (lines 30-39) with:

```tsx
      {SHOT_CONTROLS.map((group) =>
        group.key === "lens" ? (
          <LensSelect
            key={group.key}
            value={controls.lens}
            onChange={(v) => onChange({ ...controls, lens: v })}
          />
        ) : (
          <div key={group.key} className="space-y-2">
            <FieldLabel icon={ICONS[group.key]} label={group.label} />
            <ParamChipGroup
              options={group.options.map((o) => ({ value: o.value, label: o.label }))}
              value={controls[group.key]}
              onValueChange={(value) => onChange({ ...controls, [group.key]: value })}
            />
          </div>
        ),
      )}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/nodes/shot-controls-row.tsx`
Expected: no type errors; no eslint errors. (`ICONS.lens` is now unused by the JSX but is still referenced for the type map — if eslint flags it as unused, drop the `lens` key from `ICONS` and the `Aperture` import in this file, since `LensSelect` owns the lens icon.)

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/shot-controls-row.tsx
git commit -m "feat(lens-select): render lens group as the visual selector"
```

---

## Verification

**Automated (run from repo root):**

- [ ] `npx vitest run` — full suite green (existing tests + new `lens-preview.test.ts`).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx eslint .` — clean (no new errors).

**Manual QA (`npm run dev` → open a Prompt node's focus view):**

- [ ] Lens shows a single row of **five image tiles** cropped progressively tighter (wide → macro), an **Auto chip** on the header row, and a caption below.
- [ ] Clicking a tile moves the purple ring + updates the caption; the value persists to `nodes.data.controls` (reload / re-open confirms).
- [ ] Clicking **Auto** clears the tile ring, activates the Auto chip, and the caption reads `Auto · lens chosen by the model`.
- [ ] Composition and Lighting are unchanged (still text pills).
- [ ] **Generate** still sends the correct `controls` — compiled prompt is unchanged (spot-check the request payload / generated result).
- [ ] At the real ~400px column width: one row, no wrap, no horizontal overflow; brand purple only on the active ring/label.

## Spec coverage self-check

- Why / show-don't-tell (spec §1) → Tasks 2-4.
- Fixed demo image, renderer-swap only, crop = focal ratio, Auto pulled out, no slider, compact strip (spec §2) → Tasks 1-4 (`lensZoom`, `LENS_TILES`/`LENS_AUTO`, layout in Task 3).
- Layout (spec §3) → Task 3 markup + caption/auto states.
- Components §4.1-4.4 → Task 3 (`LensSelect`), Task 1 (`lensZoom` + helpers), Task 4 (`ShotControlsRow` edit), Task 2 (asset). *Helper location & test approach & asset format deviate per the "Deviations" section above.*
- Tests §5 → Task 1 pure tests (superset of the `lensZoom` cases; tile/label/caption cases stand in for the component-interaction test — see Deviation 2).
- Scope cuts §6 → honored: lens-only, no slider, fixed asset, no data/prompt/API change.
- Verification §7 → this section.
