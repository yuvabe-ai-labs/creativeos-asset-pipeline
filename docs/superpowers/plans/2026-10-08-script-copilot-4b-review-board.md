# Script Copilot · Spec 4b (Review Board) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The client's review page and the team's script page become the Visualise board (spec 3) with a Comments column: the client reads the shared version read-only in Visualise's layout, every part carries a marker and comment action that open its thread in the column (a sheet on narrow screens), and the team gets the same markers and column on its Visualise view, its review actions on Visualise's top line, and the approved version read-only after approval.

**Architecture:** Spec 3 is merged into this branch (`5bb3b04c`). A shared frame (`ScriptBoardFrame`) lays out script pane · Visuals pane · optional column for both specs. The client page and the team's approved page draw a frozen version through read-only leaf components (`ReviewCastCard`, `ReviewPanelTile`) that reuse spec 3's `AvatarSheetViews` and `StoryboardGrid`; the team's live page is spec 3's `VisualiseView` with an optional `review` prop that places spec 4's markers, actions and column through the merge-point hooks spec 3 left (`marker` on views and tiles). Threads render only in the column; the surface context gains column focus state. No database or route changes.

**Tech Stack:** Next.js App Router (this repo's version — read `node_modules/next/dist/docs/` before Next code), React 19, TypeScript, TanStack Query, shadcn on Base UI (`src/components/ui/*`, `render` prop), Lucide (1.5 stroke), vitest (node env; `react-dom/server` markup tests).

**Spec:** [docs/superpowers/specs/2026-10-08-script-copilot-4-client-review-design.md](../specs/2026-10-08-script-copilot-4-client-review-design.md) — binding, especially §4, §6 and §13 decisions 4.14–4.17 (revised 8 Oct for the review board). Spec 3: [2026-10-08-script-copilot-3-visualise-design.md](../specs/2026-10-08-script-copilot-3-visualise-design.md) §4. Previous plan (built): [2026-10-08-script-copilot-4-client-review.md](2026-10-08-script-copilot-4-client-review.md).

## Global Constraints

- **The client's page is the Visualise board, read-only, with a Comments column; panels sit in the Storyboard, not beside each shot** (4.14).
- **Threads live only in the Comments column; a part shows its marker and comment action, which open its thread there** (4.15).
- **On a narrower screen the Comments column opens over the page from a Comments button, straight at the part** (4.16). "Wide" = Tailwind `xl` (1280px).
- **After approval the team's page shows the approved version, read-only, with the column and Reopen to Visualise** (4.17). An approved script with no review (the seeded reels) keeps spec 1's read-only view.
- **No database change, no new route.** Share, comment, reply, resolve and approve endpoints are unchanged.
- **Spec 3's files are extended additively** (optional props only); with the new props left out, spec 3's Visualise view renders exactly as before.
- **Reuse, don't redefine:** the four views and their labels are spec 3's (`AVATAR_VIEWS`, `AVATAR_VIEW_LABELS` in `@/lib/avatars/constants`); spec 4's names re-export them.
- **Controls are shadcn primitives only**; icon-only buttons carry an `aria-label` that names the part ("Comment on S4"). "Add" actions keep the dashed primary border.
- **Design system:** colours via CSS variables; the client-feedback amber is `bg-client/15 text-client-text` (D310); Lucide `strokeWidth={1.5}`; easing `cubic-bezier(0.22,1,0.36,1)`.
- **Words:** "avatar", never "presenter"; spec 4's reopen is "Reopen to Visualise", distinct from spec 3's "Reopen".
- **ADR:** D357 (next free; D327–D336 are booked by spec 2).

## Review Focus

1. **A client on a phone presses a part's comment action** → the Comments sheet opens at that part with the composer open in place; posting adds the thread there and the composer closes. Test: Task 4 (composer in the focused group); the open-the-sheet path is checked in Task 11.
2. **A share with avatars where an avatar has only a front image (made before D339)** → the client sees the Front view and three empty tiles, and only Front takes comments. Tests: Task 1 (`avatarViewUrls` falls back to `front`), Task 5 (a marker only on views with an image).
3. **A shot whose picked take failed or has no image** → nothing is frozen for it; the client's tile reads "No panel" with no comment action. Tests: Task 1, Task 5.
4. **The team's Visualise page before anything is shared** → spec 3's two panes, unchanged: no empty column and no Comments button. Tests: Task 7 (frame without a column), Task 8 (no Comments button without a version).
5. **An approved script that never went through review (seeded)** → spec 1's read-only view, no error. Test: Task 9 (`loadApprovedVersion` is null without a review).

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/script-review/bridge.ts` | MP1/MP2 now real: picked panels from spec 3, four views from the avatar |
| `src/lib/script-review/constants.ts` | Re-exports spec 3's view list and labels |
| `src/lib/script-review/column.ts` | The column's groups (page order, the focused part) and the thread count |
| `src/lib/script-review/utils.ts` | `snapshotViewImages` (frozen view URLs → the sheet's image shape) |
| `src/lib/avatars/schema.ts` | `AvatarViewImages` (the sheet's image shape: URL only) |
| `src/hooks/use-media-query.ts`, `src/hooks/use-review-column.ts` | Wide-screen check; the column's focus and sheet state |
| `src/components/scripts/script-board-frame.tsx` | The Visualise board's frame, shared by specs 3 and 4 |
| `src/components/script-review/part-marker.tsx` | A part's count chip and comment action |
| `src/components/script-review/comments-column.tsx`, `review-column.tsx`, `comments-button.tsx` | The column, beside the board or in a sheet |
| `src/components/script-review/review-cast-card.tsx`, `review-cast.tsx`, `review-panel-tile.tsx`, `review-storyboard.tsx`, `frozen-board.tsx` | The read-only board for a frozen version |
| `src/components/visualise/panel-hover-line.tsx` | The shot's line over a tile on hover (extracted; two users) |
| `src/components/visualise/visualise-view.tsx` + `visualise-readiness.tsx`, `cast-slots.tsx`, `cast-slot.tsx`, `panel-tile.tsx` | Optional review hooks (MP4) |
| `src/components/script-review/team/review-actions.tsx`, `team-review-board.tsx`, `approved-review-board.tsx` | The team's review layer |
| `src/app/clients/[id]/scripts/[scriptId]/page.tsx` | Board · approved board · spec 1 view, by stage |

Removed in Task 10: `script-review-workspace.tsx`, `stage-actions.tsx`, `cast-review-slot.tsx`, `shot-review-slot.tsx`, `avatar-views.tsx`, `part-comments.tsx` and its test.

---

### Task 1: Spec 3's interfaces, for real (MP1, MP2) and one list of views

**Files:**
- Modify: `src/lib/script-review/bridge.ts`, `src/lib/script-review/visuals.ts`, `src/lib/script-review/constants.ts`
- Modify: `src/lib/script-review/__tests__/visuals.test.ts`, `src/lib/script-review/__tests__/constants.test.ts`
- Create: `src/lib/script-review/__tests__/bridge.test.ts`

**Interfaces:**
- Consumes: `listPanelPicks(scriptId): Promise<Record<shotId, takeId>>`, `listPanelTakes(scriptId): Promise<PanelTake[]>` from `@/lib/db/script-panels`; `Avatar.sheetViews: Record<AvatarViewId, AvatarImage | null> | null`, `Avatar.front`; `AVATAR_VIEWS`, `AVATAR_VIEW_LABELS` from `@/lib/avatars/constants`; `AvatarViewId` from `@/lib/avatars/schema`.
- Produces: `getPickedPanels(scriptId: string): Promise<Record<string, PanelSnapshot>>` (the clientId parameter is dropped: callers already checked the script's client); `avatarViewUrls(avatar)` returns all four views. `AVATAR_VIEWS`, `AvatarView`, `AVATAR_VIEW_LABEL`, `isAvatarView` keep their names, now backed by spec 3's list.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/script-review/__tests__/bridge.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeAvatar, makeImage } from "@/lib/avatars/__tests__/fixtures";
import type { PanelTake } from "@/lib/scripts/visualise/schema";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/script-panels", () => ({ listPanelPicks: vi.fn(), listPanelTakes: vi.fn() }));

import { listPanelPicks, listPanelTakes } from "@/lib/db/script-panels";
import { avatarViewUrls, getPickedPanels } from "../bridge";

const take = (id: string, over: Partial<PanelTake> = {}) =>
  ({ id, scriptId: "s1", shotId: "x", status: "succeeded", url: `https://cdn/${id}.png`, ...over }) as unknown as PanelTake;
const image = (url: string) => ({ ...makeImage(), url });

beforeEach(() => vi.resetAllMocks());

describe("getPickedPanels (MP1)", () => {
  it("freezes each shot's picked take, and nothing for a pick without a finished image (Review Focus 3)", async () => {
    vi.mocked(listPanelPicks).mockResolvedValue({ s01: "t1", s02: "t2", s03: "t3" });
    vi.mocked(listPanelTakes).mockResolvedValue([
      take("t1"),
      take("t2", { status: "failed", url: null }),
      take("t3", { status: "succeeded", url: null }),
      take("t9"),
    ]);
    expect(await getPickedPanels("s1")).toEqual({ s01: { takeId: "t1", url: "https://cdn/t1.png" } });
    expect(listPanelPicks).toHaveBeenCalledWith("s1");
  });
});

describe("avatarViewUrls (MP2)", () => {
  it("returns the four views", () => {
    const avatar = makeAvatar({
      sheetViews: { front: image("f"), left: image("l"), right: null, back: image("b") },
    });
    expect(avatarViewUrls(avatar)).toEqual({ front: "f", left: "l", right: null, back: "b" });
  });

  it("falls back to the front image for an avatar made before D339 (Review Focus 2)", () => {
    const avatar = makeAvatar({ sheetViews: null, front: image("front-only") });
    expect(avatarViewUrls(avatar)).toEqual({ front: "front-only", left: null, right: null, back: null });
  });
});
```

Append to `src/lib/script-review/__tests__/constants.test.ts`:

```ts
import * as avatarConstants from "@/lib/avatars/constants";
import { AVATAR_VIEWS, AVATAR_VIEW_LABEL } from "../constants";

describe("the four views", () => {
  it("are spec 3's list and labels, not a copy (CLAUDE.md: import, don't redefine)", () => {
    expect(AVATAR_VIEWS).toBe(avatarConstants.AVATAR_VIEWS);
    expect(AVATAR_VIEW_LABEL).toBe(avatarConstants.AVATAR_VIEW_LABELS);
  });
});
```

(Merge the `AVATAR_VIEWS, AVATAR_VIEW_LABEL` names into the file's existing import from `../constants`, and put the `avatarConstants` import with the other imports.)

In `src/lib/script-review/__tests__/visuals.test.ts`, change `expect(getPickedPanels).toHaveBeenCalledWith("c1", SCRIPT_ID);` to `expect(getPickedPanels).toHaveBeenCalledWith(SCRIPT_ID);`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/script-review/__tests__/bridge.test.ts src/lib/script-review/__tests__/constants.test.ts src/lib/script-review/__tests__/visuals.test.ts`
Expected: FAIL — `getPickedPanels` returns `{}` (stub), `avatarViewUrls` returns only front, the views are a copy (`toBe` fails), and visuals still passes the clientId.

- [ ] **Step 3: Write the bridge**

Replace `src/lib/script-review/bridge.ts` with:

```ts
// src/lib/script-review/bridge.ts
import "server-only";
import type { Avatar } from "@/lib/avatars/schema";
import { listPanelPicks, listPanelTakes } from "@/lib/db/script-panels";
import { AVATAR_VIEWS, type AvatarView } from "./constants";
import type { PanelSnapshot } from "./types";

// The two things spec 4 reads from spec 3 (Visualise), now merged (plan MP1, MP2). Nothing else in
// spec 4 reads panels or avatar views.

/** MP1 — each shot's picked take with a finished image: what the client sees (spec 3 §6.6). A pick
 *  whose take failed or has no image freezes nothing, so the client sees "No panel" for it. */
export async function getPickedPanels(scriptId: string): Promise<Record<string, PanelSnapshot>> {
  const [picks, takes] = await Promise.all([listPanelPicks(scriptId), listPanelTakes(scriptId)]);
  const byId = new Map(takes.map((t) => [t.id, t]));
  const panels: Record<string, PanelSnapshot> = {};
  for (const [shotId, takeId] of Object.entries(picks)) {
    const take = byId.get(takeId);
    if (take?.status === "succeeded" && take.url) panels[shotId] = { takeId, url: take.url };
  }
  return panels;
}

/** MP2 — an avatar's four views (D339). An avatar from before D339 has only its front image, which
 *  then stands as the Front view. */
export function avatarViewUrls(avatar: Avatar): Record<AvatarView, string | null> {
  const views = avatar.sheetViews;
  return Object.fromEntries(
    AVATAR_VIEWS.map((view) => [view, views?.[view]?.url ?? (view === "front" ? avatar.front?.url ?? null : null)]),
  ) as Record<AvatarView, string | null>;
}
```

In `src/lib/script-review/visuals.ts`, change `await getPickedPanels(clientId, script.id)` to `await getPickedPanels(script.id)`.

- [ ] **Step 4: Point the view list at spec 3's**

In `src/lib/script-review/constants.ts`, add to the top imports:

```ts
import { AVATAR_VIEWS, AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarViewId } from "@/lib/avatars/schema";
```

and replace the block from `/** Spec 3 §5.4 and spec 4 §5: every avatar has four views, and each takes comments. */` through the end of `isAvatarView` with:

```ts
/** Spec 3 owns the four views (D339); spec 4 comments on each. Spec 3's list, under spec 4's names. */
export { AVATAR_VIEWS };
export type AvatarView = AvatarViewId;
export const AVATAR_VIEW_LABEL: Record<AvatarView, string> = AVATAR_VIEW_LABELS;

export function isAvatarView(value: unknown): value is AvatarView {
  return typeof value === "string" && (AVATAR_VIEWS as readonly string[]).includes(value);
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/lib/script-review && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/script-review
git commit -m "feat(script-review): freeze spec 3's picked panels and four views (MP1, MP2); one list of views"
```

---

### Task 2: The column's groups, and its focus state

**Files:**
- Create: `src/lib/script-review/column.ts`, `src/lib/script-review/__tests__/column.test.ts`
- Create: `src/hooks/use-media-query.ts`, `src/hooks/use-review-column.ts`

**Interfaces:**
- Consumes: `PlacedThreads` (threads.ts); `partKey`, `partLabel`, `partOrder` (parts.ts); `Part`, `Thread` (types.ts).
- Produces: `ColumnGroup = { key: string; part: Part; label: string | null; threads: Thread[] }`; `columnGroups(placed, doc, focus: Part | null): ColumnGroup[]`; `threadCount(placed): number`; `ColumnFocus = { part: Part; compose: boolean; nonce: number }`; `useMediaQuery(query): boolean`; `REVIEW_COLUMN_QUERY`; `ReviewColumnState = { focus: ColumnFocus | null; openPart(part, compose): void; clearFocus(): void; columnOpen: boolean; setColumnOpen(open): void }`; `useReviewColumn(): ReviewColumnState`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/script-review/__tests__/column.test.ts
import { describe, it, expect } from "vitest";
import { columnGroups, threadCount } from "../column";
import { buildThreads, placeThreads } from "../threads";
import { comment, reelDoc } from "./fixtures";

const doc = reelDoc();
const placed = placeThreads(
  buildThreads([
    comment({ id: "a", part: { kind: "shot", shotId: "s04" } }),
    comment({ id: "b", part: { kind: "context" }, createdAt: "2026-10-10T10:05:00.000Z" }),
    comment({ id: "c", part: { kind: "shot", shotId: "s04" }, createdAt: "2026-10-10T10:06:00.000Z" }),
  ]),
  doc,
  {},
);

describe("columnGroups", () => {
  it("groups threads by part, in page order, each labelled", () => {
    const groups = columnGroups(placed, doc, null);
    expect(groups.map((g) => [g.label, g.threads.length])).toEqual([["Context", 1], ["S4", 2]]);
  });

  it("includes the part a marker opened even before it has a thread, in its place", () => {
    const groups = columnGroups(placed, doc, { kind: "cast", castId: "meenakshi" });
    expect(groups.map((g) => g.label)).toEqual(["Context", "Meenakshi", "S4"]);
    expect(groups[1].threads).toEqual([]);
  });

  it("never lists a part twice", () => {
    expect(columnGroups(placed, doc, { kind: "shot", shotId: "s04" })).toHaveLength(2);
  });
});

describe("threadCount", () => {
  it("counts every thread, those on removed shots included", () => {
    const gone = reelDoc();
    gone.shots = gone.shots.filter((s) => s.id !== "s04");
    expect(threadCount(placed)).toBe(3);
    expect(threadCount(placeThreads(buildThreads([comment({ part: { kind: "shot", shotId: "s04" } })]), gone, {}))).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/script-review/__tests__/column.test.ts`
Expected: FAIL with "Failed to resolve import ../column".

- [ ] **Step 3: Write the module and the two hooks**

```ts
// src/lib/script-review/column.ts
import type { ScriptDoc } from "@/lib/scripts/schema";
import { partKey, partLabel, partOrder } from "./parts";
import type { PlacedThreads } from "./threads";
import type { Part, Thread } from "./types";

/** One part's place in the Comments column. */
export type ColumnGroup = { key: string; part: Part; label: string | null; threads: Thread[] };

/** Where the column is focused: the part a marker opened, whether its composer is open, and a
 *  counter so pressing the same marker again scrolls to it again. */
export type ColumnFocus = { part: Part; compose: boolean; nonce: number };

/** Spec 4 §4 (review board): the column lists threads by part, in page order. The part a marker just
 *  opened is listed even with no thread yet, so its first comment is written in its place. */
export function columnGroups(placed: PlacedThreads, doc: ScriptDoc, focus: Part | null): ColumnGroup[] {
  const groups = new Map<string, ColumnGroup>();
  for (const [key, threads] of placed.byPart) {
    const part = threads[0].root.part;
    groups.set(key, { key, part, label: partLabel(part, doc), threads });
  }
  if (focus) {
    const key = partKey(focus);
    if (!groups.has(key)) groups.set(key, { key, part: focus, label: partLabel(focus, doc), threads: [] });
  }
  return [...groups.values()].sort((a, b) => partOrder(a.part, doc) - partOrder(b.part, doc));
}

/** Every thread on the page, those "On a removed shot" included: the Comments button's count. */
export function threadCount(placed: PlacedThreads): number {
  let count = placed.removed.reduce((n, r) => n + r.threads.length, 0);
  for (const threads of placed.byPart.values()) count += threads.length;
  return count;
}
```

```ts
// src/hooks/use-media-query.ts
import { useCallback, useSyncExternalStore } from "react";

/** Whether a CSS media query matches. False on the server and while hydrating, so the first
 *  browser render matches the server's HTML. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
```

```ts
// src/hooks/use-review-column.ts
"use client";

import { useCallback, useState } from "react";
import type { ColumnFocus } from "@/lib/script-review/column";
import type { Part } from "@/lib/script-review/types";
import { useMediaQuery } from "./use-media-query";

/** Tailwind's `xl`: from here the Comments column sits beside the board; below, it opens in a sheet. */
export const REVIEW_COLUMN_QUERY = "(min-width: 1280px)";

export type ReviewColumnState = {
  focus: ColumnFocus | null;
  /** A marker was pressed: focus its part in the column; `compose` opens its composer. */
  openPart: (part: Part, compose: boolean) => void;
  clearFocus: () => void;
  /** The narrow-screen sheet. */
  columnOpen: boolean;
  setColumnOpen: (open: boolean) => void;
};

/** Spec 4 §4, §6 (review board, 4.16): the column's focus and, below `xl`, its sheet. */
export function useReviewColumn(): ReviewColumnState {
  const wide = useMediaQuery(REVIEW_COLUMN_QUERY);
  const [focus, setFocus] = useState<ColumnFocus | null>(null);
  const [columnOpen, setColumnOpen] = useState(false);
  const openPart = useCallback(
    (part: Part, compose: boolean) => {
      setFocus((f) => ({ part, compose, nonce: (f?.nonce ?? 0) + 1 }));
      if (!wide) setColumnOpen(true);
    },
    [wide],
  );
  const clearFocus = useCallback(() => setFocus(null), []);
  return { focus, openPart, clearFocus, columnOpen, setColumnOpen };
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run src/lib/script-review/__tests__/column.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors. (The hooks have no unit test — the repo has no DOM test environment; they are exercised in Task 11.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/script-review/column.ts src/lib/script-review/__tests__/column.test.ts src/hooks/use-media-query.ts src/hooks/use-review-column.ts
git commit -m "feat(script-review): the Comments column's groups and focus state"
```

---

### Task 3: A part's marker, and the column on the surface

**Files:**
- Modify: `src/components/script-review/review-surface-context.tsx`
- Modify: `src/components/script-review/script-review-page.tsx`, `src/components/script-review/team/script-review-workspace.tsx`, `src/components/script-review/__tests__/part-comments.test.tsx` (spread the column state into the surface; these three go in Task 10)
- Create: `src/components/script-review/part-marker.tsx`
- Create: `src/components/script-review/__tests__/surface.tsx` (test helper), `src/components/script-review/__tests__/part-marker.test.tsx`

**Interfaces:**
- Consumes: `ReviewColumnState`, `useReviewColumn` (Task 2); `partKey`, `partLabel`.
- Produces: `ReviewSurface = ReviewColumnState & { mode; doc; placed; commentable; onPost?; onEdit?; onReply?; onResolve? }`; `PartMarker({ part, label?, className? })`; test helpers `testSurface(over?)`, `renderInSurface(surface, node)`.

- [ ] **Step 1: Write the test helper and the failing test**

```tsx
// src/components/script-review/__tests__/surface.tsx
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { partKey } from "@/lib/script-review/parts";
import { buildThreads, placeThreads } from "@/lib/script-review/threads";
import type { Part, ScriptComment } from "@/lib/script-review/types";
import { reelDoc } from "@/lib/script-review/__tests__/fixtures";
import { ReviewSurfaceProvider, type ReviewSurface } from "../review-surface-context";

/** A client-mode surface over Reel 01 with the given comments and commentable parts. */
export function testSurface(
  over: { comments?: ScriptComment[]; commentable?: Part[]; mode?: "client" | "team" } & Partial<ReviewSurface> = {},
): ReviewSurface {
  const { comments = [], commentable = [], mode = "client", ...rest } = over;
  const doc = reelDoc();
  return {
    mode,
    doc,
    placed: placeThreads(buildThreads(comments), doc, {}),
    commentable: new Map(commentable.map((p) => [partKey(p), p])),
    onPost: mode === "client" ? async () => {} : undefined,
    focus: null,
    openPart: () => {},
    clearFocus: () => {},
    columnOpen: false,
    setColumnOpen: () => {},
    ...rest,
  };
}

export const renderInSurface = (surface: ReviewSurface, node: ReactNode) =>
  renderToStaticMarkup(<ReviewSurfaceProvider value={surface}>{node}</ReviewSurfaceProvider>);
```

```tsx
// src/components/script-review/__tests__/part-marker.test.tsx
import { describe, it, expect } from "vitest";
import type { Part } from "@/lib/script-review/types";
import { comment } from "@/lib/script-review/__tests__/fixtures";
import { PartMarker } from "../part-marker";
import { renderInSurface, testSurface } from "./surface";

const S4: Part = { kind: "shot", shotId: "s04" };
const FRONT: Part = { kind: "view", castId: "meenakshi", view: "front" };

describe("PartMarker (review board)", () => {
  it("counts a part's threads in the client-feedback amber and marks the part", () => {
    const html = renderInSurface(
      testSurface({ comments: [comment({ part: S4 }), comment({ id: "c2", part: S4 })], commentable: [S4] }),
      <PartMarker part={S4} />,
    );
    expect(html).toContain("data-part-commented");
    expect(html).toContain("bg-client/15");
    expect(html).toContain('aria-label="2 comments on S4"');
    expect(html).toContain('aria-label="Comment on S4"');
  });

  it("offers only the comment action on a part with no thread", () => {
    const html = renderInSurface(testSurface({ commentable: [S4] }), <PartMarker part={S4} />);
    expect(html).not.toContain("data-part-commented");
    expect(html).toContain('aria-label="Comment on S4"');
  });

  it("names a view in full", () => {
    const html = renderInSurface(testSurface({ commentable: [FRONT] }), <PartMarker part={FRONT} />);
    expect(html).toContain('aria-label="Comment on Meenakshi · Front view"');
  });

  it("renders nothing where no one can comment and nothing was said (the team; after approval)", () => {
    expect(renderInSurface(testSurface({ mode: "team" }), <PartMarker part={S4} />)).toBe("");
  });

  it("never draws the threads themselves", () => {
    const html = renderInSurface(testSurface({ comments: [comment({ part: S4, body: "Make it seven steps" })] }), <PartMarker part={S4} />);
    expect(html).not.toContain("Make it seven steps");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/script-review/__tests__/part-marker.test.tsx`
Expected: FAIL with "Failed to resolve import ../part-marker" (and a type error in the helper: `focus` is not on `ReviewSurface` yet).

- [ ] **Step 3: Put the column on the surface**

In `src/components/script-review/review-surface-context.tsx`, add `import type { ReviewColumnState } from "@/hooks/use-review-column";` and change `export type ReviewSurface = {` to `export type ReviewSurface = ReviewColumnState & {`. Change the comment on `ReviewSurface` to: `// What every comment control on a review page needs, given once (docs/component-structure.md: no prop drilling), including the Comments column's focus (review board). The client's page and the team's view fill it differently.`

In `src/components/script-review/script-review-page.tsx` and `src/components/script-review/team/script-review-workspace.tsx`: add `import { useReviewColumn } from "@/hooks/use-review-column";`, call `const column = useReviewColumn();` beside the other hooks, and start the surface object with `...column,`. In `src/components/script-review/__tests__/part-comments.test.tsx`, add to the object `surface()` returns: `focus: null, openPart: () => {}, clearFocus: () => {}, columnOpen: false, setColumnOpen: () => {},`.

- [ ] **Step 4: Write the marker**

```tsx
// src/components/script-review/part-marker.tsx
"use client";

import { MessageSquarePlus, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { partKey, partLabel } from "@/lib/script-review/parts";
import type { Part } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";

/** Spec 4 §4, §6 (review board, 4.15): a part's marker — its thread count in D310's amber, and the
 *  comment action. Both open the part in the Comments column; threads are never drawn here.
 *  `data-part-commented` lets the part's own card pick up a faint amber edge. Nothing renders for
 *  a part no one may comment on now with nothing said (the team's view; after approval). */
export function PartMarker({ part, label, className }: { part: Part; label?: string; className?: string }) {
  const { doc, placed, commentable, onPost, openPart } = useReviewSurface();
  const key = partKey(part);
  const count = placed.byPart.get(key)?.length ?? 0;
  const canComment = Boolean(onPost) && commentable.has(key);
  if (count === 0 && !canComment) return null;
  const name = label ?? partLabel(part, doc) ?? "this part";

  return (
    <span className={cn("inline-flex items-center gap-1", className)} data-part-commented={count > 0 ? "" : undefined}>
      {count > 0 && (
        <Button
          variant="ghost"
          size="xs"
          aria-label={`${count} ${count === 1 ? "comment" : "comments"} on ${name}`}
          onClick={() => openPart(part, false)}
          className="h-6 rounded-full bg-client/15 px-2 tabular-nums text-client-text hover:bg-client/25 hover:text-client-text"
        >
          <MessageSquareText strokeWidth={1.5} aria-hidden />
          {count}
        </Button>
      )}
      {canComment && (
        <Button
          variant="outline"
          size="icon-xs"
          aria-label={`Comment on ${name}`}
          onClick={() => openPart(part, true)}
          className="border-dashed border-primary/40 text-primary hover:bg-primary/5"
        >
          <MessageSquarePlus strokeWidth={1.5} />
        </Button>
      )}
    </span>
  );
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/components/script-review && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/script-review
git commit -m "feat(script-review): a part's marker opens its thread in the column; the surface carries the column's focus"
```

---

### Task 4: The Comments column — beside the board, or in a sheet

**Files:**
- Modify: `src/components/script-review/comments-column.tsx`, `src/components/script-review/part-link.tsx`
- Create: `src/components/script-review/review-column.tsx`, `src/components/script-review/comments-button.tsx`
- Test: `src/components/script-review/__tests__/comments-column.test.tsx`

**Interfaces:**
- Consumes: `columnGroups`, `threadCount` (Task 2); surface (Task 3); `CommentThread`, `PartComposer`, `AddComment`, `ActivityList`, `PartLink`; `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`.
- Produces: `CommentsColumn()` (focus-aware); `ReviewColumn({ activity })`; `CommentsButton({ count })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/script-review/__tests__/comments-column.test.tsx
import { describe, it, expect } from "vitest";
import type { Part } from "@/lib/script-review/types";
import { comment } from "@/lib/script-review/__tests__/fixtures";
import { CommentsColumn } from "../comments-column";
import { renderInSurface, testSurface } from "./surface";

const S4: Part = { kind: "shot", shotId: "s04" };

describe("CommentsColumn (review board)", () => {
  it("opens the composer in place for a part a marker opened, before it has a thread (Review Focus 1)", () => {
    const html = renderInSurface(
      testSurface({ commentable: [S4], focus: { part: S4, compose: true, nonce: 1 } }),
      <CommentsColumn />,
    );
    expect(html).toContain('placeholder="Comment on S4"');
    expect(html).toContain("data-column-part");
  });

  it("only scrolls to a part when the marker was its count, not the comment action", () => {
    const html = renderInSurface(
      testSurface({ comments: [comment({ part: S4 })], commentable: [S4], focus: { part: S4, compose: false, nonce: 1 } }),
      <CommentsColumn />,
    );
    expect(html).not.toContain('placeholder="Comment on S4"');
    expect(html).toContain("ring-client/30");
  });

  it("opens no composer once comments are closed", () => {
    const html = renderInSurface(
      testSurface({ commentable: [], focus: { part: S4, compose: true, nonce: 1 } }),
      <CommentsColumn />,
    );
    expect(html).not.toContain("<textarea");
  });

  it("says a part is gone from the live script in the team's view", () => {
    const html = renderInSurface(
      testSurface({ mode: "team", comments: [comment({ part: { kind: "cast", castId: "gone" } })] }),
      <CommentsColumn />,
    );
    expect(html).toContain("No longer in the script");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/script-review/__tests__/comments-column.test.tsx`
Expected: FAIL — no composer for a focused part (the column has no focus yet), no "No longer in the script".

- [ ] **Step 3: Rewrite the column**

Replace `src/components/script-review/comments-column.tsx` with:

```tsx
// src/components/script-review/comments-column.tsx
"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { columnGroups, threadCount } from "@/lib/script-review/column";
import { partKey } from "@/lib/script-review/parts";
import { useReviewSurface } from "./review-surface-context";
import { AddComment } from "./add-comment";
import { CommentThread } from "./comment-thread";
import { PartComposer } from "./part-composer";
import { PartLink } from "./part-link";

/** Spec 4 §4, §6 (review board): every thread, grouped by part in page order, then "On a removed
 *  shot". A part's marker opens its group here — scrolled to and ringed, and for a new comment
 *  with the composer open in place. */
export function CommentsColumn() {
  const { placed, doc, mode, focus, commentable, onPost, clearFocus } = useReviewSurface();
  const root = useRef<HTMLElement>(null);
  const groups = columnGroups(placed, doc, focus?.part ?? null);
  const focusKey = focus ? partKey(focus.part) : null;
  const total = threadCount(placed);

  useEffect(() => {
    if (!focusKey) return;
    root.current
      ?.querySelector(`[data-column-part="${CSS.escape(focusKey)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusKey, focus?.nonce]);

  return (
    <section ref={root} aria-label="Comments" className="flex flex-col gap-4">
      <h2 className="text-eyebrow">Comments{total > 0 ? ` · ${total}` : ""}</h2>
      {groups.length === 0 && placed.removed.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {groups.map((g) => {
        const focused = g.key === focusKey;
        const composing = focused && Boolean(focus?.compose) && Boolean(onPost) && commentable.has(g.key);
        return (
          <div
            key={g.key}
            data-column-part={g.key}
            className={cn(
              "flex flex-col gap-2 rounded-lg transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              focused && "bg-client/5 p-2 ring-1 ring-client/30",
            )}
          >
            {g.label ? (
              <PartLink part={g.part} label={g.label} />
            ) : (
              <span className="text-sm font-medium">{mode === "team" ? "No longer in the script" : "Not in this version"}</span>
            )}
            {g.threads.length > 0 && (
              <ul className="flex flex-col gap-2">
                {g.threads.map((t) => (
                  <CommentThread key={t.root.id} thread={t} />
                ))}
              </ul>
            )}
            {composing && onPost && (
              <PartComposer
                placeholder={`Comment on ${g.label ?? "this part"}`}
                submitLabel="Post"
                onSubmit={async (body) => {
                  await onPost(g.part, body);
                  clearFocus();
                }}
                onCancel={clearFocus}
              />
            )}
          </div>
        );
      })}
      {placed.removed.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <span className="text-eyebrow">On a removed shot</span>
          {placed.removed.map((r) => (
            <div key={r.shotId} className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{r.label}</span>
                {r.text ? ` · ${r.text}` : ""}
              </p>
              <ul className="flex flex-col gap-2">
                {r.threads.map((t) => (
                  <CommentThread key={t.root.id} thread={t} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {mode === "client" && <AddComment />}
    </section>
  );
}
```

In `src/components/script-review/part-link.tsx`, close the sheet before jumping (the part is behind it on a narrow screen): read `const { setColumnOpen } = useReviewSurface();` (import `useReviewSurface` from `./review-surface-context`) and change the `onClick` to:

```tsx
onClick={() => {
  setColumnOpen(false);
  document.getElementById(partAnchor(part))?.scrollIntoView({ behavior: "smooth", block: "center" });
}}
```

- [ ] **Step 4: Write the column frame and the button**

```tsx
// src/components/script-review/review-column.tsx
"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ActivityLine } from "@/lib/script-review/types";
import { ActivityList } from "./activity-list";
import { CommentsColumn } from "./comments-column";
import { useReviewSurface } from "./review-surface-context";

/** Spec 4 §4, §6 (review board, 4.16): Comments and Activity — beside the board from `xl`, and below
 *  that in a sheet over the page, opened by the Comments button or any part's marker. */
export function ReviewColumn({ activity }: { activity: ActivityLine[] }) {
  const { columnOpen, setColumnOpen } = useReviewSurface();
  const body = (
    <>
      <CommentsColumn />
      <ActivityList lines={activity} />
    </>
  );
  return (
    <>
      <aside
        aria-label="Comments and activity"
        className="hidden min-w-0 flex-col gap-8 xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto"
      >
        {body}
      </aside>
      <Sheet open={columnOpen} onOpenChange={setColumnOpen}>
        <SheetContent side="right" className="w-full gap-8 overflow-y-auto p-4 sm:max-w-md">
          <SheetHeader className="p-0">
            <SheetTitle>Comments and activity</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    </>
  );
}
```

```tsx
// src/components/script-review/comments-button.tsx
"use client";

import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReviewSurface } from "./review-surface-context";

/** Below `xl`, the way into the Comments column (review board, 4.16). */
export function CommentsButton({ count }: { count: number }) {
  const { setColumnOpen } = useReviewSurface();
  return (
    <Button variant="outline" size="sm" className="xl:hidden" onClick={() => setColumnOpen(true)}>
      <MessageSquareText strokeWidth={1.5} />
      Comments{count > 0 ? ` · ${count}` : ""}
    </Button>
  );
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/components/script-review && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/script-review
git commit -m "feat(script-review): the Comments column — focused groups, composer in place, a sheet on narrow screens"
```

---

### Task 5: The read-only visuals and the shared frame

**Files:**
- Modify: `src/lib/avatars/schema.ts` (add `AvatarViewImages`), `src/components/avatars/avatar-sheet-views.tsx`, `src/components/avatars/avatar-views-gallery.tsx` (accept it)
- Modify: `src/lib/script-review/utils.ts` (add `snapshotViewImages`), `src/lib/script-review/__tests__/utils.test.ts`
- Create: `src/components/visualise/panel-hover-line.tsx`; Modify: `src/components/visualise/panel-tile.tsx` (use it)
- Create: `src/components/scripts/script-board-frame.tsx`
- Create: `src/components/script-review/review-cast-card.tsx`, `review-cast.tsx`, `review-panel-tile.tsx`, `review-storyboard.tsx`
- Test: `src/components/script-review/__tests__/review-visuals.test.tsx`, `src/components/scripts/__tests__/script-board-frame.test.tsx`

**Interfaces:**
- Consumes: `AvatarSheetViews` (spec 3), `StoryboardGrid` (spec 3), `panelAspect(doc)` from `@/lib/scripts/visualise/panel-prompt`, `timeShots`, `formatRange`, `castAnchor`, `PartMarker` (Task 3), `VoiceSampleButton`, `AvatarSnapshot`, `PanelSnapshot`, `VersionVisuals`.
- Produces: `AvatarViewImages = Record<AvatarViewId, Pick<AvatarImage, "url"> | null>`; `snapshotViewImages(views: Record<AvatarView, string | null>): AvatarViewImages`; `PanelHoverLine({ text })`; `ScriptBoardFrame({ script, visuals, column? })`; `ReviewCastCard({ member, avatar?, showAvatar })`; `ReviewCast({ doc, visuals, showAvatars })`; `ReviewPanelTile({ shotId, label, time, description, url, aspect, onOpen })`; `ReviewStoryboard({ doc, panels })`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/script-review/__tests__/utils.test.ts` (add `snapshotViewImages` to the import from `../utils`):

```ts
describe("snapshotViewImages", () => {
  it("gives the sheet the shape it draws, with no image where a view was not frozen", () => {
    expect(snapshotViewImages({ front: "f", left: null, right: "r", back: null })).toEqual({
      front: { url: "f" }, left: null, right: { url: "r" }, back: null,
    });
  });
});
```

```tsx
// src/components/script-review/__tests__/review-visuals.test.tsx
import { describe, it, expect } from "vitest";
import { avatarSnapshot, reelDoc } from "@/lib/script-review/__tests__/fixtures";
import type { Part } from "@/lib/script-review/types";
import { ReviewCastCard } from "../review-cast-card";
import { ReviewStoryboard } from "../review-storyboard";
import { renderInSurface, testSurface } from "./surface";

const meenakshi = reelDoc().cast[0];
const view = (v: "front" | "left"): Part => ({ kind: "view", castId: "meenakshi", view: v });

describe("ReviewCastCard", () => {
  it("shows the four-view sheet on a share with avatars, with a comment action only on views that have an image (Review Focus 2)", () => {
    const html = renderInSurface(
      testSurface({ commentable: [{ kind: "cast", castId: "meenakshi" }, view("front")] }),
      <ReviewCastCard member={meenakshi} avatar={avatarSnapshot({ front: "https://cdn/f.png" })} showAvatar />,
    );
    expect(html).toContain("Meenakshi: four views");
    expect(html).toContain('aria-label="Comment on Meenakshi · Front view"');
    expect(html).not.toContain("Left view");
    expect(html).toContain('aria-label="Comment on Meenakshi"');
    expect(html).toContain('id="cast-meenakshi"');
  });

  it("shows the person without a sheet on a script-only share", () => {
    const html = renderInSurface(testSurface(), <ReviewCastCard member={meenakshi} showAvatar={false} />);
    expect(html).toContain(meenakshi.description);
    expect(html).not.toContain("four views");
    expect(html).not.toContain("No avatar in this version");
  });

  it("says so when a share with avatars left this person's avatar out", () => {
    const html = renderInSurface(testSurface(), <ReviewCastCard member={meenakshi} showAvatar />);
    expect(html).toContain("No avatar in this version");
  });
});

describe("ReviewStoryboard", () => {
  it("draws each shot's frozen panel with no Generate button, and an empty frame where there is none (Review Focus 3)", () => {
    const html = renderInSurface(
      testSurface({ commentable: [{ kind: "panel", shotId: "s01" }] }),
      <ReviewStoryboard doc={reelDoc()} panels={{ s01: { takeId: "t1", url: "https://cdn/s01.png" } }} />,
    );
    expect(html).toContain("Storyboard");
    expect(html).toContain('aria-label="Open the S1 panel"');
    expect(html).toContain('aria-label="Comment on S1 panel"');
    expect(html).toContain("No panel");
    expect(html).not.toContain("Generate");
    expect(html).not.toContain("Comment on S2 panel");
  });
});
```

```tsx
// src/components/scripts/__tests__/script-board-frame.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScriptBoardFrame } from "../script-board-frame";

describe("ScriptBoardFrame", () => {
  it("is spec 3's two panes when there is no column (Review Focus 4)", () => {
    const html = renderToStaticMarkup(<ScriptBoardFrame script={<p>script</p>} visuals={<p>visuals</p>} />);
    expect(html).toContain('aria-label="Visuals"');
    expect(html).not.toContain("xl:grid-cols");
  });

  it("adds the Comments column at the right from xl", () => {
    const html = renderToStaticMarkup(<ScriptBoardFrame script={<p>s</p>} visuals={<p>v</p>} column={<aside>column</aside>} />);
    expect(html).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_20rem]");
    expect(html).toContain("<aside>column</aside>");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/script-review/__tests__/utils.test.ts src/components/script-review/__tests__/review-visuals.test.tsx src/components/scripts/__tests__/script-board-frame.test.tsx`
Expected: FAIL — `snapshotViewImages` not exported; the three components do not resolve.

- [ ] **Step 3: Widen the sheet's image type**

In `src/lib/avatars/schema.ts`, after `export type AvatarSheetViews = Record<AvatarViewId, AvatarImage | null>;` add:

```ts
/** What a sheet draws for each view: only the URL. A live avatar's views fit it, and so does a
 *  shared version's frozen snapshot (spec 4), which keeps URLs only. */
export type AvatarViewImages = Record<AvatarViewId, Pick<AvatarImage, "url"> | null>;
```

In `src/components/avatars/avatar-sheet-views.tsx`, change the import `import type { AvatarSheetViews as Views, AvatarViewId } from "@/lib/avatars/schema";` to `import type { AvatarViewImages as Views, AvatarViewId } from "@/lib/avatars/schema";`. In `src/components/avatars/avatar-views-gallery.tsx`, change `import type { AvatarSheetViews, AvatarViewId }` to `import type { AvatarViewImages, AvatarViewId }` and `views: AvatarSheetViews;` to `views: AvatarViewImages;`.

Append to `src/lib/script-review/utils.ts` (and add `import { AVATAR_VIEWS, type AvatarView } from "./constants";` and `import type { AvatarViewImages } from "@/lib/avatars/schema";` to its imports):

```ts
/** A frozen avatar's view URLs in the shape spec 3's sheet draws. */
export function snapshotViewImages(views: Record<AvatarView, string | null>): AvatarViewImages {
  return Object.fromEntries(AVATAR_VIEWS.map((v) => [v, views[v] ? { url: views[v] } : null])) as AvatarViewImages;
}
```

- [ ] **Step 4: Extract the tile's hover line (second user)**

```tsx
// src/components/visualise/panel-hover-line.tsx
/** The shot's visual line over a storyboard tile, on hover or focus (spec 3 testing). The scrim is
 *  sized for a white sketch, the brightest case. The parent must be `group relative`. */
export function PanelHoverLine({ text }: { text: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-foreground/90 via-foreground/70 to-transparent px-3 pb-3 pt-10 opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-within:opacity-100 group-hover:opacity-100"
    >
      <p className="line-clamp-5 text-xs leading-snug text-background">{text}</p>
    </div>
  );
}
```

In `src/components/visualise/panel-tile.tsx`, add `import { PanelHoverLine } from "./panel-hover-line";` and replace the `{!busy && ( <div aria-hidden …> … </div> )}` block (and its two comment lines above it) with:

```tsx
        {/* The shot on hover or focus. Not while drawing: the placeholder already shows it. */}
        {!busy && <PanelHoverLine text={description} />}
```

- [ ] **Step 5: Write the frame and the read-only visuals**

```tsx
// src/components/scripts/script-board-frame.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The Visualise board's frame (spec 3 §4), shared with client review (spec 4 §4): the script in one
 *  pane, the Visuals pane beside it, and, when given, the Comments column at the right from `xl`.
 *  Below `lg` the panes stack, script first. */
export function ScriptBoardFrame({ script, visuals, column }: { script: ReactNode; visuals: ReactNode; column?: ReactNode }) {
  return (
    <div
      className={cn(
        "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
        column && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_20rem]",
      )}
    >
      {script}
      <section aria-label="Visuals" className="flex min-w-0 flex-col gap-6 rounded-2xl bg-muted/40 p-4">
        {visuals}
      </section>
      {column}
    </div>
  );
}
```

```tsx
// src/components/script-review/review-cast-card.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AvatarSheetViews } from "@/components/avatars/avatar-sheet-views";
import { castAnchor } from "@/lib/scripts/anchors";
import type { CastMember } from "@/lib/scripts/schema";
import type { AvatarSnapshot } from "@/lib/script-review/types";
import { snapshotViewImages } from "@/lib/script-review/utils";
import { PartMarker } from "./part-marker";
import { VoiceSampleButton } from "./voice-sample-button";

/** Spec 4 §4 (review board): a cast member as the client sees them — spec 3's cast card with every
 *  making control taken out. The four-view sheet and the voice show on a share with avatars. */
export function ReviewCastCard({ member, avatar, showAvatar }: { member: CastMember; avatar?: AvatarSnapshot; showAvatar: boolean }) {
  return (
    <Card id={castAnchor(member.id)} className="flex flex-col gap-3 p-4 shadow-card has-[[data-part-commented]]:border-client/40">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-medium">{member.name}</h3>
            {member.isLead && <Badge variant="outline">Lead</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{member.description}</p>
        </div>
        <PartMarker part={{ kind: "cast", castId: member.id }} className="shrink-0" />
      </header>
      {showAvatar &&
        (avatar ? (
          <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
            <AvatarSheetViews
              columns={2}
              name={member.name}
              views={snapshotViewImages(avatar.views)}
              generating={[]}
              marker={(view) =>
                avatar.views[view] ? <PartMarker part={{ kind: "view", castId: member.id, view }} className="self-center" /> : null
              }
            />
            {avatar.voice && (
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs text-muted-foreground">Voice</span>
                {avatar.voice.name && <span>{avatar.voice.name}</span>}
                {avatar.voice.sampleUrl && <VoiceSampleButton url={avatar.voice.sampleUrl} />}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No avatar in this version.</p>
        ))}
    </Card>
  );
}
```

```tsx
// src/components/script-review/review-cast.tsx
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { VersionVisuals } from "@/lib/script-review/types";
import { ReviewCastCard } from "./review-cast-card";

/** The Visuals pane's cast, read-only, in the script's order (spec 3's CastSlots, for a version). */
export function ReviewCast({ doc, visuals, showAvatars }: { doc: ScriptDoc; visuals: VersionVisuals; showAvatars: boolean }) {
  return (
    <section aria-label="Cast" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Cast</h2>
      <div className="grid gap-4">
        {doc.cast.map((member) => (
          <ReviewCastCard key={member.id} member={member} avatar={visuals.avatars[member.id]} showAvatar={showAvatars} />
        ))}
      </div>
    </section>
  );
}
```

```tsx
// src/components/script-review/review-panel-tile.tsx
"use client";

import { Button } from "@/components/ui/button";
import { PanelHoverLine } from "@/components/visualise/panel-hover-line";
import { PartMarker } from "./part-marker";

/** Spec 4 §4 (review board): one shot's panel as the client sees it — spec 3's tile without the
 *  Generate button or status badges; the shot's line on hover; a tap enlarges it. */
export function ReviewPanelTile({ shotId, label, time, description, url, aspect, onOpen }: {
  shotId: string;
  label: string;
  time: string;
  description: string;
  url: string | null;
  aspect: string;
  onOpen: () => void;
}) {
  const style = { aspectRatio: aspect.replace(":", " / ") };
  return (
    <figure className="relative m-0 flex min-w-0 flex-col gap-2">
      <div className="group relative">
        {url ? (
          <div className="relative w-full overflow-hidden rounded-lg border border-border" style={style}>
            <Button
              variant="ghost"
              aria-label={`Open the ${label} panel`}
              onClick={onOpen}
              className="absolute inset-0 h-full w-full cursor-zoom-in rounded-none p-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-center rounded-lg border border-border bg-card text-xs text-muted-foreground" style={style}>
            No panel
          </div>
        )}
        {url && <PanelHoverLine text={description} />}
      </div>
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums">{time}</span>
      </figcaption>
      {url && <PartMarker part={{ kind: "panel", shotId }} label={`${label} panel`} className="self-start" />}
    </figure>
  );
}
```

```tsx
// src/components/script-review/review-storyboard.tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StoryboardGrid } from "@/components/visualise/storyboard-grid";
import { panelAspect } from "@/lib/scripts/visualise/panel-prompt";
import { formatRange, timeShots } from "@/lib/scripts/timeline";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { PanelSnapshot } from "@/lib/script-review/types";
import { ReviewPanelTile } from "./review-panel-tile";

/** Spec 4 §4 (review board): the shared Storyboard — every shot's frozen panel in order, enlarging on
 *  a tap. Shown on a full share only. */
export function ReviewStoryboard({ doc, panels }: { doc: ScriptDoc; panels: Record<string, PanelSnapshot> }) {
  const [open, setOpen] = useState<string | null>(null);
  const timed = timeShots(doc.shots);
  const aspect = panelAspect(doc);
  const current = open ? timed.find((t) => t.shot.id === open) : undefined;
  const currentPanel = current ? panels[current.shot.id] : undefined;

  return (
    <>
      <StoryboardGrid>
        {timed.map((t) => (
          <ReviewPanelTile
            key={t.shot.id}
            shotId={t.shot.id}
            label={`S${t.index + 1}`}
            time={formatRange(t.start, t.end)}
            description={t.shot.visual}
            url={panels[t.shot.id]?.url ?? null}
            aspect={aspect}
            onOpen={() => setOpen(t.shot.id)}
          />
        ))}
      </StoryboardGrid>
      {current && currentPanel && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpen(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>S{current.index + 1} · panel</DialogTitle>
              <DialogDescription>{current.shot.visual}</DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentPanel.url} alt={`Storyboard panel for S${current.index + 1}`} className="w-full rounded-lg border border-border object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run src/lib/script-review src/components/script-review src/components/scripts src/components/visualise src/components/avatars && npx tsc --noEmit`
Expected: PASS; no type errors (spec 3's own tests still pass).

- [ ] **Step 7: Commit**

```bash
git add src/lib/avatars/schema.ts src/components/avatars/avatar-sheet-views.tsx src/components/avatars/avatar-views-gallery.tsx src/lib/script-review/utils.ts src/lib/script-review/__tests__/utils.test.ts src/components/visualise/panel-hover-line.tsx src/components/visualise/panel-tile.tsx src/components/scripts/script-board-frame.tsx src/components/scripts/__tests__/script-board-frame.test.tsx src/components/script-review
git commit -m "feat(script-review): read-only cast cards and storyboard for a shared version, in Visualise's frame"
```

---

### Task 6: The client's page on the board

**Files:**
- Create: `src/components/script-review/frozen-board.tsx`
- Modify: `src/components/script-review/script-review-page.tsx`
- Test: `src/components/script-review/__tests__/frozen-board.test.tsx`

**Interfaces:**
- Consumes: `ScriptBoardFrame`, `ReviewCast`, `ReviewStoryboard` (Task 5); `PartMarker` (Task 3); `ReviewColumn`, `CommentsButton` (Task 4); `useReviewColumn`, `threadCount` (Task 2); `ScriptView` (compact, `cast={null}`, `slots.context`, `shotAside`); `scopeIncludes`.
- Produces: `FrozenBoard({ version, stage, column })` where `version: Pick<VersionContent, "scope" | "doc" | "visuals">`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/script-review/__tests__/frozen-board.test.tsx
import { describe, it, expect } from "vitest";
import { avatarSnapshot, content } from "@/lib/script-review/__tests__/fixtures";
import { FrozenBoard } from "../frozen-board";
import { renderInSurface, testSurface } from "./surface";

const render = (scope: "script" | "avatars" | "panels") =>
  renderInSurface(
    testSurface({ commentable: [{ kind: "context" }, { kind: "shot", shotId: "s01" }] }),
    <FrozenBoard
      version={content({ scope, visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: { s01: { takeId: "t", url: "https://cdn/p.png" } } } })}
      stage="in_review"
      column={<aside>the column</aside>}
    />,
  );

describe("FrozenBoard (review board, 4.14)", () => {
  it("draws a script-only share as the board: the script with markers, the cast, no sheets, no storyboard", () => {
    const html = render("script");
    expect(html).toContain('id="script-context"');
    expect(html).toContain("S14");
    expect(html).toContain('aria-label="Comment on S1"');
    expect(html).toContain('aria-label="Comment on Context"');
    expect(html).toContain('aria-label="Cast"');
    expect(html).not.toContain("four views");
    expect(html).not.toContain('aria-label="Storyboard"');
    expect(html).toContain("<aside>the column</aside>");
  });

  it("adds the four-view sheets on a share with avatars", () => {
    const html = render("avatars");
    expect(html).toContain("Meenakshi: four views");
    expect(html).not.toContain('aria-label="Storyboard"');
  });

  it("adds the Storyboard on a full share", () => {
    expect(render("panels")).toContain('aria-label="Storyboard"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/script-review/__tests__/frozen-board.test.tsx`
Expected: FAIL with "Failed to resolve import ../frozen-board".

- [ ] **Step 3: Write the frozen board**

```tsx
// src/components/script-review/frozen-board.tsx
"use client";

import type { ReactNode } from "react";
import { ScriptBoardFrame } from "@/components/scripts/script-board-frame";
import { ScriptView } from "@/components/scripts/script-view";
import { scopeIncludes } from "@/lib/script-review/constants";
import type { VersionContent } from "@/lib/script-review/types";
import type { ScriptStage } from "@/lib/scripts/constants";
import { PartMarker } from "./part-marker";
import { ReviewCast } from "./review-cast";
import { ReviewStoryboard } from "./review-storyboard";

/** Spec 4 §4 (review board, 4.14): a shared version, read-only, in the Visualise frame — the script
 *  in its compact form with a marker on the context card and each shot, the cast, and on a full
 *  share the Storyboard. The client's page, and the team's page after approval (4.17). */
export function FrozenBoard({ version, stage, column }: {
  version: Pick<VersionContent, "scope" | "doc" | "visuals">;
  stage: ScriptStage;
  column: ReactNode;
}) {
  return (
    <ScriptBoardFrame
      script={
        <ScriptView
          script={{ doc: version.doc, stage }}
          avatarFaces={{}}
          compact
          cast={null}
          slots={{ context: <PartMarker part={{ kind: "context" }} className="self-end" /> }}
          shotAside={(t) => <PartMarker part={{ kind: "shot", shotId: t.shot.id }} />}
        />
      }
      visuals={
        <>
          <ReviewCast doc={version.doc} visuals={version.visuals} showAvatars={scopeIncludes(version.scope, "avatars")} />
          {scopeIncludes(version.scope, "panels") && <ReviewStoryboard doc={version.doc} panels={version.visuals.panels} />}
        </>
      }
      column={column}
    />
  );
}
```

- [ ] **Step 4: Put the client's page on it**

In `src/components/script-review/script-review-page.tsx`:

1. Replace the imports of `ScriptView`, `ScriptViewSlots`, `scopeIncludes`, `ActivityList`, `CastReviewSlot`, `CommentsColumn`, `PartComments` and `ShotReviewSlot` with:

```tsx
import { threadCount } from "@/lib/script-review/column";
import { CommentsButton } from "./comments-button";
import { FrozenBoard } from "./frozen-board";
import { ReviewColumn } from "./review-column";
```

2. Delete the `showAvatars`, `showPanels`, `avatarFaces` and `slots` constants.

3. Replace everything from `<div className="hidden flex-1 flex-col gap-6 px-4 py-6 group-data-[reviewer=known]/review:flex lg:mx-auto lg:w-full lg:max-w-6xl lg:px-6">` to its closing `</div>` with:

```tsx
      <div className="hidden flex-1 flex-col gap-6 px-4 py-6 group-data-[reviewer=known]/review:flex lg:mx-auto lg:w-full lg:max-w-[96rem] lg:px-6">
        <ReviewSurfaceProvider value={surface}>
          <ScriptReviewHeader
            review={review}
            name={name}
            onChangeName={() => {
              clearReviewerName(browserStore());
              setName(null);
            }}
            action={
              <>
                {approveAction}
                <CommentsButton count={threadCount(placed)} />
              </>
            }
          />
          <ScopeNote scope={version.scope} />
          <FrozenBoard
            version={version}
            stage={review.approval ? "approved" : "in_review"}
            column={<ReviewColumn activity={review.activity} />}
          />
        </ReviewSurfaceProvider>
      </div>
```

- [ ] **Step 5: Run the tests, type check and lint**

Run: `npx vitest run src/components/script-review && npx tsc --noEmit && npx eslint src/components/script-review src/components/scripts src/hooks/use-media-query.ts src/hooks/use-review-column.ts`
Expected: PASS; no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/script-review
git commit -m "feat(script-review): the client's page is the Visualise board, read-only, with the Comments column"
```

---

### Task 7: The Visualise view takes spec 4's review (MP4)

**Files:**
- Modify: `src/components/visualise/visualise-view.tsx`, `visualise-readiness.tsx`, `cast-slots.tsx`, `cast-slot.tsx`

**Interfaces:**
- Consumes: `ScriptBoardFrame` (Task 5); `castAnchor`; `AvatarViewId`.
- Produces: `VisualiseReview = { actions: ReactNode; contextMarker: ReactNode; shotMarker(shotId): ReactNode; castMarker(castId): ReactNode; viewMarker(castId, view): ReactNode; panelMarker(shotId): ReactNode; column?: ReactNode }` (exported from `visualise-view.tsx`); `VisualiseView({ clientId, initial, review? })`; `VisualiseReadiness` gains `extra?: ReactNode`; `CastSlots` gains `castMarker?`, `viewMarker?`; `CastSlot` gains `headerExtra?: ReactNode`, an anchor id and the commented-part edge.

With `review` left out every one of these renders as before (Task 5's frame test pins the two-pane case).

- [ ] **Step 1: Readiness line — room for spec 4's actions**

In `src/components/visualise/visualise-readiness.tsx`: add `import type { ReactNode } from "react";`, add `extra?: ReactNode;` to `Props` with the comment `/** Spec 4's review actions (merge point MP4), before Visualise's own. */`, destructure `extra`, and change the actions block to:

```tsx
      <div className="flex flex-wrap items-center justify-end gap-2">
        {extra}
        {stage === "visualise" && <ReopenDialog busy={reopening} onConfirm={onReopen} />}
        <GenerateAllDialog plan={plan} busy={drawingAll} onConfirm={onGenerateAll} />
      </div>
```

- [ ] **Step 2: Cast cards — a marker on the person and each view**

In `src/components/visualise/cast-slot.tsx`: add `import { castAnchor } from "@/lib/scripts/anchors";`; add the prop `headerExtra?: ReactNode;` (comment: `/** Spec 4 merge point: the comment marker on the person. */`) and destructure it; change `<Card className="flex flex-col gap-3 p-4 shadow-card">` to `<Card id={castAnchor(member.id)} className="flex flex-col gap-3 p-4 shadow-card has-[[data-part-commented]]:border-client/40">`; and after `{member.isLead && <Badge variant="outline">Lead</Badge>}` add `{headerExtra}`.

In `src/components/visualise/cast-slots.tsx`: add `import type { ReactNode } from "react";` and `import type { AvatarViewId } from "@/lib/avatars/schema";`; add the props

```tsx
  /** Spec 4 merge point: the comment marker on a person, and on each of their views. */
  castMarker?: (castId: string) => ReactNode;
  viewMarker?: (castId: string, view: AvatarViewId) => ReactNode;
```

destructure them, and pass to each `<CastSlot>`:

```tsx
            headerExtra={castMarker?.(member.id)}
            marker={viewMarker ? (view) => viewMarker(member.id, view) : undefined}
```

- [ ] **Step 3: The view — markers, actions and the column**

In `src/components/visualise/visualise-view.tsx`:

1. Add imports: `import type { ReactNode } from "react";` (merge with the existing `react` import as a type import: `import { useMemo, useState, type ReactNode } from "react";`), `import type { AvatarViewId } from "@/lib/avatars/schema";`, `import { ScriptBoardFrame } from "@/components/scripts/script-board-frame";`.

2. Above the component, add:

```tsx
/** Spec 4's layer on the board (merge point MP4): its actions on the readiness line, a comment
 *  marker on each part, and the Comments column. Left out, the view is exactly spec 3's. */
export type VisualiseReview = {
  actions: ReactNode;
  contextMarker: ReactNode;
  shotMarker: (shotId: string) => ReactNode;
  castMarker: (castId: string) => ReactNode;
  viewMarker: (castId: string, view: AvatarViewId) => ReactNode;
  panelMarker: (shotId: string) => ReactNode;
  /** Absent until something has been shared, so the board keeps its two panes. */
  column?: ReactNode;
};
```

3. Change the signature to `export function VisualiseView({ clientId, initial, review }: { clientId: string; initial: BoardData; review?: VisualiseReview }) {`.

4. Pass `extra={review?.actions}` to `<VisualiseReadiness … />`.

5. Replace the `<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">` block (through its closing `</div>`, i.e. the `ScriptView` and the `<section aria-label="Visuals" …>`) with:

```tsx
      <ScriptBoardFrame
        script={
          <ScriptView
            script={script}
            avatarFaces={model.avatarFaces}
            compact
            cast={null}
            slots={review ? { context: review.contextMarker } : undefined}
            shotState={(t) => {
              const v = model.views.get(t.shot.id)!;
              return { drawing: v.status === "generating", onOpen: v.pick ? () => setOpenShot(t.shot.id) : undefined };
            }}
            shotAside={(t) => (
              <span className="flex flex-col items-end gap-1">
                <PanelShotStatus
                  view={model.views.get(t.shot.id)!}
                  credits={model.credits.get(t.shot.id) ?? null}
                  onDraw={() => void draws.draw(t.shot.id)}
                />
                {review?.shotMarker(t.shot.id)}
              </span>
            )}
          />
        }
        visuals={
          <>
            <CastSlots
              clientId={clientId}
              scriptId={script.id}
              doc={script.doc}
              avatars={model.avatars}
              castMarker={review?.castMarker}
              viewMarker={review?.viewMarker}
            />
            <StoryboardGrid
              settings={
                <AvatarAdvancedSettings className="max-w-sm">
                  <Label htmlFor="panel-model" className="text-xs text-muted-foreground">Image model for panels</Label>
                  <AvatarModelSelect id="panel-model" value={panelModelId} onChange={setPanelModelId} modelIds={PANEL_MODEL_IDS} />
                </AvatarAdvancedSettings>
              }
              action={
                <GenerateAllDialog
                  variant="outline"
                  plan={model.plan}
                  busy={draws.drawingAll}
                  onConfirm={() => void draws.drawAll(model.plan.shotIds)}
                />
              }
            >
              {timed.map((t) => (
                <PanelTile
                  key={t.shot.id}
                  label={`S${t.index + 1}`}
                  time={formatRange(t.start, t.end)}
                  description={t.shot.visual}
                  view={model.views.get(t.shot.id)!}
                  aspect={model.aspect}
                  credits={model.credits.get(t.shot.id) ?? null}
                  onDraw={() => void draws.draw(t.shot.id)}
                  onOpen={() => setOpenShot(t.shot.id)}
                  marker={review?.panelMarker(t.shot.id)}
                />
              ))}
            </StoryboardGrid>
          </>
        }
        column={review?.column}
      />
```

Update the file's header comment to end: `… Below \`lg\` the panes stack, script first. Spec 4 adds its review through \`review\` (MP4).`

- [ ] **Step 4: Run spec 3's tests, the type check and lint**

Run: `npx vitest run src/components/visualise src/components/scripts src/lib/scripts && npx tsc --noEmit && npx eslint src/components/visualise`
Expected: PASS; no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/visualise
git commit -m "feat(visualise): optional review layer — actions on the readiness line, markers on each part, the column (MP4)"
```

---

### Task 8: The team's review layer on the Visualise view

**Files:**
- Create: `src/components/script-review/team/review-actions.tsx`, `src/components/script-review/team/team-review-board.tsx`
- Modify: `src/hooks/queries/script-review.ts` (a stage move also refreshes the board's query)
- Modify: `src/app/clients/[id]/scripts/[scriptId]/page.tsx`
- Test: `src/components/script-review/__tests__/review-actions.test.tsx`

**Interfaces:**
- Consumes: `VisualiseView`, `VisualiseReview` (Task 7); `BoardData`, `visualiseKeys` from `@/hooks/queries/visualise`; team hooks; `useReviewColumn`, `threadCount`; `PartMarker`, `ReviewColumn`, `CommentsButton`; `ShareDialog`, `CopyLinkButton`, `ClientFeedbackCount`; `useRouter` from `next/navigation`.
- Produces: `ReviewActions({ clientId, script, review, commentCount })`; `TeamReviewBoard({ clientId, initial })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/script-review/__tests__/review-actions.test.tsx
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import type { Script } from "@/lib/scripts/schema";
import { reelDoc } from "@/lib/script-review/__tests__/fixtures";
import { ReviewActions } from "../team/review-actions";
import { renderInSurface, testSurface } from "./surface";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const script = (stage: Script["stage"]): Script => ({ id: "s1", clientId: "c1", stage, doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" });
const review = (over: Partial<TeamScriptReview>): TeamScriptReview => ({
  stage: "in_review", shareToken: "6f1c", latest: { number: 2, scope: "avatars", sharedAt: "2026-10-10T09:00:00.000Z" },
  comments: [], removedShots: {}, activity: [], approval: null, commentsOpen: true, feedbackCount: 3, ...over,
});
const render = (s: Script, r: TeamScriptReview | undefined) =>
  renderInSurface(
    testSurface({ mode: "team" }),
    <QueryClientProvider client={new QueryClient()}>
      <ReviewActions clientId="c1" script={s} review={r} commentCount={2} />
    </QueryClientProvider>,
  );

describe("ReviewActions (review board)", () => {
  it("offers only Move to In review at Visualise, with no Comments button before anything is shared (Review Focus 4)", () => {
    const html = render(script("visualise"), review({ stage: "visualise", latest: null, shareToken: null, feedbackCount: 0 }));
    expect(html).toContain("Move to In review");
    expect(html).not.toContain("Share");
    expect(html).not.toContain("Comments");
  });

  it("In review: the count, the version, Share again, Copy link and Move back", () => {
    const html = render(script("in_review"), review({}));
    expect(html).toContain("Client feedback 3");
    expect(html).toContain("Version 2 · shared 10 Oct");
    expect(html).toContain("Share again");
    expect(html).toContain("Copy link");
    expect(html).toContain("Move back to Visualise");
    expect(html).toContain("Comments · 2");
  });

  it("Approved: Reopen to Visualise, never spec 3's Reopen", () => {
    const html = render(script("approved"), review({ stage: "approved" }));
    expect(html).toContain("Reopen to Visualise");
    expect(html).not.toContain("Share again");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/script-review/__tests__/review-actions.test.tsx`
Expected: FAIL with "Failed to resolve import ../team/review-actions".

- [ ] **Step 3: Write the actions and the board**

```tsx
// src/components/script-review/team/review-actions.tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMoveScriptStage } from "@/hooks/queries/script-review";
import { errorMessage } from "@/lib/avatars/utils";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import { TEAM_STAGE_MOVES, teamMovesFrom, type TeamStageMove } from "@/lib/script-review/constants";
import { scriptSharePathFor } from "@/lib/script-review/paths";
import { formatShortDay } from "@/lib/script-review/utils";
import type { Script } from "@/lib/scripts/schema";
import { ClientFeedbackCount } from "../client-feedback-count";
import { CommentsButton } from "../comments-button";
import { CopyLinkButton } from "./copy-link-button";
import { ShareDialog } from "./share-dialog";

/** Spec 4 §6 (review board): the review's actions on the board's top line — the feedback count and
 *  latest version, Share / Share again (In review), Copy link, the team's stage moves, and below
 *  `xl` the Comments button once something has been shared. A move reloads the page: the stage
 *  decides which board it shows. */
export function ReviewActions({ clientId, script, review, commentCount }: {
  clientId: string;
  script: Script;
  review: TeamScriptReview | undefined;
  commentCount: number;
}) {
  const router = useRouter();
  const stage = review?.stage ?? script.stage;
  const latest = review?.latest ?? null;
  const move = useMoveScriptStage(clientId, script.id);
  const path = review?.shareToken && latest ? scriptSharePathFor(review.shareToken, script.doc.header.title) : null;

  async function run(m: TeamStageMove) {
    try {
      await move.mutateAsync(m);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e, "Could not move the script."));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ClientFeedbackCount count={review?.feedbackCount ?? 0} />
      {latest && (
        <span className="text-xs text-muted-foreground">
          Version {latest.number} · shared {formatShortDay(latest.sharedAt)}
        </span>
      )}
      {stage === "in_review" && <ShareDialog clientId={clientId} script={script} latest={latest} />}
      {path && <CopyLinkButton path={path} />}
      {teamMovesFrom(stage).map((m) => (
        <Button key={m} variant={m === "to_review" ? "default" : "outline"} size="sm" disabled={move.isPending} onClick={() => void run(m)}>
          {TEAM_STAGE_MOVES[m].label}
        </Button>
      ))}
      {latest && <CommentsButton count={commentCount} />}
    </div>
  );
}
```

```tsx
// src/components/script-review/team/team-review-board.tsx
"use client";

import { useMemo } from "react";
import { VisualiseView } from "@/components/visualise/visualise-view";
import type { BoardData } from "@/hooks/queries/visualise";
import { useReplyToThread, useResolveThread, useTeamScriptReview } from "@/hooks/queries/script-review";
import { useReviewColumn } from "@/hooks/use-review-column";
import { threadCount } from "@/lib/script-review/column";
import { buildThreads, placeThreads } from "@/lib/script-review/threads";
import type { Part } from "@/lib/script-review/types";
import { PartMarker } from "../part-marker";
import { ReviewColumn } from "../review-column";
import { ReviewSurfaceProvider, type ReviewSurface } from "../review-surface-context";
import { ReviewActions } from "./review-actions";

const NOTHING: ReadonlyMap<string, Part> = new Map();

/** Spec 4 §6 (review board): the team's Visualise view with the review on it — the actions on the
 *  readiness line, a marker on every commented part, and the Comments column with Reply and
 *  Resolve once something has been shared (merge point MP4). */
export function TeamReviewBoard({ clientId, initial }: { clientId: string; initial: BoardData }) {
  const { script } = initial;
  const { data: review } = useTeamScriptReview(clientId, script.id);
  const reply = useReplyToThread(clientId, script.id);
  const resolve = useResolveThread(clientId, script.id);
  const column = useReviewColumn();
  const threads = useMemo(() => buildThreads(review?.comments ?? []), [review?.comments]);
  const placed = useMemo(() => placeThreads(threads, script.doc, review?.removedShots ?? {}), [threads, script.doc, review?.removedShots]);
  // The team replies and resolves whenever a version exists, approved or not (user, 8 Oct).
  const shared = Boolean(review?.latest);

  const surface: ReviewSurface = {
    ...column,
    mode: "team",
    doc: script.doc,
    placed,
    commentable: NOTHING,
    onReply: shared
      ? async (commentId, body) => {
          await reply.mutateAsync({ commentId, body });
        }
      : undefined,
    onResolve: shared
      ? async (commentId, resolved) => {
          await resolve.mutateAsync({ commentId, resolved });
        }
      : undefined,
  };

  return (
    <ReviewSurfaceProvider value={surface}>
      <VisualiseView
        clientId={clientId}
        initial={initial}
        review={{
          actions: <ReviewActions clientId={clientId} script={script} review={review} commentCount={threadCount(placed)} />,
          contextMarker: <PartMarker part={{ kind: "context" }} className="self-end" />,
          shotMarker: (shotId) => <PartMarker part={{ kind: "shot", shotId }} />,
          castMarker: (castId) => <PartMarker part={{ kind: "cast", castId }} />,
          viewMarker: (castId, view) => <PartMarker part={{ kind: "view", castId, view }} className="self-center" />,
          panelMarker: (shotId) => <PartMarker part={{ kind: "panel", shotId }} className="self-start" />,
          column: shared ? <ReviewColumn activity={review?.activity ?? []} /> : undefined,
        }}
      />
    </ReviewSurfaceProvider>
  );
}
```

- [ ] **Step 4: A stage move refreshes the board too**

In `src/hooks/queries/script-review.ts`, add `import { visualiseKeys } from "@/hooks/queries/visualise";` and in `useMoveScriptStage`'s `onSettled` add `void queryClient.invalidateQueries({ queryKey: visualiseKeys.board(clientId, scriptId) });` (comment: `// Visualise reads the stage from its own board query (Reopen shows only at Visualise).`).

- [ ] **Step 5: The page — the board for Visualise and In review**

In `src/app/clients/[id]/scripts/[scriptId]/page.tsx`: replace `import { VisualiseView } from "@/components/visualise/visualise-view";` with `import { TeamReviewBoard } from "@/components/script-review/team/team-review-board";`; replace the interim MERGE comment and `<VisualiseView clientId={client.id} initial={{ script, board }} />` with `<TeamReviewBoard clientId={client.id} initial={{ script, board }} />` (the other branch stays `ScriptReviewWorkspace` until Task 9); and change the board width from `"max-w-7xl"` to `"max-w-[96rem]"` (the column needs the room).

- [ ] **Step 6: Run the tests, type check and lint**

Run: `npx vitest run src/components/script-review src/hooks && npx tsc --noEmit && npx eslint src/components/script-review "src/app/clients/[id]/scripts" src/hooks/queries/script-review.ts`
Expected: PASS; no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/script-review src/hooks/queries/script-review.ts "src/app/clients/[id]/scripts/[scriptId]/page.tsx"
git commit -m "feat(script-review): the team's review on the Visualise view — actions, markers, the column"
```

---

### Task 9: After approval — the approved version, read-only

**Files:**
- Modify: `src/lib/script-review/load.ts` (add `loadApprovedVersion`)
- Create: `src/lib/script-review/__tests__/load.test.ts`
- Create: `src/components/script-review/team/approved-review-board.tsx`
- Modify: `src/app/clients/[id]/scripts/[scriptId]/page.tsx`

**Interfaces:**
- Consumes: `getScriptReviewForScript`, `getLatestVersion` (db); `ScriptVersion`; `FrozenBoard` (Task 6); `ReviewActions` (Task 8); `ReviewColumn`; team hooks; `useReviewColumn`, `threadCount`.
- Produces: `loadApprovedVersion(scriptId): Promise<ScriptVersion | null>`; `ApprovedReviewBoard({ clientId, script, version })`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/script-review/__tests__/load.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { content } from "./fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewForScript: vi.fn(), getLatestVersion: vi.fn(),
  listVersions: vi.fn(), listScriptComments: vi.fn(), listScriptEvents: vi.fn(),
}));

import { getLatestVersion, getScriptReviewForScript } from "@/lib/db/script-reviews";
import { loadApprovedVersion } from "../load";

const review = { id: "r1", script_id: "s1", client_id: "c1", share_token: "6f1c", created_by: null, created_at: "t" };

beforeEach(() => vi.resetAllMocks());

describe("loadApprovedVersion (4.17)", () => {
  it("is the latest shared version: the one the client approved", async () => {
    const v = { ...content({ scope: "panels" }), id: "v3", number: 3, sharedAt: "t" };
    vi.mocked(getScriptReviewForScript).mockResolvedValue(review);
    vi.mocked(getLatestVersion).mockResolvedValue(v);
    expect(await loadApprovedVersion("s1")).toEqual(v);
    expect(getLatestVersion).toHaveBeenCalledWith("r1");
  });

  it("is null for an approved script that never went through review (Review Focus 5)", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue(null);
    expect(await loadApprovedVersion("s1")).toBeNull();
    expect(getLatestVersion).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/script-review/__tests__/load.test.ts`
Expected: FAIL — `loadApprovedVersion` is not exported.

- [ ] **Step 3: Write the loader**

In `src/lib/script-review/load.ts`, change the db import to `import { getLatestVersion, getScriptReviewForScript, listScriptComments, listScriptEvents, listVersions } from "@/lib/db/script-reviews";`, add `import type { ScriptVersion } from "./wire";` (merge with the existing `./wire` type import), and append:

```ts
/** Spec 4 §6 (review board, 4.17): the version an approved script's page shows — the latest share,
 *  which is the one approved (a share needs In review, so none can follow an approval). Null for a
 *  script approved without a review, such as a seeded one: its page keeps spec 1's view. */
export async function loadApprovedVersion(scriptId: string): Promise<ScriptVersion | null> {
  const review = await getScriptReviewForScript(scriptId);
  return review ? getLatestVersion(review.id) : null;
}
```

- [ ] **Step 4: Write the approved board**

```tsx
// src/components/script-review/team/approved-review-board.tsx
"use client";

import { useMemo } from "react";
import { useReplyToThread, useResolveThread, useTeamScriptReview } from "@/hooks/queries/script-review";
import { useReviewColumn } from "@/hooks/use-review-column";
import { threadCount } from "@/lib/script-review/column";
import { buildThreads, placeThreads } from "@/lib/script-review/threads";
import type { Part } from "@/lib/script-review/types";
import { formatShortDay } from "@/lib/script-review/utils";
import type { ScriptVersion } from "@/lib/script-review/wire";
import type { Script } from "@/lib/scripts/schema";
import { FrozenBoard } from "../frozen-board";
import { ReviewColumn } from "../review-column";
import { ReviewSurfaceProvider, type ReviewSurface } from "../review-surface-context";
import { ReviewActions } from "./review-actions";

const NOTHING: ReadonlyMap<string, Part> = new Map();

/** Spec 4 §6 (review board, 4.17): after approval the team sees what the client approved — the
 *  approved version, read-only, as the client's page draws it — with the column (the team still
 *  replies and resolves) and Reopen to Visualise. The record of the sign-off, not the live script. */
export function ApprovedReviewBoard({ clientId, script, version }: { clientId: string; script: Script; version: ScriptVersion }) {
  const { data: review } = useTeamScriptReview(clientId, script.id);
  const reply = useReplyToThread(clientId, script.id);
  const resolve = useResolveThread(clientId, script.id);
  const column = useReviewColumn();
  const threads = useMemo(() => buildThreads(review?.comments ?? []), [review?.comments]);
  const placed = useMemo(() => placeThreads(threads, version.doc, review?.removedShots ?? {}), [threads, version.doc, review?.removedShots]);

  const surface: ReviewSurface = {
    ...column,
    mode: "team",
    doc: version.doc,
    placed,
    commentable: NOTHING,
    onReply: async (commentId, body) => {
      await reply.mutateAsync({ commentId, body });
    },
    onResolve: async (commentId, resolved) => {
      await resolve.mutateAsync({ commentId, resolved });
    },
  };

  return (
    <ReviewSurfaceProvider value={surface}>
      <div className="flex flex-col gap-6">
        <section aria-label="Approved" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-card">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-eyebrow">Approved</span>
            <span className="text-sm">
              Version {version.number}
              {review?.approval ? ` · approved by ${review.approval.byName} on ${formatShortDay(review.approval.at)}` : ""}
            </span>
          </div>
          <ReviewActions clientId={clientId} script={script} review={review} commentCount={threadCount(placed)} />
        </section>
        <FrozenBoard version={version} stage="approved" column={<ReviewColumn activity={review?.activity ?? []} />} />
      </div>
    </ReviewSurfaceProvider>
  );
}
```

- [ ] **Step 5: The page — three branches by stage**

In `src/app/clients/[id]/scripts/[scriptId]/page.tsx`:

1. Replace `import { ScriptReviewWorkspace } from "@/components/script-review/team/script-review-workspace";` with:

```tsx
import { ScriptView } from "@/components/scripts/script-view";
import { ApprovedReviewBoard } from "@/components/script-review/team/approved-review-board";
import { loadApprovedVersion } from "@/lib/script-review/load";
```

2. After the `board` line add:

```tsx
  // Spec 4 (review board, 4.17): an approved script shows the version the client approved.
  const approved = script.stage === "approved" ? await loadApprovedVersion(script.id) : null;
```

3. Change `const avatarFaces = board` to `const avatarFaces = board || approved`, and the main width condition from `board ? "max-w-[96rem]" : "max-w-6xl"` to `board || approved ? "max-w-[96rem]" : "max-w-6xl"`.

4. Replace the render branch with:

```tsx
      {board ? (
        <TeamReviewBoard clientId={client.id} initial={{ script, board }} />
      ) : approved ? (
        <ApprovedReviewBoard clientId={client.id} script={script} version={approved} />
      ) : (
        <ScriptView script={script} avatarFaces={avatarFaces} />
      )}
```

and update the comment above `board` to `// Spec 3 — Visualise and In review show the Visualise view, with spec 4's review on it; an approved script with a review shows the approved version; other stages the read-only view.`

- [ ] **Step 6: Run the tests, type check and lint**

Run: `npx vitest run src/lib/script-review src/components/script-review && npx tsc --noEmit && npx eslint src/components/script-review "src/app/clients/[id]/scripts" src/lib/script-review`
Expected: PASS; no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/script-review/load.ts src/lib/script-review/__tests__/load.test.ts src/components/script-review/team/approved-review-board.tsx "src/app/clients/[id]/scripts/[scriptId]/page.tsx"
git commit -m "feat(script-review): an approved script's page shows the approved version, read-only, with the column"
```

---

### Task 10: Remove the old layer; record D357

**Files:**
- Delete: `src/components/script-review/team/script-review-workspace.tsx`, `src/components/script-review/team/stage-actions.tsx`, `src/components/script-review/cast-review-slot.tsx`, `src/components/script-review/shot-review-slot.tsx`, `src/components/script-review/avatar-views.tsx`, `src/components/script-review/part-comments.tsx`, `src/components/script-review/__tests__/part-comments.test.tsx`
- Modify: `src/components/scripts/__tests__/script-view.test.tsx` (keep the "context slot sits inside the card" test)
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (D357)
- Modify: `docs/superpowers/plans/2026-10-08-script-copilot-4-client-review.md` (merge table: MP1, MP2, MP4 resolved)

- [ ] **Step 1: Move the one test worth keeping**

Append to `src/components/scripts/__tests__/script-view.test.tsx`:

```tsx
describe("the context slot sits inside the context card", () => {
  it("renders the slot within the card's section, so the card can show it is commented", () => {
    const html = renderToStaticMarkup(
      <ScriptView script={{ doc: reelDoc(), stage: "in_review" }} avatarFaces={{}} slots={{ context: <span data-slot-test="context" /> }} />,
    );
    const card = html.slice(html.indexOf('id="script-context"'), html.indexOf("</section>"));
    expect(card).toContain('data-slot-test="context"');
  });
});
```

- [ ] **Step 2: Delete the old layer and confirm nothing imports it**

Run: `git rm src/components/script-review/team/script-review-workspace.tsx src/components/script-review/team/stage-actions.tsx src/components/script-review/cast-review-slot.tsx src/components/script-review/shot-review-slot.tsx src/components/script-review/avatar-views.tsx src/components/script-review/part-comments.tsx src/components/script-review/__tests__/part-comments.test.tsx`
Then: `grep -rnE "script-review-workspace|stage-actions|cast-review-slot|shot-review-slot|/avatar-views\"|part-comments" src`
Expected: no matches.

- [ ] **Step 3: Record D357**

Append to `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`:

```markdown
### D357 — Client review is the Visualise board, read-only, with a Comments column *(recorded 2026-10-08)*

**Decision.** The client's review page draws the shared version in the Visualise board's frame (spec 3 §4) — the script in its compact form, the cast cards (four-view sheet and voice on a share with avatars) and, on a full share, the Storyboard — with every making control removed and a Comments column at the right. Threads live only in that column: each part (context, shot, person, view, panel) shows an amber count and a comment action that open its thread there; below `xl` the column opens over the page from a Comments button, straight at the part. The team's Visualise view carries the same markers and column, with spec 4's actions on its readiness line; after approval the team's page shows the approved version, read-only, the same way.

**Why.** The client approves the visual reel, so they should read it as the team built it (user, 8 Oct: "the review surface is effectively the same as Visualise, just that the client reviews it"). Full threads under each shot of a narrow pane and under storyboard tiles crowd the board, worst on the phone the client opens the link on.

**Rejected.** Spec 1's table with the panel beside each shot (the first build). Threads inline under each part. A third layout of the reel for review.

**Refines →** D351, D355, D356. **Originated →** `2026-10-08-script-copilot-4-client-review-design.md` §4, §6; decisions 4.14–4.17.
```

- [ ] **Step 4: Close the merge points**

In `docs/superpowers/plans/2026-10-08-script-copilot-4-client-review.md`'s merge-point table, append to the MP1, MP2 and MP4 rows' third cell: ` **Resolved 8 Oct in spec 4b (review board), after spec 3 merged into this branch.**`

- [ ] **Step 5: Full suite, type check and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/components/script-review src/components/visualise src/components/scripts src/lib/script-review "src/app/clients/[id]/scripts" "src/app/r"`
Expected: all pass (the Kling / upstream-images timeout flakes may appear when vitest runs beside tsc; re-run alone before investigating).

- [ ] **Step 6: Commit**

```bash
git add -A src/components/script-review src/components/scripts/__tests__/script-view.test.tsx docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md docs/superpowers/plans/2026-10-08-script-copilot-4-client-review.md
git commit -m "refactor(script-review): drop the first build's inline layer; D357 records the review board"
```

---

### Task 11: Check it in the app

**Files:** none changed unless a check fails. Needs migrations 0053 and 0054 on staging (both applied as of 8 Oct) and `npm run dev:next` from this worktree. Two windows: signed in (team) and a private window at 390px (client).

- [ ] **Step 1: Team, Visualise, nothing shared yet** — Jackfruit 365 › Scripts › Golu starts today (stage Visualise): spec 3's board, two panes, unchanged; on the readiness line **Move to In review** beside Reopen and Generate all; no Comments column or button.
- [ ] **Step 2: Share** — Move to In review (the page reloads: Reopen disappears, **Share** and **Move back to Visualise** appear); Share › Script and avatars › version 1; the link field with Copy inside.
- [ ] **Step 3: Client at 390px** — name screen; then the header with a **Comments** button; the context card and 14 compact shots each with a dashed comment action; the cast cards with Meenakshi's four views and a comment action under each view that has an image; no Storyboard; the scope note.
- [ ] **Step 4: Comment from a marker** — tap S4's comment action: the sheet opens at "S4" with the composer; post; the thread appears there, the composer closes, S4's row shows an amber "1" and a faint amber tint. Repeat on the Front view and on Meenakshi.
- [ ] **Step 5: Team sees it** — reload the team page: the column at the right (wide window) lists Context/Meenakshi/Front view/S4 in page order; S4's row, Meenakshi's card and the Front view carry markers; pressing a marker scrolls the column to its thread and rings it; Reply and Resolve work; at a narrower window the column moves into the Comments sheet.
- [ ] **Step 6: Full share and approve** — draw at least one panel in spec 3 (or skip if credits matter; then panels show "No panel"), Share again › Script, avatars and panels; the client sees the Storyboard (tile hover shows the shot's line, tap enlarges, comment action on drawn panels only) and **Approve reel**; approve with one thread open (confirm names it).
- [ ] **Step 7: Approved** — the team page shows "Approved · Version n · approved by …", the read-only board of the approved version, the column (Reply/Resolve still work) and **Reopen to Visualise**; the client's page shows "Approved on …" and no comment actions.
- [ ] **Step 8: Seeded approved reel** — open Reel 06 (approved, never reviewed): spec 1's read-only view, no error.
- [ ] **Step 9: Report** — what passed, any failure with what was seen, and put Reel 01 back with **Reopen to Visualise**. Do not merge or push.

---

## Self-review (done while writing)

- **Spec coverage.** 4.14 (client page = Visualise board): Tasks 5, 6. 4.15 (threads in the column; markers): Tasks 3, 4, 6, 8. 4.16 (sheet below `xl`, straight at the part): Tasks 2, 4. 4.17 (approved version): Task 9. §6 team actions on the top line: Tasks 7, 8. Frozen four views and panels (§3 step 3, now real): Task 1. D357: Task 10.
- **Placeholders.** None; every code step has its code.
- **Type consistency.** `ReviewColumnState` (Task 2) is spread into `ReviewSurface` (Task 3) by every builder (Tasks 3, 6, 8, 9). `PartMarker` (Task 3) is the only marker; `VisualiseReview` (Task 7) is filled by `TeamReviewBoard` (Task 8). `getPickedPanels(scriptId)` (Task 1) is called by `collectVisuals` only.
- **Review Focus.** Each line has its test in its owning task (Tasks 1, 4, 5, 7, 8, 9) or an in-app step (Task 11 Step 4).
