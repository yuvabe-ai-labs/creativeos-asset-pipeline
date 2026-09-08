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

## 2. The model is Kling 3.0 Omni, and we now have its real contract

`ref/multishot-refs/kling-omni-docs.md` was updated on 2026-09-09 with the vendor's own API
reference, which settles what third-party sources could not.

```
POST https://api-singapore.klingai.com/omni-video/kling-3.0-omni
{ contents: [...], settings: {...}, options: {...} }
```

**The envelope is exactly the one `providers/kling.ts` already sends.** `buildContents` — which
emits `{type:"prompt"|"first_frame"|"last_frame"|"refer_image", url, id}` — is reusable as written.
This is a new model entry (`kling:kling-3-0-omni`) on an existing provider, not new transport.

Every third-party source was wrong, and predictably so: they documented their own wrapper APIs
(`multi_prompt`, `multi_shots`, `image_urls`) rather than Kling's native shape. None of those field
names appear in the vendor reference.

The earlier draft of this spec targeted `/omni-video/kling-o1` with `multi_shot: true`, on the
strength of `kling-omni-api-system-prompt.md`. **That was wrong.** The vendor guide is right that O1
has no multi-shot; 3.0 Omni is the flagship and the only correct target. The O1 file describes a
different endpoint's contract and is left alone.

### The constraints that bind

| | Value | Source |
|---|---|---|
| `settings.duration` | integer, 3–15 | enum in the reference |
| `settings.multi_shot` | boolean, **defaults to `true`** | must be sent explicitly either way |
| `settings.audio` | `native` \| `original` \| `off` | `original` needs a reference video |
| `settings.resolution` | `720p` \| `1080p` \| `4k` | 4k is new — Kling O1 has no 4k |
| `settings.aspect_ratio` | `16:9` \| `9:16` \| `1:1` | |
| Shots | **1–6**, each ≥1s, summing to `duration` exactly | |
| Per-shot text | ≤512 characters | |
| Whole prompt | ≤3072, recommended ≤2500 | |
| `refer_image` | ≤7 with no reference video | matches the repo's existing D100 cap |

`multi_shot` defaulting to `true` is worth flagging: a single-shot Kling request that omits it
silently gets cuts. The existing provider already sends it explicitly, which is the right habit and
stays.

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
  /** Per-beat and whole-prompt character ceilings. `null` = none stated. */
  maxCutChars: number | null;
  maxPromptChars: number | null;
};

export const MULTISHOT_MODELS: MultishotCapability[] = [
  { id: GEMINI_OMNI_MODEL_ID, label: "Gemini Omni 1.1",
    minTotalSeconds: 3, maxTotalSeconds: 10, minCutSeconds: 1, maxCuts: null,
    maxCutChars: null, maxPromptChars: null },
  { id: "kling:kling-3-0-omni", label: "Kling 3.0 Omni",
    minTotalSeconds: 3, maxTotalSeconds: 15, minCutSeconds: 1, maxCuts: 6,
    maxCutChars: 512, maxPromptChars: 3072 },
];

export const DEFAULT_MULTISHOT_MODEL = GEMINI_OMNI_MODEL_ID;
export function multishotCapabilityFor(targetModel: string | undefined): MultishotCapability;
```

| | Omni | Kling 3.0 Omni |
|---|---|---|
| Total | 3–10s | 3–15s |
| Per cut | ≥1s | ≥1s |
| Cuts per generation | no stated limit | **6, hard** |
| Per-beat characters | none stated | **512** |
| Whole prompt | none stated | **3072** |

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

`src/prompts/multishot-prompt-kling.ts` draws its craft rules from
`ref/multishot-refs/kling-omni-api-system-prompt.md` and the CHUPPS reference — but **not their
output format**, which is the console's. The writer still returns the same JSON plan; the shot
triples are `renderPlan`'s job, not the model's.

Rules worth carrying over, all of them Kling-specific:

- `@image_N` handles, 1-based, mentioned in **every** shot they appear in
- never describe a referenced object's own design — competing prose yields a hybrid
- two visually similar references may not share a shot without an explicit separator clause
- never give two un-referenced characters the same broad description; the model merges them
- reference subjects must occupy >5% of frame, unoccluded
- **keep each beat under 512 characters** — the API's own ceiling, so the writer is told the budget
  rather than having its prose truncated after the fact
- element names must not be substrings of one another, nor collide with words in the prompt (the
  reference's own example: do not name an element `@gmail` in a prompt containing an email address)

The LOOK and VOICE contracts stay, reproduced verbatim — but as leading prose, per §6.

Per the reusability rule, what is genuinely shared with the Omni prompt — the physics block, the
avoid-list, the "no on-screen type" rule — is exported from the canonical file and imported, not
copied.

**The plan JSON is unchanged.** `{ version, look, beats[{cutId, text}] }` is the node's data and
the merge path depends on it; only the system prompt and the renderer differ.

## 6. Rendering and reference tokens

`renderPlan(plan, cuts)` gains the capability and branches. **Kling's API format is not the one the
console uses**, and this is the single most correctable mistake in this work:

```
Omni     [0-2s] A hand sweeps keys off oak, the <IMAGE_REF_0> just visible.
         [2-5s] A cab door swings open onto sunlit paving.

