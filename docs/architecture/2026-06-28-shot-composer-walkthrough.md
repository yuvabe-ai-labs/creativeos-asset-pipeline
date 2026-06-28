# CreativeOS — Shot Composer Walkthrough (role-aware divergent ideation)

**Date:** 2026-06-28
**Status:** Living architecture reference for the Shot Composer (D28)
**Type:** Architecture flows
**Companions:**
[2026-06-28-shot-composer-design.md](../superpowers/specs/2026-06-28-shot-composer-design.md) (the design spec this implements),
[2026-05-30-creativeos-architecture.md](../superpowers/specs/2026-05-30-creativeos-architecture.md) (the reusable node spine — `resolveInputs → compile → runAction → writeVersion → setActive`),
[2026-05-30-creativeos-staging-roadmap.md](../superpowers/specs/2026-05-30-creativeos-staging-roadmap.md) (ADR log — **D28**, plus D21 fan-out, D22 capture, D23 trim, D19/D20 single-source, D11 scheduler),
[2026-06-14-raw-generation-capture-design.md](../superpowers/specs/2026-06-14-raw-generation-capture-design.md) (the `generated_output` freeze — D22).

This document explains **how the Shot Composer actually flows** at runtime: what a "Compose"
click does, where the 4 variations live, and the one structural twist that makes it different
from every other model-running node — **it captures versions without ever activating them.**

> **Why this doc exists.** Every other node that runs a model (`Script.parse`, `Prompt.generate`,
> `Image Gen`, `Video Prompt`) writes a version *and moves the active pointer to it* — the run's
> output becomes the node's output. The Shot Composer deliberately breaks the second half: a
> compose run is captured as a frozen `node_versions` row but is **never made active**, because a
> Shot's output must stay its own `data.script` (D19/D20). Reviewers keep asking "is that a bug?"
> — it is not. This doc is the answer.

---

## 1. Where it sits

```
Script (parsed)
   │  fan out shots (D21 — seed-and-fork, one Shot per shot)
   ▼
Shot node ───────── "Compose" ──────────► 4 role-aware idea cards
   │  (own data.script = the seed)             │
   │                                           ├─ "Use this shot"  → rewrite THIS shot's desc
   │                                           └─ "Promote N"      → N sibling Shot nodes
   ▼
Prompt → Image (Stage 3, unchanged)
```

The composer is **an action on the Shot node**, added *after* fan-out. It does not replace
fan-out, does not add a node type, and does not auto-wire anything (D11/§15 — the human is the
scheduler). See the spec §3 for why this placement was chosen over a fan-out gate or a new node.

## 2. The node spine — with one step removed

CreativeOS nodes share a spine: `resolveInputs → compile → runAction → writeVersion → setActive`
(architecture spine doc). The composer runs **all of it except `setActive`:**

```
resolveInputs   resolveShotComposeInputs(nodeId, slices)        src/lib/nodes/resolve-inputs.ts
   │              ├─ seed     = renderShotForImage(OWN data.script)   ← D23 trim, NOT an upstream walk
   │              ├─ KB       = buildParseContext(activeKB, slices)
   │              └─ images   = selectImageUpstreams(upstream)        ← image-typed upstream only
   ▼
compile         renderComposeContext({seedText, role, clientContext}) src/lib/nodes/shot-compose.ts
   │              + buildUserContent(user, imageUpstream)             ← vision parts (reused)
   ▼
runAction       openai.chat.completions.create({ response_format: json_schema })  (4 ideas)
   ▼
writeVersion    insertVersion({ generated_output:{ideas}, inputs_used:{role,…} })  ← FROZEN (D22)
   ▼
setActive       ✗  SKIPPED  ← the twist. The Shot's active_version_id stays NULL (§4).
```

Compare the Video Prompt route (`video-prompt/route.ts`) — it is the same shape and the composer
was built from it; the only diffs are **structured JSON output** (4 ideas, like `parse`) and the
**missing `setActive`**.

## 3. Two routes

```
POST /api/nodes/:id/compose          generate 4 ideas, capture the run (no setActive)
     body  { role, slices }
     →     { ideas: ShotComposeIdea[], versionId }

GET  /api/nodes/:id/compose          latest compose run, for rehydrating the sheet on reload
     →     { ideas, role, versionId, selectedIndex }   (reads generated_output of the
            newest row whose params_used.promptId === "shot-compose")

POST /api/nodes/:id/compose/select   record the pick into the SAME row's output
     body  { versionId, selectedIndex, finalDescription }
     →     { ok: true }
```

`compose/select` exists because the compose row is **not active**, so `updateActiveVersionOutput`
can't reach it; `updateVersionOutput(versionId, …)` targets the specific row. The chosen idea's
*visible* text is written separately to `nodes.data.script` (edit-at-source, client store) — the
row update is pure eval capture (the generated→shipped diff).

## 4. The twist: capture without activation

