# Generation Tray UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Generation Tray row legible without reading it — kind from a leading chip, status from a trailing glyph — and fix the derivation gap that makes an Image Prompt indistinguishable from a Motion Prompt.

**Architecture:** Three tasks, each independently committable and each leaving `npx tsc --noEmit` and `npm test` green. Task 1 changes the pure derivation (`src/lib/generation-tray.ts`) and carries a minimal compile-fix in the row component so nothing is broken mid-plan. Task 2 redesigns the row. Task 3 adjusts the panel. Tasks 2 and 3 have no automated tests — repo convention is node-env vitest over pure `src/lib/**` only, with no DOM/RTL harness — so they end in explicit manual verification instead.

**Tech Stack:** TypeScript, Next.js, React, Tailwind v4 (`@theme` tokens in `src/app/globals.css`), Base UI shadcn registry, Lucide icons, Vitest (node env).

**Spec:** [`docs/superpowers/specs/2026-08-11-generation-tray-ux-design.md`](../specs/2026-08-11-generation-tray-ux-design.md) — decision **D142**.

## Global Constraints

- **shadcn primitives only, never native.** Per `CLAUDE.md`: every interactive control MUST be a shadcn primitive from `src/components/ui/*`. Never a raw `<button>`. Both tray files currently use raw `<button>` — a pre-existing violation this plan corrects in the tasks that touch them. Base UI composes via the `render` prop, not `asChild`.
- **No hardcoded colors.** Drive everything through the shadcn CSS variables in `globals.css`. The five tokens this plan uses are all already registered in `@theme`: `text-warning-text`, `text-success-text`, `text-destructive-text`, `bg-accent`, `bg-muted`.
- **Motion easing is `cubic-bezier(0.22,1,0.36,1)` only**, at 200/320/500ms. No springs, no bounce.
- **Lucide icons only, `stroke-[1.5]`, no fills.**
- **Elevation uses the `shadow-card` / `shadow-md` / `shadow-lg` tokens** — but rows inside the panel take **no shadow at all** (§Task 2).
- **The label for the `video-prompt` node is "Motion Prompt", never "Video Prompt"** (D137). The persisted `nodes.type` slug stays `"video-prompt"` — this is display only.
- **The tray stays navigation-only.** Do not add retry, approve, regenerate, delete, or thumbnails to any row. Click does exactly one thing: fly to the node and open its focus view.
- **Import, don't redefine.** `TRAY_KIND_META` is defined once in `src/lib/generation-tray.ts` and imported by the component. Do not duplicate the label strings in the component.

---

## File Structure

| File | Responsibility | Task |
| :--- | :--- | :--- |
| `src/lib/generation-tray.ts` | Pure derivation. Owns `TrayKind`, `TRAY_KIND_META`, `resolveTrayKind`, and `deriveTrayItems`. `import type` only — no runtime React/Supabase/Lucide imports may be added. | 1 |
| `src/lib/generation-tray.test.ts` | Unit tests for the above. | 1 |
| `src/lib/__tests__/generation-tray-prompts.test.ts` | Existing prompt-specific unit tests; migrated off `assetType`. | 1 |
| `src/components/canvas/generation-tray-item.tsx` | One row. Maps `track` → Lucide glyph and `status` → glyph + tone. Owns no label strings. | 1 (compile fix), 2 (redesign) |
| `src/components/canvas/generation-tray.tsx` | The panel: header, scroll list, collapsed count pill. | 3 |

**Unchanged, do not touch:** every API route, `src/hooks/use-generation-tray.ts`, `src/lib/canvas-store.ts`, the `generations` schema, and any migration.

---

## Task 1: Derive tray kind from the node type

The load-bearing change. `TrayItem.assetType` is read off the `generations` row's `type` column, which has only three values — but **two different node types write `type: "prompt"`**: the Prompt node (`src/app/api/nodes/[id]/generate/route.ts:74`) and the Motion Prompt node (`src/app/api/nodes/[id]/video-prompt/route.ts:80`). The tray therefore has no information available to tell them apart and renders both as "Prompt". Styling cannot fix this; the derivation must read `node.type`, which `deriveTrayItems` already has in hand.