Kling    shot 1, 2, A hand sweeps keys off oak, the @image_1 just visible;
         shot 2, 3, A cab door swings open onto sunlit paving;
```

Lowercase `shot`, comma-separated triple of *number, seconds, text*, semicolon between shots. The
`Shot 1 (2s):` form in `kling-omni-system-prompt.md` and the CHUPPS reference is the **console's**
syntax, written for the web app — those files are prompt-craft references, not the API contract,
and following them here would send prose the API does not parse as shots.

Two consequences the renderer must honour:

- **Durations come from the cuts and must sum to `settings.duration` exactly.** Same construction
  as Omni's cumulative ladder, so the prompt and the request agree by construction rather than by
  check.
- **A beat's text cannot exceed 512 characters, and the whole prompt 3072.** The writer prompt
  states both; `renderPlan` is where a violation becomes visible, so it returns them as a
  validation failure rather than sending an over-long prompt to be truncated server-side.

### Where the LOOK block goes — the one open question

Omni's plan opens with a look paragraph above the ladder. Kling's format has no slot for it: the
prompt is shot triples, and repeating a ~300-character look inside every beat would consume most of
the 512-character budget six times over.

**Decision: the look is emitted as leading prose before `shot 1,`.** The reference says the prompt
"can be templated" and does not forbid leading text, and this keeps one plan shape across models.

This is the assumption most likely to be wrong, and §10 tests it first.

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
- `renderPlan` per model — Kling emits lowercase `shot n, m, words;` triples whose durations sum to
  the request duration; Omni emits cumulative `[a-bs]`. Both from the same plan. Also: a beat over
  512 characters, or a prompt over 3072, is returned as a validation failure rather than truncated.
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

Generate one real Kling clip and read the returned video against three things, in this order —
each is an assumption this spec makes that the reference does not settle:

1. **Does it cut where the triples say?** The `shot n, m, words;` format is quoted verbatim from
   the reference, so this should hold. If the clip is a single take, `multi_shot` was not sent or
   the triples did not parse — check the compiled prompt in the Sent-to-model tab first.
2. **Did the leading LOOK prose survive?** §6's one genuine guess. If the look is ignored, or worse
   if it is read as part of shot 1, the fix is to fold a compressed look into each beat's 512
   characters and drop the leading block.
3. **Do the `@image_N` handles bind?** They must match `contents[].id`, which `buildContents`
   already emits 1-based.

Cheap, and it settles everything the docs left open. Write the result up as
`2026-09-XX-kling-omni-api-findings.md` beside the Gemini Omni one, whichever way it goes — a
confirmation is worth as much as a correction to whoever reads this next.

## 11. ADR entries to append to §7

**D235 — Multishot capability is a table, not a constant.** `OMNI_MAX_SECONDS` stops being the cut
ladder's ceiling; each multishot model declares its own window, cut floor and cut cap. *Why:* Kling 3.0 Omni
allows 15s where Omni allows 10, caps cuts at 6 where Omni states no limit, and caps a beat at 512
characters where Omni states nothing — one constant cannot be all of that. *Rejected:* keeping the 10s floor for both (buys Kling nothing); a 15s ceiling with a
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

**D238 — Kling renders as API shot triples, never the console syntax.** `renderPlan` emits
`shot n, m, words;` for Kling, not the `Shot N (Xs):` form used in
`kling-omni-system-prompt.md` and the CHUPPS reference. *Why:* those files are prompt-craft
references written for the web console; the API parses shots only from the comma/semicolon triple
form given in the vendor reference. Following the console files would have sent prose the API reads
as one shot — a wrong-but-accepted payload, which is the failure mode that does not announce
itself. *Consequence:* the writer keeps returning plan JSON and never formats shots itself.
