# Generation Tray — kind-aware rows, icon-only status

**Date:** 2026-08-11
**Status:** Approved design. Implementation pending (test-first).
**Type:** Design spec (adds **D142**).
**Refines:** **D35** (`2026-07-05-generation-tray-design.md` — the tray itself; its behavior model,
retention rule, sort order, and navigation-only guardrail all survive unchanged).
**Depends on:** **D137** (the `video-prompt` node is human-labelled **"Motion Prompt"**).
**Preserves:** the tray is a *pointer surface*, not a review surface — no tray-level actions.

---

## 1. Problem

Two complaints, one of which is not a styling problem at all.

**(a) A row cannot say what it is.** `TrayItem.assetType` is derived from the **job row's** `type`
column, which has only three values — `image | video | prompt`. But *two different node types write
`type: "prompt"`*: the Prompt node (`src/app/api/nodes/[id]/generate/route.ts:74`) and the Motion
Prompt node (`src/app/api/nodes/[id]/video-prompt/route.ts:80`). So the tray renders both as the
bare word "Prompt" and **has no information available to distinguish them**. This is a derivation
gap, not a visual one; no restyling of `generation-tray-item.tsx` can fix it.

The same flattening hides the image/video *track* generally: "Prompt", "Image", and "Video" rows are
typographically identical, so the operator reads every row rather than scanning.

**(b) The status column is text.** Each row ends in the word "Running" / "Ready" / "Failed" set as an
eyebrow. Three text elements per row (status glyph, `Shot N · Type`, status word) makes a narrow rail
feel dense, and the word duplicates the glyph that already sits at the row's other end.

**(c) A latent bug surfaced by (b).** Failed currently renders in `text-muted-foreground` — the
*quietest* tone in the system. Failures recede exactly where they should announce themselves.

## 2. Goal

Make a tray row legible without reading it: **kind from a leading glyph, status from a trailing
glyph, nothing else.** Keep the tray navigation-only.

## 3. Non-goals

- **Any tray-level action.** No retry on failed rows, no approve, no regenerate. Click still does
  exactly one thing: fly to the node and open its focus view (D35 §9). Explicitly re-confirmed.
- **Output thumbnails on Ready rows.** Sketched in D35 §8, never built, still not built — it makes
  rows tall and pushes the tray toward being a review surface.
- **Grouping rows by shot.** Considered and rejected (§8); the list stays flat with the existing
  status-first sort.
- **Any API, schema, or migration change.** Everything here derives from data already in hand.

## 4. The derivation change

`TrayItem.assetType: "image" | "video" | "prompt"` is replaced by
`TrayItem.kind: TrayKind`, resolved from the job type **and the node type**. The node is already
looked up in `deriveTrayItems` (`byId.get(jobRow.node_id)`, `generation-tray.ts:79`) and is returned
early when missing, so the node type costs nothing extra to read.

```ts
export type TrayKind = "image-prompt" | "image" | "motion-prompt" | "video";

export const TRAY_KIND_META: Record<
  TrayKind,
  { label: string; track: "image" | "video"; stage: "prompt" | "output" }
> = {
  "image-prompt":  { label: "Image Prompt",  track: "image", stage: "prompt" },
  image:           { label: "Image",         track: "image", stage: "output" },
  "motion-prompt": { label: "Motion Prompt", track: "video", stage: "prompt" },
  video:           { label: "Video",         track: "video", stage: "output" },
};
```

Resolution:

| `jobRow.type` | `node.type` | `kind` |
| :--- | :--- | :--- |
| `image` | `image-gen` | `image` |
| `video` | `video-gen` | `video` |
| `prompt` | `video-prompt` | `motion-prompt` |
| `prompt` | anything else | `image-prompt` |

`prompt` + unknown node type falls back to `image-prompt` rather than throwing: the tray is a
read-only derived view and must never blank out on unexpected data. `image-prompt` is the safe
default because `prompt` is the only node type besides `video-prompt` wired to the generate route.

`TRAY_KIND_META` lives in `src/lib/generation-tray.ts` — the pure, `import type`-only module — so
the label/track/stage mapping is unit-testable and has exactly one definition. Lucide glyphs are a
runtime import and therefore stay in the component, which maps `track` → glyph.

**Stale-timeout unchanged.** The `running` image stale guard (`generation-tray.ts:97`) keys on the
*output* image kind only, i.e. `kind === "image"`, preserving today's semantics exactly — prompts
are fast and were never stale-timed, and video is owned by the async pipeline's own reconciliation.