**Files:**
- Modify: `src/lib/generation-tray.ts:38-48` (types), `:81-100` (derivation + stale guard), `:115-123` (item construction)
- Modify: `src/lib/generation-tray.test.ts`
- Modify: `src/lib/__tests__/generation-tray-prompts.test.ts:47,57`
- Modify: `src/components/canvas/generation-tray-item.tsx:23-24,35` (minimal compile fix only — the visual redesign is Task 2)

**Interfaces:**
- Consumes: `GenerationRow["type"]` from `src/lib/db/types.ts:102`, which is exactly `"image" | "video" | "prompt"`. `AppNode` from `src/lib/canvas-nodes.ts`, whose `.type` is optional.
- Produces, for Tasks 2 and 3:
  - `export type TrayKind = "image-prompt" | "image" | "motion-prompt" | "video"`
  - `export const TRAY_KIND_META: Record<TrayKind, { label: string; track: "image" | "video"; stage: "prompt" | "output" }>`
  - `export function resolveTrayKind(jobType: GenerationRow["type"], nodeType: string | undefined): TrayKind`
  - `TrayItem.kind: TrayKind` **replaces** `TrayItem.assetType`. `TrayItem`'s other fields (`nodeId`, `status`, `shotLabel`, `order`, `generationId`, `versionId`) are unchanged.

---

- [ ] **Step 1: Write the failing tests**

In `src/lib/generation-tray.test.ts`, extend the import on lines 5-11 to pull in the two new exports:

```ts
import {
  findShotAncestor,
  resolveShotLabel,
  latestJobPerNode,
  deriveTrayItems,
  resolveTrayKind,
  TRAY_KIND_META,
  STALE_RUNNING_MS,
} from "./generation-tray";
```

Replace the assertion on line 98 — `expect(items[0].assetType).toBe("prompt");` — with:

```ts
    expect(items[0].kind).toBe("image-prompt");
```

Then append these three `describe` blocks to the end of the file:

```ts
describe("resolveTrayKind", () => {
  // THE BUG: both the Prompt node and the Motion Prompt node write `type: "prompt"`,
  // so the job row alone cannot say which one ran. The node type is the tiebreaker.
  it("distinguishes the two node types that both write type:'prompt'", () => {
    expect(resolveTrayKind("prompt", "prompt")).toBe("image-prompt");
    expect(resolveTrayKind("prompt", "video-prompt")).toBe("motion-prompt");
  });

  it("maps the output job types straight through", () => {
    expect(resolveTrayKind("image", "image-gen")).toBe("image");
    expect(resolveTrayKind("video", "video-gen")).toBe("video");
  });

  it("falls back to image-prompt on an unexpected node type rather than throwing", () => {
    expect(resolveTrayKind("prompt", undefined)).toBe("image-prompt");
    expect(resolveTrayKind("prompt", "file")).toBe("image-prompt");
  });
});

describe("TRAY_KIND_META", () => {
  it("covers every TrayKind", () => {
    expect(Object.keys(TRAY_KIND_META).sort()).toEqual([
      "image",
      "image-prompt",
      "motion-prompt",
      "video",
    ]);
  });

  it("pairs each prompt with its output on the same track", () => {
    expect(TRAY_KIND_META["image-prompt"].track).toBe(TRAY_KIND_META.image.track);
    expect(TRAY_KIND_META["motion-prompt"].track).toBe(TRAY_KIND_META.video.track);
  });

  it("marks exactly the two prompt kinds as the prompt stage", () => {
    const prompts = Object.entries(TRAY_KIND_META)
      .filter(([, m]) => m.stage === "prompt")
      .map(([k]) => k)
      .sort();
    expect(prompts).toEqual(["image-prompt", "motion-prompt"]);
  });
});

describe("deriveTrayItems kind resolution", () => {
  const now = Date.parse("2026-07-05T00:00:30.000Z");

  it("derives kind from the node type when the job row says only 'prompt'", () => {
    const nodes = [node("pr", "prompt"), node("vp", "video-prompt")];
    const jobs = [
      job({ id: "a", node_id: "pr", type: "prompt", status: "succeeded" }),
      job({ id: "b", node_id: "vp", type: "prompt", status: "succeeded" }),
    ];
    const byNode = Object.fromEntries(
      deriveTrayItems(nodes, [], jobs, now).map((i) => [i.nodeId, i.kind]),
    );
    expect(byNode).toEqual({ pr: "image-prompt", vp: "motion-prompt" });
  });

  it("derives the two output kinds", () => {
    const nodes = [node("gi", "image-gen"), node("gv", "video-gen")];
    const jobs = [
      job({ id: "a", node_id: "gi", type: "image", status: "succeeded" }),
      job({ id: "b", node_id: "gv", type: "video", status: "succeeded" }),
    ];
    const byNode = Object.fromEntries(
      deriveTrayItems(nodes, [], jobs, now).map((i) => [i.nodeId, i.kind]),
    );
    expect(byNode).toEqual({ gi: "image", gv: "video" });
  });

  // Guards the stale-guard re-key from `assetType === "image"` to `kind === "image"`.
  // Not red-first — it asserts that behavior did NOT change.
  it("stale-times the image OUTPUT kind only, never a running prompt", () => {
    const stale = Date.parse("2026-07-05T00:00:00.000Z") + STALE_RUNNING_MS + 1;
    const jobs = [
      job({ id: "i", node_id: "gi", type: "image", status: "running" }),
      job({ id: "p", node_id: "pr", type: "prompt", status: "running" }),
    ];
    const items = deriveTrayItems(
      [node("gi", "image-gen"), node("pr", "prompt")],
      [],
      jobs,
      stale,
    );
    expect(items.find((i) => i.nodeId === "gi")?.status).toBe("failed");
    expect(items.find((i) => i.nodeId === "pr")?.status).toBe("running");
  });
});
```