```
                          nodes table
        ┌─────────────────────────────────────────────────┐
        │ id: shot-42 · type:"shot"                         │
        │ active_version_id: NULL  ◄── Compose never sets it │
        │ data.script…shots[0].description:                 │
        │   "Place the jewellery on a matte blush pedestal…"│ ◄─ CHOSEN idea text
        └─────────────────────────────────────────────────┘    (what renders + flows downstream)
                  ▲ node_id
                  │
     node_versions  (append-only — the variations log, NOT ephemeral)
     ┌───────────────────────────────────────────────────────────────┐
     │ v_a · run #1   inputs_used:{ role:"hero", imageRef:[snake] }    │
     │   generated_output (FROZEN): { ideas:[ 0▸ 1▸ 2▸ 3▸ ] }          │
     │   output: { ideas:[…], selectedIndex:0, finalDescription:"…" }  │ ◄─ the pick
     │ v_b · run #2   inputs_used:{ role:"hero" }                      │
     │   generated_output (FROZEN): { ideas:[ 4 DIFFERENT ] }          │
     │ v_c · run #3   inputs_used:{ role:"texture" }                   │
     │   generated_output (FROZEN): { ideas:[ 4 texture ] }            │
     └───────────────────────────────────────────────────────────────┘
```

Why this is correct, not a leak (this is D22's own pattern, one node over):

- **`generated_output` is frozen provenance** — an attribute of the LLM attempt, never rendered as
  the node's current value. (D22 added it for Script/Prompt; the composer reuses it.)
- **The Shot's output is still its own `data.script`** — because `active_version_id` is `NULL`,
  `nodeRowToFlow` hydrates nothing from versions, so D19/D20 hold: the rendered shot is the seed
  (or the chosen idea once written). The version log is a *side-channel*, not the source of truth.
- **It's a LOG, not a slot.** There is no `hero → [4]` cell that gets overwritten. Each Compose
  appends a fresh row tagged with its role. "All hero variations for this shot" is a query:
  ```sql
  SELECT generated_output->'ideas' FROM node_versions
  WHERE node_id = 'shot-42' AND params_used->>'role' = 'hero';
  ```

## 5. Stored vs. shown

```
   STORED (durable, forever)                 SHOWN (UI)
   ─────────────────────────                 ──────────
   1 node_versions row per Compose run       latest run (rehydrated on open)
   all 4 ideas/run (generated_output, D22)   the 4 ideas of that latest run
   the role per run (inputs_used.role)        role dropdown restored to that run
   the pick (output.selectedIndex/…)          older runs are NOT browsable (no panel)
```

This is D28's "capture-only, **latest run shown**; no version panel". On sheet open (after a
canvas reload), `GET /api/nodes/:id/compose` reads the newest `shot-compose` row and restores
`role` + `ideas` (the sheet's `useEffect` + `hydratedRef` — in-session reopens keep current
state). Only the *latest* run is surfaced; the full history stays for the eval flywheel, which can
mine every set ever generated. Older runs are intentionally not browsable on the canvas.

## 6. Two invariants the resolve step protects (D21/D23)

1. **Seed comes from the Shot's OWN `data.script`** via `renderShotForImage` — *not* an upstream
   walk. The dashed Script→Shot lineage edge would otherwise re-import the whole reel and break
   seed-and-fork (D21). `getNodeData(nodeId)` reads the node's own row.
2. **Grounding images come only from image-typed upstreams** (`file`/`draw`/`image-gen`) via
   `selectImageUpstreams`. A `script` upstream (the lineage edge) is not an image type, so it is
   ignored — `buildUserContent` then attaches only real reference images as vision parts. This is
   the same trim D23 applies to image prompts, carried up into ideation; `strategic_objective` and
   marketing copy are dropped so the 4 ideas diverge instead of re-homogenizing.

## 7. File map

| Concern | File |
|---|---|
| Role catalog (10 roles · slots · avoid) | `src/lib/nodes/shot-roles.ts` |
| Idea type · context renderer · image selector (pure) | `src/lib/nodes/shot-compose.ts` |
| Composer prompt (versioned · JSON schema) | `src/prompts/shot-compose.ts` |
| Resolve (own seed + KB + image upstream) | `src/lib/nodes/resolve-inputs.ts` → `resolveShotComposeInputs` |
| Generate route (capture, **no** setActive) | `src/app/api/nodes/[id]/compose/route.ts` |
| Selection capture route | `src/app/api/nodes/[id]/compose/select/route.ts` |
| DB helpers | `src/lib/db/versions.ts` → `updateVersionOutput`; `src/lib/db/nodes.ts` → `getNodeData` |
| Promote to siblings (store) | `src/lib/canvas-store.ts` → `promoteIdeasToShots` |
| Shot card (Compose chip + image handle) | `src/components/nodes/shot-node.tsx` |
| Compose focus sheet (UI) | `src/components/nodes/shot-compose-sheet.tsx` |
| Connection rule (image → Shot) | `src/lib/canvas-nodes.ts` → `VALID_CONNECTIONS` |

## 8. Did it touch the schema?

**No migration.** It reuses `node_versions` (which already had `generated_output` from D22) and
`nodes.data` (jsonb). The only DB-layer additions are two query helpers (`updateVersionOutput`,
`getNodeData`) over existing tables. Promoted siblings are ordinary new `nodes` rows; reference
images are read at compose time and persist where they already lived (`nodes.data.fileUrl`).
