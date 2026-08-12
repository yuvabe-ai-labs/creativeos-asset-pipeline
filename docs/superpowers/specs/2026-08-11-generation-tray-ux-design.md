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

Let a tray row say what it is — an Image Prompt, an Image, a Motion Prompt, a Video — and show its
status as a glyph rather than a word. Change nothing else: not the tray's geometry, not its chrome,
not its closed state, and not its navigation-only behavior.

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
│  Shot 1 · Image Prompt           ✓ │
│  Shot 1 · Image                  ✓ │
│  Shot 2 · Image Prompt           ◌ │
│  Shot 3 · Motion Prompt          ◌ │
│  Shot 3 · Video                  ✓ │
│  Untitled · Video                ⚠ │
└────────────────────────────────────┘
```

**The row is pure text plus one status glyph** — it matches the design comp exactly. There is no
leading icon.

**The label carries the kind, and that is the whole point of §4.** `{shotLabel} · {label}` at
`text-xs font-medium`, `text-foreground`, with the `·` separator in `text-muted-foreground`,
truncating with `truncate`. Because nothing else distinguishes an Image Prompt row from a Motion
Prompt row, the derivation fix is *more* load-bearing here, not less: before §4, the tray could only
render the word "Prompt" for both.

**Trailing status glyph — icon only, `size-3.5`, `stroke-[1.5]`.** It replaces both the old leading
glyph and the trailing status word, so the row goes from three elements to two.

| Status | Glyph | Class | Token | Value | On white |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Running | `Loader2` + `animate-spin` | `text-gen-running` | `--gen-running` | `#ffd230` | 1.45:1 |
| Ready | `CheckCircle2` | `text-gen-ready` | `--gen-ready` | `#0fea81` | 1.60:1 |
| Failed | `AlertTriangle` | `text-gen-failed` | `--gen-failed` | `#fc171b` | 3.96:1 |

**These three hues come from the design comp, not from the palette**, and are added to
`globals.css` as new primitives registered in `@theme` — so the components still reference tokens
and hardcode nothing. They are deliberately brighter than the semantic 700 steps and **two of the
three do not clear the 3.0:1 WCAG floor for graphical objects.**

That is an accepted, explicit trade: status here is *never carried by colour alone*. Each state has
a distinct glyph shape (rotating arc / circled check / triangle), and the status word is on the
row's `title` and `aria-label`. Colour is reinforcement, not the signal. The alternative — the
semantic `-text` 700 steps (`green-700` 4.71:1, `yellow-700` 4.57:1, `red-orange-700` 4.52:1) —
clears the floor comfortably but reads olive/mustard/vermillion rather than the comp's green/amber/
red, because the Yuvabe palette has no emerald or pure red. Both options were measured and shown
before the choice was made.

**Scoped to the tray on purpose.** `--gen-*` drives only these glyphs and the failed row's tint.
The semantic `--success` / `--warning` / `--destructive` families are untouched and still drive
`approval-badge.tsx` and everything else, so this brightness trade does not leak into surfaces that
never agreed to it.

**Accessibility.** The status word is removed from the DOM as *visible* text but retained as the
row's `title` and folded into its `aria-label`
(`"Shot 1 · Image Prompt — Ready"`), so the tray stays operable by screen reader and hover. Status is
never encoded by color alone: each state has a distinct glyph shape.

**The spinner.** `Loader2` is a rotating open arc with no arrowheads. The design comp read as a
"reload" control because it drew `RefreshCw`, whose arrowheads make it look like an actionable retry
button on a surface that has no actions. This was the complaint that started the work. `Loader2` is
also already the repo's in-progress idiom (`ProcessingPill`), so this is consistency, not novelty.

**No per-status row treatment.** Every row is the same white card whatever its status; the glyph
alone carries the state. A tinted failed row was built and then removed — it read as heavy against a
list of otherwise identical rows, and the comp draws failed rows plain. The §1(c) bug is still fixed
without it: the failure signal moved from `text-muted-foreground`, the quietest tone in the system,
to a saturated red at 3.96:1 — the highest-contrast of the three status glyphs.

**Row chrome is unchanged from the shipped tray** — `rounded-lg border border-border bg-card px-3
py-2`, `shadow-card`, label at `text-xs font-medium`, glyph at `size-3.5`, hover `-translate-y-px`
on the house easing. **No dimension moves.** An earlier pass enlarged the row (`px-4 py-2.5`,
`text-sm font-semibold`) and dropped `shadow-card`; both were reverted. The redesign is a swap of
*what* each row says, not a resize of the rail — the tray keeps its existing footprint on the canvas
so nothing else in the editor has to shift around it.

## 6. The panel

**The panel does not change at all.** `w-64`, row gap `gap-1.5`, list padding `p-2`, the header,
the `ChevronDown` collapse affordance, `localStorage` persistence, and `max-h-[50vh]` scroll are all
exactly as shipped. A `w-72` widening was tried and reverted along with the row resize (§8).

