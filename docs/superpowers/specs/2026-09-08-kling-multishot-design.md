# Kling as a second multishot model

**Status:** designed, not implemented
**Refines:** D230 (the Multishot node), D231 (the plan is JSON), D232 (Omni coercion on connect)

---

## 1. What this changes

Today the multishot lane has exactly one model. Omni is assumed at every level: the cut ladder's
ceiling is the constant `OMNI_MAX_SECONDS`, the writer prompt is Omni-specific, `renderPlan` emits
Omni's timecode ladder, and a Video Gen node connected to a Multishot Prompt is coerced to Omni on
connect.

This makes the model a choice, made once on the Multishot node and inherited down the lane.

## 2. The transport already exists — this is a prompt-and-routing job

Worth stating plainly, because it sets the size of the work. Kling's multi-shot is **not a new
endpoint**. It is `/omni-video/kling-o1` with `settings.multi_shot: true`, and the shots are
expressed in the prompt TEXT rather than as structured fields.

`src/lib/video-gen/providers/kling.ts` already sends `multi_shot`, already sends `audio:
native|off`, already caps references at 5 and addresses them `@image_1…` 1-based. None of that
changes.

**One contradiction, resolved deliberately.** `ref/multishot-refs/kling-omni-docs.md` (the vendor's
user guide) says VIDEO O1 has "No Native Audio, No Multi-shot", while
`ref/multishot-refs/kling-omni-api-system-prompt.md` sets both on that exact endpoint. We follow the
API file: the repo's own provider already sends those fields, which is stronger evidence than a
capability table in a marketing-shaped guide. **If the first Kling multishot generation comes back
as a single take, this is the assumption that was wrong** — not the prompt.

## 3. Capabilities, not constants

The core change. `OMNI_MIN_SECONDS` / `OMNI_MAX_SECONDS` stop being the cut model's ceiling and
become one model's entry in a table.

```ts
// src/lib/nodes/multishot-models.ts
export type MultishotCapability = {
  id: string;                 // a video-gen client model id
  label: string;
  minTotalSeconds: number;
  maxTotalSeconds: number;
  minCutSeconds: number;
  /** Hard cap on cuts per generation. `null` = no limit the vendor states. */
  maxCuts: number | null;
};

export const MULTISHOT_MODELS: MultishotCapability[] = [
  { id: GEMINI_OMNI_MODEL_ID, label: "Gemini Omni 1.1",
    minTotalSeconds: 3, maxTotalSeconds: 10, minCutSeconds: 1, maxCuts: null },
  { id: "kling:kling-o1",     label: "Kling O1",
    minTotalSeconds: 3, maxTotalSeconds: 15, minCutSeconds: 1, maxCuts: 6 },
];

export const DEFAULT_MULTISHOT_MODEL = GEMINI_OMNI_MODEL_ID;
export function multishotCapabilityFor(targetModel: string | undefined): MultishotCapability;
```

| | Omni | Kling O1 |
|---|---|---|
| Total | 3–10s | 3–15s |
| Per cut | ≥1s | ≥1s |
| Cuts per generation | no stated limit | **6, hard** |

The 6-cut cap is genuinely new. The repo currently treats 6 as a *soft* quality hint
(`SOFT_CUT_LIMIT` in `multishot-node.tsx`, commented "a quality signal, not a hard limit"). On
Kling it is a rejection, so it becomes a real constraint — and `SOFT_CUT_LIMIT` is deleted rather
than left beside its hard twin.

`multishot-cuts.ts` takes a capability where it currently imports constants. `resizeCut`,
`clampTotal`, `headroomOf` and `addCut` each gain a capability parameter; `totalOf` is arithmetic
and is unchanged. That file's header states its guarantees in terms of `OMNI_MAX_SECONDS` and has
to be rewritten in terms of the capability — it is the module's contract, not a comment.

**`group-shots.ts` is deliberately NOT parameterised.** Fan-out packing runs when a script is
parsed, before any Multishot node exists and therefore before any model is chosen. It keeps
packing to Omni's 10s, which is the safe floor: a group that fits Omni also fits Kling, so
switching a node to Kling afterwards only ever grants headroom. Parameterising it would mean
choosing a model at parse time, which is the wrong moment to ask.

