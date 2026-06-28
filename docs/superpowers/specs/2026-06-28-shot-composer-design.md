# Shot Composer — role-aware divergent ideation on the Shot node

**Date:** 2026-06-28
**Status:** Approved design. Implementation pending (test-first).
**Type:** Design spec (adds **D28**; implements a new capability at the Script→Shot seam).
**Decision record:** ADR **D28** (`2026-05-30-creativeos-staging-roadmap.md` §7 — append).
**PRD:** §7.1 (Shot node), §10 (connections), §14 (flow). Builds on **D21** (fan-out),
**D22** (raw-generation capture), **D23** (Shot→image trim), **D9/D11** (mark-don't-block,
human-is-scheduler).
**Origin:** Deep-research report *"Shot Composer for D2C Reel Production"* — adapted to the
existing CreativeOS architecture (three of the report's four ideas already exist; the genuine
gap is *role-aware divergent ideation*).

---

## 1. Problem

A parsed reel script gives each shot a **thin one-liner** — Reel #4 SHOT 3 is *"Fingertip
traces a line of cream on forearm. Ultra close. Skin absorbs fully. 6s."* After **fan-out
(D21)** each becomes a Shot node carrying that single seed. The designer then has:

- **No help turning a thin seed into a strong production direction.** To explore alternatives
  they duplicate the Shot and retype by hand (§15).
- **No notion of a shot's *role*.** A hook, a product hero, a texture macro, an application
  shot, and a closure each need different information present — but nothing in the system knows
  which is which, so nothing tailors the help.

The result is exactly the failure the eval flywheel keeps surfacing: thin, undifferentiated
shots that collapse to one look.

## 2. Goal

A **"Compose variations"** action on the Shot node: the designer picks a **role**, runs the
composer, and gets **4 distinct, production-ready idea cards** for that role — grounded in the
shot seed + Brand-KB compliance/tone + (optionally) a wired reference image. They **pick one to
rewrite this shot's description**, or **multi-select to promote extras into sibling Shot nodes**
for downstream comparison.

Fan-out (D21) is untouched. This is purely additive enrichment on a Shot that already exists.

## 3. Decisions carried in (settled during brainstorming → D28)

1. **Problem = role-aware divergent ideation.** Not enrichment (exists at the Prompt node), not
   variation-by-duplication (exists §15), not KB compliance (exists). The gap is *several
   distinct creative directions, role-aware,* from one thin seed.
2. **Placement = an action on the Shot node** (compose-*after*-fan-out). Rejected:
   compose-then-materialize at fan-out (turns instant fan-out into a blocking review screen,
   fights D11) and a new Shot Composer node type (more wiring, another node).
3. **Materialization = pick one → set this shot's description; optionally multi-select → promote
   extras to sibling Shot nodes.** Divergence is opt-in; comparison reuses the existing per-Shot
   → Prompt → Image chain.
4. **Role = designer picks explicitly.** A required role selector; no inference. Predictable.
5. **Capture = capture-only via D22, latest run shown; no version panel.** Each run writes a
   `node_versions` row (frozen `generated_output`) but is **never made active** — so the Shot
   keeps rendering its own-content description (D19/D20 intact).
6. **Context = trimmed seed + role + KB compliance/tone (divergence-first).** Feed the shot's
   visual description + production medium + role + KB compliance/tone/personality. **Drop**
   `strategic_objective`/caption (the Run-01 homogenizer). The *role* drives what varies.
7. **Image-ref grounding = in MVP.** A wired File/Draw/Image-Gen image is vision-read inside the
   composer call and steers **specific dimensions only** (palette, surface, vessel, prop system,
   framing, depth-of-field, mood) — not the whole concept (avoids near-copies).

## 4. Architecture

The composer route is ~90% the **Video Prompt route**
(`src/app/api/nodes/[id]/video-prompt/route.ts`) with two swaps: it asks for **structured JSON
output** (4 ideas, like `parse`) instead of one prose blob, and it **omits `setActiveVersion`**
(capture-only). Everything else — ambient KB resolve, `buildUserContent` with an image vision
part, `insertVersion` with D22 freezing — is reused.

### 4.1 Data model — the idea (pure)

```ts
// src/lib/nodes/shot-compose.ts
export type ShotComposeIdea = {
  title: string;        // short label, e.g. "Forearm glide"
  bestFor?: string;     // e.g. "Sensory proof"
  description: string;  // the production-ready prose written into the shot
};
```

The Shot's output stays a description string; an idea is just a labelled candidate description.

### 4.2 Role catalog (pure, curated)