**The collapsed count pill does not change either** — same `rounded-full` chip, same corner, same
`px-3 py-1.5`, and *the same colors it always had* (`text-primary` for running and ready,
`text-muted-foreground` for failed). This is a deliberate exception to the §5 palette: the closed
state was not part of the complaint, so it is left alone rather than dragged along for consistency's
sake. The tray's two states are allowed to differ here because the pill is a count summary, not a
status list — nothing in it needs to be matched against a row.

The one change to this file is mechanical: both raw `<button>` elements become the `Button`
primitive, which `CLAUDE.md` requires and the shipped code violated. An alternative collapsed state —
keeping the panel shell and header and moving non-zero counts into it — was built and reverted (§8).

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
- **A leading kind chip** — a track glyph (`ImageIcon` / `Clapperboard`) in a chip whose weight
  encoded the stage (outlined = prompt, filled = output). Built, reviewed, then **removed**: it made
  the row scannable without reading, but it departed visibly from the design comp, which draws rows
  as pure text. The label now carries the kind alone. This is the trade that makes §4 load-bearing —
  with no chip, a wrong `kind` is an unreadable row rather than a merely undecorated one.
- **Four distinct glyphs** (Sparkles / Image / Clapperboard / Video, one per kind). Rejected before
  the chip was, and moot now: nothing relates a prompt to the output it produced, and the two prompt
  stages share no family resemblance.
- **A colored left track rail per row.** Would need a second hue to read as a distinction, and purple
  is the system's only brand color.
- **A summary "N generations failed" banner** under the tray header. Persists while scrolling, but
  duplicates what the rows already say and costs vertical space in a `max-h-[50vh]` rail.
- **A tinted failed row.** Built, then removed — see §5. The red glyph carries it.
- **Resizing the rail** (`w-72` panel, `px-4 py-2.5` rows at `text-sm font-semibold`, no
  `shadow-card`, looser list spacing). Built, then reverted: the tray's footprint on the canvas is
  load-bearing for everything laid out around it, and none of the actual complaints were about size.
  The redesign changes what a row *says*, not how much room it takes.
- **A collapsed state that keeps the panel shell and header** with counts inline, so collapsing read
  as the same object rather than a swap to an unrelated pill. Built, then reverted with the resize —
  the existing pill is what operators already recognise, and changing it was not asked for.
- **Keeping the status word as a visible label.** It is the specific thing that makes the rail feel
  text-heavy, and it says nothing the glyph doesn't.
- **Using the semantic 700 steps for the status glyphs.** Clears WCAG comfortably, but reads
  olive/mustard/vermillion instead of the comp's green/amber/red. Measured against the comp hues and
  rejected on fidelity — see §5 for the accepted contrast trade.
- **A separate `rounded-full` count pill for the collapsed state.** The shipped behavior, replaced in
  §6.1: it swapped one shape for an unrelated one instead of reading as the same panel collapsing.

## 9. Consequence to expect

This is a **behavioral** change, not purely cosmetic. Failed rows move from `text-muted-foreground`
— the quietest tone in the system — to a saturated red glyph, so existing canvases will look like
they suddenly grew errors. They did not: the failures were always in the tray, just invisible. This
is the (c) bug in §1 being fixed, and the louder appearance is the intended result.

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

**Manual:** a canvas with all four kinds in all three states; confirm the four labels are distinct
and correct (especially Image Prompt vs Motion Prompt on the same canvas), the running glyph reads as
a spinner rather than a retry button, `w-72` fits `Untitled · Motion Prompt` untruncated, and
collapsing keeps the same shell with non-zero counts in the header and no `0`s.

## 11. Implementation surface

**Changed:**
- `src/lib/generation-tray.ts` — `TrayKind` + `TRAY_KIND_META` + `resolveTrayKind` replace
  `assetType`; kind resolution reads `node.type`; stale guard re-keyed to `kind === "image"`.
- `src/app/globals.css` — three new primitives `--gen-ready` / `--gen-failed` / `--gen-running`,
  registered in `@theme` as `--color-gen-*`. No existing token's value changes.
- `src/components/canvas/generation-tray-item.tsx` — label reads `TRAY_KIND_META[kind].label`;
  status glyph moves to the row's trailing edge and loses its text label; tones become `--gen-*`;
  `title`/`aria-label` added; raw `<button>` → `Button`. **Every dimension is untouched.**
- `src/components/canvas/generation-tray.tsx` — two raw `<button>`s → `Button`, nothing else.
  Geometry, chrome, and the collapsed pill (including its colors) are all untouched.
- `src/lib/generation-tray.test.ts`, `src/lib/__tests__/generation-tray-prompts.test.ts` — per §10.

**Unchanged:** every route, `use-generation-tray.ts`, `canvas-store.ts`, the `generations` schema,
every pre-existing `globals.css` token — including `--success` / `--warning` / `--destructive`,
which still drive `approval-badge.tsx` and every other status surface — and the full geometry of
both the panel and the row.