## 4. `targetModel` on the Multishot node

```ts
// MultishotNodeData
/** Which multishot model this ladder is built for. Absent = DEFAULT_MULTISHOT_MODEL. */
targetModel?: string;
```

A `Select` in the Multishot focus view's header, beside the duration readout — the slot that
already holds status and the guided step. Changing it re-derives the sliders' ceiling immediately.

**No migration.** An absent `targetModel` reads as Omni, which is what every existing node already
is. Nothing is backfilled.

### Switching to a tighter model does not mutate the ladder

Switch a 14s Kling ladder to Omni and the cuts are left exactly as they are. The header states the
violation — `14s / 10s max` in destructive colour, which is the mechanism `outsideOmniWindow`
already implements.

**Which Generate this blocks, precisely: the Video Gen one.** That is the request the ladder is
illegal for and the one that bills. The Multishot Prompt node's own Generate stays enabled — writing
a plan for an out-of-window ladder costs a text generation, not a video one, and blocking it would
strand the operator with no way to see what the sequence would read like while they decide how to
fix the timings. Video Gen's button carries the reason verbatim from the node.

Silent clamping was rejected for the reason `multishot-cuts.ts` already gives about redistribution:
a control that moves numbers the operator did not touch is a surprise, and a surprise in the
control that decides what gets billed is worse than a limit you can see. Refusing the *switch*
was also rejected — it strands the operator with no way to explore what a model would allow.

The same treatment covers the cut cap: `7 cuts · Kling allows 6`. The route out is the Script's own
grouping, which is where cut membership is decided; this node cannot split.

## 5. Per-model writer prompt