```ts
// src/lib/nodes/shot-roles.ts
export type ShotRole = {
  key: string;       // "hook" | "hero" | "texture" | "application" | "ingredient"
                     // | "tutorial" | "lifestyle" | "social-proof" | "bundle" | "closure"
  label: string;
  slots: string[];   // what must be present (e.g. application: body area, amount, motion, finish)
  avoid: string[];   // per-role compliance (e.g. application: no medical theater / transformation)
};
export const SHOT_ROLES: ShotRole[];        // the 10 roles
export const DEFAULT_SHOT_ROLE = "hero";    // neutral default; designer chooses
```

This mirrors how `shot-controls.ts` pre-renders a curated catalog. "Learned later" = refine these
lists from eval results — a data change to one constant, no architecture change. This is where the
report's *"role determines required information"* becomes concrete and tunable.

### 4.3 Prompt template (versioned)

```ts
// src/prompts/shot-compose.ts
export const shotComposePrompt = {
  id: "shot-compose",
  version: 1,
  model: "gpt-5.4-mini",          // match the other text nodes
  system: `...`,                   // see below
} as const;
```

System prompt rules:
- Produce **exactly 4** shot ideas, all for the **same given role**.
- The 4 must be **distinct** — vary composition, motion, prop logic, framing (the report's
  "diversity"). Do **not** return four rewordings of one idea.
- Be concrete about surface, light, hand/body action, and finish (fill the role's `slots`).
- Honor the **avoid-list** (role `avoid` + KB compliance): no medical-style visuals, no baked-in
  text, no impossible material behavior, no generic luxury filler.
- If a **reference image** is provided, use it **only** for palette / surface / vessel / prop
  system / framing / depth-of-field / mood — never copy its whole concept.
- Output **strict JSON**: `{ "ideas": [{ "title", "bestFor", "description" }] }` via
  `response_format: { type: "json_schema", strict: true }` (as `parse` does).

### 4.4 Compose context (pure renderer)

```ts
// src/lib/nodes/shot-compose.ts
export function renderComposeContext(args: {
  seedText: string;        // = renderShotForImage(data.script) — the existing D23 trim
  role: ShotRole;
  clientContext: string;   // KB slices, already rendered (buildParseContext)
}): string;
```

**Reuses the existing D23 renderer** `renderShotForImage(script)`
(`src/lib/nodes/node-output.ts`), which already returns exactly *"shot description + Medium:
ai_production_type"* and drops everything else (objective, on-screen text, caption, …). So the
composer's seed is **identical to what the image prompt later receives** — no new trim, no
divergence between ideation and prompting. `renderComposeContext` then wraps that seed with the
role's slots/avoid + KB. Tested for: role-slot injection and avoid-list inclusion (the trim itself
is already covered by the existing `renderShotForImage` tests).

### 4.5 Resolve (server)

```ts
// src/lib/nodes/resolve-inputs.ts
export async function resolveShotComposeInputs(
  nodeId: string,
  slicesInput: unknown,
): Promise<{
  seedText: string;                 // renderShotForImage(node.data.script)
  clientContext: string;
  kbVersionId: string | null;
  slices: KBSliceKey[];
  imageRef?: { fileUrl: string };   // first image-typed upstream, if any
} | null>;
```

Two grounding rules that keep D21 intact (see Insight in design notes):
- **Seed comes from the Shot's OWN `data.script`** (a `nodes` row fetch), run through
  `renderShotForImage` (the D23 trim). **Not** an upstream walk.
- **Grounding image is taken only from image-typed upstreams** (`file`/`draw`/`image-gen`) via
  `getUpstreamOutputs`. The dashed **Script→Shot lineage edge** (a `script` upstream) is ignored
  because it is not an image type — so resolution never re-imports the whole reel, and
  seed-and-fork is preserved.

### 4.6 Route (server)

```
POST /api/nodes/:id/compose
  body:   { role: string, slices?: KBSliceKey[] }
  → resolveShotComposeInputs(id, slices)
  → renderComposeContext(...) + buildUserContent(user, imageRef as vision part)
  → openai.chat.completions.create({ ..., response_format: json_schema })
  → JSON.parse → { ideas: ShotComposeIdea[] }   (clamp/validate to ~4)
  → insertVersion({
       inputsUsed:  { role, kbSlices, kbVersionId, imageRef? },
       paramsUsed:  { promptId, promptVersion, tokensUsed },
       modelUsed,
       output: { ideas },           // generated_output frozen = { ideas }  (D22)
     })                              // NB: NO setActiveVersion — capture-only
  → apiOk({ ideas, versionId })
```

Failed attempts still `insertVersion({ error })` (the log learns from failures — same as `parse`).

### 4.7 Selection capture

When the designer **picks** idea *i* (and optionally edits it to `finalDescription`):

```ts
// src/lib/db/versions.ts (new helper — the compose row is NOT active)
export async function updateVersionOutput(versionId: string, output: unknown): Promise<void>;
// updates ONLY `output` on that specific row; leaves generated_output frozen (D22).
```

