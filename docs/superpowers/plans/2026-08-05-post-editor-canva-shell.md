# Post editor — Canva-style shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Post editor into a Canva-style shell — a left tool rail with flyout panels, ten
plain-English formats, fourteen aspect-aware templates, non-technical property controls — and fix the
node-card and editor defects found in the audit.

**Architecture:** Pure logic lands first in `src/lib/post/**` (formats, aspect bands, gradients,
render state, cascade, widened history) with real Vitest coverage. Templates follow as an independent,
parallelizable block. UI is then assembled from one icon rail plus one shared flyout panel that
switches on the active tool, with `post-focus-view.tsx` shrinking to an orchestrator. No database
migration: per **D10** the Post node's data is schemaless JSONB.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, `react-konva` + `konva` 10.3.0, Zustand canvas
store, Tailwind v4 + shadcn (Base UI registry), Vitest (`environment: "node"`).

**Spec:** `docs/superpowers/specs/2026-08-05-post-editor-canva-shell-design.md` (decisions D116–D128).

## Global Constraints

- **Every interactive control MUST be a shadcn primitive** from `src/components/ui/*` — never a raw
  `<button>`/`<input>`/`<select>`/`<textarea>`. Base UI components compose via the `render` prop, not
  `asChild`. This has been a repeat review finding; it is not negotiable.
- **No `.tsx` file in this repo is unit-tested.** Vitest runs in `environment: "node"` with no jsdom.
  Components are verified by `npx tsc --noEmit` only. Only pure `.ts` under `src/lib/**` gets
  `describe`/`it` tests.
- **No raw internal token is ever rendered to a user** — not a `PostFormat` key (`ig-square`), not a
  layer `kind`. Always the friendly label (D122).
- **No database migration.** `PostNodeData` is schemaless JSONB per D10; new fields are additive and
  every reader must tolerate their absence on existing nodes.
- **Never start `npm run dev` and never use Playwright.** Verification is `npx tsc --noEmit` plus
  `npx vitest run` only. The operator hand-tests in the browser themselves.
- Motion easing is `cubic-bezier(0.22,1,0.36,1)` at 200/320/500ms; never a spring.
- Colours come from the CSS variables in `src/app/globals.css` — never hardcoded hex in components.
- Purple `#5829c7` is used sparingly (primary CTA, brand mark, focus ring), never as a large fill.

## Baseline

Before starting, confirm the tree is green:

```bash
npx tsc --noEmit          # expect: clean, no output
npx vitest run src/lib/post src/services/post-node.service.test.ts src/lib/canvas-nodes.test.ts src/lib/canvas-node-options.test.ts src/lib/nodes/node-output.test.ts
# expect: 177 passed
```

## File Structure

```
src/lib/post/
  formats.ts              10 formats, friendly labels, legacy-key fallback   (T1, modified)
  aspect-band.ts          portrait|square|landscape classifier               (T2, new)
  units.ts                fontSizeToPx measures the SHORTER edge             (T3, modified)
  layer-konva-props.ts    textLayerFontProps gains containerW                (T3, modified)
  gradients.ts            named gradient presets + direction→angle           (T4, new)
  render-state.ts         draft|exported|stale for the node card             (T5, new)
  layers.ts               cascade offset for newly created layers            (T6, modified)
  history.ts              unchanged (already generic over T)                 (T7, read only)
  templates/              4 retuned + 10 new                                 (T8–T11)

src/hooks/
  use-post-editor.ts      history widens to {layers, format, templateId}     (T7, modified)

src/components/nodes/
  post-colour-swatches.tsx    shared swatch grid                             (T12, new)
  post-gradient-presets.tsx   shared gradient swatches + direction           (T13, new)
  post-inspector*.tsx         normalised shell + visual controls             (T14, modified)
  post-tool-rail.tsx          the icon rail                                  (T15, new)
  post-tool-panel.tsx         flyout shell, switches on active tool          (T16, new)
  post-panel-sizes.tsx        platform-grouped formats                       (T17, new)
  post-panel-templates.tsx    template grid + override AlertDialog           (T18, new)
  post-panel-elements.tsx     shapes + icons                                 (T19, new)
  post-panel-text.tsx         text presets                                   (T20, new)
  post-panel-connected.tsx    connected-node thumbnails + drag-drop          (T21, new)
  post-panel-layers.tsx       wraps PostLayerList                            (T22, new)
  post-stage.tsx              Escape stops propagation while editing         (T23, modified)
  post-node.tsx               aspect-correct preview + real render state     (T25, modified)
  post-focus-view.tsx         shrinks to orchestrator                        (T26, modified)
  post-add-menu.tsx           DELETED (T26)
  post-template-picker.tsx    DELETED (T26)

src/lib/canvas-nodes.ts       adds layersUpdatedAt                           (T24, modified)
```

**Dependency order.** T1–T7 are foundation and must land first. T8–T11 (templates) depend only on
T1–T3 and are **mutually independent — run them in parallel**. T12–T22 depend on T1–T7. T23–T25 are
independent of the panels. T26 integrates everything and must be last.

---

## Task 1: Ten formats with friendly labels

**Files:**
- Modify: `src/lib/post/formats.ts`
- Modify: `src/lib/post/types.ts` (the `PostFormat` union)
- Test: `src/lib/post/formats.test.ts`

**Interfaces:**
- Produces: `PostFormat` union of 10 keys; `POST_FORMATS: Record<PostFormat, FormatSpec>` where
  `FormatSpec = { width, height, label, shortLabel, platform, dpi? }`;
  `resolveFormat(key: string | undefined): PostFormat` (legacy + unknown fallback);
  `FORMATS_BY_PLATFORM: { platform: string; formats: PostFormat[] }[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/post/formats.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  POST_FORMATS, getFormatSpec, resolveFormat, FORMATS_BY_PLATFORM,
} from "./formats";
import type { PostFormat } from "./types";

describe("POST_FORMATS", () => {
  it("has ten formats", () => {
    expect(Object.keys(POST_FORMATS)).toHaveLength(10);
  });

  it("includes Instagram 4:5 portrait at 1080x1350", () => {
    const spec = POST_FORMATS["ig-portrait"];
    expect(spec.width).toBe(1080);
    expect(spec.height).toBe(1350);
  });

  it("gives every format a human label that never contains its key", () => {
    for (const [key, spec] of Object.entries(POST_FORMATS)) {
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.label).not.toContain(key);
      expect(spec.shortLabel.length).toBeGreaterThan(0);
      expect(spec.shortLabel).not.toContain(key);
    }
  });

  it("only sets dpi on the print format", () => {
    for (const [key, spec] of Object.entries(POST_FORMATS)) {
      if (key === "a4-print") expect(spec.dpi).toBe(300);
      else expect(spec.dpi).toBeUndefined();
    }
  });
});

describe("resolveFormat", () => {
  it("passes through a known key", () => {
    expect(resolveFormat("ig-story")).toBe("ig-story");
  });

  it("maps the legacy 'linkedin' key to linkedin-post", () => {
    expect(resolveFormat("linkedin")).toBe("linkedin-post");
  });

  it("falls back to ig-square for unknown or missing keys", () => {
    expect(resolveFormat("nonsense")).toBe("ig-square");
    expect(resolveFormat(undefined)).toBe("ig-square");
  });
});

describe("FORMATS_BY_PLATFORM", () => {
  it("lists every format exactly once across all groups", () => {
    const flat = FORMATS_BY_PLATFORM.flatMap((g) => g.formats);
    expect(flat.slice().sort()).toEqual((Object.keys(POST_FORMATS) as PostFormat[]).sort());
  });

  it("puts Instagram first, portrait before square", () => {
    expect(FORMATS_BY_PLATFORM[0].platform).toBe("Instagram");
    expect(FORMATS_BY_PLATFORM[0].formats[0]).toBe("ig-portrait");
    expect(FORMATS_BY_PLATFORM[0].formats[1]).toBe("ig-square");
  });
});

describe("getFormatSpec", () => {
  it("returns the spec for a key", () => {
    expect(getFormatSpec("a4-print").dpi).toBe(300);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/post/formats.test.ts`
Expected: FAIL — `resolveFormat` / `FORMATS_BY_PLATFORM` are not exported.

- [ ] **Step 3: Widen the `PostFormat` union**

In `src/lib/post/types.ts`, replace line 1:

```typescript
export type PostFormat =
  | "ig-portrait"
  | "ig-square"
  | "ig-story"
  | "facebook-post"
  | "linkedin-post"
  | "linkedin-square"
  | "x-post"
  | "youtube-thumb"
  | "pinterest-pin"
  | "a4-print";
```

- [ ] **Step 4: Rewrite `formats.ts`**

```typescript
import type { PostFormat } from "./types";

export type FormatSpec = {
  width: number;
  height: number;
  /** Full human label, e.g. "Instagram post — portrait". Never shows the key. */
  label: string;
  /** Compact label for tight spots like the node card, e.g. "Instagram portrait". */
  shortLabel: string;
  platform: string;
  dpi?: number; // only set for print formats
};

export const POST_FORMATS: Record<PostFormat, FormatSpec> = {
  "ig-portrait": {
    width: 1080, height: 1350, platform: "Instagram",
    label: "Instagram post — portrait", shortLabel: "Instagram portrait",
  },
  "ig-square": {
    width: 1080, height: 1080, platform: "Instagram",
    label: "Instagram post — square", shortLabel: "Instagram square",
  },
  "ig-story": {
    width: 1080, height: 1920, platform: "Instagram",
    label: "Instagram story & reel", shortLabel: "Instagram story",
  },
  "facebook-post": {
    width: 1200, height: 1500, platform: "Facebook",
    label: "Facebook post", shortLabel: "Facebook post",
  },
  "linkedin-post": {
    width: 1200, height: 627, platform: "LinkedIn",
    label: "LinkedIn post", shortLabel: "LinkedIn post",
  },
  "linkedin-square": {
    width: 1080, height: 1080, platform: "LinkedIn",
    label: "LinkedIn post — square", shortLabel: "LinkedIn square",
  },
  "x-post": {
    width: 1600, height: 900, platform: "X",
    label: "X post", shortLabel: "X post",
  },
  "youtube-thumb": {
    width: 1280, height: 720, platform: "Other",
    label: "YouTube thumbnail", shortLabel: "YouTube thumbnail",
  },
  "pinterest-pin": {
    width: 1000, height: 1500, platform: "Other",
    label: "Pinterest pin", shortLabel: "Pinterest pin",
  },
  "a4-print": {
    width: 2480, height: 3508, platform: "Print",
    label: "A4 print (300 DPI)", shortLabel: "A4 print", dpi: 300,
  },
};

/** Display order for the Size panel. Instagram first; portrait before square (4:5 performs best). */
export const FORMATS_BY_PLATFORM: { platform: string; formats: PostFormat[] }[] = [
  { platform: "Instagram", formats: ["ig-portrait", "ig-square", "ig-story"] },
  { platform: "Facebook", formats: ["facebook-post"] },
  { platform: "LinkedIn", formats: ["linkedin-post", "linkedin-square"] },
  { platform: "X", formats: ["x-post"] },
  { platform: "Other", formats: ["youtube-thumb", "pinterest-pin"] },
  { platform: "Print", formats: ["a4-print"] },
];

/**
 * Formats persisted before this rename. `PostFormat` values live in node JSONB with no
 * migration (D10), so old values must keep resolving at read time forever.
 */
const LEGACY_FORMAT_KEYS: Record<string, PostFormat> = {
  linkedin: "linkedin-post",
};

export const DEFAULT_FORMAT: PostFormat = "ig-square";

/** Normalises anything read out of node data into a real PostFormat. */
export function resolveFormat(key: string | undefined): PostFormat {
  if (!key) return DEFAULT_FORMAT;
  if (key in POST_FORMATS) return key as PostFormat;
  return LEGACY_FORMAT_KEYS[key] ?? DEFAULT_FORMAT;
}

export function getFormatSpec(format: PostFormat): FormatSpec {
  return POST_FORMATS[format];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/post/formats.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and fix fallout**

Run: `npx tsc --noEmit`

The `PostFormat` union widened, so exhaustive `switch`es and `Record<PostFormat, …>` literals
elsewhere may now be incomplete. Fix each by reading the file — do not cast to silence it. Then
replace every `format ?? "ig-square"` expression in `src/components/nodes/post-focus-view.tsx` and
`src/components/nodes/post-node.tsx` with `resolveFormat(format)` so legacy keys resolve.

Run `npx tsc --noEmit` again. Expected: clean.

- [ ] **Step 7: Run the full post suite**

Run: `npx vitest run src/lib/post src/services/post-node.service.test.ts src/lib/canvas-nodes.test.ts`
Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/post/formats.ts src/lib/post/formats.test.ts src/lib/post/types.ts \
  src/components/nodes/post-focus-view.tsx src/components/nodes/post-node.tsx
git commit -m "feat(post): ten platform-grouped formats with friendly labels and a legacy-key fallback"
```

---

## Task 2: Aspect-band classifier

**Files:**
- Create: `src/lib/post/aspect-band.ts`
- Test: `src/lib/post/aspect-band.test.ts`

**Interfaces:**
- Consumes: `POST_FORMATS` (T1).
- Produces: `type AspectBand = "portrait" | "square" | "landscape"`;
  `aspectBand(format: PostFormat): AspectBand`; `byBand<T>(band, values: Record<AspectBand, T>): T`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/post/aspect-band.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { aspectBand, byBand } from "./aspect-band";

describe("aspectBand", () => {
  it("classifies tall formats as portrait", () => {
    expect(aspectBand("ig-story")).toBe("portrait");     // 1080x1920
    expect(aspectBand("ig-portrait")).toBe("portrait");  // 1080x1350
    expect(aspectBand("pinterest-pin")).toBe("portrait");// 1000x1500
    expect(aspectBand("a4-print")).toBe("portrait");     // 2480x3508
  });

  it("classifies 1:1 as square", () => {
    expect(aspectBand("ig-square")).toBe("square");
    expect(aspectBand("linkedin-square")).toBe("square");
  });

  it("classifies wide formats as landscape", () => {
    expect(aspectBand("linkedin-post")).toBe("landscape"); // 1200x627
    expect(aspectBand("x-post")).toBe("landscape");        // 1600x900
    expect(aspectBand("youtube-thumb")).toBe("landscape"); // 1280x720
  });

  it("treats near-square 4:5 as portrait, not square", () => {
    // 0.8 is meaningfully taller than wide; a square-tuned layout would waste the extra height.
    expect(aspectBand("facebook-post")).toBe("portrait"); // 1200x1500 = 0.8
  });
});