Chosen over a shared prompt with a swappable block (operator's call). Each model gets its own
system prompt, routed the way `video-prompt-generate.ts` already routes:

```ts
export function multishotPromptFor(targetModel: string): MultishotPromptSpec;
```

`src/prompts/multishot-prompt-kling.ts` is written from
`ref/multishot-refs/kling-omni-api-system-prompt.md`, which already states Kling's rules in the
form this repo wants:

- `Shot N (Xs):` lines, not a timecode ladder
- framing → subject → camera → light, 1–2 sentences
- `@image_N` handles, 1-based, mentioned in **every** shot they appear in
- never describe a referenced object's own design — competing prose yields a hybrid
- the LOOK and VOICE contracts, byte-identical across generations
- two visually similar references may not share a shot without a separator clause
- never give two un-referenced characters the same broad description

Per the reusability rule, what is genuinely shared with the Omni prompt — the physics block, the
avoid-list, the "no on-screen type" rule — is exported from the canonical file and imported, not
copied.

**The plan JSON is unchanged.** `{ version, look, beats[{cutId, text}] }` is the node's data and
the merge path depends on it; only the system prompt and the renderer differ.

## 6. Rendering and reference tokens

`renderPlan(plan, cuts)` gains the capability and branches:

```
Omni    [0-2s] A hand sweeps keys off oak, the <IMAGE_REF_0> just visible.
Kling   Shot 1 (2s): A hand sweeps keys off oak, the @image_1 just visible.
```

Both are rendered from the same `beats`, with timings taken from the cuts — so the ladder and the
request's `duration` still agree by construction.

Reference tokens differ, and `prompt-token-dialect.ts` was built for exactly this. A new
`klingImageDialect(orderedIds)` stores `@image_N` (1-based) where `imageRefDialect` stores
`<IMAGE_REF_N>` (0-based). The beat editor uses whichever the node's target model calls for, so a
reference is a thumbnail chip in both.

`refsCitedIn` likewise takes the model, because it scans for that model's token shape.

**Switching model regenerates.** An existing plan's beats carry the previous model's tokens, and
translating them would be a silent rewrite of the operator's citations. The model select says so
before it switches.

## 7. Video Gen inherits the choice

Today `video-gen-focus-view.tsx` coerces `modelId` to Omni whenever a `multishot-prompt` is
connected (D232), and the picker locks to Omni.

Both become "whatever the upstream Multishot node chose", resolved with `findAncestorOfType` — the
established client-side pattern. So a Kling ladder opens its Video Gen node **already on Kling**,
rather than opening on Omni and being coerced. Same for the server: `video-generate/route.ts`
already walks to the Multishot node's data for `cuts`, and reads `targetModel` from the same place.

The `loading` gate added on 2026-09-08 stays and matters more here: until the upstream resolves the
picker shows placeholders, so the lock lands before any chips are drawn rather than after.

## 8. Error handling

- **Ladder outside the model's window** — Video Gen's Generate disabled with the reason; the
  Multishot node states it too. No request is sent. The Multishot Prompt node still generates (§4).
- **Too many cuts for the model** — same treatment. The route out is the Script's grouping.
- **Server-side backstop** — `video-generate/route.ts` re-checks the ladder against the target
  model's capability and 400s. The client gate is a courtesy; a route that trusts it is not
  enforcing anything, which is the mistake D232's own comment records having shipped once.
- **Kling rejects the payload** (`code !== 0`) — the existing Kling provider error path, unchanged.
- **A plan whose tokens are for the other model** — cannot occur through the UI, since switching
  prompts a regenerate. If it occurs, the tokens render as literal text in the prompt, which is
  visible in the Prompt tab. Not defended against beyond that.

## 9. Testing

Pure logic:

- `multishotCapabilityFor` — unknown or absent id falls back to Omni; every entry's `id` exists in
  the video-gen client model map (a capability naming a model that cannot be generated is a dead
  end, and nothing else would catch it).
- `resizeCut` / `clampTotal` against both capabilities: a 15s ladder is legal on Kling and illegal
  on Omni; the cut floor holds on both.
- `renderPlan` per model — Kling emits `Shot N (Xs):` with per-shot durations summing to the
  request duration; Omni emits cumulative `[a-bs]`. Both from the same plan.
- `klingImageDialect` — round-trips byte-exact, 1-based, and does not collide with
  `imageRefDialect`'s 0-based tokens.
- `refsCitedIn` finds `@image_1` on Kling and `<IMAGE_REF_0>` on Omni, and neither finds the other's.

Route:

- The multishot-prompt route selects the prompt spec on the node's target model and records which
  it used in `paramsUsed`.
- Generate is refused when the ladder violates the target model's capability.

Not tested: whether Kling honours `multi_shot` on O1. That is §2's assumption and it needs one real
generation to settle — see §10.

## 10. First thing to do after implementing

Generate one real Kling multishot clip and confirm it actually cuts. §2 rests on the API file over
the vendor guide, and a single-take result would mean the guide was right and the model needs to be
`/omni-video/kling-3.0-omni` instead — a provider change, not a prompt change. Cheapest possible
check, and it invalidates the largest assumption in this spec.

## 11. ADR entries to append to §7

**D235 — Multishot capability is a table, not a constant.** `OMNI_MAX_SECONDS` stops being the cut
ladder's ceiling; each multishot model declares its own window, cut floor and cut cap. *Why:* Kling
allows 15s where Omni allows 10, and caps cuts at 6 where Omni states no limit — one constant cannot
be both. *Rejected:* keeping the 10s floor for both (buys Kling nothing); a 15s ceiling with a
generate-time rejection on Omni (moves the failure past the point the prompt was written and paid
for). *Note:* `group-shots.ts` stays on Omni's 10s because fan-out runs before a model exists.

**D236 — The multishot model is chosen on the Multishot node and inherited down the lane.** Not on
Video Gen. *Why:* the cut ladder needs its ceiling while it is being built, which is upstream of
where a model is otherwise picked. Video Gen defaults to the inherited model rather than coercing
after the fact. *Refines:* D232, whose hard Omni coercion this replaces.

**D237 — Switching to a tighter model states the violation rather than clamping the ladder.** *Why:*
the same reason redistribution was rejected in `multishot-cuts.ts` — a control that silently moves
numbers the operator did not touch is a surprise, and this one decides what gets billed. *Rejected:*
refusing the switch (strands the operator with no way to see what a model would allow).