`output` becomes `{ ideas, selectedIndex, finalDescription }`. This is the eval-flywheel signal:
*the model proposed 4, the human chose #i and shipped Y.* The Shot's visible description is
written separately via the existing `setDescription` (edit-at-source, autosave). The version row
is a pure capture side-channel — never surfaced as a version panel.

### 4.8 Shot node + connections

- **`src/components/nodes/shot-node.tsx`**: add a dashed-primary **"✦ Compose"** chip (AGENTS.md:
  "Add" actions are discoverable dashed chips) opening the Compose sheet; add a **dedicated image
  target handle** (`id="image"`, visually distinct from the existing lineage target handle).
- **`src/lib/canvas-nodes.ts` `VALID_CONNECTIONS`**: add `"shot"` to the target lists of `file`,
  `draw`, and `image-gen` (image grounding). Script→Shot lineage stays a programmatic dashed edge
  (not user-drawn), unchanged.
- **`src/lib/nodes/resolve-inputs.ts` `TYPE_LABEL`**: already has `shot: "Shot"` — no change.

### 4.9 Promote to siblings (client store)

```ts
// src/lib/canvas-store.ts
promoteIdeasToShots: (shotNodeId: string, ideas: ShotComposeIdea[]) => void;
```

Reuses the fan-out column layout/seeding: one sibling Shot per idea, laid out to the right/below,
each carrying that idea's `description` written into a copy of the source Shot's narrowed
`data.script`. **No edges** (human wires each `Shot → Prompt → Image` — D11/§15). `seededFrom`
carries the source Shot's title for provenance.

### 4.10 Compose sheet (client)