describe("byBand", () => {
  it("selects the value for the given band", () => {
    const values = { portrait: 1, square: 2, landscape: 3 };
    expect(byBand("portrait", values)).toBe(1);
    expect(byBand("square", values)).toBe(2);
    expect(byBand("landscape", values)).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/post/aspect-band.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/post/aspect-band.ts`:

```typescript
import type { PostFormat } from "./types";
import { POST_FORMATS } from "./formats";

export type AspectBand = "portrait" | "square" | "landscape";

/**
 * How far from 1:1 a format may sit and still be treated as square. 4:5 (0.8) is
 * deliberately OUTSIDE this band: it is Instagram's best-performing feed size and has
 * real extra height a square-tuned composition would leave empty.
 */
const SQUARE_TOLERANCE = 0.05;

/**
 * Templates tune ONE composition across three bands rather than shipping a layout per
 * format (D124) — margins, headline size and scrim height differ by band, the structure
 * does not.
 */
export function aspectBand(format: PostFormat): AspectBand {
  const { width, height } = POST_FORMATS[format];
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= SQUARE_TOLERANCE) return "square";
  return ratio < 1 ? "portrait" : "landscape";
}

/** Tiny readability helper so templates read as data rather than if-chains. */
export function byBand<T>(band: AspectBand, values: Record<AspectBand, T>): T {
  return values[band];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/post/aspect-band.test.ts`
Expected: PASS (6 assertions across 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/post/aspect-band.ts src/lib/post/aspect-band.test.ts
git commit -m "feat(post): add the aspect-band classifier for format-aware templates"
```

---

## Task 3: Font size measures the shorter edge

**Files:**
- Modify: `src/lib/post/units.ts`
- Modify: `src/lib/post/layer-konva-props.ts`
- Modify: `src/components/nodes/post-text-layer.tsx`
- Modify: `src/components/nodes/post-stage.tsx:253`
- Test: `src/lib/post/units.test.ts` (existing expectations change — see D123)

**Interfaces:**
- Produces: `fontSizeToPx(fontSize: number, containerW: number, containerH: number): number`;
  `pxToFontSize(px: number, containerW: number, containerH: number): number`;
  `textLayerFontProps(layer: TextLayer, containerW: number, containerH: number): KonvaTextProps`.

**Why the existing test changes.** `TextLayer.fontSize` is a 0–1 fraction. Measured against height,
identical copy renders 49px on a 1080-tall square and 86px on a 1920-tall story while both canvases
stay 1080 wide — unusable across the ten formats T1 just added. The shorter edge is stable. For every
square format `min == height`, so this is a **no-op on square posts**, which are the default and the
bulk of existing data (D123). This is the one file in this plan where an edited test is expected.

- [ ] **Step 1: Update the failing test**

In `src/lib/post/units.test.ts`, replace the whole `describe("fontSizeToPx / pxToFontSize", …)` block
with:

```typescript
describe("fontSizeToPx / pxToFontSize", () => {
  it("measures against the shorter edge, so square is unchanged", () => {
    // 1080x1080: min == height, identical to the old height-based behaviour.
    expect(fontSizeToPx(0.05, 1080, 1080)).toBeCloseTo(54, 5);
  });

  it("uses width when the canvas is taller than it is wide", () => {
    // 1080x1920 story: the old height basis gave 96px; the shorter edge gives 54px,
    // so the same copy reads the same size as it does on a square.
    expect(fontSizeToPx(0.05, 1080, 1920)).toBeCloseTo(54, 5);
  });

  it("uses height when the canvas is wider than it is tall", () => {
    // 1600x900 X post.
    expect(fontSizeToPx(0.05, 1600, 900)).toBeCloseTo(45, 5);
  });

  it("round-trips through pxToFontSize at any ratio", () => {
    expect(pxToFontSize(fontSizeToPx(0.05, 1080, 1920), 1080, 1920)).toBeCloseTo(0.05, 6);
    expect(pxToFontSize(fontSizeToPx(0.05, 1600, 900), 1600, 900)).toBeCloseTo(0.05, 6);
  });

  it("returns 0 rather than dividing by zero on an unmeasured canvas", () => {
    expect(pxToFontSize(10, 0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/post/units.test.ts`
Expected: FAIL — `fontSizeToPx` currently takes two arguments.

- [ ] **Step 3: Change the basis in `units.ts`**

Replace the two functions and the file's header comment:

```typescript
// Every layer's x/y/w/h is normalized 0-1 of the canvas. fontSize is normalized against the
// canvas's SHORTER EDGE (D123) — not its height — so identical copy reads at the same visual
// size on a 9:16 story, a 1:1 square and a 16:9 thumbnail. For square formats the shorter
// edge IS the height, so square posts render exactly as they always have.
```

```typescript
export function fontSizeToPx(fontSize: number, containerW: number, containerH: number): number {
  return fontSize * Math.min(containerW, containerH);
}

export function pxToFontSize(px: number, containerW: number, containerH: number): number {
  const basis = Math.min(containerW, containerH);
  return basis === 0 ? 0 : px / basis;
}
```

Leave `normalizedToPx`, `pxToNormalized`, `FONT_SIZE_BASELINE_PX`, `displayFontSize` and
`fontSizeFromDisplay` exactly as they are — the inspector's displayed number is deliberately
independent of the selected format.

- [ ] **Step 4: Thread `containerW` through the call sites**

In `src/lib/post/layer-konva-props.ts`, change the signature and body:

```typescript
export function textLayerFontProps(
  layer: TextLayer, containerW: number, containerH: number,
): KonvaTextProps {
  return {
    fontFamily: layer.fontFamily,
    fontSize: fontSizeToPx(layer.fontSize, containerW, containerH),
    fontStyle: layer.fontWeight >= 600 ? "bold" : "normal",
```

(leave the rest of the returned object untouched).

In `src/components/nodes/post-text-layer.tsx` line 28:

```typescript
  const fontProps = textLayerFontProps(layer, containerW, containerH);
```

In `src/components/nodes/post-stage.tsx` around line 253, inside the inline-edit overlay's `style`:

```typescript
              fontSize: fontSizeToPx(layer.fontSize, containerW, containerH),
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/lib/post/units.test.ts src/lib/post/layer-konva-props.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean. If `layer-konva-props.test.ts` calls `textLayerFontProps` with two arguments, update
those call sites to pass width and height — the test's *expectations* for square inputs should not
change, because square is a no-op.

- [ ] **Step 6: Commit**

```bash
git add src/lib/post/units.ts src/lib/post/units.test.ts src/lib/post/layer-konva-props.ts \
  src/lib/post/layer-konva-props.test.ts src/components/nodes/post-text-layer.tsx \
  src/components/nodes/post-stage.tsx
git commit -m "feat(post): measure font size against the canvas's shorter edge"
```

---

## Task 4: Gradient presets and direction

**Files:**
- Create: `src/lib/post/gradients.ts`
- Test: `src/lib/post/gradients.test.ts`

**Interfaces:**
- Consumes: `Fill` from `./types`.
- Produces: `type GradientDirection = "down" | "up" | "right" | "left"`;
  `GRADIENT_DIRECTIONS: { key: GradientDirection; label: string; angle: number }[]`;
  `GRADIENT_PRESETS: { id: string; label: string; from: string; to: string }[]`;
  `directionToAngle(d)`, `angleToDirection(angle)`,
  `makeGradientFill(presetId: string, direction: GradientDirection): Fill`.

**Why.** The gradient control shipped as two free-text boxes expecting `rgba(0,0,0,0.72)`, and the
angle was hardcoded to `0` at creation with no control anywhere — unreachable forever (D125). This
module is the data behind clickable swatches and a four-way direction picker.

- [ ] **Step 1: Write the failing test**

Create `src/lib/post/gradients.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  GRADIENT_PRESETS, GRADIENT_DIRECTIONS, directionToAngle, angleToDirection, makeGradientFill,
} from "./gradients";

describe("GRADIENT_PRESETS", () => {
  it("offers at least six presets with unique ids", () => {
    expect(GRADIENT_PRESETS.length).toBeGreaterThanOrEqual(6);
    const ids = GRADIENT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("labels every preset in plain language", () => {
    for (const p of GRADIENT_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.label).not.toMatch(/rgba|#[0-9a-f]{3,}/i);
    }
  });

  it("includes a transparent-to-dark scrim, the most useful one over photos", () => {
    const scrim = GRADIENT_PRESETS.find((p) => p.id === "dark-fade");
    expect(scrim).toBeDefined();
    expect(scrim!.from).toBe("rgba(0,0,0,0)");
  });
});

describe("directions", () => {
  it("maps all four directions to distinct angles", () => {
    const angles = GRADIENT_DIRECTIONS.map((d) => d.angle);
    expect(new Set(angles).size).toBe(4);
  });

  it("round-trips direction -> angle -> direction", () => {
    for (const d of GRADIENT_DIRECTIONS) {
      expect(angleToDirection(directionToAngle(d.key))).toBe(d.key);
    }
  });

  it("falls back to 'down' for an angle it does not recognise", () => {
    expect(angleToDirection(37)).toBe("down");
  });
});

describe("makeGradientFill", () => {
  it("builds a gradient Fill from a preset id and direction", () => {
    const fill = makeGradientFill("dark-fade", "up");
    expect(fill).toEqual({
      kind: "gradient",
      from: "rgba(0,0,0,0)",
      to: "rgba(0,0,0,0.72)",
      angle: directionToAngle("up"),
    });
  });

  it("falls back to the first preset for an unknown id", () => {
    const fill = makeGradientFill("nope", "down");
    expect(fill.kind).toBe("gradient");
    if (fill.kind === "gradient") expect(fill.from).toBe(GRADIENT_PRESETS[0].from);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/post/gradients.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/post/gradients.ts`:

```typescript
import type { Fill } from "./types";

export type GradientDirection = "down" | "up" | "right" | "left";

/**
 * `angle` is what ShapeLayer's gradient Fill stores, and what layer-konva-props turns into
 * Konva's start/end points. Degrees, clockwise, 0 = top-to-bottom.
 */
export const GRADIENT_DIRECTIONS: { key: GradientDirection; label: string; angle: number }[] = [
  { key: "down", label: "Downward", angle: 0 },
  { key: "right", label: "Rightward", angle: 90 },
  { key: "up", label: "Upward", angle: 180 },
  { key: "left", label: "Leftward", angle: 270 },
];

/**
 * Ready-made gradients a non-technical operator can pick by eye (D125). "dark-fade" comes
 * first because a transparent-to-dark scrim is what rescues copy sitting over a photo, and
 * it is what every stock template reaches for.
 */
export const GRADIENT_PRESETS: { id: string; label: string; from: string; to: string }[] = [
  { id: "dark-fade", label: "Dark fade", from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.72)" },
  { id: "light-fade", label: "Light fade", from: "rgba(255,255,255,0)", to: "rgba(255,255,255,0.85)" },
  { id: "brand", label: "Brand purple", from: "#5829c7", to: "#8b5cf6" },
  { id: "sunset", label: "Sunset", from: "#ff7a45", to: "#ffca2d" },
  { id: "ocean", label: "Ocean", from: "#0ea5e9", to: "#1e3a8a" },
  { id: "forest", label: "Forest", from: "#14532d", to: "#4ade80" },
  { id: "blush", label: "Blush", from: "#fbcfe8", to: "#f472b6" },
  { id: "slate", label: "Slate", from: "#1e1e1e", to: "#64748b" },
];

export function directionToAngle(direction: GradientDirection): number {
  return GRADIENT_DIRECTIONS.find((d) => d.key === direction)?.angle ?? 0;
}

/** Any angle we didn't author (e.g. legacy data) reads as the default, "down". */
export function angleToDirection(angle: number): GradientDirection {
  return GRADIENT_DIRECTIONS.find((d) => d.angle === angle)?.key ?? "down";
}

export function makeGradientFill(presetId: string, direction: GradientDirection): Fill {
  const preset = GRADIENT_PRESETS.find((p) => p.id === presetId) ?? GRADIENT_PRESETS[0];
  return {
    kind: "gradient",
    from: preset.from,
    to: preset.to,
    angle: directionToAngle(direction),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/post/gradients.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/post/gradients.ts src/lib/post/gradients.test.ts
git commit -m "feat(post): add named gradient presets and a four-way direction map"
```

---

## Task 5: Node-card render state

**Files:**
- Create: `src/lib/post/render-state.ts`
- Test: `src/lib/post/render-state.test.ts`

**Interfaces:**
- Produces: `type RenderState = "draft" | "exported" | "stale"`;
  `renderState(args: { fileUrl?: string; renderedAt?: string; layersUpdatedAt?: string }): RenderState`;
  `RENDER_STATE_LABELS: Record<RenderState, string>`.

**Why.** `PostNodeData.renderedAt` is declared as driving an "unrendered changes" badge and written on
every export, but nothing has ever read it — the original plan ended before that task existed. This is
the missing half (D126).

- [ ] **Step 1: Write the failing test**

Create `src/lib/post/render-state.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderState, RENDER_STATE_LABELS } from "./render-state";

const EARLIER = "2026-08-05T10:00:00.000Z";
const LATER = "2026-08-05T11:00:00.000Z";

describe("renderState", () => {
  it("is draft when nothing has ever been exported", () => {
    expect(renderState({})).toBe("draft");
    expect(renderState({ layersUpdatedAt: LATER })).toBe("draft");
  });

  it("is exported when the render is at least as new as the last layer edit", () => {
    expect(renderState({ fileUrl: "u", renderedAt: LATER, layersUpdatedAt: EARLIER })).toBe("exported");
  });

  it("is stale when layers changed after the last export", () => {
    expect(renderState({ fileUrl: "u", renderedAt: EARLIER, layersUpdatedAt: LATER })).toBe("stale");
  });

  it("treats a missing layersUpdatedAt as current, not stale", () => {
    // Every node saved before layersUpdatedAt existed lacks it. Guessing 'stale' would
    // flag every previously-exported post as dirty on first load (D126).
    expect(renderState({ fileUrl: "u", renderedAt: EARLIER })).toBe("exported");
  });

  it("treats a missing renderedAt with a fileUrl as exported", () => {
    // Older exports wrote fileUrl before renderedAt was added.
    expect(renderState({ fileUrl: "u", layersUpdatedAt: LATER })).toBe("exported");
  });

  it("is exported when the two stamps are identical", () => {
    expect(renderState({ fileUrl: "u", renderedAt: LATER, layersUpdatedAt: LATER })).toBe("exported");
  });

  it("ignores unparseable timestamps rather than throwing", () => {
    expect(renderState({ fileUrl: "u", renderedAt: "nonsense", layersUpdatedAt: LATER })).toBe("exported");
  });
});

describe("RENDER_STATE_LABELS", () => {
  it("labels every state in plain language", () => {
    expect(RENDER_STATE_LABELS.draft).toBe("Draft");
    expect(RENDER_STATE_LABELS.exported).toBe("Exported");
    expect(RENDER_STATE_LABELS.stale).toBe("Edited since export");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/post/render-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/post/render-state.ts`:

```typescript
export type RenderState = "draft" | "exported" | "stale";

export const RENDER_STATE_LABELS: Record<RenderState, string> = {
  draft: "Draft",
  exported: "Exported",
  stale: "Edited since export",
};

function parseTime(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * What the node card should say about a post (D126).
 *
 * The old chip read `!!fileUrl` and said "Rendered"/"Pending" — i.e. "has this ever been
 * exported?", not "is this ready?". A finished design you hadn't downloaded read *Pending*,
 * and an edited-since-export design read *Rendered*, which was simply false.
 *
 * Absent timestamps are treated as "current", never as stale: every node saved before
 * `layersUpdatedAt` existed lacks it, and defaulting those to stale would flag every
 * previously-exported post as dirty the first time it loaded.
 */
export function renderState(args: {
  fileUrl?: string;
  renderedAt?: string;
  layersUpdatedAt?: string;
}): RenderState {
  if (!args.fileUrl) return "draft";
  const rendered = parseTime(args.renderedAt);
  const edited = parseTime(args.layersUpdatedAt);
  if (rendered === null || edited === null) return "exported";
  return edited > rendered ? "stale" : "exported";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/post/render-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/post/render-state.ts src/lib/post/render-state.test.ts
git commit -m "feat(post): derive a real render state for the node card"
```

---

## Task 6: New layers cascade instead of stacking

**Files:**
- Modify: `src/lib/post/layers.ts`
- Test: `src/lib/post/layers.test.ts` (add a `describe` block; change nothing existing)

**Interfaces:**
- Produces: `cascadeGeometry(existing: PostLayer[]): { x: number; y: number }`, used by
  `createTextLayer` / `createShapeLayer` / `createIconLayer` when the caller passes no `x`/`y`.

**Why.** All three creators spread one fixed `DEFAULT_GEOMETRY` (`x: 0.1, y: 0.1`), so three added
texts stack perfectly and only the top one is reachable (D128). `duplicateLayer` already nudges by
+0.02; new layers never got the same treatment.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/post/layers.test.ts`:

```typescript
describe("cascadeGeometry", () => {
  it("places the first layer at the default origin", () => {
    expect(cascadeGeometry([])).toEqual({ x: 0.1, y: 0.1 });
  });

  it("offsets each subsequent layer so additions never stack invisibly", () => {
    const one = [createTextLayer()];
    const two = [createTextLayer(), createTextLayer()];
    expect(cascadeGeometry(one)).toEqual({ x: 0.12, y: 0.12 });
    expect(cascadeGeometry(two)).toEqual({ x: 0.14, y: 0.14 });
  });

  it("wraps back to the origin rather than walking off the canvas", () => {
    const many = Array.from({ length: 12 }, () => createTextLayer());
    const { x, y } = cascadeGeometry(many);
    expect(x).toBeLessThanOrEqual(0.6);
    expect(y).toBeLessThanOrEqual(0.6);
    expect(x).toBeGreaterThanOrEqual(0.1);
  });
});

describe("created layers cascade", () => {
  it("gives two successively created text layers different positions", () => {
    const first = createTextLayer({}, []);
    const second = createTextLayer({}, [first]);
    expect(second.x).not.toBe(first.x);
    expect(second.y).not.toBe(first.y);
  });

  it("still honours an explicit position override", () => {
    const layer = createTextLayer({ x: 0, y: 0, w: 1, h: 1 }, [createTextLayer()]);
    expect(layer.x).toBe(0);
    expect(layer.y).toBe(0);
  });

  it("cascades shapes and icons too", () => {
    const existing = [createShapeLayer()];
    expect(createShapeLayer({}, existing).x).not.toBe(existing[0].x);
    expect(createIconLayer({ src: { kind: "lucide", name: "star" } }, existing).x)
      .not.toBe(existing[0].x);
  });
});
```

Add `cascadeGeometry` to the file's existing import from `./layers`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/post/layers.test.ts`
Expected: FAIL — `cascadeGeometry` is not exported and the creators take one argument.

- [ ] **Step 3: Implement the cascade**

In `src/lib/post/layers.ts`, immediately after the existing `DEFAULT_GEOMETRY` constant:

```typescript
/** How far each successive new layer steps down-right, in normalized units. */
const CASCADE_STEP = 0.02;
/** Steps before wrapping back to the origin, so a long session never walks off-canvas. */
const CASCADE_WRAP = 25;

/**
 * Where the next created layer should sit (D128). Without this every add landed on the
 * same coordinates, so three added texts formed a perfect stack in which only the top one
 * was selectable and nothing indicated the others existed.
 */
export function cascadeGeometry(existing: PostLayer[]): { x: number; y: number } {
  const step = (existing.length % CASCADE_WRAP) * CASCADE_STEP;
  return {
    x: DEFAULT_GEOMETRY.x + step,
    y: DEFAULT_GEOMETRY.y + step,
  };
}
```

Then give each creator an optional second parameter. `createTextLayer` becomes:

```typescript
export function createTextLayer(
  overrides: Partial<TextLayer> = {}, existing: PostLayer[] = [],
): TextLayer {
  return {
    id: crypto.randomUUID(),
    kind: "text",
    text: "Text",
    fontFamily: "inter",
    fontSize: 0.05,
    fontWeight: 600,
    color: "#1e1e1e",
    align: "left",
    lineHeight: 1.2,
    ...DEFAULT_GEOMETRY,
    ...cascadeGeometry(existing),
    ...overrides,
  };
}
```

Apply the identical `existing: PostLayer[] = []` parameter and `...cascadeGeometry(existing),` line
(placed after `...DEFAULT_GEOMETRY,` and before `...overrides,`) to `createShapeLayer`,
`createImageLayer` and `createIconLayer`. Order matters: `overrides` stays last so an explicit
position always wins.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/post/layers.test.ts`
Expected: PASS — including every pre-existing test in the file, because the new parameter defaults to
`[]`, which cascades to exactly the old `DEFAULT_GEOMETRY` origin.

- [ ] **Step 5: Pass the current layers at the call sites**

In `src/hooks/use-post-editor.ts`, the `addText` / `addShape` / `addIcon` / `addImage` actions each
call a creator. Pass the current layer array as the second argument, e.g.:

```typescript
    const next = addLayer(current, createTextLayer({}, current));
```

Read each action and apply the same change; the variable holding the current layers is already in
scope in every one.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/post/layers.ts src/lib/post/layers.test.ts src/hooks/use-post-editor.ts
git commit -m "feat(post): cascade newly added layers so they never stack invisibly"
```

---

## Task 7: Undo covers format and template

**Files:**
- Modify: `src/hooks/use-post-editor.ts`
- Test: none (React hook — tsc-only per Global Constraints; `history.ts` itself is already generic
  over its state type and needs no change, so its existing tests still cover the mechanism)

**Interfaces:**
- Consumes: `createHistory`/`commit`/`undo`/`redo`/`canUndo`/`canRedo` from `src/lib/post/history.ts`
  (already generic over `T` — no change needed there).
- Produces: `usePostEditor(initial: { layers: PostLayer[]; format: PostFormat; templateId?: string },
  onChange: (next: { layers: PostLayer[]; format: PostFormat; templateId?: string }) => void,
  onChangeDelayMs?: number)` returning everything it returns today, plus `format`, `templateId`, and
  `setFormat(format: PostFormat)` / `setTemplateId(id: string | undefined)`.

**Why.** Layer edits were undoable; format and template changes went through `onPatch` and were not.
After a format change ⌘Z did not revert it — it reached past and undid an unrelated earlier *layer*
edit, silently damaging something the user wasn't looking at (D127). Title stays out: it is metadata,
like a filename.

- [ ] **Step 1: Read the current hook in full**

Read `src/hooks/use-post-editor.ts` end to end before editing. It is ~245 lines and every action
follows one of two shapes: a *pure updater* (`applyCommitted`) or a *live gesture*
(`updateLayerLive` + `commitLayerChange`). You are widening the history's state type, not rewriting
those mechanics.

- [ ] **Step 2: Introduce the widened state type**

At the top of the hook file:

```typescript
import type { PostFormat } from "@/lib/post/types";

/**
 * Everything the undo stack owns. Format and templateId join layers here (D127) so a single
 * ⌘Z reverts whatever the operator actually just did — previously a format change was
 * invisible to history, and ⌘Z would silently undo an unrelated earlier layer edit instead.
 * Title is deliberately absent: it is metadata, like a filename.
 */
export type PostDesign = {
  layers: PostLayer[];
  format: PostFormat;
  templateId?: string;
};
```

- [ ] **Step 3: Rewrite the hook's state plumbing**

Change the signature and the history initialisation:

```typescript
export function usePostEditor(
  initial: PostDesign,
  onChange: (next: PostDesign) => void,
  onChangeDelayMs = 2000,
) {
  const [history, setHistory] = useState<History<PostDesign>>(() => createHistory(initial));
```

`liveLayersRef` keeps holding only `PostLayer[] | null` — live gestures never touch format or
templateId. Derive `layers` as it is derived today, but from `history.present.layers`:

```typescript
  const layers = liveLayersRef.current ?? history.present.layers;
  const format = history.present.format;
  const templateId = history.present.templateId;
```

Every existing action that produced a new `PostLayer[]` now commits a whole design. Introduce one
helper and route every layer action through it, replacing the current `applyCommitted`:

```typescript
  // Commit a new set of layers, carrying format/templateId through untouched.
  const applyLayers = useCallback((nextLayers: PostLayer[]) => {
    liveLayersRef.current = null;
    setHistory((h) => {
      const next = commitHistory(h, { ...h.present, layers: nextLayers });
      debouncedOnChange(next.present);
      return next;
    });
  }, [debouncedOnChange]);
```

Add the two new actions:

```typescript
  const setFormat = useCallback((next: PostFormat) => {
    liveLayersRef.current = null;
    setHistory((h) => {
      if (h.present.format === next) return h;
      const committed = commitHistory(h, { ...h.present, format: next });
      debouncedOnChange(committed.present);
      return committed;
    });
  }, [debouncedOnChange]);

  const setTemplateId = useCallback((next: string | undefined) => {
    setHistory((h) => {
      if (h.present.templateId === next) return h;
      const committed = commitHistory(h, { ...h.present, templateId: next });
      debouncedOnChange(committed.present);
      return committed;
    });
  }, [debouncedOnChange]);
```

`replaceAllLayers` is what template application uses; give it a second parameter so applying a
template is **one** undo step rather than two:

```typescript
  const replaceAllLayers = useCallback((nextLayers: PostLayer[], nextTemplateId?: string) => {
    liveLayersRef.current = null;
    setHistory((h) => {
      const next = commitHistory(h, {
        ...h.present,
        layers: nextLayers,
        templateId: nextTemplateId ?? h.present.templateId,
      });
      debouncedOnChange(next.present);
      return next;
    });
  }, [debouncedOnChange]);
```

`undo` and `redo` keep their existing shape — they already read `nextPresent` from the pure updater
and pass it to `debouncedOnChange`, which now carries a whole `PostDesign`. Do **not** regress the
existing `onChangeRef` stale-closure protection or the `useCallback` identity stability; both were
established by earlier review rounds.

- [ ] **Step 4: Return the new values**

Add `format`, `templateId`, `setFormat`, `setTemplateId` to the returned object. Keep every existing
key exactly as named.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors **only** in `src/components/nodes/post-focus-view.tsx`, which still calls
`usePostEditor(persistedLayers ?? [], …)` and still reads `format` from props. That file is Task 26's
job — do not fix it here. Confirm no other file errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-post-editor.ts
git commit -m "feat(post): widen the editor's undo history to cover format and template"
```

---

# Template block — Tasks 8–11

**These four tasks are mutually independent and may be executed in parallel**, each in its own
worktree. They all depend on Tasks 1–3 (formats, aspect bands, font basis) and on nothing else.
Task 8 must merge before 9–11 if run sequentially, because it changes the shared
`TemplateModule` contract in `index.ts`; if run in parallel, land Task 8 first and rebase the others.

Every template in this block obeys the same rules:

- `seedLayers(format: PostFormat)` — takes the format, uses `aspectBand(format)` and `byBand(...)`
  for margins, headline size and block heights.
- Placeholder copy is **specific to the template's purpose** ("Save 30% this week", not "Body copy
  goes here"), because a template nobody can read the intent of is a template nobody picks.
- The CTA is always a shape + text `groupLayers([...], [pill.id, text.id])` pair, per the existing
  convention.
- Text colour always contrasts with whatever sits behind it — check the fill you're placing it on.
- No new layer kinds. Rectangles (with `radius`), text, and the connected image only.

---

## Task 8: Format-aware plumbing and the four existing templates

**Files:**
- Modify: `src/lib/post/templates/index.ts`
- Modify: `src/lib/post/templates/lower-third.ts`, `inset-card.ts`, `side-column.ts`, `split-half.ts`
- Test: `src/lib/post/templates/templates.test.ts`

**Interfaces:**
- Consumes: `aspectBand`, `byBand` (T2); `PostFormat` (T1).
- Produces: `TemplateModule.seedLayers: (format: PostFormat) => PostLayer[]` — the shared contract
  every template in Tasks 9–11 implements.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/post/templates/templates.test.ts`:

```typescript
import { POST_FORMATS } from "../formats";
import type { PostFormat } from "../types";

const ALL_FORMATS = Object.keys(POST_FORMATS) as PostFormat[];

describe("templates are format-aware", () => {
  it("keeps every layer in bounds at every format", () => {
    for (const t of TEMPLATES) {
      for (const format of ALL_FORMATS) {
        for (const layer of t.seedLayers(format)) {
          expect(layer.x, `${t.id} @ ${format}`).toBeGreaterThanOrEqual(0);
          expect(layer.y, `${t.id} @ ${format}`).toBeGreaterThanOrEqual(0);
          expect(layer.x + layer.w, `${t.id} @ ${format}`).toBeLessThanOrEqual(1.001);
          expect(layer.y + layer.h, `${t.id} @ ${format}`).toBeLessThanOrEqual(1.001);
        }
      }
    }
  });

  it("actually varies its layout between a story and a landscape post", () => {
    for (const t of TEMPLATES) {
      const portrait = JSON.stringify(t.seedLayers("ig-story").map((l) => [l.x, l.y, l.w, l.h]));
      const landscape = JSON.stringify(t.seedLayers("x-post").map((l) => [l.x, l.y, l.w, l.h]));
      expect(portrait, `${t.id} ignores its format`).not.toBe(landscape);
    }
  });

  it("seeds exactly one CTA group of two layers at every format", () => {
    for (const t of TEMPLATES) {
      for (const format of ALL_FORMATS) {
        const groups = t.seedLayers(format).filter((l) => l.kind === "group");
        expect(groups, `${t.id} @ ${format}`).toHaveLength(1);
        expect(groups[0].kind === "group" && groups[0].childIds).toHaveLength(2);
      }
    }
  });

  it("never seeds empty placeholder copy", () => {
    for (const t of TEMPLATES) {
      for (const layer of t.seedLayers("ig-square")) {
        if (layer.kind === "text") expect(layer.text.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/post/templates/templates.test.ts`
Expected: FAIL — "actually varies its layout" fails for all four templates, because `seedLayers`
currently ignores its argument.

- [ ] **Step 3: Make the module contract format-aware**

In `src/lib/post/templates/index.ts`, change `TemplateModule` and `toTemplate`:

```typescript
type TemplateModule = {
  id: string;
  name: string;
  purposeTags: string[];
  copyZone: CopyZone;
  seedLayers: (format: PostFormat) => PostLayer[];
};

function toTemplate(mod: TemplateModule): PostTemplate {
  return {
    id: mod.id,
    name: mod.name,
    purposeTags: mod.purposeTags,
    copyZone: mod.copyZone,
    seedLayers: (format) => mod.seedLayers(format),
  };
}
```

Delete the now-stale comment above `seedLayers` in the `PostTemplate` type (the one beginning
"format is accepted for future per-format layout variants (V2)") and replace it with:

```typescript
  /** Tunes one composition across three aspect bands — see aspect-band.ts and D124. */
```

- [ ] **Step 4: Retune `lower-third.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "lower-third";
export const name = "Lower third";
export const purposeTags = ["offer", "promotion"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.36 };

// Full-bleed image, copy stacked over a bottom scrim. The safest template: the scrim
// rescues almost any plate. A tall story needs a deeper scrim and a wider landscape post
// a shallower one, or the copy either floats or swallows the picture.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const scrimTop = byBand(band, { portrait: 0.58, square: 0.52, landscape: 0.42 });
  const headSize = byBand(band, { portrait: 0.05, square: 0.045, landscape: 0.06 });
  const bodySize = byBand(band, { portrait: 0.021, square: 0.02, landscape: 0.026 });
  const ctaH = byBand(band, { portrait: 0.05, square: 0.055, landscape: 0.075 });

  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: scrimTop, w: 1, h: 1 - scrimTop,
    fill: { kind: "gradient", from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.72)", angle: 0 },
    radius: 0,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: 0.72, w: 1 - m * 2, h: 0.08,
    text: "Your headline here", fontSize: headSize, fontWeight: 700, color: "#ffffff",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: 0.805, w: 1 - m * 2, h: 0.035,
    text: "One line of supporting detail", fontSize: bodySize, fontWeight: 400,
    color: "rgba(255,255,255,0.85)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.875, w: 0.34, h: ctaH,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Shop now", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([scrim, headline, body, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
```

- [ ] **Step 5: Retune `inset-card.ts`**

Same imports as Step 4. Replace `seedLayers`:

```typescript
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.09, landscape: 0.07 });
  const copyTop = byBand(band, { portrait: 0.63, square: 0.6, landscape: 0.5 });
  const headSize = byBand(band, { portrait: 0.045, square: 0.042, landscape: 0.055 });
  const ctaH = byBand(band, { portrait: 0.05, square: 0.055, landscape: 0.075 });

  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#f4e2d4" }, radius: 0, locked: true,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: copyTop, w: 1 - m * 2, h: 0.08,
    text: "Introducing our newest", fontSize: headSize, fontWeight: 700, color: "#1e1e1e",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: copyTop + 0.1, w: 1 - m * 2, h: 0.035,
    text: "A short line about why it matters", fontSize: 0.02, fontWeight: 400, color: "#52525b",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - m - 0.33, y: 0.85, w: 0.33, h: ctaH,
    fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Learn more", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([background, headline, body, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
```

- [ ] **Step 6: Retune `side-column.ts`**

Same imports. Replace `seedLayers`:

```typescript
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  // The copy column is a fraction of WIDTH, so a wide post can afford a narrower one.
  const colW = byBand(band, { portrait: 0.5, square: 0.36, landscape: 0.32 });
  const headSize = byBand(band, { portrait: 0.042, square: 0.038, landscape: 0.05 });

  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#1b1b22" }, radius: 0, locked: true,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: 0.24, w: colW, h: 0.07,
    text: "A reason to look", fontSize: headSize, fontWeight: 700, color: "#ffffff",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: 0.46, w: colW, h: 0.2,
    text: "Room here for the longer explanation an offer usually needs.",
    fontSize: 0.018, fontWeight: 400, lineHeight: 1.5, color: "rgba(255,255,255,0.72)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.86, w: Math.min(colW, 0.32), h: 0.05,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "See the offer", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([background, headline, body, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
```

- [ ] **Step 7: Retune `split-half.ts`**

Same imports. Replace `seedLayers`:

```typescript
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  // Where the colour block starts. A landscape post splits later so the photo keeps width.
  const splitY = byBand(band, { portrait: 0.55, square: 0.5, landscape: 0.45 });
  const headSize = byBand(band, { portrait: 0.06, square: 0.055, landscape: 0.07 });

  const colourBlock = createShapeLayer({
    name: "Colour block", x: 0, y: splitY, w: 1, h: 1 - splitY,
    fill: { kind: "solid", color: "#c8a000" }, radius: 0, locked: true,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: splitY + 0.07, w: 0.5, h: 0.11,
    text: "30% off", fontSize: headSize, fontWeight: 700, color: "#1e1e1e",
  });
  const body = createTextLayer({
    name: "Body copy", x: m, y: splitY + 0.21, w: 1 - m * 2, h: 0.035,
    text: "This week only", fontSize: 0.02, fontWeight: 400, color: "rgba(30,30,30,0.72)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - m - 0.34, y: 0.85, w: 0.34, h: 0.055,
    fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Claim it", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([colourBlock, headline, body, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/lib/post/templates/templates.test.ts`
Expected: PASS. If "keeps every layer in bounds" fails, a `y + h` exceeded 1 at some band — fix the
numbers, do not loosen the assertion.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/post/templates/
git commit -m "feat(post): make templates aspect-band aware and retune the original four"
```

---

## Task 9: Bold quote, Product hero, Before/after

**Files:**
- Create: `src/lib/post/templates/bold-quote.ts`, `product-hero.ts`, `before-after.ts`
- Modify: `src/lib/post/templates/index.ts` (register them)

**Interfaces:**
- Consumes: the `TemplateModule` contract from Task 8.

- [ ] **Step 1: Create `bold-quote.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "bold-quote";
export const name = "Bold quote";
export const purposeTags = ["quote", "engagement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.6 };

// A full-bleed dim over the photo with one large centred pull-quote. Nothing competes with
// the sentence, which is the whole point — quote cards live or die on legibility.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.1, square: 0.1, landscape: 0.12 });
  const quoteSize = byBand(band, { portrait: 0.058, square: 0.055, landscape: 0.062 });
  const quoteTop = byBand(band, { portrait: 0.3, square: 0.32, landscape: 0.24 });

  const dim = createShapeLayer({
    name: "Dim", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "rgba(0,0,0,0.55)" }, radius: 0, locked: true,
  });
  const mark = createTextLayer({
    name: "Quote mark", x: m, y: quoteTop - 0.1, w: 0.2, h: 0.1,
    text: "“", fontSize: 0.1, fontWeight: 700, color: "rgba(255,255,255,0.5)",
  });
  const quote = createTextLayer({
    name: "Quote", x: m, y: quoteTop, w: 1 - m * 2, h: 0.3,
    text: "The line worth stopping the scroll for.",
    fontSize: quoteSize, fontWeight: 700, lineHeight: 1.25, color: "#ffffff", align: "center",
  });
  const attribution = createTextLayer({
    name: "Attribution", x: m, y: quoteTop + 0.33, w: 1 - m * 2, h: 0.04,
    text: "— Name, Role", fontSize: 0.02, fontWeight: 400,
    color: "rgba(255,255,255,0.75)", align: "center",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 0.33, y: 0.87, w: 0.34, h: 0.05,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Read more", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([dim, mark, quote, attribution, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
```

- [ ] **Step 2: Create `product-hero.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "product-hero";
export const name = "Product hero";
export const purposeTags = ["ecommerce", "product"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.34 };

// Soft field behind the product, name and price stacked beneath. The e-commerce workhorse:
// the photo stays untouched and every word sits on flat colour.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const panelTop = byBand(band, { portrait: 0.7, square: 0.66, landscape: 0.58 });
  const nameSize = byBand(band, { portrait: 0.04, square: 0.038, landscape: 0.048 });

  const field = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#f6f5f2" }, radius: 0, locked: true,
  });
  const panel = createShapeLayer({
    name: "Copy panel", x: 0, y: panelTop, w: 1, h: 1 - panelTop,
    fill: { kind: "solid", color: "#ffffff" }, radius: 0,
  });
  const productName = createTextLayer({
    name: "Product name", x: m, y: panelTop + 0.05, w: 1 - m * 2, h: 0.06,
    text: "Product name", fontSize: nameSize, fontWeight: 700, color: "#1e1e1e",
  });
  const price = createTextLayer({
    name: "Price", x: m, y: panelTop + 0.13, w: 0.4, h: 0.05,
    text: "₹1,299", fontSize: 0.032, fontWeight: 600, color: "#5829c7",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - m - 0.34, y: panelTop + 0.13, w: 0.34, h: 0.055,
    fill: { kind: "solid", color: "#5829c7" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Buy now", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([field, panel, productName, price, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
```

- [ ] **Step 3: Create `before-after.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "before-after";
export const name = "Before / after";
export const purposeTags = ["results", "service"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.24 };

// Two labelled panels with a divider. Portrait stacks them, landscape sits them side by
// side — the comparison only reads if each half keeps a sensible shape.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const stacked = band !== "landscape";
  const m = byBand(band, { portrait: 0.06, square: 0.06, landscape: 0.05 });

  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#101014" }, radius: 0, locked: true,
  });
  const beforePanel = createShapeLayer({
    name: "Before panel",
    x: 0, y: 0,
    w: stacked ? 1 : 0.5,
    h: stacked ? 0.38 : 0.78,
    fill: { kind: "solid", color: "rgba(255,255,255,0.06)" }, radius: 0,
  });
  const afterPanel = createShapeLayer({
    name: "After panel",
    x: stacked ? 0 : 0.5,
    y: stacked ? 0.4 : 0,
    w: stacked ? 1 : 0.5,
    h: stacked ? 0.38 : 0.78,
    fill: { kind: "solid", color: "rgba(255,255,255,0.12)" }, radius: 0,
  });
  const beforeLabel = createTextLayer({
    name: "Before label", x: m, y: stacked ? 0.03 : 0.04, w: 0.3, h: 0.04,
    text: "BEFORE", fontSize: 0.02, fontWeight: 700, letterSpacing: 2,
    color: "rgba(255,255,255,0.7)",
  });
  const afterLabel = createTextLayer({
    name: "After label",
    x: stacked ? m : 0.5 + m, y: stacked ? 0.43 : 0.04, w: 0.3, h: 0.04,
    text: "AFTER", fontSize: 0.02, fontWeight: 700, letterSpacing: 2, color: "#ffffff",
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: 0.82, w: 1 - m * 2, h: 0.06,
    text: "Six weeks, real results", fontSize: 0.036, fontWeight: 700, color: "#ffffff",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.9, w: 0.36, h: 0.05,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Book a slot", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers(
    [background, beforePanel, afterPanel, beforeLabel, afterLabel, headline, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}
```

- [ ] **Step 4: Register all three**

In `src/lib/post/templates/index.ts`, add the imports and array entries:

```typescript
import * as boldQuote from "./bold-quote";
import * as productHero from "./product-hero";
import * as beforeAfter from "./before-after";
```

```typescript
export const TEMPLATES: readonly PostTemplate[] = [
  toTemplate(lowerThird),
  toTemplate(insetCard),
  toTemplate(sideColumn),
  toTemplate(splitHalf),
  toTemplate(boldQuote),
  toTemplate(productHero),
  toTemplate(beforeAfter),
];
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/lib/post/templates/templates.test.ts && npx tsc --noEmit`
Expected: PASS and clean. The Task 8 sweep now covers seven templates automatically.

- [ ] **Step 6: Commit**

```bash
git add src/lib/post/templates/
git commit -m "feat(post): add bold-quote, product-hero and before-after templates"
```

---

## Task 10: Carousel cover, Testimonial, Announcement, Numbered tips

**Files:**
- Create: `src/lib/post/templates/carousel-cover.ts`, `testimonial.ts`, `announcement.ts`,
  `numbered-tips.ts`
- Modify: `src/lib/post/templates/index.ts`

- [ ] **Step 1: Create `carousel-cover.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "carousel-cover";
export const name = "Carousel cover";
export const purposeTags = ["carousel", "engagement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.5 };

// Slide-one of a carousel: an oversized title and an explicit swipe affordance. Carousels
// are the highest-engagement feed format, and they only work if slide one earns the swipe.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.09, landscape: 0.07 });
  const titleSize = byBand(band, { portrait: 0.075, square: 0.07, landscape: 0.08 });
  const titleTop = byBand(band, { portrait: 0.34, square: 0.32, landscape: 0.26 });

  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "gradient", from: "rgba(0,0,0,0.15)", to: "rgba(0,0,0,0.8)", angle: 0 },
    radius: 0, locked: true,
  });
  const eyebrow = createTextLayer({
    name: "Eyebrow", x: m, y: titleTop - 0.07, w: 1 - m * 2, h: 0.04,
    text: "GUIDE", fontSize: 0.02, fontWeight: 700, letterSpacing: 3,
    color: "rgba(255,255,255,0.75)",
  });
  const title = createTextLayer({
    name: "Title", x: m, y: titleTop, w: 1 - m * 2, h: 0.28,
    text: "5 things nobody tells you", fontSize: titleSize, fontWeight: 700,
    lineHeight: 1.15, color: "#ffffff",
  });
  const swipePill = createShapeLayer({
    name: "Swipe pill", x: m, y: 0.87, w: 0.38, h: 0.055,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const swipeText = createTextLayer({
    name: "Swipe label", x: swipePill.x, y: swipePill.y, w: swipePill.w, h: swipePill.h,
    text: "Swipe →", fontSize: 0.019, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([scrim, eyebrow, title, swipePill, swipeText], [swipePill.id, swipeText.id]);
}
```

- [ ] **Step 2: Create `testimonial.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "testimonial";
export const name = "Testimonial";
export const purposeTags = ["social-proof", "review"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.55 };

// A card floating on a soft field: stars, the quote, then who said it. Social proof reads
// as proof only when the attribution is as legible as the praise.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const cardTop = byBand(band, { portrait: 0.42, square: 0.38, landscape: 0.3 });
  const quoteSize = byBand(band, { portrait: 0.034, square: 0.032, landscape: 0.038 });

  const field = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#eef0f6" }, radius: 0, locked: true,
  });
  const card = createShapeLayer({
    name: "Card", x: m, y: cardTop, w: 1 - m * 2, h: 0.86 - cardTop,
    fill: { kind: "solid", color: "#ffffff" }, radius: 24,
  });
  const stars = createTextLayer({
    name: "Stars", x: m + 0.04, y: cardTop + 0.04, w: 0.4, h: 0.04,
    text: "★★★★★", fontSize: 0.026, fontWeight: 700, color: "#ffca2d",
  });
  const quote = createTextLayer({
    name: "Quote", x: m + 0.04, y: cardTop + 0.11, w: 1 - m * 2 - 0.08, h: 0.2,
    text: "Genuinely changed how our team works. Worth every rupee.",
    fontSize: quoteSize, fontWeight: 600, lineHeight: 1.4, color: "#1e1e1e",
  });
  const who = createTextLayer({
    name: "Attribution", x: m + 0.04, y: 0.76, w: 1 - m * 2 - 0.08, h: 0.04,
    text: "Name — Role, Company", fontSize: 0.019, fontWeight: 400, color: "#6b7280",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m + 0.04, y: 0.88, w: 0.36, h: 0.05,
    fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Read reviews", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([field, card, stars, quote, who, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
```

- [ ] **Step 3: Create `announcement.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "announcement";
export const name = "Announcement";
export const purposeTags = ["launch", "announcement"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.45 };

// A badge, a big claim, and a date. Built for "this exists now" rather than "buy this".
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const blockTop = byBand(band, { portrait: 0.55, square: 0.52, landscape: 0.44 });
  const headSize = byBand(band, { portrait: 0.058, square: 0.055, landscape: 0.065 });

  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: blockTop - 0.08, w: 1, h: 1 - blockTop + 0.08,
    fill: { kind: "gradient", from: "rgba(11,15,25,0)", to: "rgba(11,15,25,0.88)", angle: 0 },
    radius: 0,
  });
  const badge = createShapeLayer({
    name: "Badge", x: m, y: blockTop, w: 0.18, h: 0.045,
    fill: { kind: "solid", color: "#5829c7" }, radius: 999,
  });
  const badgeText = createTextLayer({
    name: "Badge label", x: badge.x, y: badge.y, w: badge.w, h: badge.h,
    text: "NEW", fontSize: 0.017, fontWeight: 700, letterSpacing: 2,
    color: "#ffffff", align: "center",
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: blockTop + 0.07, w: 1 - m * 2, h: 0.14,
    text: "Something worth announcing", fontSize: headSize, fontWeight: 700,
    lineHeight: 1.2, color: "#ffffff",
  });
  const date = createTextLayer({
    name: "Date", x: m, y: blockTop + 0.23, w: 1 - m * 2, h: 0.04,
    text: "Live from 12 August", fontSize: 0.021, fontWeight: 400,
    color: "rgba(255,255,255,0.8)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.88, w: 0.36, h: 0.05,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "See what's new", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers(
    [scrim, badge, badgeText, headline, date, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}
```

- [ ] **Step 4: Create `numbered-tips.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "numbered-tips";
export const name = "Numbered tips";
export const purposeTags = ["education", "listicle"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.62 };

// A numbered list on flat colour. Listicles are the most-saved content type, and saves are
// what the algorithm actually rewards — so the numbers need to be scannable, not pretty.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.09, square: 0.09, landscape: 0.07 });
  const listTop = byBand(band, { portrait: 0.34, square: 0.32, landscape: 0.28 });
  const rowGap = byBand(band, { portrait: 0.13, square: 0.12, landscape: 0.14 });
  const titleSize = byBand(band, { portrait: 0.05, square: 0.048, landscape: 0.056 });

  const background = createShapeLayer({
    name: "Background", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#0f172a" }, radius: 0, locked: true,
  });
  const title = createTextLayer({
    name: "Title", x: m, y: 0.14, w: 1 - m * 2, h: 0.12,
    text: "3 ways to get started", fontSize: titleSize, fontWeight: 700,
    lineHeight: 1.2, color: "#ffffff",
  });
  const rows = [1, 2, 3].flatMap((n, i) => {
    const y = listTop + i * rowGap;
    return [
      createTextLayer({
        name: `Tip ${n} number`, x: m, y, w: 0.08, h: 0.06,
        text: String(n), fontSize: 0.042, fontWeight: 700, color: "#ffca2d",
      }),
      createTextLayer({
        name: `Tip ${n} text`, x: m + 0.1, y, w: 1 - m * 2 - 0.1, h: 0.08,
        text: "The tip itself, in one short line", fontSize: 0.024, fontWeight: 500,
        lineHeight: 1.35, color: "rgba(255,255,255,0.9)",
      }),
    ];
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.88, w: 0.38, h: 0.05,
    fill: { kind: "solid", color: "#ffca2d" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Save this post", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers([background, title, ...rows, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
```

- [ ] **Step 5: Register all four**

Add to `src/lib/post/templates/index.ts`:

```typescript
import * as carouselCover from "./carousel-cover";
import * as testimonial from "./testimonial";
import * as announcement from "./announcement";
import * as numberedTips from "./numbered-tips";
```

and append `toTemplate(carouselCover), toTemplate(testimonial), toTemplate(announcement),
toTemplate(numberedTips),` to the `TEMPLATES` array.

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run src/lib/post/templates/templates.test.ts && npx tsc --noEmit`
Expected: PASS and clean. Pay attention to the in-bounds sweep for `numbered-tips` — three rows at
`rowGap` must still clear the CTA at `y: 0.88` in the landscape band.

- [ ] **Step 7: Commit**

```bash
git add src/lib/post/templates/
git commit -m "feat(post): add carousel-cover, testimonial, announcement and numbered-tips templates"
```

---

## Task 11: Sale offer, Event, Minimal frame

**Files:**
- Create: `src/lib/post/templates/sale-offer.ts`, `event.ts`, `minimal-frame.ts`
- Modify: `src/lib/post/templates/index.ts`

- [ ] **Step 1: Create `sale-offer.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "sale-offer";
export const name = "Sale offer";
export const purposeTags = ["discount", "sale", "urgency"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.42 };

// A discount disc over the product, urgency underneath, code last. Loud on purpose — the
// number is the message and everything else is support.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const discSize = byBand(band, { portrait: 0.3, square: 0.32, landscape: 0.42 });
  const discY = byBand(band, { portrait: 0.1, square: 0.08, landscape: 0.06 });

  const disc = createShapeLayer({
    name: "Discount disc", x: 1 - m - discSize, y: discY, w: discSize, h: discSize,
    fill: { kind: "solid", color: "#e11d48" }, radius: 999,
  });
  const discText = createTextLayer({
    name: "Discount", x: disc.x, y: disc.y + discSize * 0.34, w: discSize, h: discSize * 0.3,
    text: "30% OFF", fontSize: 0.036, fontWeight: 700, color: "#ffffff", align: "center",
  });
  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: 0.58, w: 1, h: 0.42,
    fill: { kind: "gradient", from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.85)", angle: 0 },
    radius: 0,
  });
  const headline = createTextLayer({
    name: "Headline", x: m, y: 0.7, w: 1 - m * 2, h: 0.08,
    text: "Mid-season sale", fontSize: 0.05, fontWeight: 700, color: "#ffffff",
  });
  const urgency = createTextLayer({
    name: "Urgency", x: m, y: 0.79, w: 1 - m * 2, h: 0.04,
    text: "Ends Sunday · Use code SAVE30", fontSize: 0.021, fontWeight: 500,
    color: "rgba(255,255,255,0.85)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.87, w: 0.36, h: 0.055,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Shop the sale", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  return groupLayers(
    [disc, discText, scrim, headline, urgency, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}
```

- [ ] **Step 2: Create `event.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "event";
export const name = "Event";
export const purposeTags = ["event", "invite"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.48 };

// A date block reads first, then what and where. Events fail when the date is buried in a
// sentence, so it gets its own tile.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  const m = byBand(band, { portrait: 0.08, square: 0.08, landscape: 0.06 });
  const blockTop = byBand(band, { portrait: 0.5, square: 0.47, landscape: 0.38 });
  const titleSize = byBand(band, { portrait: 0.05, square: 0.048, landscape: 0.058 });

  const scrim = createShapeLayer({
    name: "Scrim", x: 0, y: blockTop - 0.1, w: 1, h: 1 - blockTop + 0.1,
    fill: { kind: "gradient", from: "rgba(11,15,25,0)", to: "rgba(11,15,25,0.9)", angle: 0 },
    radius: 0,
  });
  const dateTile = createShapeLayer({
    name: "Date tile", x: m, y: blockTop, w: 0.2, h: 0.2,
    fill: { kind: "solid", color: "#ffffff" }, radius: 16,
  });
  const dateDay = createTextLayer({
    name: "Date day", x: dateTile.x, y: dateTile.y + 0.03, w: dateTile.w, h: 0.09,
    text: "12", fontSize: 0.058, fontWeight: 700, color: "#1e1e1e", align: "center",
  });
  const dateMonth = createTextLayer({
    name: "Date month", x: dateTile.x, y: dateTile.y + 0.13, w: dateTile.w, h: 0.04,
    text: "AUG", fontSize: 0.02, fontWeight: 700, letterSpacing: 2,
    color: "#5829c7", align: "center",
  });
  const title = createTextLayer({
    name: "Title", x: m + 0.24, y: blockTop, w: 1 - m * 2 - 0.24, h: 0.11,
    text: "Event name goes here", fontSize: titleSize, fontWeight: 700,
    lineHeight: 1.2, color: "#ffffff",
  });
  const details = createTextLayer({
    name: "Details", x: m + 0.24, y: blockTop + 0.13, w: 1 - m * 2 - 0.24, h: 0.07,
    text: "6:30 PM · Venue, City", fontSize: 0.021, fontWeight: 400,
    lineHeight: 1.4, color: "rgba(255,255,255,0.82)",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: m, y: 0.88, w: 0.36, h: 0.05,
    fill: { kind: "solid", color: "#5829c7" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Reserve a seat", fontSize: 0.018, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers(
    [scrim, dateTile, dateDay, dateMonth, title, details, ctaPill, ctaText],
    [ctaPill.id, ctaText.id],
  );
}
```

- [ ] **Step 3: Create `minimal-frame.ts`**

```typescript
import type { PostFormat, PostLayer } from "../types";
import { createShapeLayer, createTextLayer, groupLayers } from "../layers";
import { aspectBand, byBand } from "../aspect-band";
import type { CopyZone } from "../copy-zone-hint";

export const id = "minimal-frame";
export const name = "Minimal frame";
export const purposeTags = ["editorial", "brand"];
export const copyZone: CopyZone = { side: "bottom", fraction: 0.2 };

// A generous white frame with one quiet caption. The restrained option — closest to this
// app's own "light editorial premium" language, and the one that flatters a good photo.
export function seedLayers(format: PostFormat): PostLayer[] {
  const band = aspectBand(format);
  // The frame is a fraction of the SHORTER edge conceptually; a landscape post needs a
  // thinner band or the photo disappears.
  const inset = byBand(band, { portrait: 0.07, square: 0.07, landscape: 0.05 });
  const captionTop = byBand(band, { portrait: 0.84, square: 0.83, landscape: 0.8 });

  const frame = createShapeLayer({
    name: "Frame", x: 0, y: 0, w: 1, h: 1,
    fill: { kind: "solid", color: "#ffffff" }, radius: 0, locked: true,
  });
  const plate = createShapeLayer({
    name: "Photo plate", x: inset, y: inset, w: 1 - inset * 2, h: captionTop - inset * 2,
    fill: { kind: "solid", color: "#e9e7e2" }, radius: 4,
  });
  const caption = createTextLayer({
    name: "Caption", x: inset, y: captionTop, w: 1 - inset * 2, h: 0.05,
    text: "A quiet line about this picture", fontSize: 0.024, fontWeight: 500, color: "#1e1e1e",
  });
  const meta = createTextLayer({
    name: "Meta", x: inset, y: captionTop + 0.055, w: 1 - inset * 2, h: 0.035,
    text: "STUDIO NOTES", fontSize: 0.016, fontWeight: 600, letterSpacing: 3, color: "#9ca3af",
  });
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 1 - inset - 0.3, y: captionTop + 0.045, w: 0.3, h: 0.045,
    fill: { kind: "solid", color: "#1e1e1e" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "See the series", fontSize: 0.017, fontWeight: 700, color: "#ffffff", align: "center",
  });
  return groupLayers([frame, plate, caption, meta, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
```

- [ ] **Step 4: Register all three**

Add to `src/lib/post/templates/index.ts`:

```typescript
import * as saleOffer from "./sale-offer";
import * as event from "./event";
import * as minimalFrame from "./minimal-frame";
```

and append `toTemplate(saleOffer), toTemplate(event), toTemplate(minimalFrame),` to `TEMPLATES`.

- [ ] **Step 5: Assert the library is complete**

Append to `src/lib/post/templates/templates.test.ts`:

```typescript
describe("the template library", () => {
  it("ships fourteen templates with unique ids", () => {
    expect(TEMPLATES).toHaveLength(14);
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(14);
  });

  it("gives every template a human name and at least one purpose tag", () => {
    for (const t of TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.name).not.toBe(t.id);
      expect(t.purposeTags.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run src/lib/post/templates/templates.test.ts && npx tsc --noEmit`
Expected: PASS and clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/post/templates/
git commit -m "feat(post): add sale-offer, event and minimal-frame templates"
```

---

# UI block — Tasks 12–25

Everything here is `.tsx` and therefore **verified by `npx tsc --noEmit` only** — no test files.
Every interactive element must be a shadcn primitive (Global Constraints).

---

## Task 12: Shared colour and gradient controls

**Files:**
- Create: `src/components/nodes/post-colour-swatches.tsx`
- Create: `src/components/nodes/post-gradient-presets.tsx`

**Interfaces:**
- Consumes: `GRADIENT_PRESETS`, `GRADIENT_DIRECTIONS`, `angleToDirection`, `makeGradientFill` (T4).
- Produces:
  `PostColourSwatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string })`
  and
  `PostGradientPresets({ from, to, angle, onChange }: { from: string; to: string; angle: number; onChange: (fill: Fill) => void })`.

**Why.** The inspector asked designers to type `rgba(0,0,0,0.72)` into a text box, and gradient angle
had no control at all (D125). These two components are what replace that everywhere.

- [ ] **Step 1: Create `post-colour-swatches.tsx`**

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A small, curated palette. Brand purple first, then the neutrals this design system
 * actually uses, then the two extremes. "Custom" hands off to the OS picker for the rare
 * case — but nobody has to open it to do ordinary work (D125).
 */
const SWATCHES: { value: string; label: string }[] = [
  { value: "#5829c7", label: "Brand purple" },
  { value: "#ffca2d", label: "Accent yellow" },
  { value: "#1e1e1e", label: "Near black" },
  { value: "#52525b", label: "Slate" },
  { value: "#9ca3af", label: "Grey" },
  { value: "#e5e7eb", label: "Light grey" },
  { value: "#ffffff", label: "White" },
  { value: "#000000", label: "Black" },
];

type Props = {
  value: string;
  onChange: (colour: string) => void;
  label: string;
};

export function PostColourSwatches({ value, onChange, label }: Props) {
  return (
    <div>
      <label className="text-eyebrow mb-1 block !text-[0.6rem]">{label}</label>
      <div className="flex flex-wrap gap-1">
        {SWATCHES.map((s) => (
          <Button
            key={s.value}
            variant="outline"
            size="icon"
            aria-label={s.label}
            title={s.label}
            onClick={() => onChange(s.value)}
            className={cn(
              "size-6 rounded-full border p-0",
              value.toLowerCase() === s.value.toLowerCase() &&
                "ring-2 ring-primary ring-offset-1",
            )}
            style={{ backgroundColor: s.value }}
          />
        ))}
        {/* The OS picker, kept deliberately small and last — an escape hatch, not the path. */}
        <Input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} — custom`}
          title="Custom colour"
          className="size-6 rounded-full border p-0"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `post-gradient-presets.tsx`**

```tsx
"use client";

import { ArrowDown, ArrowUp, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Fill } from "@/lib/post/types";
import {
  GRADIENT_PRESETS, GRADIENT_DIRECTIONS, angleToDirection, makeGradientFill,
  type GradientDirection,
} from "@/lib/post/gradients";

const DIRECTION_ICONS: Record<GradientDirection, typeof ArrowDown> = {
  down: ArrowDown,
  up: ArrowUp,
  right: ArrowRight,
  left: ArrowLeft,
};

/** CSS angle for the swatch preview. Our 0 = top-to-bottom, which is CSS's 180deg. */
function previewCss(from: string, to: string, angle: number): string {
  return `linear-gradient(${(angle + 180) % 360}deg, ${from}, ${to})`;
}

type Props = {
  from: string;
  to: string;
  angle: number;
  onChange: (fill: Fill) => void;
};

export function PostGradientPresets({ from, to, angle, onChange }: Props) {
  const direction = angleToDirection(angle);
  const activeId = GRADIENT_PRESETS.find((p) => p.from === from && p.to === to)?.id;

  return (
    <div className="space-y-2">
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Gradient</label>
        <div className="grid grid-cols-4 gap-1">
          {GRADIENT_PRESETS.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              size="icon"
              aria-label={p.label}
              title={p.label}
              onClick={() => onChange(makeGradientFill(p.id, direction))}
              className={cn(
                "h-7 w-full rounded-md border p-0",
                activeId === p.id && "ring-2 ring-primary ring-offset-1",
              )}
              style={{ backgroundImage: previewCss(p.from, p.to, angle) }}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Direction</label>
        <div className="flex gap-1">
          {GRADIENT_DIRECTIONS.map((d) => {
            const Icon = DIRECTION_ICONS[d.key];
            return (
              <Button
                key={d.key}
                variant="outline"
                size="icon"
                aria-label={d.label}
                title={d.label}
                onClick={() =>
                  onChange({ kind: "gradient", from, to, angle: d.angle })
                }
                className={cn("size-7", direction === d.key && "ring-2 ring-primary ring-offset-1")}
              >
                <Icon className="size-3.5" strokeWidth={1.5} />
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (neither component has a consumer yet — that is Task 13).

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/post-colour-swatches.tsx src/components/nodes/post-gradient-presets.tsx
git commit -m "feat(post): add shared colour-swatch and gradient-preset controls"
```

---

## Task 13: De-jargonise and normalise the inspector

**Files:**
- Modify: `src/components/nodes/post-inspector.tsx`
- Modify: `src/components/nodes/post-inspector-shape.tsx`
- Modify: `src/components/nodes/post-inspector-text.tsx`
- Modify: `src/components/nodes/post-inspector-image.tsx`

**Interfaces:**
- Consumes: `PostColourSwatches`, `PostGradientPresets` (T12); `Slider` from
  `@/components/ui/slider` (already present).

**Why.** Two problems at once: the panel restructures itself per layer kind, and its controls speak
CSS (D119, D125). Both are fixed here.

- [ ] **Step 1: Read all four files in full before editing.**

- [ ] **Step 2: Give `post-inspector.tsx` one shared shell**

Wrap every kind in the same header + body so switching selection never restructures the panel:

```tsx
"use client";

import type { PostLayer } from "@/lib/post/types";
import { PostInspectorText } from "./post-inspector-text";
import { PostInspectorShape } from "./post-inspector-shape";
import { PostInspectorImage } from "./post-inspector-image";
import { PostInspectorIcon } from "./post-inspector-icon";

type Props = {
  layer: PostLayer | null;
  selectedCount: number;
  naturalSize?: { width: number; height: number };
  onChange: (patch: Partial<PostLayer>) => void;
};

/** Plain-English name for a layer kind — internal tokens never reach the user (D122). */
function kindLabel(layer: PostLayer): string {
  switch (layer.kind) {
    case "text": return "Text";
    case "shape": return "Shape";
    case "image": return "Image";
    case "icon": return "Icon";
    case "group": return "Group";
  }
}

/** One shell for every state, so the panel's rhythm never changes (D119). */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-eyebrow !text-[0.6rem]">{title}</p>
      {children}
    </div>
  );
}

export function PostInspector({ layer, selectedCount, naturalSize, onChange }: Props) {
  if (selectedCount > 1) {
    return (
      <Shell title="Selection">
        <p className="text-xs text-muted-foreground">
          {selectedCount} layers selected. Use align, group or delete from the right-click menu.
        </p>
      </Shell>
    );
  }
  if (!layer) {
    return (
      <Shell title="Nothing selected">
        <p className="text-xs text-muted-foreground">
          Select a layer on the canvas to edit it.
        </p>
      </Shell>
    );
  }
  return (
    <Shell title={kindLabel(layer)}>
      {layer.kind === "text" && <PostInspectorText layer={layer} onChange={onChange} />}
      {layer.kind === "shape" && <PostInspectorShape layer={layer} onChange={onChange} />}
      {layer.kind === "image" && (
        <PostInspectorImage layer={layer} onChange={onChange} naturalSize={naturalSize} />
      )}
      {layer.kind === "icon" && <PostInspectorIcon layer={layer} onChange={onChange} />}
      {layer.kind === "group" && (
        <p className="text-xs text-muted-foreground">
          A group of {layer.childIds.length} layers. Ungroup to edit them individually.
        </p>
      )}
    </Shell>
  );
}
```

- [ ] **Step 3: Rewrite `post-inspector-shape.tsx`'s controls**

Replace the gradient From/To text inputs with `PostGradientPresets`, the solid colour input with
`PostColourSwatches`, and both number inputs with `Slider`s:

```tsx
"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ShapeLayer } from "@/lib/post/types";
import { PostColourSwatches } from "./post-colour-swatches";
import { PostGradientPresets } from "./post-gradient-presets";
import { makeGradientFill } from "@/lib/post/gradients";

type Props = { layer: ShapeLayer; onChange: (patch: Partial<ShapeLayer>) => void };

/** Corner radius is stored in px against the rendered box; these read as words, not numbers. */
const CORNER_MAX = 120;

export function PostInspectorShape({ layer, onChange }: Props) {
  const isGradient = layer.fill.kind === "gradient";

  return (
    <div className="space-y-3">
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Fill</label>
        <div className="flex gap-1">
          <Button
            variant="outline" size="sm"
            className={cn(!isGradient && "ring-2 ring-primary ring-offset-1")}
            onClick={() =>
              onChange({
                fill: {
                  kind: "solid",
                  color: layer.fill.kind === "gradient" ? layer.fill.to : layer.fill.color,
                },
              })
            }
          >
            Solid
          </Button>
          <Button
            variant="outline" size="sm"
            className={cn(isGradient && "ring-2 ring-primary ring-offset-1")}
            onClick={() =>
              onChange({ fill: isGradient ? layer.fill : makeGradientFill("dark-fade", "down") })
            }
          >
            Gradient
          </Button>
        </div>
      </div>

      {layer.fill.kind === "solid" ? (
        <PostColourSwatches
          label="Colour"
          value={layer.fill.color}
          onChange={(color) => onChange({ fill: { kind: "solid", color } })}
        />
      ) : (
        <PostGradientPresets
          from={layer.fill.from}
          to={layer.fill.to}
          angle={layer.fill.angle}
          onChange={(fill) => onChange({ fill })}
        />
      )}

      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">
          Corners — {layer.radius >= CORNER_MAX ? "Pill" : layer.radius === 0 ? "Sharp" : "Rounded"}
        </label>
        <Slider
          min={0} max={CORNER_MAX} step={1}
          value={[Math.min(layer.radius, CORNER_MAX)]}
          onValueChange={([v]) => onChange({ radius: v >= CORNER_MAX ? 999 : v })}
        />
      </div>

      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Border</label>
        <div className="flex gap-1">
          <Button
            variant="outline" size="sm"
            className={cn(!layer.stroke && "ring-2 ring-primary ring-offset-1")}
            onClick={() => onChange({ stroke: undefined })}
          >
            None
          </Button>
          <Button
            variant="outline" size="sm"
            className={cn(layer.stroke && "ring-2 ring-primary ring-offset-1")}
            onClick={() => onChange({ stroke: layer.stroke ?? { color: "#1e1e1e", width: 2 } })}
          >
            Solid
          </Button>
        </div>
      </div>

      {layer.stroke && (
        <>
          <PostColourSwatches
            label="Border colour"
            value={layer.stroke.color}
            onChange={(color) => onChange({ stroke: { ...layer.stroke!, color } })}
          />
          <div>
            <label className="text-eyebrow mb-1 block !text-[0.6rem]">
              Border thickness — {layer.stroke.width}
            </label>
            <Slider
              min={1} max={40} step={1}
              value={[layer.stroke.width]}
              onValueChange={([v]) => onChange({ stroke: { ...layer.stroke!, width: v } })}
            />
          </div>
        </>
      )}
    </div>
  );
}
```

Note the `Slider`s commit on every drag step. That is fine and intentional: `onChange` here is wired
to `updateLayerLive` + `commitLayerChange`, and the outer persistence write is already debounced by
2 s inside `usePostEditor`. The blur-commit pattern existed specifically for *typed* fields, which
these no longer are.

- [ ] **Step 4: Update `post-inspector-text.tsx`**

Keep its `Select`s for font and weight and its align buttons. Replace the colour `Input type="color"`
with `PostColourSwatches` (label `"Colour"`), and replace the font-size number `Input` with a
`Slider` plus a readout, deleting that field's draft `useState`/`useEffect`:

```tsx
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">
          Size — {displayFontSize(layer.fontSize)}
        </label>
        <Slider
          min={8} max={200} step={1}
          value={[displayFontSize(layer.fontSize)]}
          onValueChange={([v]) => onChange({ fontSize: fontSizeFromDisplay(v) })}
        />
      </div>
```

- [ ] **Step 5: Update `post-inspector-image.tsx` wording**

Rename the "Fit" label to `How the image fills its box`, and its two options to `Fill the box` /
`Fit inside`. Keep the existing `naturalSize` reset button exactly as it is.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `post-focus-view.tsx` (it does not yet pass `selectedCount`/`naturalSize` to
`PostInspector`) — that is Task 25. Confirm no other file errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/post-inspector.tsx src/components/nodes/post-inspector-shape.tsx \
  src/components/nodes/post-inspector-text.tsx src/components/nodes/post-inspector-image.tsx
git commit -m "feat(post): normalise the inspector shell and replace its technical controls"
```

---

## Task 14: The tool rail

**Files:**
- Create: `src/components/nodes/post-tool-rail.tsx`

**Interfaces:**
- Produces: `type PostTool = "templates" | "sizes" | "elements" | "text" | "connected" | "layers" | "brand"`;
  `POST_TOOLS` (ordered metadata);
  `PostToolRail({ active, onSelect }: { active: PostTool | null; onSelect: (t: PostTool | null) => void })`.

- [ ] **Step 1: Create the file**

```tsx
"use client";

import {
  LayoutTemplate, Ratio, Shapes, Type, ImageDown, Layers as LayersIcon, Palette,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PostTool =
  | "templates" | "sizes" | "elements" | "text" | "connected" | "layers" | "brand";

export const POST_TOOLS: { key: PostTool; label: string; icon: LucideIcon; comingSoon?: boolean }[] = [
  { key: "templates", label: "Templates", icon: LayoutTemplate },
  { key: "sizes", label: "Size", icon: Ratio },
  { key: "elements", label: "Elements", icon: Shapes },
  { key: "text", label: "Text", icon: Type },
  { key: "connected", label: "Connected", icon: ImageDown },
  { key: "layers", label: "Layers", icon: LayersIcon },
  { key: "brand", label: "Brand", icon: Palette, comingSoon: true },
];

type Props = {
  active: PostTool | null;
  onSelect: (tool: PostTool | null) => void;
};

/** Clicking the active tool closes its panel, so the rail toggles rather than only opening. */
export function PostToolRail({ active, onSelect }: Props) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border py-3">
      {POST_TOOLS.map(({ key, label, icon: Icon, comingSoon }) => (
        <Button
          key={key}
          variant="ghost"
          onClick={() => onSelect(active === key ? null : key)}
          aria-pressed={active === key}
          title={comingSoon ? `${label} — coming soon` : label}
          className={cn(
            "h-auto w-12 flex-col gap-1 rounded-md px-0 py-2 text-[0.6rem] font-medium",
            active === key && "bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-4" strokeWidth={1.5} />
          {label}
          {comingSoon && <span className="text-[0.5rem] text-muted-foreground">soon</span>}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/nodes/post-tool-rail.tsx
git commit -m "feat(post): add the editor tool rail"
```

---

## Task 15: The flyout panel shell

**Files:**
- Create: `src/components/nodes/post-tool-panel.tsx`

**Interfaces:**
- Consumes: `PostTool`, `POST_TOOLS` (T14).
- Produces: `PostToolPanel({ tool, children }: { tool: PostTool | null; children: React.ReactNode })`
  — renders nothing when `tool` is null, otherwise a fixed-width titled scroll container.

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { POST_TOOLS, type PostTool } from "./post-tool-rail";

type Props = {
  tool: PostTool | null;
  children: React.ReactNode;
};

/**
 * One shell for every panel — one width, one scroll behaviour, one header treatment (D116).
 * `scrollbar-thin` keeps overflow from falling back to the raw OS scrollbar.
 */
export function PostToolPanel({ tool, children }: Props) {
  if (!tool) return null;
  const meta = POST_TOOLS.find((t) => t.key === tool);
  return (
    <div className="scrollbar-thin w-64 shrink-0 overflow-y-auto border-r border-border p-3">
      <p className="text-eyebrow mb-3 !text-[0.6rem]">{meta?.label ?? ""}</p>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/nodes/post-tool-panel.tsx
git commit -m "feat(post): add the shared flyout panel shell"
```

---

## Task 16: The Size panel

**Files:**
- Create: `src/components/nodes/post-panel-sizes.tsx`

**Interfaces:**
- Consumes: `POST_FORMATS`, `FORMATS_BY_PLATFORM` (T1).
- Produces: `PostPanelSizes({ format, onSelect }: { format: PostFormat; onSelect: (f: PostFormat) => void })`.

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PostFormat } from "@/lib/post/types";
import { POST_FORMATS, FORMATS_BY_PLATFORM } from "@/lib/post/formats";

type Props = {
  format: PostFormat;
  onSelect: (format: PostFormat) => void;
};

/** A proportional swatch so the ratio is legible at a glance, not just as text. */
function RatioSwatch({ width, height }: { width: number; height: number }) {
  const scale = 22 / Math.max(width, height);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-[3px] border border-border bg-muted"
      style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
    />
  );
}

export function PostPanelSizes({ format, onSelect }: Props) {
  return (
    <div className="space-y-4">
      {FORMATS_BY_PLATFORM.map((group) => (
        <div key={group.platform}>
          <p className="mb-1 text-[0.6rem] font-semibold text-muted-foreground">{group.platform}</p>
          <div className="space-y-0.5">
            {group.formats.map((key) => {
              const spec = POST_FORMATS[key];
              const active = key === format;
              return (
                <Button
                  key={key}
                  variant="ghost"
                  onClick={() => onSelect(key)}
                  className={cn(
                    "h-auto w-full justify-start gap-2 px-2 py-1.5 text-left",
                    active && "bg-primary/10",
                  )}
                >
                  <span className="flex w-6 items-center justify-center">
                    <RatioSwatch width={spec.width} height={spec.height} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{spec.label}</span>
                    <span className="block text-[0.6rem] text-muted-foreground">
                      {spec.width} × {spec.height}
                    </span>
                  </span>
                  {active && <Check className="size-3.5 shrink-0 text-primary" strokeWidth={2} />}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/nodes/post-panel-sizes.tsx
git commit -m "feat(post): add the platform-grouped Size panel"
```

---

## Task 17: The Templates panel and its override dialog

**Files:**
- Create: `src/components/nodes/post-panel-templates.tsx`

**Interfaces:**
- Consumes: `TEMPLATES`, `PostTemplate` (Tasks 8–11); `AlertDialog*` from
  `@/components/ui/alert-dialog`.
- Produces: `PostPanelTemplates({ activeTemplateId, onApply }: { activeTemplateId?: string; onApply: (t: PostTemplate) => void })`.

- [ ] **Step 1: Confirm the alert-dialog export names**

Run: `grep -n "^export\|^  Alert" src/components/ui/alert-dialog.tsx | head -20`
Use the exact exported component names in the next step; do not guess them.

- [ ] **Step 2: Create the file**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { TEMPLATES, type PostTemplate } from "@/lib/post/templates";

type Props = {
  activeTemplateId?: string;
  onApply: (template: PostTemplate) => void;
};

/**
 * Applying a template is the one destructive action in the editor and it is one click away,
 * so it always confirms — including on an untouched canvas (D118). Connected images survive;
 * the caller guarantees that.
 */
export function PostPanelTemplates({ activeTemplateId, onApply }: Props) {
  const [pending, setPending] = useState<PostTemplate | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => (
          <Button
            key={t.id}
            variant="outline"
            onClick={() => setPending(t)}
            className={cn(
              "h-auto flex-col items-start gap-1 p-2 text-left",
              activeTemplateId === t.id && "ring-2 ring-primary ring-offset-1",
            )}
          >
            <span className="block w-full truncate text-xs font-medium">{t.name}</span>
            <span className="block w-full truncate text-[0.6rem] text-muted-foreground">
              {t.purposeTags.join(" · ")}
            </span>
          </Button>
        ))}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply “{pending?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces your current layout. Your connected image is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onApply(pending);
                setPending(null);
              }}
            >
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit` → clean. If the alert-dialog exports differ from Step 1's findings, adjust the
import and JSX to match the real API rather than adding the missing pieces.

```bash
git add src/components/nodes/post-panel-templates.tsx
git commit -m "feat(post): add the templates panel with an override confirmation"
```

---

## Task 18: The Elements panel

**Files:**
- Create: `src/components/nodes/post-panel-elements.tsx`

**Interfaces:**
- Produces: `PostPanelElements({ nodeId, onAddShape, onAddIcon, onAddImageUrl }: { nodeId: string; onAddShape: () => void; onAddIcon: (src: IconSource) => void; onAddImageUrl: (url: string) => void })`.

**Carry the upload path over — do not drop it.** `post-add-menu.tsx` is not only icons: it also owns
the *image upload* flow (a hidden file input, an upload call, then `onAddImageUrl(result.fileUrl)`).
Task 25 deletes that file, so if this panel does not carry the upload over, the ability to add an
image from disk disappears silently. It must move here intact.

- [ ] **Step 1: Read `src/components/nodes/post-add-menu.tsx` in full**

It holds three things this task moves verbatim: `LUCIDE_PRESET` (41 entries, grouped),
`SIMPLE_PRESET` (7), and the upload flow (`inputRef`, the change handler that uploads and calls
`onAddImageUrl`, the reset of `inputRef.current.value`, and the hidden `<input type="file">`). Do not
re-derive or re-verify the icon names — they were already checked against the installed packages.

- [ ] **Step 2: Create the panel**

```tsx
"use client";

import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IconSource } from "@/lib/post/types";

type Props = {
  nodeId: string;
  onAddShape: () => void;
  onAddIcon: (src: IconSource) => void;
  onAddImageUrl: (url: string) => void;
};

export function PostPanelElements({ nodeId, onAddShape, onAddIcon, onAddImageUrl }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-[0.6rem] font-semibold text-muted-foreground">Shapes</p>
        <Button variant="outline" size="sm" onClick={onAddShape} className="w-full justify-start gap-2">
          <Square className="size-3.5" strokeWidth={1.5} /> Rectangle
        </Button>
      </div>
      {/* Sections moved verbatim from post-add-menu.tsx, in this order:
          1. "Upload"  — the hidden file input + its Button trigger + the upload handler that
                         calls onAddImageUrl(result.fileUrl). Keep `nodeId` threaded through,
                         it is what the upload call needs.
          2. "Icons"   — LUCIDE_PRESET's grouped 4-column Button grid, each calling
                         onAddIcon({ kind: "lucide", name }).
          3. "Brands"  — SIMPLE_PRESET's grid, each calling onAddIcon({ kind: "simple", name }).
          Copy the existing markup and handlers as they are; this is a move, not a redesign. */}
    </div>
  );
}
```

Only the Shapes section above is new. (Ellipse, line, arrow and star arrive in Plan 2; do not add
disabled stubs for them.) The hidden `<input type="file">` is the one legitimate raw input in this
codebase's Post components — it is pre-existing and shadcn has no file-input primitive.

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit` → clean (`post-add-menu.tsx` still exists and still compiles; Task 25 deletes
it).

```bash
git add src/components/nodes/post-panel-elements.tsx
git commit -m "feat(post): add the Elements panel"
```

---

## Task 19: The Text panel

**Files:**
- Create: `src/components/nodes/post-panel-text.tsx`

**Interfaces:**
- Produces: `PostPanelText({ onAddText }: { onAddText: (preset: Partial<TextLayer>) => void })`.
- Requires: `addText` must accept overrides — see Step 1. It currently takes **no arguments**.

- [ ] **Step 1: Let `addText` accept a preset**

`usePostEditor`'s `addText` is `useCallback(() => { const layer = createTextLayer(); … })` — it takes
nothing, so the presets below would have no way to reach it. Widen it in
`src/hooks/use-post-editor.ts`, mirroring how `addImage` already accepts overrides:

```typescript
  const addText = useCallback((overrides?: Partial<TextLayer>) => {
    const layer = createTextLayer(overrides ?? {}, history.present.layers);
    applyLayers(addLayer(history.present.layers, layer));
    setSelectedIds([layer.id]);
  }, [history.present.layers, applyLayers]);
```

Import `TextLayer` in that file if it is not already imported. Existing zero-argument callers keep
working because the parameter is optional.

- [ ] **Step 2: Create the file**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import type { TextLayer } from "@/lib/post/types";

/**
 * Three presets rather than one generic "add text" — a heading and a body differ only by
 * size and weight, and picking the right one up front is faster than restyling afterwards.
 */
const TEXT_PRESETS: { label: string; className: string; preset: Partial<TextLayer> }[] = [
  {
    label: "Heading",
    className: "text-lg font-bold",
    preset: { text: "Add a heading", fontSize: 0.055, fontWeight: 700, h: 0.09 },
  },
  {
    label: "Subheading",
    className: "text-sm font-semibold",
    preset: { text: "Add a subheading", fontSize: 0.032, fontWeight: 600, h: 0.06 },
  },
  {
    label: "Body text",
    className: "text-xs font-normal",
    preset: { text: "Add a line of body text", fontSize: 0.02, fontWeight: 400, h: 0.045 },
  },
];

export function PostPanelText({ onAddText }: { onAddText: (preset: Partial<TextLayer>) => void }) {
  return (
    <div className="space-y-2">
      {TEXT_PRESETS.map((p) => (
        <Button
          key={p.label}
          variant="outline"
          onClick={() => onAddText(p.preset)}
          className="h-auto w-full justify-start px-3 py-2.5"
        >
          <span className={p.className}>{p.label}</span>
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/nodes/post-panel-text.tsx src/hooks/use-post-editor.ts
git commit -m "feat(post): add the Text panel with heading/subheading/body presets"
```

---

## Task 20: The Connected panel

**Files:**
- Create: `src/components/nodes/post-panel-connected.tsx`

**Interfaces:**
- Produces:
  `PostPanelConnected({ nodes, onAdd }: { nodes: { nodeId: string; url: string; title?: string }[]; onAdd: (nodeId: string, at?: { x: number; y: number }) => void })`.
  Drag payload: `application/x-post-node-id` carrying the `nodeId`, read by the stage drop handler
  in Task 25.

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  nodes: { nodeId: string; url: string; title?: string }[];
  onAdd: (nodeId: string) => void;
};

/** The drag payload key the stage's drop handler reads (Task 25). */
export const CONNECTED_DRAG_TYPE = "application/x-post-node-id";

export function PostPanelConnected({ nodes, onAdd }: Props) {
  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
        <ImageOff className="size-6 text-muted-foreground/40" strokeWidth={1.5} />
        <p className="text-xs text-muted-foreground">
          Nothing connected yet. Wire an Image or File node into this Post node to use its picture
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[0.6rem] text-muted-foreground">Click to add, or drag onto the canvas.</p>
      <div className="grid grid-cols-2 gap-2">
        {nodes.map((n) => (
          <Button
            key={n.nodeId}
            variant="outline"
            onClick={() => onAdd(n.nodeId)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(CONNECTED_DRAG_TYPE, n.nodeId);
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="h-auto flex-col gap-1 p-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={n.url}
              alt={n.title ?? "Connected image"}
              className="aspect-square w-full rounded-sm object-cover"
            />
            <span className="block w-full truncate text-[0.6rem] text-muted-foreground">
              {n.title ?? "Untitled"}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/nodes/post-panel-connected.tsx
git commit -m "feat(post): add the connected-nodes panel with click and drag placement"
```

---

## Task 21: The Layers panel wrapper

**Files:**
- Create: `src/components/nodes/post-panel-layers.tsx`

**Interfaces:**
- Consumes: `PostLayerList` (unchanged — read its current `Props` and forward them verbatim).

- [ ] **Step 1: Read `src/components/nodes/post-layer-list.tsx`'s `Props` type**

- [ ] **Step 2: Create a thin pass-through**

```tsx
"use client";

import { PostLayerList } from "./post-layer-list";

type Props = React.ComponentProps<typeof PostLayerList>;

/**
 * The layer list becomes a rail item rendered in the shared flyout (D120). This wrapper
 * exists so the panel switch in post-focus-view stays uniform — one component per tool —
 * rather than special-casing layers.
 */
export function PostPanelLayers(props: Props) {
  return <PostLayerList {...props} />;
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/nodes/post-panel-layers.tsx
git commit -m "feat(post): add the layers panel wrapper"
```

---

## Task 22: Escape must not close the editor mid-edit

**Files:**
- Modify: `src/components/nodes/post-stage.tsx`

**Why.** The inline text overlay handles Escape to cancel an edit but never calls `stopPropagation`,
and the editor is a `Sheet` — a Base UI `Dialog`, which closes on Escape. The instinctive "cancel this
edit" gesture ejects the user from the whole editor.

- [ ] **Step 1: Add propagation guards to the overlay's `onKeyDown`**

In the `<Textarea>`'s `onKeyDown` inside `post-stage.tsx`, stop both handled keys from reaching the
Sheet:

```tsx
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                // Cancel the edit ONLY. Without this the keydown reaches the Sheet (a Base UI
                // Dialog), which closes on Escape — so cancelling a text edit would eject the
                // operator from the entire editor.
                e.stopPropagation();
                setEditingTextId(null);
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.stopPropagation();
                onCommitText(editingTextId, (e.target as HTMLTextAreaElement).value);
                setEditingTextId(null);
              }
            }}
```

- [ ] **Step 2: Verify by reading, then typecheck**

Trace: with a text layer being edited, pressing Escape now calls `stopPropagation` before
`setEditingTextId(null)`, so the Sheet's own Escape handling never sees the event and the editor
stays open. Pressing Escape with no text edit active still reaches the Sheet and closes the editor,
which is correct.

Run: `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/post-stage.tsx
git commit -m "fix(post): keep Escape from closing the editor while editing text"
```

---

## Task 23: Track when layers last changed

**Files:**
- Modify: `src/lib/canvas-nodes.ts`
- Modify: `src/components/nodes/post-node.tsx`

**Interfaces:**
- Produces: `PostNodeData.layersUpdatedAt?: string` (ISO 8601).

- [ ] **Step 1: Add the field**

In `src/lib/canvas-nodes.ts`, beside the existing `renderedAt`:

```typescript
  renderedAt?: string;         // set on export; compared against layersUpdatedAt (D126)
  layersUpdatedAt?: string;    // set whenever layers change; drives the "Edited since export" chip
```

- [ ] **Step 2: Stamp it on every layer write**

`post-node.tsx` owns the `onPatch` the editor calls. Stamp the time there, so every path that changes
layers — editor edits, template application, undo, redo — is covered by one rule rather than each
call site remembering:

```tsx
      onPatch={(patch) => {
        // Any patch carrying layers is a design edit; record when, so the card can tell
        // "exported" from "edited since export" (D126).
        const stamped = "layers" in patch
          ? { ...patch, layersUpdatedAt: new Date().toISOString() }
          : patch;
        updateNodeData(id, stamped);
      }}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/canvas-nodes.ts src/components/nodes/post-node.tsx
git commit -m "feat(post): record when a post's layers last changed"
```

---

## Task 24: The node card tells the truth

**Files:**
- Modify: `src/components/nodes/post-node.tsx`

**Interfaces:**
- Consumes: `renderState`, `RENDER_STATE_LABELS` (T5); `POST_FORMATS`, `resolveFormat` (T1).

- [ ] **Step 1: Replace the status chip and preview**

```tsx
import { renderState, RENDER_STATE_LABELS } from "@/lib/post/render-state";
import { POST_FORMATS, resolveFormat } from "@/lib/post/formats";
```

Replace `const hasRender = !!d.fileUrl;` and `const hasLayers = …` with:

```tsx
  const format = resolveFormat(d.format);
  const spec = POST_FORMATS[format];
  const state = renderState({
    fileUrl: d.fileUrl,
    renderedAt: d.renderedAt,
    layersUpdatedAt: d.layersUpdatedAt,
  });
  const layerCount = d.layers?.length ?? 0;
```

Replace the `status={…}` prop's chip with one driven by `state`:

```tsx
          status={
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold leading-none",
                state === "exported" && "bg-primary/10 text-primary",
                state === "stale" && "bg-amber-100 text-amber-700",
                state === "draft" && "bg-muted text-muted-foreground",
              )}
            >
              {RENDER_STATE_LABELS[state]}
            </span>
          }
```

- [ ] **Step 2: Make the preview respect the real aspect ratio**

Replace the whole `hasRender ? (…) : (…)` preview block:

```tsx
        <div
          className="flex items-center justify-center overflow-hidden border-b border-border bg-muted/20"
          style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
        >
          {d.fileUrl ? (
            // object-contain, not cover: the card must show the composition that was made,
            // not a centre-crop of it (D126).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d.fileUrl}
              alt={d.title ?? "post"}
              className="size-full object-contain"
            />
          ) : (
            <LayoutTemplate className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
          )}
        </div>
```

- [ ] **Step 3: Replace the footer with honest metadata**

```tsx
        <div className="space-y-1 px-3 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 h-auto gap-1 px-1.5 py-1 text-xs font-medium text-primary"
          >
            Open ↗
          </Button>
          <p className="text-[0.6rem] text-muted-foreground">
            {layerCount === 0
              ? "Empty — open to start"
              : `${spec.shortLabel} · ${layerCount} layer${layerCount === 1 ? "" : "s"}`}
          </p>
        </div>
```

Add `import { Button } from "@/components/ui/button";` — the raw `<button>` this replaces violated
CLAUDE.md's shadcn-only rule.

- [ ] **Step 4: Narrow the auto-place memo**

`connectedImageNodes` is memoised on `[nodes, edges, id]`, so dragging any unrelated node on the board
gives it a fresh identity and re-fires the editor's auto-place effect. Key it on the resolved content
instead by appending, after the existing `useMemo`:

```tsx
  // Re-key on the resolved ids+urls, not on the whole nodes/edges arrays: otherwise moving
  // ANY node on the board hands post-focus-view a new array identity and re-runs its
  // auto-place effect.
  const connectedSignature = connectedImageNodes.map((c) => `${c.nodeId}:${c.url}`).join("|");
  const stableConnectedImageNodes = useMemo(
    () => connectedImageNodes,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectedSignature],
  );
```

and pass `stableConnectedImageNodes` to `<PostFocusView connectedImageNodes={…} />`.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/nodes/post-node.tsx
git commit -m "feat(post): make the node card preview and status tell the truth"
```

---

## Task 25: Wire the shell together

**Files:**
- Modify: `src/components/nodes/post-focus-view.tsx`
- Delete: `src/components/nodes/post-add-menu.tsx`
- Delete: `src/components/nodes/post-template-picker.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–24.

This is the integration task; every deferred typecheck error from earlier tasks resolves here.

- [ ] **Step 1: Read the current file in full.**

- [ ] **Step 2: Switch to the widened editor state**

```tsx
  const {
    layers, format, templateId, setFormat, setTemplateId, selectedIds, /* …all existing… */
  } = usePostEditor(
    {
      layers: persistedLayers ?? [],
      format: resolveFormat(persistedFormat),
      templateId: persistedTemplateId,
    },
    (next) => onPatch({ layers: next.layers, format: next.format, templateId: next.templateId }),
  );
```

Rename the incoming props `format` → `persistedFormat` and `templateId` → `persistedTemplateId` in the
destructured `Props`, since the hook now owns the live values. Derive the stage size from the hook's
`format`, not the prop:

```tsx
  const formatSpec = POST_FORMATS[format];
```

- [ ] **Step 3: Replace the rail/picker state with the tool rail**

Delete the `rail` state, the `pickerOpen` state, `showTemplatePicker`, and the `<PostTemplatePicker>`
element entirely. Add:

```tsx
  const [tool, setTool] = useState<PostTool | null>("templates");
```

Templates open by default so the next step is discoverable, but nothing is applied until clicked
(D117).

- [ ] **Step 4: Rewrite `handlePickTemplate` to be one undo step**

```tsx
  function handlePickTemplate(template: PostTemplate) {
    const seeded = template.seedLayers(format);
    // Connected-node images survive a template swap (D118) — the auto-place effect fires at
    // most once per source, so a discarded plate could never come back on its own.
    const keptImages = layers.filter((l) => l.kind === "image" && l.src.kind === "node");
    replaceAllLayers([...keptImages, ...seeded], template.id);
  }
```

- [ ] **Step 5: Render rail + panel + canvas + inspector**

Replace the icon rail and left panel with:

```tsx
        <div className="flex min-h-0 flex-1">
          <PostToolRail active={tool} onSelect={setTool} />
          <PostToolPanel tool={tool}>
            {tool === "templates" && (
              <PostPanelTemplates activeTemplateId={templateId} onApply={handlePickTemplate} />
            )}
            {tool === "sizes" && <PostPanelSizes format={format} onSelect={setFormat} />}
            {tool === "elements" && (
              <PostPanelElements
                nodeId={nodeId}
                onAddShape={addShape}
                onAddIcon={addIcon}
                onAddImageUrl={(url) => addImage({ kind: "url", url })}
              />
            )}
            {tool === "text" && <PostPanelText onAddText={(preset) => addText(preset)} />}
            {tool === "connected" && (
              <PostPanelConnected nodes={connectedImageNodes} onAdd={(nodeId) => addImage({ kind: "node", nodeId })} />
            )}
            {tool === "layers" && (
              <PostPanelLayers
                layers={layers}
                selectedIds={selectedIds}
                onSelect={selectLayer}
                onToggleSelect={toggleLayerSelection}
                onRename={handleRenameLayer}
                onReorder={reorder}
                onReorderToIndex={reorderToIndex}
                onToggleLock={toggleLock}
                onToggleHidden={toggleHidden}
                onDuplicate={(id) => duplicateSelection([id])}
                onDelete={(id) => deleteSelection([id])}
              />
            )}
            {tool === "brand" && <PostBrandTabStub />}
          </PostToolPanel>
          {/* …stage…, then the inspector… */}
```

The inspector call gains the two props Task 13 added:

```tsx
            <PostInspector
              layer={selectedLayer}
              selectedCount={selectedIds.length}
              naturalSize={selectedLayer ? naturalSizes[selectedLayer.id] : undefined}
              onChange={(patch) => {
                if (selectedIds.length === 1) {
                  updateLayerLive(selectedIds[0], patch);
                  commitLayerChange();
                }
              }}
            />
```

- [ ] **Step 6: Accept drops from the Connected panel**

Wrap the stage container so a dragged thumbnail lands where it is dropped:

```tsx
          <div
            className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/10 p-6"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(CONNECTED_DRAG_TYPE)) e.preventDefault();
            }}
            onDrop={(e) => {
              const nodeId = e.dataTransfer.getData(CONNECTED_DRAG_TYPE);
              if (!nodeId) return;
              e.preventDefault();
              const stageBox = stageRef.current?.container().getBoundingClientRect();
              if (!stageBox) return;
              // The drop point becomes the new layer's CENTRE, so the image lands under the
              // cursor rather than starting there and extending down-right.
              const w = 0.4;
              const h = 0.4;
              const cx = pxToNormalized(e.clientX - stageBox.left, stageBox.width);
              const cy = pxToNormalized(e.clientY - stageBox.top, stageBox.height);
              addImage(
                { kind: "node", nodeId },
                {
                  x: Math.min(Math.max(cx - w / 2, 0), 1 - w),
                  y: Math.min(Math.max(cy - h / 2, 0), 1 - h),
                  w, h,
                },
              );
            }}
          >
```

- [ ] **Step 7: Replace the format `Select` in the header**

Delete the header's `<Select>` block entirely — the Size panel replaces it. Keep the ratio-change
toast, moved into `setFormat`'s call site in the Size panel handler:

```tsx
  function handleSelectFormat(next: PostFormat) {
    const from = POST_FORMATS[format];
    const to = POST_FORMATS[next];
    if (Math.abs(from.width / from.height - to.width / to.height) > 0.3) {
      toast.info("Big aspect-ratio change — check the layout. Undo with ⌘Z if it looks wrong.");
    }
    setFormat(next);
  }
```

and pass `onSelect={handleSelectFormat}` to `PostPanelSizes`.

- [ ] **Step 8: Mark Publish as coming soon**

```tsx
                <Button variant="outline" size="sm" disabled title="Publishing is coming soon">
                  Publish <span className="ml-1 text-[0.6rem] opacity-70">soon</span>
                </Button>
```

- [ ] **Step 9: Delete the replaced files**

```bash
git rm src/components/nodes/post-add-menu.tsx src/components/nodes/post-template-picker.tsx
```

- [ ] **Step 10: Typecheck — this must now be completely clean**

Run: `npx tsc --noEmit`
Expected: **clean, no output.** Every deferred error from Tasks 1, 7 and 13 resolves here. If anything
is still red, it is a real gap — fix it here rather than deferring.

- [ ] **Step 11: Run the full suite**

Run:
```bash
npx vitest run src/lib/post src/services/post-node.service.test.ts src/lib/canvas-nodes.test.ts src/lib/canvas-node-options.test.ts src/lib/nodes/node-output.test.ts
```
Expected: all passing. The only file whose expectations changed in this plan is `units.test.ts`
(Task 3, per D123).

- [ ] **Step 12: Commit**

```bash
git add -A src/components/nodes src/hooks
git commit -m "feat(post): wire the Canva-style shell together and retire the old add menu"
```

---

## Self-review checklist for the executor

Before declaring the plan done, confirm:

- [ ] `npx tsc --noEmit` is clean.
- [ ] The full post suite passes, and the only edited test expectations are in `units.test.ts`.
- [ ] No raw `<button>`, `<input>`, `<select>` or `<textarea>` was introduced in any new file
      (`grep -n "<button\|<input\|<select\|<textarea" src/components/nodes/post-*.tsx` — the only
      legitimate hits are the pre-existing file input in the elements panel and the `Textarea`
      primitive usage in `post-stage.tsx`).
- [ ] No internal key reaches the UI (`grep -rn "ig-square\|ig-story\|ig-portrait" src/components/`
      should return only logic, never rendered text).
- [ ] `post-add-menu.tsx` and `post-template-picker.tsx` are deleted and nothing imports them.