In `src/lib/__tests__/generation-tray-prompts.test.ts`, change line 47 from `expect(items[0].assetType).toBe("prompt");` to:

```ts
    expect(items[0].kind).toBe("image-prompt");
```

and line 57 from `expect(items[0].assetType).toBe("image");` to:

```ts
    expect(items[0].kind).toBe("image");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- generation-tray`

Expected: FAIL. The `resolveTrayKind` and `TRAY_KIND_META` blocks fail to import (`does not provide an export named 'resolveTrayKind'`), and the `.kind` assertions read `undefined`. If any of these unexpectedly PASS, stop — the change was already made.

- [ ] **Step 3: Implement the derivation**

In `src/lib/generation-tray.ts`, replace the `TrayItem` type block (lines 38-48):

```ts
export type TrayStatus = "running" | "ready" | "failed";

/** What a row IS. Four values, because a `generations` row's `type` column collapses the
 *  two prompt node types into one value and the tray must tell them apart (D142). */
export type TrayKind = "image-prompt" | "image" | "motion-prompt" | "video";

/** Display label plus the two facets the row encodes visually: `track` picks the glyph,
 *  `stage` picks the chip weight. Pure data so it is unit-testable here — the Lucide glyph
 *  for each track is a runtime import and therefore lives in the component. */
export const TRAY_KIND_META: Record<
  TrayKind,
  { label: string; track: "image" | "video"; stage: "prompt" | "output" }
> = {
  "image-prompt": { label: "Image Prompt", track: "image", stage: "prompt" },
  image: { label: "Image", track: "image", stage: "output" },
  // "Motion Prompt", not "Video Prompt" — D137 renamed the node everywhere the
  // operator looks. Only the persisted `nodes.type` slug stays "video-prompt".
  "motion-prompt": { label: "Motion Prompt", track: "video", stage: "prompt" },
  video: { label: "Video", track: "video", stage: "output" },
};

/** A `prompt` job row cannot say which prompt node wrote it — the Prompt node and the
 *  Motion Prompt node both write `type: "prompt"` — so the node type is the tiebreaker.
 *  Falls back rather than throwing: this is a read-only derived view that must never
 *  blank the tray on unexpected data. */
export function resolveTrayKind(
  jobType: GenerationRow["type"],
  nodeType: string | undefined,
): TrayKind {
  if (jobType === "image") return "image";
  if (jobType === "video") return "video";
  return nodeType === "video-prompt" ? "motion-prompt" : "image-prompt";
}

export type TrayItem = {
  nodeId: string;
  kind: TrayKind;
  status: TrayStatus;
  shotLabel: string;
  order: number;
  generationId: string;
  versionId: string | null;
};
```

Then inside `deriveTrayItems`, replace the `assetType` block (lines 81-86):

```ts
    const kind = resolveTrayKind(jobRow.type, node.type);
```

Update the stale guard (lines 95-100) to key on the image **output** kind:

```ts
    // Stale running IMAGE OUTPUT (client disconnected mid-request) → Failed. Prompts are
    // fast and were never stale-timed; video is owned by the async pipeline's own
    // reconciliation. Keying on `kind === "image"` preserves both exclusions exactly.
    if (status === "running" && kind === "image") {
      if (nowMs - Date.parse(jobRow.created_at) > STALE_RUNNING_MS)
        status = "failed";
    }
```

And in the `items.push({ ... })` call (lines 115-123), replace `assetType,` with:

```ts
      kind,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- generation-tray`

Expected: PASS, all files. If `generation-tray-prompts.test.ts` still fails, the two assertions in Step 1 were not applied.

- [ ] **Step 5: Apply the minimal compile fix to the row component**

`generation-tray-item.tsx` still reads `item.assetType` and will not typecheck. This step keeps the tree green; the visual redesign is Task 2. Replace lines 23-24:

```ts
  const assetLabel =
    item.assetType === "video" ? "Video" : item.assetType === "prompt" ? "Prompt" : "Image";
```

with an import off the canonical map. Add to the imports at the top of the file:

```ts
import { TRAY_KIND_META } from "@/lib/generation-tray";
```

and replace the two lines above with:

```ts
  const assetLabel = TRAY_KIND_META[item.kind].label;
```

Leave everything else in the file alone for now.

- [ ] **Step 6: Verify the whole tree typechecks and all tests pass**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

Run: `npm test`
Expected: PASS, no failures.

Run: `npm run lint`
Expected: no errors on the files touched.

- [ ] **Step 7: Commit**

```bash
git add src/lib/generation-tray.ts src/lib/generation-tray.test.ts src/lib/__tests__/generation-tray-prompts.test.ts src/components/canvas/generation-tray-item.tsx
git commit -m "feat(tray): derive tray kind from node type, not the job row

Both the Prompt node and the Motion Prompt node write type:'prompt' to
generations, so TrayItem.assetType could not tell them apart and rendered
both as 'Prompt'. Replaces assetType with a four-value kind resolved from
the job type plus node.type, and adds TRAY_KIND_META as the single source
of the label/track/stage mapping.

Refs D142.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Redesign the row

Leading kind chip, icon-only status, tinted failed row. Also converts the raw `<button>` to the `Button` primitive per `CLAUDE.md`.

**Files:**
- Modify: `src/components/canvas/generation-tray-item.tsx` (full rewrite)

**Interfaces:**
- Consumes: `TrayItem`, `TRAY_KIND_META` from Task 1. `Button` from `src/components/ui/button.tsx`.
- Produces: nothing new — the component's props (`{ item, onOpen }`) are unchanged, so `generation-tray.tsx` needs no edit for this task.

**Design notes the implementer needs:**
- **Two glyphs, not four.** A shot's prompt and the output it produced share a track glyph and differ only in chip weight, so the rail's left edge scans as a pipeline.
- **`bg-accent`, not `bg-muted`, for the output chip.** `--muted` is `neutral-50`, nearly invisible against the white `bg-card` row. `--accent` is `neutral-100` — a deliberate fill that still sits below the row's own contrast.
- **`Loader2`, never `RefreshCw`.** `Loader2` is a rotating open arc with no arrowheads. `RefreshCw`'s arrowheads make it read as an actionable retry control on a surface that has no actions — the exact complaint that started this work.
- **No `shadow-card` on the row.** These sit inside an already-shadowed panel, where a second shadow reads as mud.
- **Status is never color-alone.** Each state has a distinct glyph shape, and the status word is preserved in `title` + `aria-label`.

---

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/components/canvas/generation-tray-item.tsx` with:

```tsx
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ImageIcon,
  Clapperboard,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TRAY_KIND_META, type TrayItem } from "@/lib/generation-tray";

// Status is icon-only (D142) — the word survives in title/aria-label so the row stays
// readable by screen reader and on hover. Every state has a distinct glyph SHAPE, so
// status is never encoded by color alone. Tones are globals.css tokens; the -text (700)
// variants are used because the 500s wash out against a white card.
const STATUS_META: Record<
  TrayItem["status"],
  { label: string; icon: LucideIcon; tone: string; spin?: boolean }
> = {
  running: { label: "Running", icon: Loader2, tone: "text-warning-text", spin: true },
  ready: { label: "Ready", icon: CheckCircle2, tone: "text-success-text" },
  failed: { label: "Failed", icon: AlertTriangle, tone: "text-destructive-text" },
};

// Two glyphs, not four: a shot's prompt and the output it produced share a track glyph and
// differ only in chip weight, so the rail's left edge scans as a pipeline. Both glyphs are
// the ones already on the corresponding node cards.
const TRACK_ICON: Record<"image" | "video", LucideIcon> = {
  image: ImageIcon,
  video: Clapperboard,
};

export function GenerationTrayItem({
  item,
  onOpen,
}: {
  item: TrayItem;
  onOpen: (nodeId: string) => void;
}) {
  const status = STATUS_META[item.status];
  const StatusIcon = status.icon;
  const kind = TRAY_KIND_META[item.kind];
  const TrackIcon = TRACK_ICON[kind.track];
  const isOutput = kind.stage === "output";
  const isFailed = item.status === "failed";
  const accessibleName = `${item.shotLabel} · ${kind.label} — ${status.label}`;

  return (
    <Button
      variant="ghost"
      onClick={() => onOpen(item.nodeId)}
      title={accessibleName}
      aria-label={accessibleName}
      className={cn(
        "h-auto w-full justify-start gap-2.5 rounded-xl border px-3 py-3 text-left font-normal",
        // No shadow — the row sits inside an already-shadowed panel, where a second
        // shadow reads as mud. Inside a container, the border IS the elevation.
        "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px",
        isFailed
          ? "border-destructive/30 bg-destructive/10 hover:bg-destructive/15"
          : "border-border bg-card hover:bg-card",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg",
          isOutput
            ? "bg-accent text-foreground"
            : "border border-border text-muted-foreground",
        )}
      >
        <TrackIcon className="size-3.5 stroke-[1.5]" />
      </span>
      <span className="flex-1 truncate text-sm text-foreground">
        {item.shotLabel} <span className="text-muted-foreground">·</span> {kind.label}
      </span>
      <StatusIcon
        className={cn(
          "size-[18px] shrink-0 stroke-[1.5]",
          status.tone,
          status.spin && "animate-spin",
        )}
      />
    </Button>
  );
}
```

- [ ] **Step 2: Verify it typechecks, lints, and the suite still passes**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors.

Run: `npm test`
Expected: PASS — Task 1's unit tests are unaffected by a component change, and this confirms nothing regressed.

- [ ] **Step 3: Verify visually in the running app**

Run: `npm run dev:next` and open a canvas that has generation activity.

Confirm each of these by eye:
1. Every row shows a leading chip. Image-track rows show the image glyph, video-track rows the clapperboard.
2. Prompt rows have an **outlined** chip with a muted glyph; output rows have a **filled** (`neutral-100`) chip with a full-strength glyph. The two are clearly distinguishable at a glance.
3. Labels read `Shot 1 · Image Prompt`, `Shot 3 · Motion Prompt`, `Shot 3 · Video` — and **"Motion Prompt" never appears as "Video Prompt"**.
4. No row shows the words "Running", "Ready", or "Failed". Hovering a row surfaces them in the native tooltip.
5. A running row's glyph is a **smooth rotating arc** — it must not look like a reload/retry button.
6. A failed row has a soft red-orange tint and border; Running and Ready rows stay white.
7. Rows have no drop shadow, only a border.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/generation-tray-item.tsx
git commit -m "feat(tray): kind chip on the row, icon-only status, tinted failed row

Track picks the glyph, stage picks the chip weight, so a shot's prompt and
its output pair visually. Status drops its text label for a trailing glyph
(word preserved in title/aria-label) and Failed moves off muted-foreground,
where failures visually receded. Row shadow removed — it sat inside an
already-shadowed panel. Raw <button> converted to the Button primitive per
CLAUDE.md.

Refs D142.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Adjust the panel

Widen to fit the longest row, loosen spacing, and recolor the collapsed count pill so it stops contradicting the new row palette. Also converts this file's two raw `<button>`s to `Button`.

**Files:**
- Modify: `src/components/canvas/generation-tray.tsx:66-97` (collapsed pill, panel shell, header chevron)

**Interfaces:**
- Consumes: `Button` from `src/components/ui/button.tsx`. No change to `GenerationTrayItem`'s props.
- Produces: nothing new.