`src/components/nodes/shot-compose-sheet.tsx` — a side sheet (the Shot's first focus surface):

1. **Role** `Select` (shadcn Base-UI; the 10 roles; required; defaults to `DEFAULT_SHOT_ROLE`).
2. **KB toggles**: compliance / tone / personality **on**, brand profile **off** (§9.1 set).
3. **Grounding**: if an image is on the image handle, a *"grounding from [thumbnail]"* row;
   otherwise absent (text-only run).
4. **Compose** → 4 shimmer skeleton cards (reuse the skeleton pattern) → 4 idea cards.
5. Each card: `title` · `bestFor` tag · prose, a **"Use this shot"** primary action + a checkbox.
   - **Use this shot** → `setDescription` + `updateVersionOutput` (capture) + close.
   - **Check 2+ → "Promote N to sibling shots"** → `promoteIdeasToShots`.
6. **Re-compose** writes a fresh capture row and **replaces** the shown ideas (latest-run only).

## 5. Data flow

```
Shot node (data.script = reel narrowed to one shot)         [image upstream? File/Draw/Image-Gen]
   │  designer: pick role → "Compose"                                    │
   ▼                                                                     ▼
POST /api/nodes/:id/compose
   resolveShotComposeInputs:  seed = renderShotForImage(OWN data.script)  +  KB slices  +  image (vision)
   renderComposeContext + buildUserContent(image as vision part)
   LLM (structured JSON, 4 ideas)
   insertVersion{ generated_output:{ideas} }   ← capture-only, NOT active (D19/D20 intact)
   ▼
4 idea cards in the sheet
   ├─ "Use this"  → setDescription (edit-at-source) + updateVersionOutput{selectedIndex,final}
   └─ multi-select → promoteIdeasToShots → N sibling Shot nodes (no edges; human wires)
                                                  │
                                                  ▼
                                   Shot → Prompt → Image (Stage 3, unchanged) → compare
```

## 6. Files

| File | Change |
|---|---|
| `src/lib/nodes/shot-roles.ts` | **New.** `SHOT_ROLES` catalog (10 roles, slots+avoid) + default |
| `src/lib/nodes/shot-roles.test.ts` | **New.** Catalog integrity (every role has slots+avoid) |
| `src/lib/nodes/shot-compose.ts` | **New.** `ShotComposeIdea`, `renderComposeContext` (reuses `renderShotForImage`) |
| `src/lib/nodes/shot-compose.test.ts` | **New.** Trimming, role-slot injection, avoid-list |
| `src/prompts/shot-compose.ts` | **New.** Versioned composer prompt template |
| `src/lib/nodes/resolve-inputs.ts` | `resolveShotComposeInputs` (own-seed + image-only upstream) |
| `src/lib/nodes/resolve-inputs.test.ts` | Resolve: trims seed; ignores script lineage; picks image |
| `src/app/api/nodes/[id]/compose/route.ts` | **New.** Compose route (structured output, no setActive) |
| `src/lib/db/versions.ts` | `updateVersionOutput(versionId, output)` |
| `src/lib/db/versions.test.ts` | Updates only that row's `output`; `generated_output` frozen |
| `src/lib/canvas-nodes.ts` | `VALID_CONNECTIONS`: add `shot` to file/draw/image-gen targets |
| `src/lib/canvas-nodes.test.ts` | Image-source → Shot allowed; non-image → Shot rejected |
| `src/lib/canvas-store.ts` | `promoteIdeasToShots` action (+ type) |
| `src/lib/canvas-store.test.ts` | N siblings, descriptions, order/layout, **no edges** |
| `src/components/nodes/shot-node.tsx` | Compose chip + image target handle |
| `src/components/nodes/shot-compose-sheet.tsx` | **New.** The Compose sheet |
| `docs/.../2026-05-30-creativeos-staging-roadmap.md` | Append **D28** to §7 |
| `CreativeOS MVP PRD.md` | §7.1 Shot node, §10 connections, §14 flow note |

## 7. Testing (TDD — written first)

- **`shot-roles`**: every role has a non-empty `slots` and `avoid`; keys unique; default exists.
- **`shot-compose` (`renderComposeContext`)**: wraps the given `seedText` with the role's slots +
  avoid-list + KB (the trim itself is `renderShotForImage`'s existing test).
- **`resolveShotComposeInputs`**: seed = `renderShotForImage(node.data.script)` (not upstream);
  a `script`-typed upstream (lineage edge) is **ignored**; an `image-gen`/`file`/`draw` upstream
  becomes `imageRef`.
- **`updateVersionOutput`**: updates only the named row's `output`; `generated_output` unchanged.
- **`VALID_CONNECTIONS`**: `file/draw/image-gen → shot` allowed; `text/script/prompt → shot` not.
- **`promoteIdeasToShots`**: N ideas → N sibling Shot nodes with the right descriptions/order; no
  new edges.
- **Route/integration**: compose returns 4 ideas; inserts a version with
  `generated_output == { ideas }`; **does not** set the node's active version.
- **Manual e2e**: fan out Reel #4 → Compose on SHOT 3, role = Application → 4 distinct ideas →
  "Use this" rewrites the description (persists on reload) → wire Shot→Prompt→Image; multi-select
  2 ideas → 2 sibling Shots appear (no edges); re-compose replaces the cards.

## 8. Out of scope (YAGNI / deferred)

- **No** version panel / restore on the Shot (capture-only — D28).
- **No** approved-shot-history grounding (the report's "learning phase"; needs the F6 library).
- **No** shot-group / `SHOT 1-10` expansion concept — each shot is already its own node post
  fan-out; the composer is per-shot.
- **No** role inference (designer picks — D28).
- **No** auto-wiring of Prompt/Image on promote (human is scheduler — D11/§15).
- **No** configurable idea count (fixed 4 for MVP).
- Untouched: fan-out (D21), Script node, Prompt/Image/Video Gen nodes.

## 9. Verification

- New unit tests green; `tsc --noEmit` and `npm run lint` clean on touched files; existing vitest
  suite unbroken.
- Manual e2e (§7) passes.
- Capture confirmed by direct DB read: a compose row exists with `generated_output = { ideas }`,
  the node's `active_version_id` is **unchanged**, and after "Use this" the row's `output` carries
  `selectedIndex` + `finalDescription` while `generated_output` stays frozen.

## 10. ADR — D28 (append to the roadmap log §7)

**Decision.** Add a **Shot Composer**: a capture-only **"Compose variations"** action on the Shot
node that produces **4 role-aware, divergent, production-ready shot ideas** from the shot's own
trimmed seed + a designer-picked role + KB compliance/tone + an optional vision-read reference
image. Picking one rewrites the shot's description (edit-at-source); multi-select promotes extras
into sibling Shot nodes.

**Why.** The genuine gap (vs. the deep-research report) is *role-aware divergent ideation* — the
other report ideas already exist (Prompt-node enrichment, duplicate-to-compare, KB compliance).
The role concept is new and is where production knowledge lives.

**How it preserves invariants.** A compose run writes a `node_versions` row (D22 freezes
`generated_output`) but is **never made active**, so the Shot keeps rendering its own-content
description (D19/D20 intact) — frozen provenance, not a second source of truth. Seed comes from the
node's own `data.script`, and grounding from image-typed upstreams only, so the dashed Script→Shot
lineage edge is never traversed (seed-and-fork, D21). Fan-out and the human-as-scheduler model
(D11) are unchanged.

**Rejected.** Compose-then-materialize at fan-out (blocking review screen, fights D11); a dedicated
Shot Composer node type (extra wiring/node); role inference (less predictable than a picked role);
full context incl. `strategic_objective` (re-introduces the Run-01 homogeneity D23 removed); a
user-facing version panel on the Shot (capture is enough for MVP).

**Refines.** D21 (adds an enrichment action atop fan-out), D23 (carries the trim up into
ideation). **Originated →** this spec.
