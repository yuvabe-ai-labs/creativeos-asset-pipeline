# Version Viewing and Media Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every versioned node gets one History pattern (click to view, restore only from a viewing bar), and every node card and focus-view preview shows its media at the media's own aspect ratio with nothing cropped.

**Architecture:** Two pure libraries carry the logic (`src/lib/versions/viewing.ts`, `src/lib/canvas/media-fit.ts`) and are unit-tested. Thin hooks (`useVersionViewing`, `useNodeMediaSize`) wrap them in React state. Small shared components (`VersionList`, `VersionThumb`, `VersionViewingBar`, `VersionStepper`, `VersionOutputEmpty`, `ActiveOnlyNotice`, `PromptHistoryPane`, `NodeMedia`) are the only UI the nodes consume. Each focus view and node card is then migrated in its own task.

**Tech Stack:** Next.js (this repo's fork — read `node_modules/next/dist/docs/` before touching routing; this plan touches none), React 19, TypeScript, Tailwind v4, shadcn/Base UI primitives in `src/components/ui/`, Lucide icons, `@xyflow/react`, Vitest (node environment, **no DOM**: component tests use `renderToStaticMarkup`).

**Spec:** [docs/superpowers/specs/2026-10-21-version-viewing-and-media-fit-design.md](../specs/2026-10-21-version-viewing-and-media-fit-design.md) · **ADRs:** D383, D384 · **Mockup:** https://claude.ai/artifact/6ZzcYtPqCSoErvVZo68u71

## Global Constraints

- Controls are shadcn primitives from `src/components/ui/*` only — never a raw `<button>`, `<input>`, `<select>`. Base UI composes via `render`, not `asChild`.
- Lucide icons only, `strokeWidth={1.5}`, no fills.
- Never hardcode colours; use the theme tokens (`text-primary`, `border-border`, `bg-muted`, `text-muted-foreground`, …). Purple is used sparingly.
- Motion easing is `cubic-bezier(0.22,1,0.36,1)` only.
- User-facing copy is plain: no vendor names, no raw errors, no em-dash phrasing.
- Performance rule 1: a component mounted once per node makes **zero** network calls on mount. Rule 4: never write node data when nothing changed.
- Writes to node data happen only when the canvas is editable (`useCanvasEditable()`, the D33 lock holder).
- One component per file, named exports, split at ~200 lines (`docs/component-structure.md`).
- Viewing copy, exactly: bar `Viewing {vN}, made {relative}. The node still uses {vM}.`; buttons `Back to {vM}` / `Restore {vN}`; notice `You're viewing {vN}. Restore it to review or change it.`; empty `No {noun} from this attempt` + `The generation did not finish.`
- Media tiers, exactly: `output` = card 280–480, cap 500, hard cap 600, inset 26. `input` = card 176–280, cap 300, hard cap 360, inset 2.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The full `vitest run` has ~11 known timeout flakes in API route tests; verify with the per-file commands given in each task.

## Commands

- One test file: `npx vitest run <path>`
- Types: `npx tsc --noEmit`
- Lint the files you touched: `npx eslint <file> <file> …`

## File map

| File | New/Modify | Responsibility |
|---|---|---|
| `src/lib/canvas/media-fit.ts` (+ `.test.ts`) | New | Tiers, `parseAspectRatio`, `ratioOf`, `nodeMediaBox`, `resolveMediaRatio`, `mediaSizeToSave` |
| `src/lib/versions/viewing.ts` (+ `.test.ts`) | New | `resolveViewedVersion`, `stepVersionId`, `nextViewedId` |
| `src/hooks/use-version-viewing.ts` | New | Viewing state per focus view |
| `src/hooks/use-node-media-size.ts` | New | Measured → saved media size per node card |
| `src/components/nodes/version-thumb.tsx` | New | `VersionThumb`, `VersionFailedThumb` |
| `src/components/nodes/version-viewing-bar.tsx` | New | The bar with Back / Restore |
| `src/components/nodes/version-stepper.tsx` | New | `‹ vN of M ›` |
| `src/components/nodes/version-output-empty.tsx` | New | Failed-version frame |
| `src/components/nodes/active-only-notice.tsx` | New | "You're viewing vN…" line |
| `src/components/nodes/version-list.tsx` | New | The one shared history list (replaces `version-history-list.tsx`) |
| `src/components/nodes/prompt-history-pane.tsx` | New | Prompt nodes' History: list + read-only output |
| `src/components/nodes/node-media.tsx` | New | Card media box (image or video) |
| `src/components/nodes/__tests__/version-viewing-ui.test.tsx` | New | Static-markup tests for the shared UI |
| `src/components/nodes/__tests__/node-media.test.tsx` | New | Static-markup test for `NodeMedia` |
| `src/components/nodes/{video-gen,image-gen,prompt,dubbing}-version-history.tsx` | Modify | Adapters onto `VersionList` |
| Focus views: `video-gen`, `image-gen`, `composite` (+ `composite-output-pane`), `dubbing` (+ `dubbing-player`), `prompt-focus-shell`, `video-prompt`, `multishot-prompt`, `prompt` | Modify | Wire viewing |
| Cards: `image-gen`, `composite`, `video-gen`, `dubbing`, `file`, `draw`, `avatar`, `client-review`, `post`, `kb` nodes | Modify | Media fit |
| `src/lib/canvas-nodes.ts` | Modify | `mediaWidth`/`mediaHeight` on node data |
| `version-history-list.tsx`, `prompt-version-chips.tsx`, `buildVersionChips` (+ its tests) | Delete | Replaced |

---

### Task 1: Media-fit library

**Files:**
- Create: `src/lib/canvas/media-fit.ts`
- Test: `src/lib/canvas/media-fit.test.ts`

**Interfaces:**
- Produces:
  - `type MediaTier = "output" | "input"`
  - `const MEDIA_TIERS: Record<MediaTier, { minCard: number; maxCard: number; cap: number; hardCap: number; inset: number }>`
  - `type MediaBox = { cardWidth: number; mediaWidth: number; mediaHeight: number; letterboxed: boolean }`
  - `type MediaSize = { width: number; height: number }`
  - `parseAspectRatio(value: unknown): number | null`
  - `ratioOf(width?: number | null, height?: number | null): number | null`
  - `nodeMediaBox(ratio: number, tier: MediaTier): MediaBox`
  - `resolveMediaRatio(measured: MediaSize | null, saved: { width?: number; height?: number }, fallback: number | null): number`
  - `mediaSizeToSave(saved: { width?: number; height?: number }, measured: MediaSize, editable: boolean): { mediaWidth: number; mediaHeight: number } | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/canvas/media-fit.test.ts
import { describe, it, expect } from "vitest";
import { mediaSizeToSave, nodeMediaBox, parseAspectRatio, ratioOf, resolveMediaRatio } from "./media-fit";

describe("parseAspectRatio", () => {
  it("reads w:h strings", () => {
    expect(parseAspectRatio("9:16")).toBeCloseTo(0.5625);
    expect(parseAspectRatio("16:9")).toBeCloseTo(1.7778, 3);
    expect(parseAspectRatio(" 4 : 5 ")).toBeCloseTo(0.8);
  });
  it("rejects anything else", () => {
    expect(parseAspectRatio("auto")).toBeNull();
    expect(parseAspectRatio("0:9")).toBeNull();
    expect(parseAspectRatio(undefined)).toBeNull();
    expect(parseAspectRatio(1.5)).toBeNull();
  });
});

describe("ratioOf", () => {
  it("needs two positive numbers", () => {
    expect(ratioOf(1920, 1080)).toBeCloseTo(1.7778, 3);
    expect(ratioOf(0, 1080)).toBeNull();
    expect(ratioOf(undefined, 1080)).toBeNull();
  });
});

describe("nodeMediaBox, output tier", () => {
  it("keeps landscape at full width", () => {
    expect(nodeMediaBox(16 / 9, "output")).toEqual({ cardWidth: 480, mediaWidth: 454, mediaHeight: 255, letterboxed: false });
    expect(nodeMediaBox(21 / 9, "output")).toEqual({ cardWidth: 480, mediaWidth: 454, mediaHeight: 195, letterboxed: false });
  });
  it("narrows portrait cards instead of growing them", () => {
    expect(nodeMediaBox(9 / 16, "output")).toEqual({ cardWidth: 307, mediaWidth: 281, mediaHeight: 500, letterboxed: false });
    expect(nodeMediaBox(4 / 5, "output")).toEqual({ cardWidth: 426, mediaWidth: 400, mediaHeight: 500, letterboxed: false });
    expect(nodeMediaBox(1, "output")).toEqual({ cardWidth: 480, mediaWidth: 454, mediaHeight: 454, letterboxed: false });
  });
  it("letterboxes only extremely tall media", () => {
    expect(nodeMediaBox(1 / 4, "output")).toEqual({ cardWidth: 280, mediaWidth: 254, mediaHeight: 600, letterboxed: true });
  });
});

describe("nodeMediaBox, input tier", () => {
  it("uses the smaller scale, edge to edge", () => {
    expect(nodeMediaBox(9 / 16, "input")).toEqual({ cardWidth: 176, mediaWidth: 174, mediaHeight: 309, letterboxed: false });
    expect(nodeMediaBox(16 / 9, "input")).toEqual({ cardWidth: 280, mediaWidth: 278, mediaHeight: 156, letterboxed: false });
  });
});

describe("resolveMediaRatio", () => {
  it("prefers measured, then saved, then the fallback, then 16:9", () => {
    expect(resolveMediaRatio({ width: 9, height: 16 }, { width: 16, height: 9 }, 1)).toBeCloseTo(0.5625);
    expect(resolveMediaRatio(null, { width: 16, height: 9 }, 1)).toBeCloseTo(1.7778, 3);
    expect(resolveMediaRatio(null, {}, 1)).toBe(1);
    expect(resolveMediaRatio(null, {}, null)).toBeCloseTo(1.7778, 3);
  });
});

describe("mediaSizeToSave", () => {
  it("writes only when the size changed and the canvas is editable", () => {
    expect(mediaSizeToSave({}, { width: 1080, height: 1920 }, true)).toEqual({ mediaWidth: 1080, mediaHeight: 1920 });
    expect(mediaSizeToSave({ width: 1080, height: 1920 }, { width: 1080, height: 1920 }, true)).toBeNull();
    expect(mediaSizeToSave({}, { width: 1080, height: 1920 }, false)).toBeNull();
    expect(mediaSizeToSave({}, { width: 0, height: 0 }, true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas/media-fit.test.ts`
Expected: FAIL — `Failed to resolve import "./media-fit"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/canvas/media-fit.ts
// D384 — every node card shows its media whole, at the media's own shape. One rule at two scales:
// output nodes (generated media) and input tiles (references). See the spec's tier table.

export type MediaTier = "output" | "input";

export const MEDIA_TIERS: Record<
  MediaTier,
  { minCard: number; maxCard: number; cap: number; hardCap: number; inset: number }
> = {
  // Media sits inside the card's px-3 body: 24px padding + 2px of border.
  output: { minCard: 280, maxCard: 480, cap: 500, hardCap: 600, inset: 26 },
  // Media runs edge to edge under the header: only the 2px of border.
  input: { minCard: 176, maxCard: 280, cap: 300, hardCap: 360, inset: 2 },
};

export type MediaBox = { cardWidth: number; mediaWidth: number; mediaHeight: number; letterboxed: boolean };
export type MediaSize = { width: number; height: number };

const DEFAULT_RATIO = 16 / 9;

/** "9:16" → 0.5625. Anything that is not two positive numbers is null ("auto", "", undefined). */
export function parseAspectRatio(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? w / h : null;
}

export function ratioOf(width?: number | null, height?: number | null): number | null {
  return width && height && width > 0 && height > 0 ? width / height : null;
}

/** The card and media size for a ratio. Landscape hits the max width; portrait gets narrower. */
export function nodeMediaBox(ratio: number, tier: MediaTier): MediaBox {
  const t = MEDIA_TIERS[tier];
  const mediaWidth = Math.round(Math.min(t.maxCard - t.inset, Math.max(t.minCard - t.inset, t.cap * ratio)));
  const natural = mediaWidth / ratio;
  const letterboxed = natural > t.hardCap;
  return {
    cardWidth: mediaWidth + t.inset,
    mediaWidth,
    mediaHeight: Math.round(letterboxed ? t.hardCap : natural),
    letterboxed,
  };
}

export function resolveMediaRatio(
  measured: MediaSize | null,
  saved: { width?: number; height?: number },
  fallback: number | null,
): number {
  return ratioOf(measured?.width, measured?.height) ?? ratioOf(saved.width, saved.height) ?? fallback ?? DEFAULT_RATIO;
}

/** The node-data patch to save, or null when nothing changed or this viewer may not write (D33). */
export function mediaSizeToSave(
  saved: { width?: number; height?: number },
  measured: MediaSize,
  editable: boolean,
): { mediaWidth: number; mediaHeight: number } | null {
  if (!editable || measured.width <= 0 || measured.height <= 0) return null;
  if (saved.width === measured.width && saved.height === measured.height) return null;
  return { mediaWidth: measured.width, mediaHeight: measured.height };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas/media-fit.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/media-fit.ts src/lib/canvas/media-fit.test.ts
git commit -m "feat(canvas): media-fit sizing rule for node cards (D384)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Version-viewing library and hook

**Files:**
- Create: `src/lib/versions/viewing.ts`
- Create: `src/hooks/use-version-viewing.ts`
- Test: `src/lib/versions/viewing.test.ts`

**Interfaces:**
- Produces:
  - `resolveViewedVersion<V extends { id: string }>(versions: V[], activeId: string | null, viewedId: string | null): { viewed: V | null; index: number; isViewingOther: boolean }`
  - `stepVersionId<V extends { id: string }>(versions: V[], fromId: string | null, delta: 1 | -1): string | null` — versions are newest first, so `+1` is older.
  - `nextViewedId(activeId: string | null, targetId: string): string | null` — `null` means "follow the active version".
  - `type VersionViewing<V> = { viewed: V | null; index: number; total: number; isViewingOther: boolean; view(id: string): void; step(delta: 1 | -1): void; backToActive(): void }`
  - `useVersionViewing<V extends { id: string }>(versions: V[], activeVersionId: string | null, open: boolean, onLeaveActive?: () => void): VersionViewing<V>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/versions/viewing.test.ts
import { describe, it, expect } from "vitest";
import { nextViewedId, resolveViewedVersion, stepVersionId } from "./viewing";

const v = (id: string) => ({ id });
const list = [v("v3"), v("v2"), v("v1")]; // newest first

describe("resolveViewedVersion", () => {
  it("follows the active version when nothing is viewed", () => {
    expect(resolveViewedVersion(list, "v2", null)).toEqual({ viewed: list[1], index: 1, isViewingOther: false });
  });
  it("shows the viewed version and flags it", () => {
    expect(resolveViewedVersion(list, "v3", "v1")).toEqual({ viewed: list[2], index: 2, isViewingOther: true });
  });
  it("falls back to active when the viewed id is gone", () => {
    expect(resolveViewedVersion(list, "v3", "gone")).toEqual({ viewed: list[0], index: 0, isViewingOther: false });
  });
  it("is empty with no versions", () => {
    expect(resolveViewedVersion([], null, null)).toEqual({ viewed: null, index: -1, isViewingOther: false });
  });
  it("counts any version as other when there is no active one", () => {
    expect(resolveViewedVersion(list, null, "v2").isViewingOther).toBe(true);
  });
});

describe("stepVersionId", () => {
  it("+1 goes older, -1 goes newer", () => {
    expect(stepVersionId(list, "v2", 1)).toBe("v1");
    expect(stepVersionId(list, "v2", -1)).toBe("v3");
  });
  it("stops at the ends", () => {
    expect(stepVersionId(list, "v1", 1)).toBeNull();
    expect(stepVersionId(list, "v3", -1)).toBeNull();
  });
  it("starts at the newest when nothing is on screen", () => {
    expect(stepVersionId(list, null, 1)).toBe("v3");
    expect(stepVersionId([], null, 1)).toBeNull();
  });
});

describe("nextViewedId", () => {
  it("viewing the active version means following it", () => {
    expect(nextViewedId("v3", "v3")).toBeNull();
    expect(nextViewedId("v3", "v1")).toBe("v1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/versions/viewing.test.ts`
Expected: FAIL — cannot resolve `./viewing`.

- [ ] **Step 3: Write the library**

```ts
// src/lib/versions/viewing.ts
// D383 — which version a focus view shows. `viewedId === null` means "follow the active
// version", so a restore (which makes the viewed version active) needs no special case.

type HasId = { id: string };

export function resolveViewedVersion<V extends HasId>(
  versions: V[],
  activeId: string | null,
  viewedId: string | null,
): { viewed: V | null; index: number; isViewingOther: boolean } {
  const viewed =
    (viewedId ? versions.find((v) => v.id === viewedId) : undefined) ??
    (activeId ? versions.find((v) => v.id === activeId) : undefined) ??
    null;
  return {
    viewed,
    index: viewed ? versions.indexOf(viewed) : -1,
    isViewingOther: viewed !== null && viewed.id !== activeId,
  };
}

/** Versions are newest first, so +1 steps to an older version and -1 to a newer one. */
export function stepVersionId<V extends HasId>(versions: V[], fromId: string | null, delta: 1 | -1): string | null {
  if (versions.length === 0) return null;
  const from = fromId ? versions.findIndex((v) => v.id === fromId) : -1;
  if (from === -1) return versions[0].id;
  const to = from + delta;
  return to >= 0 && to < versions.length ? versions[to].id : null;
}

export function nextViewedId(activeId: string | null, targetId: string): string | null {
  return targetId === activeId ? null : targetId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/versions/viewing.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the hook**

```ts
// src/hooks/use-version-viewing.ts
"use client";

import { useState } from "react";
import { nextViewedId, resolveViewedVersion, stepVersionId } from "@/lib/versions/viewing";

export type VersionViewing<V> = {
  viewed: V | null;
  index: number;
  total: number;
  isViewingOther: boolean;
  view: (id: string) => void;
  step: (delta: 1 | -1) => void;
  backToActive: () => void;
};

/**
 * D383 — the version a focus view shows. Local, never written anywhere. Resets when the view
 * closes and when the viewed version becomes active (a restore). `onLeaveActive` runs whenever the
 * view moves off the active version, so a caller can switch off modes that act on the active
 * output (annotate, edit, change voice).
 *
 * `useState` + compare-during-render, not an effect or a ref read: the same idiom
 * VersionHistoryList used for its expanded set (react-hooks/refs forbids reading refs in render).
 */
export function useVersionViewing<V extends { id: string }>(
  versions: V[],
  activeVersionId: string | null,
  open: boolean,
  onLeaveActive?: () => void,
): VersionViewing<V> {
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [seen, setSeen] = useState({ open, activeVersionId });
  if (seen.open !== open || seen.activeVersionId !== activeVersionId) {
    setSeen({ open, activeVersionId });
    if (!open || activeVersionId === viewedId) setViewedId(null);
  }

  const { viewed, index, isViewingOther } = resolveViewedVersion(versions, activeVersionId, viewedId);

  function view(id: string) {
    const next = nextViewedId(activeVersionId, id);
    if (next !== null) onLeaveActive?.();
    setViewedId(next);
  }

  return {
    viewed,
    index,
    total: versions.length,
    isViewingOther,
    view,
    step: (delta) => {
      const id = stepVersionId(versions, viewed?.id ?? null, delta);
      if (id) view(id);
    },
    backToActive: () => setViewedId(null),
  };
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/versions/viewing.ts src/lib/versions/viewing.test.ts src/hooks/use-version-viewing.ts
git commit -m "feat(versions): viewing state for focus views (D383)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Shared viewing UI and the shared version list

**Files:**
- Create: `src/components/nodes/version-thumb.tsx`
- Create: `src/components/nodes/version-viewing-bar.tsx`
- Create: `src/components/nodes/version-stepper.tsx`
- Create: `src/components/nodes/version-output-empty.tsx`
- Create: `src/components/nodes/active-only-notice.tsx`
- Create: `src/components/nodes/version-list.tsx`
- Test: `src/components/nodes/__tests__/version-viewing-ui.test.tsx`

**Interfaces:**
- Consumes: `stepVersionId` (Task 2), `formatRelativeTime` (`src/lib/format/relative-time.ts`), `ApprovalStatusIcon`, `VersionDecisionThread`.
- Produces:
  - `VersionThumb({ kind: "image" | "video" | "text"; src?: string | null })`, `VersionFailedThumb()`
  - `VersionViewingBar({ viewedLabel: string; viewedCreatedAt: string; activeLabel: string | null; canRestore: boolean; restoring: boolean; onBack(): void; onRestore(): void })`
  - `VersionStepper({ index: number; total: number; onStep(delta: 1 | -1): void })`
  - `VersionOutputEmpty({ noun: string })`
  - `ActiveOnlyNotice({ label: string })`
  - `type VersionRow = { id; createdAt; error: string | null; approvalStatus?: ApprovalStatus; makerName?: string | null; decisions?: VersionDecisionSummary[]; thumb?: ReactNode; summary?: string; meta?: ReactNode }`
  - `VersionList({ rows: VersionRow[]; activeVersionId: string | null; viewedVersionId: string | null; onView(id: string): void; hideHeader?: boolean })`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/nodes/__tests__/version-viewing-ui.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VersionViewingBar } from "../version-viewing-bar";
import { VersionStepper } from "../version-stepper";
import { VersionOutputEmpty } from "../version-output-empty";
import { ActiveOnlyNotice } from "../active-only-notice";
import { VersionList } from "../version-list";

// No DOM environment in this repo: render to static markup and read text and attributes.
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const now = new Date().toISOString();

describe("VersionViewingBar", () => {
  const base = { viewedLabel: "v3", viewedCreatedAt: now, activeLabel: "v6", canRestore: true, restoring: false, onBack: vi.fn(), onRestore: vi.fn() };
  it("names the viewed and the active version, with Back and Restore", () => {
    const t = text(renderToStaticMarkup(<VersionViewingBar {...base} />));
    expect(t).toContain("Viewing v3, made just now. The node still uses v6.");
    expect(t).toContain("Back to v6");
    expect(t).toContain("Restore v3");
  });
  it("hides Restore for a version that cannot be restored", () => {
    expect(text(renderToStaticMarkup(<VersionViewingBar {...base} canRestore={false} />))).not.toContain("Restore");
  });
  it("says only Back when the node has no active version", () => {
    const t = text(renderToStaticMarkup(<VersionViewingBar {...base} activeLabel={null} />));
    expect(t).not.toContain("still uses");
    expect(t).toContain("Back");
  });
});

describe("VersionStepper", () => {
  it("labels the position and disables the ends", () => {
    const html = renderToStaticMarkup(<VersionStepper index={0} total={3} onStep={vi.fn()} />);
    expect(text(html)).toContain("v3 of 3");
    expect(html).toMatch(/aria-label="Newer version"[^>]*disabled|disabled[^>]*aria-label="Newer version"/);
  });
  it("renders nothing with no versions", () => {
    expect(renderToStaticMarkup(<VersionStepper index={-1} total={0} onStep={vi.fn()} />)).toBe("");
  });
});

describe("VersionOutputEmpty and ActiveOnlyNotice", () => {
  it("use the agreed copy", () => {
    expect(text(renderToStaticMarkup(<VersionOutputEmpty noun="video" />))).toContain("No video from this attempt");
    expect(text(renderToStaticMarkup(<ActiveOnlyNotice label="v3" />))).toBe("You're viewing v3. Restore it to review or change it.");
  });
});

describe("VersionList", () => {
  const rows = [
    { id: "c", createdAt: now, error: null, summary: "Kling 2.1" },
    { id: "b", createdAt: now, error: "boom" },
    { id: "a", createdAt: now, error: null },
  ];
  it("marks the viewed row selected, the active row Active, and never offers Restore", () => {
    const html = renderToStaticMarkup(<VersionList rows={rows} activeVersionId="c" viewedVersionId="a" onView={vi.fn()} />);
    expect(html).toMatch(/aria-selected="true"[^>]*>[\s\S]*?v1/);
    expect(text(html)).toContain("Active");
    expect(text(html)).toContain("Failed");
    expect(text(html)).not.toContain("Restore");
  });
  it("opens the active row when nothing else is viewed", () => {
    const html = renderToStaticMarkup(<VersionList rows={rows} activeVersionId="c" viewedVersionId={null} onView={vi.fn()} />);
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx`
Expected: FAIL — cannot resolve `../version-viewing-bar`.

- [ ] **Step 3: Write `version-thumb.tsx`**

```tsx
"use client";

import { FileText, Play, XCircle } from "lucide-react";

/**
 * D383 — a version's thumbnail at its real shape: 48px tall, width from the media (capped at
 * 80px). Prompt versions get a text tile. Videos show a poster frame and a small play mark.
 */
export function VersionThumb({ kind, src }: { kind: "image" | "video" | "text"; src?: string | null }) {
  if (kind === "text" || !src) {
    return (
      <span className="flex h-12 w-10 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground">
        <FileText className="size-4" strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <span className="relative block h-12 overflow-hidden rounded-sm border border-border bg-muted">
      {kind === "video" ? (
        <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="h-12 w-auto max-w-20 object-contain" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-12 w-auto max-w-20 object-contain" />
      )}
      {kind === "video" && (
        <span className="absolute bottom-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-foreground/60">
          <Play className="size-2 text-background" strokeWidth={1.5} />
        </span>
      )}
    </span>
  );
}

export function VersionFailedThumb() {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-sm border border-dashed border-destructive/50 bg-destructive/5 text-destructive">
      <XCircle className="size-4" strokeWidth={1.5} />
    </span>
  );
}
```

- [ ] **Step 4: Write `version-viewing-bar.tsx`**

```tsx
"use client";

import { Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format/relative-time";

/** D383 — shown above the output while a version other than the active one is on screen. The
 *  only place Restore lives. */
export function VersionViewingBar({
  viewedLabel,
  viewedCreatedAt,
  activeLabel,
  canRestore,
  restoring,
  onBack,
  onRestore,
}: {
  viewedLabel: string;
  viewedCreatedAt: string;
  activeLabel: string | null;
  canRestore: boolean;
  restoring: boolean;
  onBack: () => void;
  onRestore: () => void;
}) {
  // One string, so the message is one text node (and one sentence for screen readers).
  const message =
    `Viewing ${viewedLabel}, made ${formatRelativeTime(viewedCreatedAt)}.` +
    (activeLabel ? ` The node still uses ${activeLabel}.` : "");
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/5 py-2 pl-3 pr-2 text-sm">
      <p className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-foreground/80">
        <Eye className="size-3.5 shrink-0 text-primary" strokeWidth={1.5} />
        <span>{message}</span>
      </p>
      <div className="flex shrink-0 gap-1.5">
        <Button type="button" variant="ghost" size="xs" onClick={onBack}>
          {activeLabel ? `Back to ${activeLabel}` : "Back"}
        </Button>
        {canRestore && (
          <Button type="button" size="xs" disabled={restoring} onClick={onRestore}>
            <RotateCcw strokeWidth={1.5} />
            {`Restore ${viewedLabel}`}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `version-stepper.tsx`, `version-output-empty.tsx`, `active-only-notice.tsx`**

```tsx
// src/components/nodes/version-stepper.tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** D383 — `‹ v3 of 6 ›` beside the output heading. Views, never restores. Newest first, so the
 *  left arrow goes to a newer version. Replaces the prompt nodes' v1/v2 chips. */
export function VersionStepper({ index, total, onStep }: { index: number; total: number; onStep: (delta: 1 | -1) => void }) {
  if (total === 0 || index < 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Newer version" disabled={index === 0} onClick={() => onStep(-1)}>
        <ChevronLeft strokeWidth={1.5} />
      </Button>
      <span className="min-w-16 text-center tabular-nums">{`v${total - index} of ${total}`}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Older version" disabled={index === total - 1} onClick={() => onStep(1)}>
        <ChevronRight strokeWidth={1.5} />
      </Button>
    </div>
  );
}
```

```tsx
// src/components/nodes/version-output-empty.tsx
import { XCircle } from "lucide-react";

/** D383 — the output column for a failed version. Never shows the raw error. */
export function VersionOutputEmpty({ noun }: { noun: string }) {
  return (
    <div className="flex size-full min-h-48 items-center justify-center rounded-xl border border-dashed border-border">
      <div className="px-8 text-center">
        <XCircle className="mx-auto size-8 text-destructive/60" strokeWidth={1.5} />
        <p className="mt-3 text-sm font-medium text-foreground">{`No ${noun} from this attempt`}</p>
        <p className="mt-1 text-xs text-muted-foreground">The generation did not finish.</p>
      </div>
    </div>
  );
}
```

```tsx
// src/components/nodes/active-only-notice.tsx
/** D383 — sits above controls that act on the active version while another is on screen. */
export function ActiveOnlyNotice({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground">{`You're viewing ${label}. Restore it to review or change it.`}</p>;
}
```

- [ ] **Step 6: Write `version-list.tsx`**

```tsx
"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { stepVersionId } from "@/lib/versions/viewing";
import { ApprovalStatusIcon } from "@/components/review/approval-status-icon";
import { VersionDecisionThread } from "./version-decision-history";
import { VersionFailedThumb } from "./version-thumb";
import type { ApprovalStatus, VersionDecisionSummary } from "@/lib/approval";

// D180 + D383: ONE version list for every node type. A row click VIEWS the version (the output
// column shows it); restoring happens only in the viewing bar. Each node type supplies only its
// thumbnail, one summary line and its expanded metadata.
export type VersionRow = {
  id: string;
  createdAt: string;
  error: string | null;
  approvalStatus?: ApprovalStatus;
  makerName?: string | null;
  decisions?: VersionDecisionSummary[];
  thumb?: ReactNode;
  /** One line under the label, e.g. the model. */
  summary?: string;
  /** Shown when the row is open (it is the version on screen). */
  meta?: ReactNode;
};

export function VersionList({
  rows,
  activeVersionId,
  viewedVersionId,
  onView,
  hideHeader = false,
}: {
  rows: VersionRow[];
  activeVersionId: string | null;
  viewedVersionId: string | null;
  onView: (id: string) => void;
  hideHeader?: boolean;
}) {
  const total = rows.length;
  if (total === 0) return null;
  // The row on screen: the viewed one, else the active one.
  const openId = viewedVersionId ?? activeVersionId;

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const next = stepVersionId(rows, openId, e.key === "ArrowDown" ? 1 : -1);
    if (!next) return;
    e.preventDefault();
    onView(next);
    // Roving focus: the row just opened becomes the tab stop.
    e.currentTarget.querySelectorAll<HTMLElement>("[data-version-row]")[rows.findIndex((r) => r.id === next)]?.focus();
  }

  return (
    <div>
      {!hideHeader && (
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <History className="size-3.5 text-primary" strokeWidth={1.5} />
            <span className="text-eyebrow">History</span>
          </div>
          <span className="text-xs text-muted-foreground">{`${total} generation${total !== 1 ? "s" : ""}`}</span>
        </div>
      )}
      <ul role="listbox" aria-label="Versions" onKeyDown={onKeyDown} className="space-y-1.5 pb-2">
        {rows.map((row, i) => {
          const isActive = row.id === activeVersionId;
          const isOpen = row.id === openId;
          const isError = Boolean(row.error);
          return (
            <li
              key={row.id}
              className={cn(
                "overflow-hidden rounded-lg border transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                isOpen ? "border-primary/30 bg-primary/5" : "border-border",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                role="option"
                aria-selected={isOpen}
                tabIndex={isOpen ? 0 : -1}
                data-version-row=""
                onClick={() => onView(row.id)}
                className="flex h-auto w-full items-center gap-3 rounded-none border-0 px-2 py-2 text-left font-normal whitespace-normal hover:bg-muted/60 dark:hover:bg-muted/60"
              >
                <span className="flex h-12 w-20 shrink-0 items-center justify-center">
                  {isError ? <VersionFailedThumb /> : row.thumb}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium", isOpen ? "text-primary" : "text-foreground")}>{`v${total - i}`}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(row.createdAt)}</span>
                  </span>
                  {row.summary && <span className="truncate text-xs text-muted-foreground">{row.summary}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {isError ? (
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-destructive">Failed</span>
                  ) : (
                    <ApprovalStatusIcon status={row.approvalStatus} />
                  )}
                  {isActive ? (
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">Active</span>
                  ) : isOpen ? (
                    <span className="text-[0.65rem] font-medium text-primary">Viewing</span>
                  ) : null}
                </span>
              </Button>
              {isOpen && (
                <div className="border-t border-border px-3 py-2">
                  {row.meta}
                  {row.makerName !== undefined && (
                    <p className="mt-0.5 text-[0.65rem] leading-snug text-muted-foreground/80">
                      {`Made by ${row.makerName ?? "an unknown maker"}`}
                    </p>
                  )}
                  <VersionDecisionThread decisions={row.decisions ?? []} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx`
Expected: PASS. If the `VersionStepper` disabled regex fails because Base UI renders `disabled=""` before `aria-label`, it is covered by the alternation; if Base UI renders `data-disabled` instead, change the assertion to `/aria-label="Newer version"[^>]*(disabled|data-disabled)/` — check the actual markup with `console.log(html)` first.

- [ ] **Step 8: Lint and typecheck**

Run: `npx eslint src/components/nodes/version-*.tsx src/components/nodes/active-only-notice.tsx && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/components/nodes/version-thumb.tsx src/components/nodes/version-viewing-bar.tsx src/components/nodes/version-stepper.tsx src/components/nodes/version-output-empty.tsx src/components/nodes/active-only-notice.tsx src/components/nodes/version-list.tsx src/components/nodes/__tests__/version-viewing-ui.test.tsx
git commit -m "feat(versions): shared version list, viewing bar and stepper (D383)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Video Gen focus view

**Files:**
- Modify: `src/components/nodes/video-gen-version-history.tsx`
- Modify: `src/components/nodes/video-gen-focus-view.tsx`
- Test: `src/components/nodes/__tests__/version-viewing-ui.test.tsx` (append)

**Interfaces:**
- Consumes: `useVersionViewing` (Task 2); `VersionList`, `VersionThumb`, `VersionViewingBar`, `VersionStepper`, `VersionOutputEmpty`, `ActiveOnlyNotice` (Task 3).
- Produces: `VideoGenVersionHistory({ versions, activeVersionId, viewedVersionId: string | null, onView(id): void, hideHeader? })` — `onRestore`/`restoring` are removed.

- [ ] **Step 1: Append the failing test**

```tsx
// append to src/components/nodes/__tests__/version-viewing-ui.test.tsx
import { VideoGenVersionHistory } from "../video-gen-version-history";

describe("VideoGenVersionHistory", () => {
  it("renders through the shared list with a real-shape video thumb", () => {
    const versions = [
      { id: "b", output: "https://x/b.mp4", error: null, paramsUsed: {}, createdAt: now, modelUsed: "kling:Kling 2.1" },
      { id: "a", output: "https://x/a.mp4", error: null, paramsUsed: {}, createdAt: now, modelUsed: "kling:Kling 2.1" },
    ];
    const html = renderToStaticMarkup(
      <VideoGenVersionHistory versions={versions} activeVersionId="b" viewedVersionId="a" onView={vi.fn()} />,
    );
    expect(html).toContain('role="listbox"');
    expect(html).toContain("h-12 w-auto max-w-20 object-contain");
    expect(text(html)).toContain("Kling 2.1");
    expect(text(html)).not.toContain("Restore");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx -t VideoGenVersionHistory`
Expected: FAIL — TypeScript/props mismatch or `role="listbox"` not found (old list).

- [ ] **Step 3: Rewrite the adapter's props and render**

In `src/components/nodes/video-gen-version-history.tsx`:

Replace the imports line `import { VersionHistoryList } from "./version-history-list";` with:

```tsx
import { VersionList } from "./version-list";
import { VersionThumb } from "./version-thumb";
```

Replace the `Props` type and the function signature with:

```tsx
type Props = {
  versions: VideoGenVersionSummary[];
  activeVersionId: string | null;
  viewedVersionId: string | null;
  onView: (versionId: string) => void;
  hideHeader?: boolean;
};

// D180/D383: the row shell lives in VersionList. This file supplies only what is specific to a
// video version: the thumbnail, the summary line and the generation metadata.
export function VideoGenVersionHistory({ versions, activeVersionId, viewedVersionId, onView, hideHeader = false }: Props) {
```

In the `rows` map, replace the `thumb: v.output ? ( … ) : undefined,` property with:

```tsx
      thumb: v.output ? <VersionThumb kind="video" src={v.output} /> : undefined,
      summary: voiceChange ? voiceChange.title : modelLabel || undefined,
```

Replace the final `return ( <VersionHistoryList … /> );` with:

```tsx
  return (
    <VersionList
      rows={rows}
      activeVersionId={activeVersionId}
      viewedVersionId={viewedVersionId}
      onView={onView}
      hideHeader={hideHeader}
    />
  );
```

- [ ] **Step 4: Wire viewing into the focus view — state**

In `src/components/nodes/video-gen-focus-view.tsx`, add imports next to the other `./` imports:

```tsx
import { useVersionViewing } from "@/hooks/use-version-viewing";
import { VersionViewingBar } from "./version-viewing-bar";
import { VersionStepper } from "./version-stepper";
import { VersionOutputEmpty } from "./version-output-empty";
import { ActiveOnlyNotice } from "./active-only-notice";
```

Directly after the line `const [restoring, setRestoring] = useState(false);` (≈ line 566) add:

```tsx
  // D383 — which version the output column shows. Moving off the active version switches off
  // the modes that act on the active output.
  const viewing = useVersionViewing(versions, activeVersionId, open, () => {
    setReviewAnnotating(false);
    setChangeVoiceOpen(false);
    setCapturedFrame(null);
    setOpenTimecode(null);
  });
```

Directly after `const activeVoice = readVoiceMeta(activeVersion?.paramsUsed?.voice);` (≈ line 1348) add:

```tsx
  const labelById = versionLabelsById(versions);
  const viewed = viewing.viewed;
  const viewedLabel = viewed ? labelById.get(viewed.id) ?? "" : "";
  const activeLabel = activeVersionId ? labelById.get(activeVersionId) ?? null : null;
```

- [ ] **Step 5: Wire the History pane**

Replace:

```tsx
                    <VideoGenVersionHistory
                      versions={versions}
                      activeVersionId={activeVersionId}
                      onRestore={handleRestoreVersion}
                      restoring={restoring}
                    />
```

with:

```tsx
                    <VideoGenVersionHistory
                      versions={versions}
                      activeVersionId={activeVersionId}
                      viewedVersionId={viewed?.id ?? null}
                      onView={viewing.view}
                    />
```

- [ ] **Step 6: Wire the Details review controls**

In the Details `Review` section, inside `<div className="flex flex-col gap-3">` directly above `<InlineApprovalBar`, add:

```tsx
                        {viewing.isViewingOther && <ActiveOnlyNotice label={viewedLabel} />}
```

On that `InlineApprovalBar`, change `canApprove={identity?.role === "senior"}` to:

```tsx
                          canApprove={identity?.role === "senior" && !viewing.isViewingOther}
```

and change the start of `onToggleAnnotate={ videoUrl ? () => {` to `onToggleAnnotate={ videoUrl && !viewing.isViewingOther ? () => {` (the rest of the block is unchanged).

- [ ] **Step 7: Wire "Sent to model"**

Replace `) : activeVersion ? (` / `<VideoGenRequestPanel version={activeVersion} labelById={versionLabelsById(versions)} />` with:

```tsx
                ) : viewed ? (
                  <VideoGenRequestPanel version={viewed} labelById={labelById} />
```

- [ ] **Step 8: Wire the output column header, bar and media**

In the right column header row (`<div className="flex items-center gap-6">` that holds the `Video` eyebrow), add as its last child, after the `VideoGenChangeVoiceToggle` block:

```tsx
                {!loadingVersions && (
                  <div className="ml-auto">
                    <VersionStepper index={viewing.index} total={viewing.total} onStep={viewing.step} />
                  </div>
                )}
```

On `VideoGenChangeVoiceToggle`, change `disabled={!editable || (isGenerating && !isChangingVoice)}` to:

```tsx
                    disabled={!editable || (isGenerating && !isChangingVoice) || viewing.isViewingOther}
```

Directly after that header row's closing `</div>` (before `<div className="min-h-0 flex-1">`) add:

```tsx
              {viewing.isViewingOther && viewed && (
                <VersionViewingBar
                  viewedLabel={viewedLabel}
                  viewedCreatedAt={viewed.createdAt}
                  activeLabel={activeLabel}
                  canRestore={editable && !viewed.error && Boolean(viewed.output)}
                  restoring={restoring}
                  onBack={viewing.backToActive}
                  onRestore={() => void handleRestoreVersion(viewed.id)}
                />
              )}
```

Inside `<div className="min-h-0 flex-1">`, the content is currently `<> {mode === "skeleton" && …} … </>`. Wrap that fragment:

```tsx
              <div className="min-h-0 flex-1">
                {viewing.isViewingOther && viewed ? (
                  viewed.output ? (
                    // Plain playback of the viewed take: annotations, markers and the voice
                    // workspace belong to the active version only.
                    <video
                      key={viewed.id}
                      src={viewed.output}
                      controls
                      playsInline
                      className="h-full w-auto max-w-full rounded-xl border border-border bg-muted/20"
                    />
                  ) : (
                    <VersionOutputEmpty noun="video" />
                  )
                ) : (
                  <>
                    {/* …the existing mode === "skeleton" / "empty" / "result" blocks, unchanged… */}
                  </>
                )}
              </div>
```

(Move the existing fragment's children inside the new `<>…</>` without editing them.)

- [ ] **Step 9: Run tests, lint, typecheck**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx && npx eslint src/components/nodes/video-gen-version-history.tsx src/components/nodes/video-gen-focus-view.tsx && npx tsc --noEmit`
Expected: PASS, clean. (`restoring` is still used by the bar; `activeVersion` is still used by `activeVoice` and the review derivations.)

- [ ] **Step 10: Manual check**

Run `npm run dev`, open a canvas with a Video Gen node that has 2+ versions, open its focus view → History. Click an older row: the output column shows it, the bar reads "Viewing v1, made …. The node still uses v2.", the card on the canvas does not change, and nothing autosaves (no "Saving…" indicator). Press Restore: the bar disappears and the card updates. Press ↑/↓ in the list and the arrows in the header: the view steps.

- [ ] **Step 11: Commit**

```bash
git add src/components/nodes/video-gen-version-history.tsx src/components/nodes/video-gen-focus-view.tsx src/components/nodes/__tests__/version-viewing-ui.test.tsx
git commit -m "feat(video-gen): view any version without restoring it (D383)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Image Gen and Composite focus views

Both use `ImageGenVersionHistory`, so they move together.

**Files:**
- Modify: `src/components/nodes/image-gen-version-history.tsx`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`
- Modify: `src/components/nodes/composite-focus-view.tsx`
- Modify: `src/components/nodes/composite-output-pane.tsx`
- Test: `src/components/nodes/__tests__/version-viewing-ui.test.tsx` (append)

**Interfaces:**
- Consumes: Task 2 and Task 3 exports; `versionLabelsById` (`src/lib/generations/version-labels.ts`).
- Produces: `ImageGenVersionHistory({ versions, activeVersionId, viewedVersionId: string | null, onView(id): void })`; `CompositeOutputPane` gains `stepper?: ReactNode; banner?: ReactNode; viewingFailed?: boolean`.

- [ ] **Step 1: Append the failing test**

```tsx
import { ImageGenVersionHistory } from "../image-gen-version-history";

describe("ImageGenVersionHistory", () => {
  it("renders through the shared list with a real-shape image thumb", () => {
    const versions = [
      { id: "b", output: "https://x/b.png", error: null, paramsUsed: { modelId: "openai:GPT Image" }, createdAt: now, decision: null, note: null },
      { id: "a", output: null, error: "x", paramsUsed: {}, createdAt: now, decision: null, note: null },
    ];
    const html = renderToStaticMarkup(
      <ImageGenVersionHistory versions={versions} activeVersionId="b" viewedVersionId={null} onView={vi.fn()} />,
    );
    expect(html).toContain('role="listbox"');
    expect(html).toContain('<img src="https://x/b.png"');
    expect(text(html)).toContain("GPT Image");
    expect(text(html)).toContain("Failed");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx -t ImageGenVersionHistory`
Expected: FAIL.

- [ ] **Step 3: Rewrite the adapter**

In `src/components/nodes/image-gen-version-history.tsx`: replace `import { VersionHistoryList } from "./version-history-list";` with

```tsx
import { VersionList } from "./version-list";
import { VersionThumb } from "./version-thumb";
```

Replace `type Props` and the signature:

```tsx
type Props = {
  versions: ImageGenVersionSummary[];
  activeVersionId: string | null;
  viewedVersionId: string | null;
  onView: (versionId: string) => void;
};

// D180/D383: the row shell lives in VersionList. This file supplies only what is specific to an
// image version: the thumbnail, the summary line and the generation metadata.
export function ImageGenVersionHistory({ versions, activeVersionId, viewedVersionId, onView }: Props) {
```

In the rows map replace the `thumb: v.output ? ( … ) : undefined,` property with:

```tsx
      thumb: v.output ? <VersionThumb kind="image" src={v.output} /> : undefined,
      summary: modelLabel || undefined,
```

Replace the final return with:

```tsx
  return <VersionList rows={rows} activeVersionId={activeVersionId} viewedVersionId={viewedVersionId} onView={onView} />;
```

- [ ] **Step 4: Image Gen focus view — state and labels**

In `src/components/nodes/image-gen-focus-view.tsx` add the same five imports as Task 4 Step 4, plus `import { versionLabelsById } from "@/lib/generations/version-labels";` if not already imported.

After `const [restoring, setRestoring] = useState(false);` (≈ line 243) add:

```tsx
  // D383 — which version the output column shows. Leaving the active version ends annotate and
  // Edit, which act on the active image.
  const viewing = useVersionViewing(versions, activeVersionId, open, () => {
    setReviewAnnotating(false);
    setActiveTab("generate");
  });
```

If `setReviewAnnotating` or `setActiveTab` are declared below this line, place the `useVersionViewing` call directly after the later of the two declarations instead (hooks order is unchanged either way).

After the `const mode: … = generating ? … : "empty";` block (≈ line 620) add:

```tsx
  const labelById = versionLabelsById(versions);
  const viewed = viewing.viewed;
  const viewedLabel = viewed ? labelById.get(viewed.id) ?? "" : "";
  const activeLabel = activeVersionId ? labelById.get(activeVersionId) ?? null : null;
```

- [ ] **Step 5: Image Gen — History, Details, Edit switch**

Replace the `ImageGenVersionHistory` usage (`onRestore={handleRestoreVersion} restoring={restoring}`) with:

```tsx
                    <ImageGenVersionHistory
                      versions={versions}
                      activeVersionId={activeVersionId}
                      viewedVersionId={viewed?.id ?? null}
                      onView={viewing.view}
                    />
```

In Details → Review, directly above its `<InlineApprovalBar` add `{viewing.isViewingOther && <ActiveOnlyNotice label={viewedLabel} />}`; change `canApprove={identity?.role === "senior"}` to `canApprove={identity?.role === "senior" && !viewing.isViewingOther}`; change `imageUrl ? () => setReviewAnnotating((v) => !v) : undefined` to `imageUrl && !viewing.isViewingOther ? () => setReviewAnnotating((v) => !v) : undefined`.

On the Edit `<Switch id={`image-edit-mode-${nodeId}`}` add the prop `disabled={viewing.isViewingOther}`.

- [ ] **Step 6: Image Gen — output column**

In the right column header row (`<div className="flex items-center gap-6">` holding the "Generated image" eyebrow) add as the last child:

```tsx
                {!loadingVersions && (
                  <div className="ml-auto">
                    <VersionStepper index={viewing.index} total={viewing.total} onStep={viewing.step} />
                  </div>
                )}
```

After that header row's closing `</div>` add the bar:

```tsx
              {viewing.isViewingOther && viewed && (
                <VersionViewingBar
                  viewedLabel={viewedLabel}
                  viewedCreatedAt={viewed.createdAt}
                  activeLabel={activeLabel}
                  canRestore={editable && !viewed.error && Boolean(viewed.output)}
                  restoring={restoring}
                  onBack={viewing.backToActive}
                  onRestore={() => void handleRestoreVersion(viewed.id)}
                />
              )}
```

(`editable` is already in scope in this view; if it is named differently, use the existing `useCanvasEditable()` value.)

Inside `<div className="min-h-0 flex-1">` the content is one expression `{activeTab === "edit" && editBaseUrl && !editing ? ( … ) : ( <> … </> )}`. Wrap it:

```tsx
              <div className="min-h-0 flex-1">
                {viewing.isViewingOther && viewed ? (
                  viewed.output ? (
                    <div className="relative h-full w-fit max-w-full overflow-hidden rounded-xl border border-border bg-muted/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={viewed.output} alt={`${title || "Generated image"}, ${viewedLabel}`} className="h-full w-auto max-w-full object-contain" />
                    </div>
                  ) : (
                    <VersionOutputEmpty noun="image" />
                  )
                ) : (
                  /* the existing activeTab === "edit" … expression, unchanged */
                )}
              </div>
```

- [ ] **Step 7: Composite output pane props**

In `src/components/nodes/composite-output-pane.tsx`: add `import type { ReactNode, Ref } from "react";` (replacing the existing `import type { Ref } from "react";`) and `import { VersionOutputEmpty } from "./version-output-empty";`. Add to `Props`:

```tsx
  /** D383 — the version stepper, beside the heading. */
  stepper?: ReactNode;
  /** D383 — the viewing bar, under the heading. */
  banner?: ReactNode;
  /** D383 — the version on screen failed. */
  viewingFailed?: boolean;
```

Add `stepper, banner, viewingFailed` to the destructured parameters. In the header row add `{stepper && <div className="ml-auto">{stepper}</div>}` as the last child. After the header row add `{banner}`. Make the body's first branch:

```tsx
        {viewingFailed ? (
          <VersionOutputEmpty noun="image" />
        ) : generating ? (
```

(the rest of the chain unchanged).

- [ ] **Step 8: Composite focus view**

In `src/components/nodes/composite-focus-view.tsx` add imports: `useVersionViewing`, `VersionViewingBar`, `VersionStepper`, `ActiveOnlyNotice`, and `versionLabelsById`. After the `useCompositeVersions(...)` line add:

```tsx
  // D383 — the version on screen. Leaving the active one ends Edit, which acts on it.
  const viewing = useVersionViewing(versions, activeVersionId, open, () => setEditMode(false));
  const labelById = versionLabelsById(versions);
  const viewed = viewing.viewed;
  const viewedLabel = viewed ? labelById.get(viewed.id) ?? "" : "";
  const shownImageUrl = viewing.isViewingOther ? viewed?.output ?? null : imageUrl;
```

Change `const canEditPicture = Boolean(imageUrl && activeVersionId);` to:

```tsx
  const canEditPicture = Boolean(imageUrl && activeVersionId) && !viewing.isViewingOther;
```

Replace the History `ImageGenVersionHistory` usage with:

```tsx
                    <ImageGenVersionHistory versions={versions} activeVersionId={activeVersionId} viewedVersionId={viewed?.id ?? null} onView={viewing.view} />
```

In the compose branch (`selected !== "history"`), directly inside `<div className="flex flex-col gap-6 px-6 py-5">` add as the first child: `{viewing.isViewingOther && <ActiveOnlyNotice label={viewedLabel} />}`. On `ImageGenOutputSettingsBody` change `generating={generating}` to `generating={generating || viewing.isViewingOther}` so Generate is unavailable while viewing another version.

Change the `CompositeOutputPane` usage: `imageUrl={shownImageUrl}` and add:

```tsx
              stepper={loading ? null : <VersionStepper index={viewing.index} total={viewing.total} onStep={viewing.step} />}
              banner={
                viewing.isViewingOther && viewed ? (
                  <VersionViewingBar
                    viewedLabel={viewedLabel}
                    viewedCreatedAt={viewed.createdAt}
                    activeLabel={activeVersionId ? labelById.get(activeVersionId) ?? null : null}
                    canRestore={editable && !viewed.error && Boolean(viewed.output)}
                    restoring={restoring}
                    onBack={viewing.backToActive}
                    onRestore={() => void restore(viewed.id)}
                  />
                ) : null
              }
              viewingFailed={viewing.isViewingOther && !viewed?.output}
```

- [ ] **Step 9: Run tests, lint, typecheck**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx && npx eslint src/components/nodes/image-gen-version-history.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/composite-focus-view.tsx src/components/nodes/composite-output-pane.tsx && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 10: Manual check**

Same as Task 4 Step 10, on an Image Gen node and a Composite node. Also: with an older version on screen, the Edit switch is disabled and the Review section shows "You're viewing v1. Restore it to review or change it."

- [ ] **Step 11: Commit**

```bash
git add src/components/nodes/image-gen-version-history.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/composite-focus-view.tsx src/components/nodes/composite-output-pane.tsx src/components/nodes/__tests__/version-viewing-ui.test.tsx
git commit -m "feat(image-gen,composite): view any version without restoring it (D383)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Dubbing focus view

**Files:**
- Modify: `src/components/nodes/dubbing-version-history.tsx`
- Modify: `src/components/nodes/dubbing-player.tsx`
- Modify: `src/components/nodes/dubbing-focus-view.tsx`
- Test: `src/components/nodes/__tests__/version-viewing-ui.test.tsx` (append)

**Interfaces:**
- Consumes: Tasks 2–3; `stageUrl`, `furthestStage`, `dubLanguageLabel`, `dubStyleLabel`, `dubVoiceLabel` from `@/lib/dubbing/types`.
- Produces: `DubbingVersionHistory({ versions, activeVersionId, viewedVersionId: string | null, onView(id): void })`; `DubbingPlayer` gains `stepper?: ReactNode; banner?: ReactNode; failed?: boolean`.

- [ ] **Step 1: Append the failing test**

```tsx
import { DubbingVersionHistory } from "../dubbing-version-history";

describe("DubbingVersionHistory", () => {
  it("views on click (shared list) and keeps the three stage marks in the open row", () => {
    const versions = [
      { id: "b", createdAt: now, error: null, lipSyncRuns: 0, creditsCharged: null, dubbing: { language: "hi-IN" as const, original: "https://x/o.mp4", dubbed: "https://x/d.mp4", dubbedAudio: "a", lipSynced: null } },
    ];
    const html = renderToStaticMarkup(<DubbingVersionHistory versions={versions} activeVersionId="b" viewedVersionId={null} onView={vi.fn()} />);
    expect(html).toContain('role="listbox"');
    expect(html).toContain("https://x/d.mp4#t=0.1");
    expect(text(html)).toContain("Lip-synced");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx -t DubbingVersionHistory`
Expected: FAIL.

- [ ] **Step 3: Rewrite `dubbing-version-history.tsx`**

```tsx
"use client";

import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { dubLanguageLabel, dubStyleLabel, dubVoiceLabel, furthestStage, stageUrl } from "@/lib/dubbing/types";
import type { DubbingVersionSummary } from "@/hooks/use-dubbing-versions";
import { VersionList } from "./version-list";
import { VersionThumb } from "./version-thumb";

function Step({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? Check : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", done ? "text-foreground" : "text-muted-foreground")}>
      <Icon className="size-3" strokeWidth={1.5} />
      {label}
    </span>
  );
}

// D375 + D383 — newest first, on the shared list: a click views the dub, Restore lives in the bar.
export function DubbingVersionHistory({ versions, activeVersionId, viewedVersionId, onView }: {
  versions: DubbingVersionSummary[];
  activeVersionId: string | null;
  viewedVersionId: string | null;
  onView: (id: string) => void;
}) {
  const rows = versions.map((v) => {
    const d = v.dubbing;
    const summary = d
      ? [`${dubLanguageLabel(d.language)} dub`, d.style ? dubStyleLabel(d.style) : null, d.voice ? dubVoiceLabel(d.voice) : null].filter(Boolean).join(" · ")
      : "Dub";
    return {
      id: v.id,
      createdAt: v.createdAt,
      error: v.error,
      thumb: d ? <VersionThumb kind="video" src={stageUrl(d, furthestStage(d))} /> : undefined,
      summary,
      meta: (
        <span className="flex gap-4">
          <Step done label="Original" />
          <Step done={Boolean(d?.dubbed)} label="Dubbed" />
          <Step done={Boolean(d?.lipSynced)} label="Lip-synced" />
        </span>
      ),
    };
  });
  return <VersionList rows={rows} activeVersionId={activeVersionId} viewedVersionId={viewedVersionId} onView={onView} />;
}
```

If `DubbingOutput` has no `style`/`voice` fields, the original file read them as `d.style` / `d.voice`, so they exist; keep the same accessors.

- [ ] **Step 4: `DubbingPlayer` props**

In `src/components/nodes/dubbing-player.tsx`: import `type ReactNode` from `react` and `VersionOutputEmpty` from `./version-output-empty`. Extend the props:

```tsx
export function DubbingPlayer({ dub, sourceUrl, workingLabel, stepper, banner, failed = false }: {
  dub: DubbingOutput | null;
  sourceUrl: string | null;
  /** "Dubbing into Tamil…" while a job runs, else null. */
  workingLabel: string | null;
  /** D383 — the version stepper and viewing bar, and whether the version on screen failed. */
  stepper?: ReactNode;
  banner?: ReactNode;
  failed?: boolean;
}) {
```

In the header row add `{stepper && <div className="ml-auto">{stepper}</div>}` as the last child; after the header row add `{banner}`; change the body's condition `{url ? (` to `{failed ? (<VersionOutputEmpty noun="dub" />) : url ? (`.

- [ ] **Step 5: Dubbing focus view**

In `src/components/nodes/dubbing-focus-view.tsx` add imports for `useVersionViewing`, `VersionViewingBar`, `VersionStepper`, `ActiveOnlyNotice`, `versionLabelsById`. After `const activeDub = active?.dubbing ?? null;` add:

```tsx
  // D383 — the dub on screen; the controls act on the active one only.
  const viewing = useVersionViewing(versions, activeVersionId, open);
  const labelById = versionLabelsById(versions);
  const viewed = viewing.viewed;
  const viewedLabel = viewed ? labelById.get(viewed.id) ?? "" : "";
  const shownDub = viewing.isViewingOther ? viewed?.dubbing ?? null : activeDub;
```

Replace the History usage with:

```tsx
                    <DubbingVersionHistory versions={versions} activeVersionId={activeVersionId} viewedVersionId={viewed?.id ?? null} onView={viewing.view} />
```

In the controls branch, wrap `<DubbingControls … />` as:

```tsx
                <>
                  {viewing.isViewingOther && (
                    <div className="px-6 pt-5">
                      <ActiveOnlyNotice label={viewedLabel} />
                    </div>
                  )}
                  <DubbingControls
                    /* …existing props… */
                    editable={editable && !viewing.isViewingOther}
                  />
                </>
```

(change only the `editable` prop; keep every other prop as is).

Replace the `DubbingPlayer` element with:

```tsx
            <DubbingPlayer
              key={`${viewed?.id ?? ""}|${shownDub?.dubbed ?? ""}|${shownDub?.lipSynced ?? ""}`}
              dub={shownDub}
              sourceUrl={source?.url ?? null}
              workingLabel={viewing.isViewingOther ? null : running === "dub" ? `Dubbing into ${dubLanguageLabel(lang)}…` : running === "lipsync" ? "Lip-syncing…" : null}
              stepper={loading ? null : <VersionStepper index={viewing.index} total={viewing.total} onStep={viewing.step} />}
              banner={
                viewing.isViewingOther && viewed ? (
                  <VersionViewingBar
                    viewedLabel={viewedLabel}
                    viewedCreatedAt={viewed.createdAt}
                    activeLabel={activeVersionId ? labelById.get(activeVersionId) ?? null : null}
                    canRestore={editable && !viewed.error && Boolean(viewed.dubbing)}
                    restoring={restoring}
                    onBack={viewing.backToActive}
                    onRestore={() => void restore(viewed.id)}
                  />
                ) : null
              }
              failed={viewing.isViewingOther && !viewed?.dubbing}
            />
```

- [ ] **Step 6: Run tests, lint, typecheck**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx src/components/nodes/__tests__/dubbing-controls.test.tsx && npx eslint src/components/nodes/dubbing-*.tsx && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Manual check**

On a Dubbing node with 2+ dubs: clicking an older dub no longer restores it; the player plays it under the bar; the Dub/Lip sync controls are disabled with the notice; Restore makes it active.

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/dubbing-version-history.tsx src/components/nodes/dubbing-player.tsx src/components/nodes/dubbing-focus-view.tsx src/components/nodes/__tests__/version-viewing-ui.test.tsx
git commit -m "feat(dubbing): shared history, view a dub without restoring it (D383)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Prompt shell, `PromptHistoryPane`, Video Prompt and Multishot Prompt

The shell's slots change, so both shell consumers move in this task.

**Files:**
- Modify: `src/components/nodes/prompt-version-history.tsx`
- Create: `src/components/nodes/prompt-history-pane.tsx`
- Modify: `src/components/nodes/prompt-focus-shell.tsx`
- Modify: `src/components/nodes/video-prompt-focus-view.tsx`
- Modify: `src/components/nodes/multishot-prompt-focus-view.tsx`
- Test: `src/components/nodes/__tests__/version-viewing-ui.test.tsx` (append)

**Interfaces:**
- Consumes: Tasks 2–3; `VersionViewing` type.
- Produces:
  - `PromptVersionHistory({ versions, activeVersionId, viewedVersionId: string | null, onView(id): void })`
  - `PromptHistoryPane({ versions: VersionSummary[]; activeVersionId: string | null; viewing: VersionViewing<VersionSummary>; outputLabel: string; outputIcon: ReactNode; renderVersionOutput(v: VersionSummary): ReactNode; canRestore: boolean; restoring: boolean; onRestore(id: string): void })`
  - `PromptFocusShellSlots = { versionStepper: ReactNode; viewingBar: ReactNode; viewedVersion: VersionSummary | null; isViewingOther: boolean; approvalControls: ReactNode }`
  - `PromptFocusShellProps` gains `outputLabel: string; outputIcon: ReactNode; renderVersionOutput(v: VersionSummary): ReactNode`.

- [ ] **Step 1: Append the failing test**

```tsx
import { PromptHistoryPane } from "../prompt-history-pane";

describe("PromptHistoryPane", () => {
  const versions = [
    { id: "b", output: "Push in on Riya.", error: null, paramsUsed: {}, createdAt: now, decision: null, note: null, modelUsed: "Gemini" },
    { id: "a", output: "Riya opens a box.", error: null, paramsUsed: {}, createdAt: now, decision: null, note: null, modelUsed: "Gemini" },
  ];
  const viewing = { viewed: versions[1], index: 1, total: 2, isViewingOther: true, view: vi.fn(), step: vi.fn(), backToActive: vi.fn() };
  it("puts the list beside the viewed version's read-only output, with the bar", () => {
    const html = renderToStaticMarkup(
      <PromptHistoryPane
        versions={versions}
        activeVersionId="b"
        viewing={viewing}
        outputLabel="Generated prompt"
        outputIcon={null}
        renderVersionOutput={(v) => <p>{v.output}</p>}
        canRestore
        restoring={false}
        onRestore={vi.fn()}
      />,
    );
    const t = text(html);
    expect(t).toContain("Riya opens a box.");
    expect(t).toContain("The node still uses v2.");
    expect(t).toContain("Restore v1");
    expect(html).toContain('role="listbox"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx -t PromptHistoryPane`
Expected: FAIL — cannot resolve `../prompt-history-pane`.

- [ ] **Step 3: Rewrite `PromptVersionHistory`'s props**

In `src/components/nodes/prompt-version-history.tsx`: replace `import { VersionHistoryList } from "./version-history-list";` with `import { VersionList } from "./version-list";` and `import { VersionThumb } from "./version-thumb";`. Replace `PromptVersionHistoryProps` with:

```tsx
type PromptVersionHistoryProps = {
  versions: VersionSummary[];
  activeVersionId: string | null;
  viewedVersionId: string | null;
  onView: (versionId: string) => void;
};
```

Update the destructuring to `{ versions, activeVersionId, viewedVersionId, onView }`. In each row add `thumb: <VersionThumb kind="text" />,` and `summary: v.modelUsed ?? undefined,`, and remove the `v.modelUsed` paragraph from `meta` (it is now the summary). Replace the return with:

```tsx
  return <VersionList rows={rows} activeVersionId={activeVersionId} viewedVersionId={viewedVersionId} onView={onView} />;
```

Update the file's header comment: "A prompt version has a text tile for a thumbnail."

- [ ] **Step 4: Create `prompt-history-pane.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { versionLabelsById } from "@/lib/generations/version-labels";
import type { VersionViewing } from "@/hooks/use-version-viewing";
import { PromptVersionHistory, type VersionSummary } from "./prompt-version-history";
import { VersionStepper } from "./version-stepper";
import { VersionViewingBar } from "./version-viewing-bar";
import { VersionOutputEmpty } from "./version-output-empty";

/**
 * D383 — the prompt nodes' History, in the media nodes' shape: the list in a raised middle
 * column, the version on screen in the output column beside it, read-only. Shared by
 * PromptFocusShell (Video Prompt, Multishot Prompt) and the image Prompt node's own view.
 */
export function PromptHistoryPane({
  versions,
  activeVersionId,
  viewing,
  outputLabel,
  outputIcon,
  renderVersionOutput,
  canRestore,
  restoring,
  onRestore,
}: {
  versions: VersionSummary[];
  activeVersionId: string | null;
  viewing: VersionViewing<VersionSummary>;
  outputLabel: string;
  outputIcon: ReactNode;
  renderVersionOutput: (version: VersionSummary) => ReactNode;
  canRestore: boolean;
  restoring: boolean;
  onRestore: (versionId: string) => void;
}) {
  if (versions.length === 0) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-muted-foreground">No versions yet. Generate once and every run is kept here.</p>
      </div>
    );
  }
  const labelById = versionLabelsById(versions);
  const viewed = viewing.viewed;
  return (
    <div className="flex w-full min-h-0 flex-1 overflow-hidden">
      <div className="h-full w-[54%] shrink-0 overflow-y-auto border-x border-primary/25 bg-card px-6 py-5 panel-raised">
        <PromptVersionHistory versions={versions} activeVersionId={activeVersionId} viewedVersionId={viewed?.id ?? null} onView={viewing.view} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {outputIcon}
            <span className="text-eyebrow">{outputLabel}</span>
          </div>
          <VersionStepper index={viewing.index} total={viewing.total} onStep={viewing.step} />
        </div>
        {viewing.isViewingOther && viewed && (
          <VersionViewingBar
            viewedLabel={labelById.get(viewed.id) ?? ""}
            viewedCreatedAt={viewed.createdAt}
            activeLabel={activeVersionId ? labelById.get(activeVersionId) ?? null : null}
            canRestore={canRestore && !viewed.error && Boolean(viewed.output)}
            restoring={restoring}
            onBack={viewing.backToActive}
            onRestore={() => onRestore(viewed.id)}
          />
        )}
        {viewed && (viewed.error || !viewed.output ? <VersionOutputEmpty noun="prompt" /> : renderVersionOutput(viewed))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the pane test**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx -t PromptHistoryPane`
Expected: PASS.

- [ ] **Step 6: Shell — props, slots, viewing**

In `src/components/nodes/prompt-focus-shell.tsx`:

Replace `import { PromptVersionChips } from "./prompt-version-chips";` and `import { PromptVersionHistory, type VersionSummary } from "./prompt-version-history";` with:

```tsx
import type { VersionSummary } from "./prompt-version-history";
import { PromptHistoryPane } from "./prompt-history-pane";
import { VersionStepper } from "./version-stepper";
import { VersionViewingBar } from "./version-viewing-bar";
import { ActiveOnlyNotice } from "./active-only-notice";
import { useVersionViewing } from "@/hooks/use-version-viewing";
import { versionLabelsById } from "@/lib/generations/version-labels";
```

Replace `PromptFocusShellSlots` with:

```tsx
export type PromptFocusShellSlots = {
  // D383 — `‹ vN of M ›`, placed beside the caller's own "Generated ___" heading. Views, never
  // restores (it replaced the v1/v2 chips, which restored on click).
  versionStepper: ReactNode;
  // D383 — the viewing bar, placed directly under that heading; null while on the active version.
  viewingBar: ReactNode;
  // The version on screen (the active one unless another is being viewed).
  viewedVersion: VersionSummary | null;
  isViewingOther: boolean;
  // A ready-wired <InlineApprovalBar> (gated on the viewer's role, and on viewing the active
  // version) — the caller places it beside its own eval bar.
  approvalControls: ReactNode;
};
```

Add to `PromptFocusShellProps` (after `onLiveVersionUpdate`):

```tsx
  // D383 — the History pane's output column: its heading, and a read-only rendering of one
  // version's result (built from the same code that renders the active result).
  outputLabel: string;
  outputIcon: ReactNode;
  renderVersionOutput: (version: VersionSummary) => ReactNode;
```

Add `outputLabel, outputIcon, renderVersionOutput,` to the destructured parameters.

After `const editable = useCanvasEditable();` add:

```tsx
  // D383 — the version on screen, shared by the prompt pane and the History pane.
  const viewing = useVersionViewing(versions, activeVersionId, open);
  const labelById = versionLabelsById(versions);
  const viewed = viewing.viewed;
  const viewedLabel = viewed ? labelById.get(viewed.id) ?? "" : "";
  const canRestore = editable && Boolean(viewed && !viewed.error && viewed.output);
```

Replace the `const versionChips = ( <PromptVersionChips … /> );` block with:

```tsx
  const versionStepper = <VersionStepper index={viewing.index} total={viewing.total} onStep={viewing.step} />;
  const viewingBar =
    viewing.isViewingOther && viewed ? (
      <VersionViewingBar
        viewedLabel={viewedLabel}
        viewedCreatedAt={viewed.createdAt}
        activeLabel={activeVersionId ? labelById.get(activeVersionId) ?? null : null}
        canRestore={canRestore}
        restoring={restoring}
        onBack={viewing.backToActive}
        onRestore={() => onRestoreVersion(viewed.id)}
      />
    ) : null;
```

In `approvalControls`, wrap the bar and gate it:

```tsx
  const approvalControls = (
    <>
      {viewing.isViewingOther && <ActiveOnlyNotice label={viewedLabel} />}
      <InlineApprovalBar
        status={approvalStatus}
        note={approvalNote}
        saving={approvalSaving}
        // R7.1/D160: not gated on `editable` — approval writes only to node_versions, outside
        // what the D33 lock serialises. D383: gated on viewing the active version.
        canApprove={identity?.role === "senior" && !viewing.isViewingOther}
        onSet={onSetApproval}
        approvedByName={approvedByName}
        approvedAt={approvedAt}
      />
    </>
  );
```

Change `{children({ versionChips, approvalControls })}` to:

```tsx
            {children({ versionStepper, viewingBar, viewedVersion: viewed, isViewingOther: viewing.isViewingOther, approvalControls })}
```

Replace the whole `{selected === "history" && ( <div className="min-h-0 w-full max-w-3xl …"> … </div> )}` block with:

```tsx
            {selected === "history" && (
              <PromptHistoryPane
                versions={versions}
                activeVersionId={activeVersionId}
                viewing={viewing}
                outputLabel={outputLabel}
                outputIcon={outputIcon}
                renderVersionOutput={renderVersionOutput}
                canRestore={editable}
                restoring={restoring}
                onRestore={onRestoreVersion}
              />
            )}
```

Update the comment above the rail's History item: "D383: History shows the list beside the version on screen, like every other versioned node."

- [ ] **Step 7: Video Prompt view**

In `src/components/nodes/video-prompt-focus-view.tsx`:

Add import `import { VersionOutputEmpty } from "./version-output-empty";` and, if not already imported, `import type { VersionSummary } from "./prompt-version-history";`.

Before `return (` add the read-only renderer (same rendering the result uses, never editable):

```tsx
  // D383 — one version's motion prompt, read-only: the History pane's output column, and the
  // prompt pane while an older version is on screen.
  const renderVersionOutput = (v: VersionSummary) =>
    omniRefs ? (
      <MentionInstructionEditor
        value={v.output ?? ""}
        onChange={() => {}}
        upstream={mentionUpstream}
        disabled
        dialect={omniRefs}
        className="min-h-[16rem] max-w-[65ch] flex-1 text-base"
      />
    ) : (
      <div className="max-w-[65ch] rounded-xl p-4 text-base leading-7">
        <GeneratedPromptBody text={v.output ?? ""} images={promptRefImages} />
      </div>
    );
```

On `<PromptFocusShell` add the props:

```tsx
      outputLabel="Generated motion prompt"
      outputIcon={<Clapperboard className="size-3.5 text-primary" />}
      renderVersionOutput={renderVersionOutput}
```

Change the children signature `{({ versionChips, approvalControls }) => (` to `{({ versionStepper, viewingBar, viewedVersion, isViewingOther, approvalControls }) => (`.

Replace `{versionChips}` with `{versionStepper}`. Directly after that heading row's closing `</div>` add `{viewingBar}`.

Wrap the three output blocks (`{mode === "skeleton" && …}`, `{mode === "empty" && …}`, `{mode === "result" && ( … )}`) in:

```tsx
                  {isViewingOther && viewedVersion ? (
                    viewedVersion.output ? renderVersionOutput(viewedVersion) : <VersionOutputEmpty noun="prompt" />
                  ) : (
                    <>
                      {/* existing skeleton / empty / result blocks, unchanged */}
                    </>
                  )}
```

On the Generate button change `disabled={generating || !editable}` to `disabled={generating || !editable || isViewingOther}`.

In the `selected === "request"` block, change `{activeRequest ? ( <ModelRequestPanel request={activeRequest} /> )` to use the version on screen:

```tsx
                {(isViewingOther ? viewedVersion?.inputsUsed?.request ?? null : activeRequest) ? (
                  <ModelRequestPanel request={(isViewingOther ? viewedVersion?.inputsUsed?.request : activeRequest)!} />
```

- [ ] **Step 8: Multishot Prompt view**

In `src/components/nodes/multishot-prompt-focus-view.tsx` add `import { VersionOutputEmpty } from "./version-output-empty";` and the `VersionSummary` type import if missing. Before `return (` add:

```tsx
  // D383 — one version's plan, read-only (the History pane, and the prompt pane while an older
  // version is on screen). A version's output is the plan object the restore route returns.
  const renderVersionOutput = (v: VersionSummary) => {
    const plan = v.output as unknown as MultishotPlan | null;
    if (!plan || !Array.isArray(plan.beats)) return <VersionOutputEmpty noun="plan" />;
    return (
      <div className="flex flex-col gap-3">
        {plan.look.trim() && (
          <div className="rounded-xl border-2 border-primary/20 bg-primary/[0.03] p-3">
            <span className="text-eyebrow text-primary">Look &amp; atmosphere</span>
            <MentionInstructionEditor value={plan.look} onChange={() => {}} upstream={mentionUpstream} dialect={beatDialect} disabled />
          </div>
        )}
        <ol className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          {plan.beats.map((b, i) => (
            <li key={b.cutId} className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0">
              <span className="text-eyebrow">{`Shot ${i + 1}`}</span>
              <MentionInstructionEditor value={b.text} onChange={() => {}} upstream={mentionUpstream} dialect={beatDialect} disabled />
            </li>
          ))}
        </ol>
      </div>
    );
  };
```

On `<PromptFocusShell` add:

```tsx
      outputLabel="Generated plan"
      outputIcon={<ListVideo className="size-3.5 text-primary" strokeWidth={1.5} />}
      renderVersionOutput={renderVersionOutput}
```

Change the children signature to `{({ versionStepper, viewingBar, viewedVersion, isViewingOther, approvalControls }) => (`. Replace `{versionChips}` with `{versionStepper}`; add `{viewingBar}` directly after that heading row's closing `</div>`. Wrap the `mode === "skeleton"` / `"empty"` / `"result"` blocks exactly as in Step 7 (using `renderVersionOutput(viewedVersion)` and `<VersionOutputEmpty noun="plan" />`). Change the Save footer condition `{mode === "result" && (` (the `border-t … px-6 py-3` block) to `{mode === "result" && !isViewingOther && (`. Find the Generate `Button` whose `onClick={runGenerate}` and add `|| isViewingOther` to its `disabled` expression. Apply the same "Sent to model" change as Step 7 if this view renders `ModelRequestPanel` from `activeRequest`.

- [ ] **Step 9: Run tests, lint, typecheck**

Run: `npx vitest run src/components/nodes/__tests__/version-viewing-ui.test.tsx && npx eslint src/components/nodes/prompt-*.tsx src/components/nodes/video-prompt-focus-view.tsx src/components/nodes/multishot-prompt-focus-view.tsx && npx tsc --noEmit`
Expected: PASS, clean. `tsc` must show no remaining reference to `versionChips`.

- [ ] **Step 10: Manual check**

On a Video Prompt and a Multishot Prompt node with 2+ versions: History shows list + read-only output side by side; the stepper in the Prompt pane views (no restore); while an older version is on screen the prompt pane shows it read-only under the bar and Generate is disabled; Restore makes it active.

- [ ] **Step 11: Commit**

```bash
git add src/components/nodes/prompt-version-history.tsx src/components/nodes/prompt-history-pane.tsx src/components/nodes/prompt-focus-shell.tsx src/components/nodes/video-prompt-focus-view.tsx src/components/nodes/multishot-prompt-focus-view.tsx src/components/nodes/__tests__/version-viewing-ui.test.tsx
git commit -m "feat(prompts): shared history and stepper for prompt nodes (D383)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Image Prompt focus view gains History

**Files:**
- Modify: `src/components/nodes/prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `PromptHistoryPane` (Task 7), `useVersionViewing`, `VersionStepper`, `VersionViewingBar`, `VersionOutputEmpty`, `ActiveOnlyNotice`, `versionLabelsById`.

- [ ] **Step 1: Imports and viewing state**

Replace `import { PromptVersionChips } from "./prompt-version-chips";` with:

```tsx
import { PromptHistoryPane } from "./prompt-history-pane";
import { VersionStepper } from "./version-stepper";
import { VersionViewingBar } from "./version-viewing-bar";
import { VersionOutputEmpty } from "./version-output-empty";
import { ActiveOnlyNotice } from "./active-only-notice";
import { useVersionViewing } from "@/hooks/use-version-viewing";
import { versionLabelsById } from "@/lib/generations/version-labels";
```

Add `History` to the `lucide-react` import. After `const [restoring, setRestoring] = useState(false);` add:

```tsx
  // D383 — the version on screen (this view had chips only, and no History tab).
  const viewing = useVersionViewing(versions, activeVersionId, open);
  const labelById = versionLabelsById(versions);
  const viewed = viewing.viewed;
  const viewedLabel = viewed ? labelById.get(viewed.id) ?? "" : "";
```

Change `const isNodeSelected = !["prompt", "details", "request"].includes(selected);` to:

```tsx
  const isNodeSelected = !["prompt", "history", "details", "request"].includes(selected);
```

- [ ] **Step 2: One renderer for a prompt's beats**

The `EditableField`'s `renderDisplay={(text) => ( <span className="block space-y-2.5"> … </span> )}` body becomes a named function so the read-only view uses the same rendering. Before `return (` add:

```tsx
  const renderBeats = (text: string) => (
    <span className="block space-y-2.5">
      {splitSentenceBeats(text).map((beat, i) => (
        <span key={i} className="block">
          {segmentByTerms(beat, highlightTerms).map((seg, j) =>
            seg.highlighted ? (
              <span key={j} className="rounded bg-primary/10 px-0.5 font-bold">{seg.text}</span>
            ) : (
              <span key={j}>{seg.text}</span>
            ),
          )}
        </span>
      ))}
    </span>
  );
  const renderVersionOutput = (v: { output: string | null }) => (
    <div className="max-w-[65ch] rounded-xl p-4 text-base leading-7">{renderBeats(v.output ?? "")}</div>
  );
  const viewingBar =
    viewing.isViewingOther && viewed ? (
      <VersionViewingBar
        viewedLabel={viewedLabel}
        viewedCreatedAt={viewed.createdAt}
        activeLabel={activeVersionId ? labelById.get(activeVersionId) ?? null : null}
        canRestore={editable && !viewed.error && Boolean(viewed.output)}
        restoring={restoring}
        onBack={viewing.backToActive}
        onRestore={() => void handleRestoreVersion(viewed.id)}
      />
    ) : null;
```

and change `renderDisplay={(text) => ( … )}` to `renderDisplay={renderBeats}`.

- [ ] **Step 3: Rail and History pane**

In the rail, directly after `<div className="mx-2.5 my-2 h-px bg-border" />` add:

```tsx
            <RailItem
              icon={<History className="size-4 text-primary" />}
              label="History"
              active={selected === "history"}
              onClick={() => setSelected("history")}
            />
```

Next to the `selected === "details"` pane (as a sibling, before it) add:

```tsx
            {selected === "history" && (
              <PromptHistoryPane
                versions={versions}
                activeVersionId={activeVersionId}
                viewing={viewing}
                outputLabel="Generated prompt"
                outputIcon={<Sparkles className="size-3.5 text-primary" />}
                renderVersionOutput={renderVersionOutput}
                canRestore={editable}
                restoring={restoring}
                onRestore={(id) => void handleRestoreVersion(id)}
              />
            )}
```

- [ ] **Step 4: Prompt pane output column**

Replace `<PromptVersionChips versions={versions} activeVersionId={activeVersionId} restoring={restoring} onSwitch={handleRestoreVersion} />` with:

```tsx
                        <VersionStepper index={viewing.index} total={viewing.total} onStep={viewing.step} />
```

Directly after that heading row's closing `</div>` add `{viewingBar}`. Wrap the `mode === "skeleton"` / `"empty"` / `"result"` blocks:

```tsx
                      {viewing.isViewingOther && viewed ? (
                        viewed.output ? renderVersionOutput(viewed) : <VersionOutputEmpty noun="prompt" />
                      ) : (
                        <>
                          {/* existing skeleton / empty / result blocks, unchanged */}
                        </>
                      )}
```

On the Generate button change `disabled={generating || !editable}` to `disabled={generating || !editable || viewing.isViewingOther}`.

- [ ] **Step 5: Details and Sent to model**

In Details → Review, inside `<div className="flex flex-col gap-3">` add first `{viewing.isViewingOther && <ActiveOnlyNotice label={viewedLabel} />}`; on its `InlineApprovalBar` change `canApprove={identity?.role === "senior"}` to `canApprove={identity?.role === "senior" && !viewing.isViewingOther}`.

Change `const activeRequest = versions.find((v) => v.id === activeVersionId)?.inputsUsed?.request ?? null;` to:

```tsx
  // "Sent to model" reports on the version on screen (D383).
  const activeRequest = viewed?.inputsUsed?.request ?? null;
```

- [ ] **Step 6: Lint, typecheck, manual check**

Run: `npx eslint src/components/nodes/prompt-focus-view.tsx && npx tsc --noEmit`
Expected: clean.

Manual: an image Prompt node's focus view now has History in the rail; it behaves exactly like the Video Prompt node's.

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/prompt-focus-view.tsx
git commit -m "feat(prompt): History tab and version stepper on the image Prompt node (D383)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Remove the replaced version UI

**Files:**
- Delete: `src/components/nodes/version-history-list.tsx`
- Delete: `src/components/nodes/prompt-version-chips.tsx`
- Modify: `src/lib/nodes/prompt-focus.ts` (remove `buildVersionChips` and any type used only by it)
- Modify: `src/lib/nodes/prompt-focus.test.ts` (remove the `buildVersionChips` describe block and its import)

- [ ] **Step 1: Confirm nothing imports them**

Run: `git grep -n -E "version-history-list|VersionHistoryList|prompt-version-chips|PromptVersionChips|buildVersionChips" -- src`
Expected: matches only in the files listed above (the definitions and the test). Any other match means a caller was missed in Tasks 4–8: migrate it before continuing.

- [ ] **Step 2: Delete and trim**

```bash
git rm src/components/nodes/version-history-list.tsx src/components/nodes/prompt-version-chips.tsx
```

In `src/lib/nodes/prompt-focus.ts` delete `buildVersionChips` (from its doc comment at ≈ line 110 to the end of the function) and any type exported only for it. In `src/lib/nodes/prompt-focus.test.ts` delete `buildVersionChips` from the import list and the whole `describe("buildVersionChips", …)` block.

- [ ] **Step 3: Verify**

Run: `npx vitest run src/lib/nodes/prompt-focus.test.ts src/components/nodes/__tests__/version-viewing-ui.test.tsx && npx tsc --noEmit && npx eslint src/lib/nodes/prompt-focus.ts`
Expected: PASS, clean.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/nodes src/lib/nodes
git commit -m "refactor(versions): remove the old history list and restore-on-click chips (D383)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `useNodeMediaSize`, `NodeMedia`, node data fields

**Files:**
- Modify: `src/lib/canvas-nodes.ts`
- Create: `src/hooks/use-node-media-size.ts`
- Create: `src/components/nodes/node-media.tsx`
- Test: `src/components/nodes/__tests__/node-media.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`resolveMediaRatio`, `mediaSizeToSave`, `MediaBox`, `MediaSize`); `useCanvasStore` (`@/components/canvas/canvas-store-provider`); `useCanvasEditable` (`@/components/canvas/canvas-editable-context`).
- Produces:
  - `useNodeMediaSize(nodeId: string, saved: { width?: number; height?: number }, fallbackRatio: number | null): { ratio: number; measured: MediaSize | null; onMeasured(width: number, height: number): void }`
  - `NodeMedia({ kind: "image" | "video"; src: string; alt: string; box: MediaBox; onMeasured(w: number, h: number): void; edge?: boolean; children?: ReactNode })`
  - `mediaWidth?: number; mediaHeight?: number` on `ImageGenNodeData`, `CompositeNodeData`, `VideoGenNodeData`, `DubbingNodeData`, `FileNodeData`, `DrawNodeData`, `AvatarNodeData`, `ClientReviewNodeData`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/nodes/__tests__/node-media.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NodeMedia } from "../node-media";
import { nodeMediaBox } from "@/lib/canvas/media-fit";

describe("NodeMedia", () => {
  it("sizes the box to the media and never crops", () => {
    const html = renderToStaticMarkup(
      <NodeMedia kind="image" src="https://x/a.png" alt="a" box={nodeMediaBox(9 / 16, "output")} onMeasured={vi.fn()} />,
    );
    expect(html).toContain("width:281px");
    expect(html).toContain("height:500px");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
  });
  it("shows a video as a metadata-only poster frame", () => {
    const html = renderToStaticMarkup(
      <NodeMedia kind="video" src="https://x/a.mp4" alt="a" box={nodeMediaBox(16 / 9, "output")} onMeasured={vi.fn()} />,
    );
    expect(html).toContain('src="https://x/a.mp4#t=0.1"');
    expect(html).toContain('preload="metadata"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/nodes/__tests__/node-media.test.tsx`
Expected: FAIL — cannot resolve `../node-media`.

- [ ] **Step 3: Node data fields**

In `src/lib/canvas-nodes.ts` add these two lines, with this comment, inside each of `ImageGenNodeData`, `CompositeNodeData`, `VideoGenNodeData`, `FileNodeData`, `DrawNodeData` and `AvatarNodeData`:

```ts
  // D384 — the card's media size, measured on load and saved once so reloads don't jump.
  mediaWidth?: number;
  mediaHeight?: number;
```

Change `export type ClientReviewNodeData = { title?: string };` to:

```ts
export type ClientReviewNodeData = { title?: string; mediaWidth?: number; mediaHeight?: number };
```

and add `mediaWidth?: number; mediaHeight?: number;` to the `DubbingNodeData` object type.

- [ ] **Step 4: Create the hook**

```ts
// src/hooks/use-node-media-size.ts
"use client";

import { useState } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { mediaSizeToSave, resolveMediaRatio, type MediaSize } from "@/lib/canvas/media-fit";

/**
 * D384 — the aspect ratio a node card lays its media out at. Measured when the media loads and
 * saved on the node once (only when it changed, only by the canvas lock holder), so a reload lays
 * out at the final size. No network call, no effect: the write happens in the load handler.
 */
export function useNodeMediaSize(
  nodeId: string,
  saved: { width?: number; height?: number },
  fallbackRatio: number | null,
): { ratio: number; measured: MediaSize | null; onMeasured: (width: number, height: number) => void } {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const editable = useCanvasEditable();
  const [measured, setMeasured] = useState<MediaSize | null>(null);

  function onMeasured(width: number, height: number) {
    const next = { width, height };
    setMeasured(next);
    const patch = mediaSizeToSave(saved, next, editable);
    if (patch) updateNodeData(nodeId, patch);
  }

  return { ratio: resolveMediaRatio(measured, saved, fallbackRatio), measured, onMeasured };
}
```

- [ ] **Step 5: Create the component**

```tsx
// src/components/nodes/node-media.tsx
"use client";

import type { ReactNode } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaBox } from "@/lib/canvas/media-fit";

/**
 * D384 — a card's image or video, whole, in a box of exactly its shape (so `object-contain`
 * draws no bands). `edge` runs it edge to edge under the header (input tiles); otherwise it is a
 * rounded, bordered box inside the card body (output nodes). Overlays go in `children`.
 */
export function NodeMedia({
  kind,
  src,
  alt,
  box,
  onMeasured,
  edge = false,
  children,
}: {
  kind: "image" | "video";
  src: string;
  alt: string;
  box: MediaBox;
  onMeasured: (width: number, height: number) => void;
  edge?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-muted/40",
        edge ? "border-b border-border" : "rounded-md border border-border",
      )}
      style={{ width: box.mediaWidth, height: box.mediaHeight }}
    >
      {kind === "video" ? (
        <>
          <video
            src={`${src}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            className="size-full object-contain"
            onLoadedMetadata={(e) => onMeasured(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          />
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/50">
            <Play className="size-3.5 text-background" strokeWidth={1.5} />
          </span>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="size-full object-contain"
          onLoad={(e) => onMeasured(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
        />
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Run tests, lint, typecheck**

Run: `npx vitest run src/components/nodes/__tests__/node-media.test.tsx && npx eslint src/hooks/use-node-media-size.ts src/components/nodes/node-media.tsx src/lib/canvas-nodes.ts && npx tsc --noEmit`
Expected: PASS, clean. (React renders the style as `width:281px;height:500px`.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/canvas-nodes.ts src/hooks/use-node-media-size.ts src/components/nodes/node-media.tsx src/components/nodes/__tests__/node-media.test.tsx
git commit -m "feat(canvas): NodeMedia and measured media size for node cards (D384)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Output-tier cards — Image Gen, Composite, Video Gen, Dubbing

**Files:**
- Modify: `src/components/nodes/image-gen-node.tsx`
- Modify: `src/components/nodes/composite-node.tsx`
- Modify: `src/components/nodes/video-gen-node.tsx`
- Modify: `src/components/nodes/dubbing-node.tsx`

**Interfaces:**
- Consumes: `useNodeMediaSize`, `NodeMedia` (Task 10); `nodeMediaBox`, `parseAspectRatio` (Task 1).

The pattern for every card in this task:

```tsx
import { useNodeMediaSize } from "@/hooks/use-node-media-size";
import { nodeMediaBox, parseAspectRatio } from "@/lib/canvas/media-fit";
import { NodeMedia } from "./node-media";

// inside the component, unconditionally (hook order):
const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, /* fallback ratio */);
const box = /* has media */ ? nodeMediaBox(media.ratio, "output") : null;

// on the card root: drop the fixed width class when there is a box, and set the width inline
className={cn(!box && "w-[480px]", "rounded-lg border …")}
style={box ? { width: box.cardWidth } : undefined}
```

- [ ] **Step 1: Image Gen card**

In `image-gen-node.tsx` add the three imports. After `const imageUrl = …;` add:

```tsx
  // D384 — the card takes the image's shape. Before the first load, the chosen aspect ratio.
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, parseAspectRatio(d.params?.aspect_ratio));
  const box = imageUrl ? nodeMediaBox(media.ratio, "output") : null;
```

(If `d.params` is not typed as a record, read it as `(d.params as Record<string, unknown> | undefined)?.aspect_ratio`.)

Root `className`: replace `"w-[480px] rounded-lg border border-border bg-card shadow-card",` with `!box && "w-[480px]",` followed by `"rounded-lg border border-border bg-card shadow-card",` and add `style={box ? { width: box.cardWidth } : undefined}` to that `div`.

Replace:

```tsx
          {imageUrl && (
            <div className="mb-2 overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Generated" className="aspect-video w-full object-cover" />
            </div>
          )}
```

with:

```tsx
          {imageUrl && box && (
            <div className="mb-2">
              <NodeMedia kind="image" src={imageUrl} alt="Generated" box={box} onMeasured={media.onMeasured} />
            </div>
          )}
```

- [ ] **Step 2: Composite card**

Same as Step 1 in `composite-node.tsx` (fallback `parseAspectRatio((d.params as Record<string, unknown> | undefined)?.aspect_ratio)`, alt `"Composite"`), replacing the `aspect-video w-full object-cover` block.

- [ ] **Step 3: Video Gen card**

In `video-gen-node.tsx` add the imports. After `const showVideo = …;` add:

```tsx
  // D384 — the card takes the video's shape; while generating, it reserves the chosen shape.
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, parseAspectRatio((d.params as Record<string, unknown> | undefined)?.aspect_ratio));
  const box = showVideo || isGenerating ? nodeMediaBox(media.ratio, "output") : null;
```

Root: replace `"w-60 rounded-lg …"` with `!box && "w-60",` + `"rounded-lg border border-border bg-card shadow-card",` and add `style={box ? { width: box.cardWidth } : undefined}`.

Replace the skeleton `<div className="mb-2 h-16 w-full animate-pulse rounded-md bg-primary/10" />` with:

```tsx
            <div className="mb-2 animate-pulse rounded-md bg-primary/10" style={box ? { width: box.mediaWidth, height: box.mediaHeight } : undefined} />
```

Replace the `{showVideo && ( <div className="relative mb-2 overflow-hidden rounded-md border border-border"> <video … className="h-16 w-full object-cover" … /> {isChangingVoice && (…)} </div> )}` block with:

```tsx
          {showVideo && videoUrl && box && (
            <div className="mb-2">
              <NodeMedia kind="video" src={videoUrl} alt={title || "Generated video"} box={box} onMeasured={media.onMeasured}>
                {/* D284 — a voice change keeps the take in view, veiled, like the focus view. */}
                {isChangingVoice && (
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/60 text-xs font-medium backdrop-blur-sm">
                    <AudioLines className="size-3.5 animate-pulse text-primary" strokeWidth={1.5} />
                    Changing voice…
                  </div>
                )}
              </NodeMedia>
            </div>
          )}
```

- [ ] **Step 4: Dubbing card**

In `dubbing-node.tsx` add the imports. After `const url = …;` add:

```tsx
  // D384 — the card takes the dub's shape. Most dubs are of portrait takes, so 9:16 until measured.
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, 9 / 16);
  const box = url ? nodeMediaBox(media.ratio, "output") : null;
```

Root: replace `"w-[320px] rounded-lg …"` with `!box && "w-[320px]",` + the rest, and add the inline `style`. Replace the `{url && ( <div className="relative overflow-hidden rounded-md border border-border"> <video … className="h-16 w-full object-cover" /> {running && (…)} </div> )}` block with:

```tsx
            {url && box && (
              <NodeMedia kind="video" src={url} alt={d.title || "Dub"} box={box} onMeasured={media.onMeasured}>
                {/* Like Video Gen's voice change: the take stays in view, veiled, while a job runs. */}
                {running && (
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/60 text-xs font-medium backdrop-blur-sm">
                    <AudioLines className="size-3.5 animate-pulse text-primary" strokeWidth={1.5} />
                    {stateWord(dub, running)}
                  </div>
                )}
              </NodeMedia>
            )}
```

- [ ] **Step 5: Lint, typecheck**

Run: `npx eslint src/components/nodes/image-gen-node.tsx src/components/nodes/composite-node.tsx src/components/nodes/video-gen-node.tsx src/components/nodes/dubbing-node.tsx && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Manual check — count the calls**

`npm run dev`, open a canvas with portrait and landscape Image Gen / Video Gen / Composite / Dubbing nodes. Each card shows its whole picture at its own shape; portrait cards are narrower. Open DevTools → Network, reload: no new requests per node beyond the media files themselves. Reload a second time: no autosave fires on load (sizes are already saved). Open the same canvas in a second browser without the lock: no autosave from that viewer.

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/image-gen-node.tsx src/components/nodes/composite-node.tsx src/components/nodes/video-gen-node.tsx src/components/nodes/dubbing-node.tsx
git commit -m "feat(canvas): output cards take their media's shape, no cropping (D384)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Input-tier cards — File, Draw, Avatar, Client review, Post; KB images

**Files:**
- Modify: `src/components/nodes/file-node.tsx`
- Modify: `src/components/nodes/draw-node.tsx`
- Modify: `src/components/nodes/avatar-node.tsx`
- Modify: `src/components/nodes/client-review-node.tsx`
- Modify: `src/components/nodes/post-node.tsx`
- Modify: `src/components/nodes/kb-node.tsx`

**Interfaces:**
- Consumes: Tasks 1 and 10.

- [ ] **Step 1: File card**

Add the three imports (`useNodeMediaSize`, `nodeMediaBox`, `NodeMedia`). Remove the `measuredDims` state. After `const uploadError = d.uploadError;` add:

```tsx
  // D384 — the tile takes the image's shape. Upload already stored imageWidth/imageHeight.
  const media = useNodeMediaSize(
    id,
    { width: d.mediaWidth ?? d.imageWidth, height: d.mediaHeight ?? d.imageHeight },
    null,
  );
  const showImage = d.fileKind === "image" && Boolean(d.fileUrl) && !showUploading && !uploadError;
  const box = showImage ? nodeMediaBox(media.ratio, "input") : null;
```

Change `const dims = measuredDims ?? (…)` to:

```tsx
  const dims = media.measured
    ? { w: media.measured.width, h: media.measured.height }
    : d.imageWidth && d.imageHeight
      ? { w: d.imageWidth, h: d.imageHeight }
      : null;
```

Root: replace `"group w-44 rounded-lg …"` with `!box && "w-44",` + `"group rounded-lg border border-border bg-card shadow-card",` and add `style={box ? { width: box.cardWidth } : undefined}`.

In the thumbnail slot, keep the uploading and error branches in their `h-16` box, and render the image through `NodeMedia`:

```tsx
      {box && d.fileUrl ? (
        <NodeMedia kind="image" src={d.fileUrl} alt={d.filename ?? "image"} box={box} onMeasured={media.onMeasured} edge />
      ) : (d.fileKind === "image" || showUploading) && (
        <div className="flex h-16 items-center justify-center overflow-hidden border-b border-border bg-muted/40">
          {showUploading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" strokeWidth={1.5} />
          ) : uploadError ? (
            <div className="flex flex-col items-center gap-1 px-2 text-center">
              <AlertTriangle className="size-3.5 text-destructive" strokeWidth={1.5} />
              <p className="truncate text-[0.6rem] text-destructive">Upload failed</p>
            </div>
          ) : null}
        </div>
      )}
```

- [ ] **Step 2: Draw card**

Add the imports. After `const hasSketch = !!d.fileUrl;` add:

```tsx
  // D384 — the tile takes the sketch's shape.
  const media = useNodeMediaSize(id, { width: d.mediaWidth ?? d.imageWidth, height: d.mediaHeight ?? d.imageHeight }, null);
  const box = hasSketch ? nodeMediaBox(media.ratio, "input") : null;
```

(If `DrawNodeData` has no `imageWidth`, drop the `?? d.imageWidth` / `?? d.imageHeight` fallbacks.) Root: `!box && "w-44",` + the rest, and the inline `style`. Replace the `{hasSketch && ( <div className="overflow-hidden border-b border-border"> <img … className="h-24 w-full object-cover" /> </div> )}` block with:

```tsx
        {hasSketch && d.fileUrl && box && (
          <NodeMedia kind="image" src={d.fileUrl} alt={d.title ?? "sketch"} box={box} onMeasured={media.onMeasured} edge />
        )}
```

- [ ] **Step 3: Avatar card**

Add the imports. Read node data for the saved size: change `const { avatarId } = data as AvatarNodeData;` to `const d = data as AvatarNodeData; const { avatarId } = d;`. After `const avatar = lookup.avatar;` add:

```tsx
  // D384 — the whole front view, at its own shape (it was cropped to the head).
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, 3 / 4);
  const box = avatar?.front ? nodeMediaBox(media.ratio, "input") : null;
```

Root: `!box && "w-44",` + the rest, and the inline `style`. Move the picture out of the padded body and directly under `NodeCardHeader`, edge to edge:

```tsx
          {avatar?.front && box && (
            <NodeMedia kind="image" src={avatar.front.url} alt="" box={box} onMeasured={media.onMeasured} edge>
              {avatar.archivedAt && (
                <Badge variant="outline" className="absolute inset-x-1.5 bottom-1.5 justify-center bg-card text-[0.65rem]">
                  Archived — still works here
                </Badge>
              )}
            </NodeMedia>
          )}
```

Inside `<div className="flex flex-col gap-2 px-3 pb-3">`, change it to `px-3 py-3`, and replace the `<div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted"> … </div>` block with the no-picture fallback only:

```tsx
                {!avatar.front && (
                  <div className="relative flex aspect-[3/4] items-center justify-center rounded-md bg-muted">
                    <UserRound className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
                  </div>
                )}
```

(The archived badge's existing copy is kept as it was; it is not part of this change.)

- [ ] **Step 4: Client review card**

Add the imports. After `const cut = current?.review ?? null;` add:

```tsx
  // D384 — the cut at its own shape, no black bars.
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, 16 / 9);
  const box = cut ? nodeMediaBox(media.ratio, "input") : null;
```

Root: replace `"group w-56 cursor-pointer …"` with `!box && "w-56",` + `"group cursor-pointer overflow-hidden rounded-lg border border-client/70 bg-card shadow-card",` and add the inline `style`. Replace the `{cut && ( <div className="overflow-hidden border-b border-border bg-black"> <video … className="h-32 w-full object-contain" /> </div> )}` block with:

```tsx
        {cut && box && (
          <NodeMedia kind="video" src={cut.videoUrl} alt={d.title || "Cut"} box={box} onMeasured={media.onMeasured} edge />
        )}
```

- [ ] **Step 5: Post card**

Add `import { nodeMediaBox } from "@/lib/canvas/media-fit";`. The ratio is known from the format, so nothing is measured. Where `spec` is available, add:

```tsx
  // D384 — the card takes the format's shape (a Story card gets narrower, not taller).
  const box = nodeMediaBox(spec.width / spec.height, "input");
```

Root: replace `"w-56 rounded-lg …"` with `"rounded-lg border border-border bg-card shadow-card"` and add `style={{ width: box.cardWidth }}`. On the media container replace `style={{ aspectRatio: `${spec.width} / ${spec.height}` }}` with `style={{ width: box.mediaWidth, height: box.mediaHeight }}`.

- [ ] **Step 6: KB brand images**

In `kb-node.tsx` change the brand image class `"size-16 rounded-md object-cover border border-border"` to:

```tsx
                      className="h-16 w-auto max-w-32 rounded-md border border-border bg-muted object-contain"
```

- [ ] **Step 7: Lint, typecheck**

Run: `npx eslint src/components/nodes/file-node.tsx src/components/nodes/draw-node.tsx src/components/nodes/avatar-node.tsx src/components/nodes/client-review-node.tsx src/components/nodes/post-node.tsx src/components/nodes/kb-node.tsx && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Manual check**

On a canvas: a portrait and a landscape File image, a sketch, an avatar, a Story post, a Feed post and a client-review cut each show whole at their own shape, at the smaller input scale; nothing is cropped; a reload does not jump; Network shows no new per-node requests.

- [ ] **Step 9: Commit**

```bash
git add src/components/nodes/file-node.tsx src/components/nodes/draw-node.tsx src/components/nodes/avatar-node.tsx src/components/nodes/client-review-node.tsx src/components/nodes/post-node.tsx src/components/nodes/kb-node.tsx
git commit -m "feat(canvas): input tiles take their media's shape, no cropping (D384)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Focus-view players and placeholders use the real shape

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`
- Modify: `src/components/nodes/composite-output-pane.tsx`
- Modify: `src/components/nodes/composite-focus-view.tsx`
- Modify: `src/components/nodes/dubbing-player.tsx`

**Interfaces:**
- Consumes: `parseAspectRatio` (Task 1).
- Produces: `CompositeOutputPane` gains `placeholderRatio?: number`.

- [ ] **Step 1: Video Gen player**

In `video-gen-focus-view.tsx` add `import { parseAspectRatio } from "@/lib/canvas/media-fit";`. Next to the other video state (after `const [videoDurationMs, setVideoDurationMs] = useState(0);`) add:

```tsx
  // D384 — the player's shape: measured from the video, else the version's setting, else 9:16.
  const [playerShape, setPlayerShape] = useState<{ url: string; ratio: number } | null>(null);
```

After the `viewed` / `viewedLabel` lines from Task 4 add:

```tsx
  const shownVideoUrl = viewing.isViewingOther ? viewed?.output ?? null : videoUrl;
  const playerRatio =
    (playerShape && playerShape.url === shownVideoUrl ? playerShape.ratio : null) ??
    parseAspectRatio(viewed?.paramsUsed?.aspect_ratio) ??
    parseAspectRatio(params.aspect_ratio) ??
    9 / 16;
  const measurePlayer = (e: SyntheticEvent<HTMLVideoElement>) => {
    const { videoWidth, videoHeight } = e.currentTarget;
    if (videoWidth > 0 && videoHeight > 0 && shownVideoUrl) setPlayerShape({ url: shownVideoUrl, ratio: videoWidth / videoHeight });
  };
```

(Add `type SyntheticEvent` to this file's existing `react` import.)

On the main result `<video>`: change `className="aspect-[9/16] h-full max-w-full rounded-xl border border-border bg-muted/20"` to `className="h-full max-w-full rounded-xl border border-border bg-muted/20"`, add `style={{ aspectRatio: playerRatio }}`, and extend its `onLoadedMetadata` so it also calls `measurePlayer(e)`:

```tsx
                        onLoadedMetadata={(e) => {
                          setVideoDurationMs(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration * 1000 : 0);
                          measurePlayer(e);
                        }}
```

On the viewed-version `<video>` added in Task 4, add `style={{ aspectRatio: playerRatio }}` and `onLoadedMetadata={measurePlayer}`, and change its class to `h-full max-w-full rounded-xl border border-border bg-muted/20`.

Skeleton: replace `<div className="aspect-[9/16] h-full max-w-full animate-pulse rounded-xl bg-muted-foreground/15" />` with:

```tsx
                  <div className="h-full max-w-full animate-pulse rounded-xl bg-muted-foreground/15" style={{ aspectRatio: parseAspectRatio(params.aspect_ratio) ?? 9 / 16 }} />
```

Update the comments that say "9:16, flush left" / "Height-driven 9:16 frame" to "the chosen shape, flush left" / "Height-driven frame at the video's own shape".

- [ ] **Step 2: Image Gen skeleton**

In `image-gen-focus-view.tsx` add the `parseAspectRatio` import and replace `<div className="aspect-[9/16] h-full max-w-full animate-pulse rounded-xl bg-muted-foreground/15" />` with:

```tsx
                      <div className="h-full max-w-full animate-pulse rounded-xl bg-muted-foreground/15" style={{ aspectRatio: parseAspectRatio(paramValues.aspect_ratio) ?? 9 / 16 }} />
```

Update its comment to "the chosen shape, centred — the same footprint the result will occupy".

- [ ] **Step 3: Composite skeleton**

In `composite-output-pane.tsx` add `placeholderRatio?: number;` to `Props` (comment: `/** D384 — the chosen aspect ratio, for the placeholder while generating. */`), destructure it with default `9 / 16`, and replace `<Skeleton className="aspect-[9/16] w-full max-w-sm rounded-xl" />` with:

```tsx
          <Skeleton className="w-full max-w-sm rounded-xl" style={{ aspectRatio: placeholderRatio }} />
```

In `composite-focus-view.tsx` add the `parseAspectRatio` import and pass `placeholderRatio={parseAspectRatio(values.aspect_ratio) ?? 9 / 16}` to `CompositeOutputPane`.

- [ ] **Step 4: Dubbing player**

In `dubbing-player.tsx` add next to `stage` state:

```tsx
  // D384 — the player's shape: measured from the video, 9:16 until then.
  const [ratio, setRatio] = useState(9 / 16);
```

On its `<video>` change the class to `h-full max-w-full rounded-xl border border-border bg-muted/20`, add `style={{ aspectRatio: ratio }}` and:

```tsx
              onLoadedMetadata={(e) => {
                const { videoWidth, videoHeight } = e.currentTarget;
                if (videoWidth > 0 && videoHeight > 0) setRatio(videoWidth / videoHeight);
              }}
```

Update the header comment's "the 9:16 frame below" to "the video below at its own shape".

- [ ] **Step 5: Lint, typecheck**

Run: `npx eslint src/components/nodes/video-gen-focus-view.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/composite-output-pane.tsx src/components/nodes/composite-focus-view.tsx src/components/nodes/dubbing-player.tsx && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Manual check**

Open a Video Gen node with a 16:9 video: the player is landscape, not a tall 9:16 box. Generate with aspect ratio 1:1: the placeholder is square. Same for Image Gen and Composite placeholders and the Dubbing player.

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/video-gen-focus-view.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/composite-output-pane.tsx src/components/nodes/composite-focus-view.tsx src/components/nodes/dubbing-player.tsx
git commit -m "feat(focus-views): players and placeholders use the real shape, not 9:16 (D384)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Final verification

- [ ] **Step 1: Every touched test file**

Run: `npx vitest run src/lib/canvas/media-fit.test.ts src/lib/versions/viewing.test.ts src/lib/nodes/prompt-focus.test.ts src/components/nodes`
Expected: PASS.

- [ ] **Step 2: Types and lint across the change**

Run: `npx tsc --noEmit && npx eslint src/components/nodes src/hooks src/lib/canvas src/lib/versions`
Expected: clean.

- [ ] **Step 3: Nothing left behind**

Run: `git grep -n -E "aspect-\[9/16\]|object-cover|VersionHistoryList|PromptVersionChips|onRestore=\{.*restoring" -- src/components/nodes`
Expected: `object-cover` only in `kb-node.tsx`'s non-brand-image uses (if any) and nowhere in a media card; no `aspect-[9/16]` in a player or placeholder; no `VersionHistoryList` / `PromptVersionChips`. Investigate any other match.

- [ ] **Step 4: The 300-node count (AGENTS.md performance rule)**

On a staging canvas with many nodes, reload with DevTools → Network open. Requests on load must not grow with the number of nodes beyond each node's own media file. No autosave on load once sizes are saved. Record the result in the PR description.

- [ ] **Step 5: Consistency walk-through**

Open, one after another, a Video Gen, Image Gen, Composite, Dubbing, Prompt, Video Prompt and Multishot Prompt node. History is in the rail with a count; the list sits beside the output; a click views; the bar wording is identical; Restore is only in the bar; active-only controls show the same notice. Any difference is a bug.

- [ ] **Step 6: Commit any fixes, then finish**

Use `superpowers:finishing-a-development-branch` to choose how to integrate.
