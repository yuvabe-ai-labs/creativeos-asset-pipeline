# Shot Type Badge — design

**Date:** 2026-07-16
**Branch:** `worktree-minimal-agent`
**Status:** design → plan

## Goal

Surface a shot's **shot type** (Wide Shot, Close-Up, POV, …) in two places:

1. The **Shot node** header on the canvas (next to `Shot {order}` / the `SHOT-XXXX` handle).
2. The **connected-input rail** in every focus view where a Shot appears as an input
   (image-gen, prompt, video-prompt).

## Background

- `deriveShotType(text)` and the `SHOT_TYPES` catalog already exist in
  [`src/lib/nodes/shot-types.ts`](../../../src/lib/nodes/shot-types.ts). It's a pure
  keyword regex over the shot description — no LLM, no async.
- A `shot_type` field is stamped onto shot nodes **once**, at `fanOutShots` time
  ([`canvas-store.ts`](../../../src/lib/canvas-store.ts) ~L328). It is **stale-prone**:
  it is not recomputed when the description is edited, and shots created by other paths
  (e.g. promoting compose ideas) never get it.

## Decisions

- **D-a — Derive live at render time.** Both display sites call `deriveShotType(description)`
  against the shot's *current* description rather than reading the stored `shot_type`.
  Rationale: `shot_type` is an un-invalidated cache. Live derivation is always correct,
  needs no store migration, and the function is cheap/pure. The stored field is left in
  place (harmless; not read by this feature). **Rejected:** reading `data.shot_type` +
  adding re-derivation on every edit (more moving parts, still a cache to keep coherent).
- **D-b — Badge, not editable.** Shot type renders as a small **neutral** pill (muted,
  matching the eyebrow/handle metadata tier). It is **not** user-editable in this pass.
  The purple `bg-primary/10` badge convention is reserved for shot *role*
  (see `connected-inputs-card.tsx` L111–115), so type uses a neutral treatment to stay
  visually distinct from role. **Rejected:** an editable `Select` override (bigger scope —
  a real persisted field + edit UI; not asked for).
- **D-c — All three focus views.** Consistency across every surface where a Shot is a
  connected input.

## Components & changes

### 1. Shot node header — `src/components/nodes/shot-node.tsx`
- Compute `const shotType = deriveShotType(description)` (description already in scope).
- When truthy, render a neutral pill in the header row, after the `NodeHandle`.
  No new props, no store change.

### 2. Connected rail badge — the three focus views
The rail `RailItem` already exposes a `badge` slot ([`focus-rail-item.tsx`](../../../src/components/nodes/focus-rail-item.tsx)).
The shot's description must be reachable where the rail is built.

- **`UpstreamNode`** ([`connected-inputs-card.tsx`](../../../src/components/nodes/connected-inputs-card.tsx))
  gains an optional `shotType?: string` (derived, not the stored field).
- The **upstream builders** that map canvas nodes → `UpstreamNode`
  (e.g. [`image-gen-node.tsx`](../../../src/components/nodes/image-gen-node.tsx) L54, and the
  equivalents feeding prompt / video-prompt focus views) set
  `shotType: n.type === "shot" ? deriveShotType(shotDescription(n)) : undefined`,
  where `shotDescription(n)` reads `data.script.visual_script.shots[0].description`.
- Each focus view's shot `RailItem` passes `badge={u.shotType && <ShotTypeBadge …/>}`.

### 3. Shared badge component
A tiny presentational `ShotTypeBadge` (neutral pill) so the header and the three rails
render identically. Location: co-locate with `shot-types.ts` consumers — a small component
under `src/components/nodes/shot-type-badge.tsx`. One definition, four call sites → extract
(satisfies the "two call sites = extract" rule).

## Reuse / helper

- Reading `shots[0].description` from a shot node's data happens in ≥2 upstream builders →
  extract a `shotDescription(node)` helper (co-locate in `shot-types.ts` or a nodes util),
  rather than repeating the nested optional-chain.

## Testing

- Unit: `deriveShotType` is already tested. Add a test for `shotDescription(node)` (present /
  missing / empty script) if it becomes a shared helper.
- Manual: verify the badge appears/updates as a Shot's description is edited (proves the
  live-derive fix vs. the stale stored field), and shows on all three focus-view rails.

## Out of scope

- Editable shot-type override.
- Removing or backfilling the stored `shot_type` field.
- Any change to how `shot_type` feeds prompts/composition (this is display-only).