**Why the width changes:** the longest realistic row is chip + `Untitled · Motion Prompt` + status glyph, which does not fit `w-64` (256px) without truncating the kind — defeating the entire change. `w-72` (288px) fits it.

**Why the pill recolors:** it currently renders running *and* ready both in `text-primary` and failed in `text-muted-foreground`. Left alone it directly contradicts the row palette Task 2 established.

---

- [ ] **Step 1: Replace the collapsed count pill**

In `src/components/canvas/generation-tray.tsx`, replace the whole `if (collapsed)` return block (lines 66-84) with:

```tsx
  if (collapsed) {
    return (
      <Button
        variant="outline"
        onClick={() => toggleCollapsed(false)}
        className="absolute right-4 top-1/2 z-20 h-auto -translate-y-1/2 gap-2 rounded-full px-3 py-1.5 shadow-card"
        aria-label="Expand generation tray"
      >
        <span className="flex items-center gap-1 text-xs text-warning-text">
          <Loader2 className="size-3 animate-spin stroke-[1.5]" /> {counts.running}
        </span>
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="size-3 stroke-[1.5]" /> {counts.failed}
        </span>
        <span className="flex items-center gap-1 text-xs text-success-text">
          <CheckCircle2 className="size-3 stroke-[1.5]" /> {counts.ready}
        </span>
      </Button>
    );
  }
```

Note the counts are reordered to Running → Failed → Ready, matching the list's own sort order.

- [ ] **Step 2: Widen the panel and loosen the spacing**

Replace the expanded return block (lines 86-104) with:

```tsx
  return (
    <div className="absolute right-4 top-1/2 z-20 flex w-72 -translate-y-1/2 flex-col rounded-xl border border-border bg-card/95 shadow-card backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-eyebrow !text-[0.65rem]">Generation Tray</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => toggleCollapsed(true)}
          className="text-muted-foreground"
          aria-label="Collapse generation tray"
        >
          <ChevronDown className="size-4 stroke-[1.5]" />
        </Button>
      </div>
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto p-2.5">
        {items.map((item) => (
          <GenerationTrayItem key={item.nodeId} item={item} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
```

- [ ] **Step 3: Add the Button import**

Add to the import block at the top of the file, after the lucide import on line 6:

```ts
import { Button } from "@/components/ui/button";
```

- [ ] **Step 4: Verify it typechecks, lints, and the suite passes**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify visually in the running app**

Run: `npm run dev:next` and open a canvas with generation activity.

Confirm:
1. `Untitled · Motion Prompt` fits on one line without truncating — this is the specific case `w-72` exists for.
2. Rows have visible breathing room between them; the list does not feel cramped.
3. Collapse the tray. The count pill's colors match the rows: yellow spinner, red-orange alert, green check — no purple.
4. Reload the page. The collapsed state persists (localStorage), and the pill still renders correctly.
5. Expand again. The chevron still collapses it.

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/generation-tray.tsx
git commit -m "feat(tray): widen the panel, loosen spacing, recolor the count pill

w-64 truncated 'Untitled · Motion Prompt'. The collapsed pill rendered
running and ready both in primary and failed in muted-foreground, which
contradicts the row palette; it now mirrors the rows and orders its counts
to match the list sort. Raw <button>s converted to the Button primitive per
CLAUDE.md.

Refs D142.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the full suite one more time: `npm test` — expected PASS.
- [ ] Run `npx tsc --noEmit` — expected exit 0, no output.
- [ ] Run `npm run lint` — expected no errors.
- [ ] `grep -rn "assetType" src/` returns **no hits** — the old field is fully gone.
- [ ] `grep -rn "Video Prompt" src/components/canvas/ src/lib/generation-tray.ts` returns **no hits** — the tray says "Motion Prompt".
- [ ] `grep -n "<button" src/components/canvas/generation-tray.tsx src/components/canvas/generation-tray-item.tsx` returns **no hits** — no raw buttons remain.
- [ ] Confirm no route, hook, store, or migration file appears in `git diff --stat main...HEAD` beyond the five files this plan names.

## Expected consequence

Failed rows move from `text-muted-foreground` to destructive color plus a tinted row, so existing canvases will look like they suddenly grew errors. They did not — the failures were always in the tray, rendered in the quietest tone the system has. This is intended, and is the §1(c) bug in the spec being fixed. Do not "fix" it back.