**"Motion Prompt", not "Video Prompt."** Per D137 the human-facing label for the `video-prompt` node
is **Motion Prompt** everywhere the operator looks (`ADD_NODE_OPTIONS`, the node card title
placeholder, the focus view's "Generated motion prompt" section, its completion toast). The tray
matches. The persisted `nodes.type` slug stays `"video-prompt"` — this is display only.

## 5. The row

```
┌────────────────────────────────────┐
│  (▫🖼)  Shot 1 · Image Prompt    ✓ │   outlined chip = prompt stage
│  (▪🖼)  Shot 1 · Image           ✓ │   tinted chip   = output stage
│  (▫🖼)  Shot 2 · Image Prompt    ◌ │
│  (▫🎬)  Shot 3 · Motion Prompt   ◌ │
│  (▪🎬)  Shot 3 · Video           ✓ │
│▓ (▪🎬)  Untitled · Video        ⚠ ▓│   failed row tinted
└────────────────────────────────────┘
```

**Leading kind chip** — `size-7 rounded-lg`, centred glyph at `size-3.5 stroke-[1.5]`.

| Facet | Encoding |
| :--- | :--- |
| `track: "image"` | `ImageIcon` (the glyph already on the Image Gen node card) |
| `track: "video"` | `Clapperboard` (already on both the Motion Prompt and Video Gen cards) |
| `stage: "prompt"` | `border border-border`, transparent bg, `text-muted-foreground` |
| `stage: "output"` | `bg-accent` (`neutral-100`), no border, `text-foreground` |

`bg-accent` rather than `bg-muted` for the output chip: `--muted` is `neutral-50`, which is nearly
invisible against the white `bg-card` row and would leave the prompt/output distinction resting on
the border alone. `neutral-100` reads as a deliberate fill while staying well below the row's own
contrast. Three differentiators stack — ring vs fill, muted vs full-strength glyph, and the label
text itself — so the distinction never depends on any single one.

Two glyphs, not four. The pairing is the signal: a shot's prompt and the output it produced share a
glyph and differ only in chip weight, so the left edge of the tray reads as a pipeline. Four
unrelated glyphs were rejected (§8).

**Label** — `{shotLabel} · {TRAY_KIND_META[kind].label}` at `text-sm`, shot and kind both
`text-foreground` with the `·` separator in `text-muted-foreground`. Truncates with `truncate`.

**Trailing status glyph — icon only, `size-[18px]`, `stroke-[1.5]`:**

| Status | Glyph | Class | Token chain |
| :--- | :--- | :--- | :--- |
| Running | `Loader2` + `animate-spin` | `text-warning-text` | `--warning-text` → `--yellow-700` |
| Ready | `CheckCircle2` | `text-success-text` | `--success-text` → `--green-700` |
| Failed | `AlertTriangle` | `text-destructive-text` | `--destructive-text` → `--red-orange-700` |

All are pre-existing `globals.css` tokens registered in `@theme` (`--color-success-text`,
`--color-warning-text`, `--color-destructive-text`), so the palette is token-driven — nothing
hardcoded, nothing invented.

**All three glyphs take the `-text` (700-step) variant.** `globals.css:139-146` documents the rule:
`--x` is *the fill / solid surface*, `--x-foreground` is *ink on that fill*, and `--x-text` is *ink
on a LIGHT surface (the 700 step)*. A status glyph is ink on a light surface in all three states —
including Failed, whose row tint is a 10% wash, still light. The 700 steps also carry verified
contrast annotations (`green-700` 4.71:1, `yellow-700` 4.57:1, `red-orange-700` 4.52:1); the 500
steps carry none, because they were never meant as ink.

Note this makes the tray *diverge* from `approval-badge.tsx:22`, which puts `text-destructive`
(the 500 fill) on a `bg-destructive/10` chip. That badge is the outlier against the documented
convention, not the precedent — an earlier draft of this spec cited it as one and was wrong.

**Accessibility.** The status word is removed from the DOM as *visible* text but retained as the
row's `title` and folded into its `aria-label`
(`"Shot 1 · Image Prompt — Ready"`), so the tray stays operable by screen reader and hover. Status is
never encoded by color alone: each state has a distinct glyph shape.

**The spinner.** `Loader2` is a rotating open arc with no arrowheads. The reference mock read as a
"reload" control because it drew `RefreshCw`, whose arrowheads make it look like an actionable retry
button on a surface that has no actions. `Loader2` is also already the repo's in-progress idiom
(`ProcessingPill`, the collapsed tray pill), so this is consistency, not novelty.

**Failed row treatment** — the row card takes `border-destructive/30 bg-destructive/10`, verbatim the
language `approval-badge.tsx` already uses for `changes_requested`. No other row state is tinted;
Running and Ready rows stay white.

**Row chrome** — `rounded-xl border border-border bg-card px-3 py-3`. **`shadow-card` is removed from
the row.** Rows currently carry a card shadow *inside* an already-shadowed panel, which is the main
reason the shipped tray reads as muddy rather than crisp; inside a container, borders alone are the
correct elevation. Hover keeps `-translate-y-px` with the house easing.

## 6. The panel

- **Width `w-64` → `w-72`.** The longest realistic row — chip + `Untitled · Motion Prompt` + status
  glyph — does not fit 256px without truncating the kind, which would defeat the whole change.
- Row gap `gap-1.5` → `gap-2`; list padding `p-2` → `p-2.5`.
- Header, collapse chevron, `localStorage` persistence, `max-h-[50vh]` scroll: unchanged.
- **Collapsed count pill recolored** to match the row palette. Today it renders running *and* ready
  both in `text-primary` and failed in `text-muted-foreground` — it will directly contradict the new
  row colors if left alone. It becomes `text-warning-text` / `text-success-text` /
  `text-destructive`, same glyphs as the rows.

## 7. Unchanged

Sort order (Running → Failed → Ready, then shot order), the approved-drop, the stale-timeout, the
Realtime hook (`use-generation-tray.ts`), the hidden-when-empty rule, read-only viewer access, and
navigation-only click behavior. No route, schema, or migration touched.

## 8. Rejected alternatives

- **Grouping rows by shot** (shot heading + its stages beneath). Neater on a full reel and stops
  `Shot N ·` repeating, but it fights the status-first sort — the operator's primary question is
  "what is running / what just broke", not "walk me through shot 3". Rejected in favor of keeping
  the flat list. Revisit if reels routinely exceed ~6 shots.
- **Splitting the tray into fixed Image / Video sections.** Makes the track unmissable but tears a
  single shot's pipeline across two places in the rail.
- **Four distinct glyphs** (Sparkles / Image / Clapperboard / Video, one per kind). Fastest
  single-row read, but nothing then relates a prompt to the output it produced, and the two prompt
  stages share no family resemblance. The 2×2 (track glyph × stage chip) carries strictly more
  information with half the glyphs.
- **A colored left track rail per row.** Would need a second hue to read as a distinction, and purple
  is the system's only brand color.
- **A summary "N generations failed" banner** under the tray header. Persists while scrolling, but
  duplicates what the rows already say and costs vertical space in a `max-h-[50vh]` rail. Tinting the
  failed row itself puts the signal where the fix is.
- **Keeping the status word as a visible label.** It is the specific thing that makes the rail feel
  text-heavy, and it says nothing the glyph doesn't.

## 9. Consequence to expect

This is a **behavioral** change, not purely cosmetic. Failed rows move from `text-muted-foreground`
to destructive color plus a tinted row, so existing canvases will look like they suddenly grew
errors. They did not — the failures were always in the tray, rendered in the quietest tone the
system has. This is the (c) bug in §1 being fixed, and the louder appearance is the intended result.

## 10. Testing

Repo convention: node-env vitest over pure `src/lib/**`; the panel is verified by running the app.

**Unit (`generation-tray.test.ts`, `generation-tray-prompts.test.ts`)** — migrate existing
`assetType` assertions to `kind`, then add the cases that encode the §1(a) bug:

- `prompt` job on a `prompt` node → `kind === "image-prompt"`.
- `prompt` job on a `video-prompt` node → `kind === "motion-prompt"`. **This is the regression
  test** — it fails against today's implementation, which returns `"prompt"` for both.
- `image` job on `image-gen` → `"image"`; `video` job on `video-gen` → `"video"`.
- `prompt` job on an unexpected node type → falls back to `"image-prompt"` (no throw).
- `TRAY_KIND_META` covers every `TrayKind` (type-level via `Record`, plus a key-count assertion).
- Stale-timeout still fires for `kind === "image"` and still does **not** fire for
  `"image-prompt"` or `"video"` — guards the §4 keying change.

**Manual:** a canvas with all four kinds in all three states; confirm the left edge scans as a
pipeline, the running glyph reads as a spinner rather than a retry button, the failed row tints, the
collapsed pill's colors match the rows, and `w-72` fits `Untitled · Motion Prompt` untruncated.

## 11. Implementation surface

**Changed:**
- `src/lib/generation-tray.ts` — `TrayKind` + `TRAY_KIND_META` replace `assetType`; kind resolution
  reads `node.type`; stale guard re-keyed to `kind === "image"`.
- `src/components/canvas/generation-tray-item.tsx` — leading kind chip, icon-only status, failed-row
  tint, `shadow-card` removed, `title`/`aria-label`.
- `src/components/canvas/generation-tray.tsx` — `w-72`, spacing, recolored collapsed count pill.
- `src/lib/generation-tray.test.ts`, `src/lib/__tests__/generation-tray-prompts.test.ts` — per §10.

**Unchanged:** every route, `use-generation-tray.ts`, `canvas-store.ts`, the `generations` schema.
