# Signal-flavoured script parsing — design

**Date:** 2026-08-31 · **Status:** approved in brainstorm, pending spec review
**ADR:** D204 (refines D189, D186, D17-era parse-context pattern. D192–D200 were left free for
`feat/gemini-omni-provider`; on merge that branch's decisions were renumbered to D205–D234
instead, so the gap is now simply unused.)
**Builds on:** Market Signals V1 (`2026-08-27-market-signals-v1-design.md`, D184–D191)

## 1. Context and goal

Market Signals V1 deliberately stopped at the Market page: D189 recorded *"Signals are
page-only in V1 — no in-canvas signal browsing"* and deferred generation injection
(*"Mode A returns at V1.2/V1.3 with a designer in the loop"*). The browsing half has now
shipped (Signals tab in the gallery drawer, commit `1537e13`). This spec is the
injection half: a designer attaches one or more signals to a **Script node**, and the
signals' interpretation flavours the parse so **every extracted shot carries the
theme** — e.g. a face-cream script parsed with a "Rakshabandhan" signal yields shots
with rakhi-tying moments, sibling gifting, festive palette.

The mechanism rides the existing KB rail: the script parse already injects ambient
client context (KB slices, chosen by toggles in the focus view, resolved server-side).
Signals become a second, explicit context block in that same prompt assembly. Because
shots are extracted *inside* the parse call, flavouring the parse flavours every shot
with **zero changes downstream** — `fanOutShots`, shot nodes, and the image/video
prompt paths all inherit the tinted `parsed` content untouched.

## 2. Decisions (from brainstorm, 2026-08-31)

| Question | Decision |
|---|---|
| Attach mechanism | Picker in the script focus view (KB-slices rail) — **no new node type**, no edge |
| How many signals | **Multi-select**; briefs concatenate in selection order |
| Flavour depth | **Per-parse toggle**: `tint` (default — visuals only) vs `rewrite` (whole script may adapt) |
| Flavour payload | Signal **name + tags + description + non-empty per-reference notes** (D186's "MR's voice") |
| Browsing surface | Gallery drawer Signals tab — already shipped, out of scope here |

## 3. Node data model (no DB schema change)

`ScriptNodeData` (`src/lib/canvas-nodes.ts:12-17`) gains two optional fields beside
`kbSlices`:

```ts
signalIds?: string[];              // ids of attached signals, selection order
signalMode?: "tint" | "rewrite";   // absent ⇒ "tint"
```

Persisted with the node like `kbSlices` (autosave path unchanged). No migration:
signals live in `signals` / `signal_items` (migration 0034) and are referenced by id.

## 4. Script focus view UI

A **Signals** section renders beside the existing KB slice toggles in
`script-focus-view.tsx`, using shadcn primitives only:

- Multi-select **chips** listing the client's signals (name, tags as muted suffix).
  Toggling a chip patches `signalIds` on node data — same patch pattern as the slice
  toggles.
- A **mode toggle** (`tint` / `rewrite`), visible only when ≥ 1 signal is selected.
  Labels: "Tint visuals" (default) — *voiceover stays faithful, imagery carries the
  signal*; "Full rewrite" — *the whole script may adapt*.
- Empty state: a one-line muted hint linking the designer to the Market page.

Signal list source: the client's signals from the market GET
(`/api/clients/[id]/market`). The focus view needs `clientId`; how it reaches the
component (prop vs. existing canvas context) is an implementation-plan detail.

**Stale attachments:** a signal deleted after being attached simply stops appearing in
the list; its id is pruned from `signalIds` on the next patch and is silently skipped
by the server (§5). Nothing errors.

## 5. Parse route changes

`POST /api/nodes/[id]/parse` (`src/app/api/nodes/[id]/parse/route.ts`) body gains
`{ signalIds?: string[], signalMode?: "tint" | "rewrite" }`.

Server flow additions:

1. Resolve the node's client (the route's existing node→canvas→client chain used by
   `getNodeActiveKB`).
2. Load that client's signals via the existing DAL (`listSignalsWithItems`) and keep
   those whose id ∈ `signalIds`, in `signalIds` order. **Unknown/foreign ids are
   dropped silently** — client scoping is the authorization boundary, same as KB.
3. Build the signal brief (§6) and pass it to `compileScript`.
4. Provenance: `insertVersion`'s `inputsUsed` gains `signalIds` (the ids actually
   used, post-filter) and `signalMode`.

## 6. Prompt assembly

A pure builder, `buildSignalBrief(signals: SignalWithItems[]): string`, in
`src/lib/market/` (unit-testable, no I/O). Per signal:

```
Market signal: <name>  [tags: a, b]
<description — omitted line if empty>
Evidence notes:
- <reference note>        ← only non-empty notes; section omitted if none
```

`compileScript` (`src/lib/nodes/script.ts`) composes, in order: KB client context →
signal brief block → mode instruction → source script. The two mode instructions are
**canonical, versioned text in `src/prompts/script-parse.ts`** (the existing prompt
home), roughly:

- `tint`: keep voiceover/text-overlay content faithful to the source; adapt only the
  visual side — shot descriptions, settings, props, moods — to reflect the signal(s).
- `rewrite`: the whole script — hooks, voiceover, overlays, visuals — may adapt to the
  signal(s) while keeping the product message.

With no signals attached the assembly is byte-identical to today's (no empty headers).

## 7. Downstream — explicitly no changes

`fanOutShots`, `ShotNodeData`, `getNodeOutput`, `resolve-inputs.ts`, and every
image/video path are untouched. The flavour lives in `parsed` content they already
consume. This is the whole reason the design is small.

## 8. Testing

- `buildSignalBrief`: empty description omitted, empty notes skipped, notes section
  omitted when all empty, multi-signal ordering, tags rendering.
- `compileScript`: composition with/without brief; both mode instructions present in
  the right slot; no-signal output unchanged from current behavior (regression pin).
- Route-level: unknown signal ids filtered; `inputsUsed` records post-filter ids and
  mode. (Same test style as the existing parse/KB tests.)
- UI: manual verification (no drawer/focus-view component test precedent).

## 9. Non-goals

- No Signal canvas node type, no `VALID_CONNECTIONS` change, no edges.
- No automatic injection into `compilePrompt` / image / video paths (still deferred,
  per D189's rejection of designer-out-of-the-loop Mode A).
- No signal editing from the canvas; the Market page remains the distill surface.
- No blending logic beyond concatenation when multiple signals are attached.
