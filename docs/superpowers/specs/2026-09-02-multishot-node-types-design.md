# Multishot becomes a node type

*Design spec — 2026-09-02. Decisions D226–D232. Supersedes D214's flag, D222's controls and D223.
Refines D216, D221. Parks D224, D225.*

Multishot is currently a **boolean on `ShotNodeData`**. One node type renders two different things
depending on that flag, one prompt branches on it, one Composer branches on it, and turning it off
performs structural surgery on the graph. This spec replaces the flag with **two new node types** —
`multishot` and `multishot-prompt` — moves the decision **into the Script**, and deletes the surgery.

The shape of the pipeline does not change. The number of nodes fan-out produces does not change.
What changes is that a generation's *mode* is now visible in the script, carried by the node's type,
and reversible by flipping one switch.

---

## 1. What is wrong with the flag

**A flag makes one component render two products.** `shot-node.tsx` shows a description textarea, a
beat-chip strip that only appears above one beat, a Compose button opening a sheet that itself
branches on the flag, and a toggle whose meaning changes with the beat count — on a single-beat node
it is a hint to the model, on a grouped node it is a destructive split. Four controls on a 224px
card, three of which are conditional.

**Turning it off was a graph rewrite.** `splitMultishotNode` replaced one node with N, re-pointed
every incoming edge N times, dropped the outgoing ones, and needed a confirm dialog to explain that
it could not be undone. `mergeShots` (D223) existed to undo it, with three refusal cases of its own.
Two structural operations, ~250 lines, and a class of edge cases — both for a decision that should
have been "which of two things does fan-out make here".

**The decision was in the wrong place.** D221 put a read-only `· Multishot · Gen 1` label on each row
of the parsed Visual script — the operator can *see* the plan there but must go to the canvas, find
the node, and use a different control to change it.

---

## 2. Two lanes that never cross

```
script ──fan-out──▶ shot ──▶ prompt ──▶ image-gen ──▶ video-prompt ──▶ video-gen  (any provider)
                 │
                 └▶ multishot ─────────────────────▶ multishot-prompt ──▶ video-gen  (Omni, coerced)

file / draw / image-gen ──▶ video-prompt, multishot-prompt
```

**Four node types, no flags anywhere.** `shot` and `multishot` are separate; `video-prompt` and
`multishot-prompt` are separate. Each pair is genuinely two products, not one product with a switch:

- A **Shot** is a continuous take with a framing. A **Multishot** is a budget of seconds divided into
  cuts — no `shot_type`, no single description, no still to compose.
- A **Video Prompt** writes one motion paragraph about one still. A **Multishot Prompt** writes one
  paragraph *per cut*, with per-cut instructions in and a per-cut breakup view out, and returns
  structured JSON rather than a string.

Every one of those differences is structural. Branching a shared component on a flag is what produced
the four conditional controls in §1, and it would produce a worse version of the same thing on a
prompt node whose entire body — input column, output column, and return type — changes with the
flag.

The consequence worth stating plainly: **the video lane loses its multishot branch entirely.**
`video-prompt` goes back to being one thing. `resolve-inputs.ts` drops `upstreamMultishot`,
`compileVideoPrompt` drops its `multishot` param, and `videoPromptGeneratePromptFor` drops its
multishot prompt. Those all move to the new lane, where they are not branches.

### The multishot lane skips the still

A Multishot node connects **only** to `multishot-prompt`. It has no path through `prompt` → `image-gen`,
and **no image target handle**, because a start frame fixes one composition and this node is a
sequence of several. Reference images reach the sequence at the prompt node, per cut (§8).

### Connections

```ts
VALID_CONNECTIONS = {
  …
  shot:               ["prompt", "video-prompt"],          // unchanged
  multishot:          ["multishot-prompt"],                // NEW
  "multishot-prompt": ["video-gen"],                       // NEW
  "video-prompt":     ["video-gen"],                       // unchanged
  text:               ["prompt", "video-prompt", "multishot-prompt"],
  file:               [… "video-prompt", "multishot-prompt", "video-gen", "shot", "post"],
  draw:               [… "video-prompt", "multishot-prompt", "video-gen", "shot", "post"],
  "image-gen":        [… "video-prompt", "multishot-prompt", "video-gen", "shot", "post"],
}
```

`file` / `draw` / `image-gen` / `text` feed `multishot-prompt` on exactly the terms they feed
`video-prompt` — the connected-references model every prompt node in this app already uses.

### Omni is coerced on connect, not filtered

Omni is the only multishot model (D217). When a `video-gen` node is connected to a
`multishot-prompt`, its `modelId` is **coerced** to the Omni model at connect time. The model chips
are not merely filtered.

Because the lanes are separate types, this is a check on the **source node's type** — no traversal,
no flag to read, no upstream to resolve. That is the practical payoff of not sharing the prompt node.

This is the followups doc's own recorded lesson: *"Filtering a picker is not enforcing a
constraint."* The D216 restriction hid every other chip but never changed the node's stored
`modelId`, and a new node defaults to Veo — so Generate would have billed a Veo run fed a ladder Veo
ignores, which is exactly what the restriction existed to prevent.

---

## 3. Data

```ts
// src/lib/canvas-nodes.ts

export type ShotNodeData = {
  script?: ReelScript;   // full parent script narrowed to the rows THIS node covers
  order?: number;
  shot_type?: string;    // SHOT_TYPES — the framing of one continuous take
  seededFrom?: { scriptNodeId; shotIndexes: number[]; scriptTitle? };
};                       // ← `multishot` DELETED

export type MultishotCut = {
  /** Stable across edit, add, delete and reorder. The prompt node keys its per-cut
   *  instruction on this, and the returned plan joins back on it. NEVER an index. */
  id: string;
  text: string;
  seconds: number;       // integer, 1..OMNI_MAX_SECONDS
};

export type MultishotNodeData = {
  /** The envelope ONLY — objective, on-screen text, voiceover, caption, execution notes.
   *  `visual_script.shots` is NOT stored here: `cuts` is the sole shot list. Two copies of
   *  the same list is exactly the drift this split exists to prevent. */
  script?: ReelScript;
  order?: number;
  /** The budget. Seeded from the group's packed seconds, clamped to Omni's 3..10 window. */
  totalSeconds?: number;
  /** INVARIANT: sum(cuts.map(c => c.seconds)) === totalSeconds. Enforced by every mutation. */
  cuts?: MultishotCut[];
  seededFrom?: { scriptNodeId; shotIndexes: number[]; scriptTitle? };
};

/** NEW type. Sibling of VideoPromptNodeData, deliberately not a superset of it. */
export type MultishotPromptNodeData = {
  title?: string;
  /** Per-cut operator steer, keyed by MultishotCut.id. References are @-mentions
   *  inside these strings (§8) — there is no separate ref field. */
  cutInstructions?: Record<string, string>;
  /** Whole-sequence steer, applied to every cut. */
  instruction?: string;
  kbSlices?: KBSliceKey[];
  /** D19: the active version's output — a MultishotPlan, not a string. */
  parsed?: unknown;
};
// No `controls`: camera move and motion energy describe ONE continuous take.
// No `targetProvider`: Omni is the only multishot model, so there is nothing to pick.

export type VideoPromptNodeData = { … };  // UNCHANGED — loses nothing, gains nothing

export type ScriptNodeData = {
  … // unchanged
  /** Per-generation mode OVERRIDES, keyed by `group.shotIndexes.join("-")`.
   *  An absent key means the default (a group of >1 row is multishot). */
  groupModes?: Record<string, boolean>;
};
```

`MultishotNodeData` has **no `shot_type`**. Framing is decided per cut by the prompt writer, which
carries the shot-size, 30-degree and screen-direction rules — the same reason `341b2f88` dropped the
per-beat camera control. A single stored framing would describe at most one cut and fight the rest.

### No migration

Existing multishot nodes are **not** converted. A saved `shot` row keeps loading as a `shot`; its
now-meaningless `multishot` field is ignored and dropped on the next write. To get the new node, flip
the generation's switch in the Script.

The feature is unreleased and its data is staging-only, so a read-time rewrite would be machinery
built for nobody.

---

## 4. The toggle lives in the Script, on a group bracket

### The list gains a bracket

D221's per-row label is replaced. Rows belonging to one generation are enclosed by a thin left rule
with a header carrying the generation's number, its total seconds, and **one** switch:

```
VISUAL SCRIPT

┃ Gen 1 · 8s                    [●──] Multishot
┃
┃  1.  Rapid close-ups. A young man picks up his keys…
┃      0-3 sec
┃  2.  CHUPPS designs and outfit transitions from jeans…
┃      3-8 sec

┃ Gen 2 · 6s                    [──○] Multishot
┃
┃  3.  Fast montage of different people walking toward…
┃      8-14 sec
```

**Why a bracket rather than a toggle per row.** A generation spans several rows, so a per-row control
reaches rows the operator did not touch. Drawing the scope makes the switch's reach a fact on screen
instead of something to be learned by surprise. The rows themselves are unchanged inside it.

### Overrides only, never the full state

`groupModes` stores **only** deviations from the default. The default is today's rule: a group of
more than one row is multishot, a lone row is not.

The key is `group.shotIndexes.join("-")`. When the script is re-parsed the group boundaries shift,
the old keys stop matching any group, and every override silently reverts to default. That is
correct, not a bug: the grouping an override described no longer exists, and carrying a stale
override onto a differently-shaped group would apply an intent to rows it was never about.

Stale keys are dropped on write rather than accumulating.

### `describeShotGrouping` becomes `describeGenerations`

```ts
export type Generation = {
  index: number;          // 0-based, display as index + 1
  shotIndexes: number[];
  seconds: number;        // packed, already clamped to the 3..10 window
  multishot: boolean;     // override if present, else shotIndexes.length > 1
  key: string;            // shotIndexes.join("-")
};

export function describeGenerations(shots: ReelShot[], overrides?: Record<string, boolean>): Generation[];
```

Still derived from `groupShotsForFanOut`, so the list continues to show exactly what fan-out will do
— the property D221 was built for.

---

## 5. Fan-out only makes what is missing

Today `fanOutShots` recreates every group on every press, duplicating the entire row of nodes.

```
for each generation:
    existing = nodes.find(n =>
        (n.type === "shot" || n.type === "multishot")
        && n.data.seededFrom?.scriptNodeId === scriptNodeId
        && sameIndexes(n.data.seededFrom?.shotIndexes, generation.shotIndexes))
    if existing:  skip
    else:         create a node of the type generation.multishot selects
```

Matching is on the **exact** `shotIndexes` array, not on overlap. A group whose boundaries moved
under a re-parse is genuinely a different generation and correctly gets a new node; the old one is
left alone for the operator to delete, because deleting a node with downstream work attached is not
a decision fan-out gets to make silently.

New nodes are positioned below the lowest existing node seeded from this script, so a second
fan-out does not stack on top of the first.

The toast reports both numbers — `2 shots added · 3 already on canvas` — and fan-out with nothing to
add says so rather than appearing to do nothing.

---

## 6. Flipping the switch swaps the node type in place

When a generation already has a node, flipping its switch **converts that node**. It keeps its `id`,
its `position` and all its **incoming** edges. **Outgoing** edges are dropped: a motion prompt
written for a cut ladder does not describe a continuous take, and vice versa.

A confirm dialog appears **only when outgoing edges exist**. Flipping a freshly fanned-out node —
the common case, and the "undo" the operator actually wants — is silent.

|          | `shot → multishot`                                                              | `multishot → shot`                                           |
| -------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| list     | each`ReelShot` → `{ id: uuid(), text: description, seconds: shotSeconds(s) }` | each cut →`{ description: text, duration_seconds: seconds }` |
| budget   | `totalSeconds` = clamp(sum, 3, 10)                                               | dropped                                                         |
| envelope | `visual_script.shots` removed, rest kept                                         | `visual_script.shots` restored from cuts                      |
| framing  | `shot_type` dropped                                                              | `shot_type` re-derived from the first cut's text              |

**The conversion is lossless in both directions**, so an accidental flip and flip-back costs the
operator nothing. That is what makes this the script-level undo, and it is why the pair is specified
as a table rather than left to each call site.

There is **no split and no merge.** The node count is identical in both modes — a generation is one
node either way — so the only thing a flip changes is which of two things that node is.

### "Off" means one continuous take covering the whole span

A Shot node made from a 3-row group holds all three rows and generates them as **one take**. This
requires a fix: `renderShotForVideo` currently reads `script.visual_script.shots[0]` and silently
drops the rest — a defect already recorded in `2026-08-29-multishot-followups.md`. It joins every
row's description into one `Action:` paragraph.

---

## 7. The Multishot node — a budget divided into cuts

**No composer, no toggle, no shot switcher.** Every control that lived on the Shot node's surface is
gone from this one. What remains is the cut list, because that is the node's entire content.

```
┌─ Multishot 2 ─────────────────────── 8s / 8s scripted ─┐
│                                                         │
│ ┌─ 1 ────────┐┌─ 2 ──────┐┌─ 3 ─────────────────┐      │
│ │ keys, tight││ cab door ││ street, walking      │      │
│ └────────────┘└──────────┘└──────────────────────┘      │
│ ┃─────●───────┃────●──────┃──────────────────────┃      │
│      2s           2s              4s                    │
│                                                         │
│                          [ + Create multishot prompt ]  │
└─────────────────────────────────────────────────────────┘
```

- **Cards are proportional** to their seconds, so a bad rhythm is visible before it is generated.
- **Text is inline-editable** with the dotted-underline hover affordance the design system specifies
  for editable text (`editable-field.tsx`), not a boxed textarea.
- **Handles sit *between* cards.** Dragging one moves seconds from one cut to its neighbour.
  `totalSeconds` never changes.
- **Delete** redistributes a cut's seconds to its neighbour; **add** takes from the largest cut.
  The budget survives both.
- Every cut stays ≥ 1s; a drag that would starve a neighbour stops at 1s rather than removing it.
- **Past 6 cuts**, a soft warning — that is where Kling caps its own Custom Multi-Shot, and it is a
  quality signal rather than a hard limit we can verify.
- The header reads `7s / 8s scripted` and tints when the budget has drifted from what the script
  scheduled. It is information, not a block.
- The footer's single action is the dashed-border primary chip the design system specifies for "add"
  actions: **Create multishot prompt**, which creates the Multishot Prompt node and connects it.

**Why a fixed budget rather than independent sliders.** Kling's Custom Multi-Shot requires per-shot
durations to sum to the clip total, and the reason applies here exactly: the Omni request's
`duration` is derived from the ladder, and a ladder longer than the duration comes back **truncated
at full price**. Under a fixed budget that failure is structurally impossible instead of validated
after the fact.

Controls are shadcn primitives (`Slider`, already vendored at `src/components/ui/slider.tsx`). This
also retires the raw `<textarea>` the followups doc flags on `shot-node.tsx`, for the multishot lane
at least.

---

## 8. The Multishot Prompt node

A new node type, sibling of Video Prompt. It takes the **connected-references** shape every prompt
node in this app uses — upstream File / Draw / Image Gen nodes are its reference library — and adds
the thing that makes it multishot: **a reference is bound per cut, not per node.**

Three columns:

```
CONNECTED          INPUT                        OUTPUT
─────────          ─────                        ──────
▢ V-Strap                                       ╔═ LOOK & ATMOSPHERE ════╗
▢ Sandal           ┌─ Sequence ─────────────┐   ║ Contemporary city, late║
▢ Script           │ punchy, everyday       │   ║ afternoon, warm low sun║
                   └────────────────────────┘   ║ 35mm handheld…      [↻]║
                                                ╚════════════════════════╝
                   ┌─ Shot 1 · keys, tight ─┐        governs every beat
                   │ open on the keys;      │
                   │ use @V-Strap ▣         │   ┌─ [0-2s] ───────────────┐
                   └────────────────────────┘   │ Tight on a hand lifting│
                                                │ keys, the CHUPPS       │
                   ┌─ Shot 2 · cab door ────┐   │ V-Straps ▣ just visible│
                   │ (blank — writer picks) │   │                    [↻] │
                   └────────────────────────┘   └────────────────────────┘
                                                ┌─ [2-4s] ───────────────┐
                                                │ …                  [↻] │
```

**Input** — the whole-sequence steer, then one card per cut showing the cut's text read-only (it
belongs to the Multishot node) plus an instruction editor.

**Output** — the **look block** first, then one card per beat: its read-only `[0-2s]` timecode, the
written beat with reference tokens rendered as inline thumbnails, and a per-beat re-run.

### The look block is written by the model, and it is its own card

The system prompt makes the writer open with a **look and atmosphere** paragraph — light direction,
time of day, lens feel, palette, grade — that governs every beat and is what makes separate cuts
read as one film. It is part of the compiled prompt, so the UI has to show it as part of the output.

It gets a **visually distinct card at the top of the output column**, not a numbered one: no
timecode, a different border treatment, and a line saying it governs every beat. Rendering it as
"beat 0" would be a lie about its scope, and folding it into the first beat's card — which is what
happens if the plan is a flat list of beats — would make the operator think a global constraint was
local to shot 1.

**This is not D222's LOOK returning.** That was an operator-authored field with a preset catalog, and
it stays deleted (§9). This is model-written output, steered by the sequence-level instruction the
node already has, and editable afterwards like any other beat. No new control, no preset list.

### References are `@`-mentions, not a second picker

A reference is bound to a cut by `@`-mentioning it **inside that cut's instruction**. Blank means
the writer chooses from the connected library — the behaviour shipped in `66eed88d`.

This is Kling's `@input` model, and it is the mechanism this repo already built:
`resolve-mention-tokens.ts`, `omniImageRefToken`, and the chip editor that renders reference tokens
as inline pictures (`999b26d2`, `4aefaba0`, `78854b22`, `cdcbaa34`). A per-cut pin row would be a
**second** binding surface beside a working one, and the operator would have to learn which wins.

### Every text box on this node is the same chip editor

**Input and output both mention images, both render them as previews, and editing keeps the
preview.** There is no box on this node where a reference degrades to raw text.

This is not new work — it is `MentionInstructionEditor` with the dialect that field stores:

| Box | Dialect | Stores |
|---|---|---|
| Sequence steer, per-cut instruction | `mentionDialect()` | `@[Label](id)` — human-authored, self-describing |
| Look block, per-beat text | `imageRefDialect(orderedIds)` | `<IMAGE_REF_N>` — Omni's own syntax, ships to the model |

`prompt-token-dialect.ts` was written for exactly this and says so in its header comment: *"Two
fields now hold references and both must edit them as atomic chips, but they store them
differently… The editor is one component, so the difference lives here rather than as a second
editor."* This node makes it `2 + 2N` fields instead of two, which is a loop, not a new mechanism.

Three properties that follow, and that the tests in §11 pin:

- **A chip survives editing.** The editor is a contenteditable chip surface, not a textarea — the
  operator never sees `<IMAGE_REF_0>` while typing around it, and a chip deletes atomically rather
  than leaving half a token behind. This is what `78854b22` established for the generated prompt.
- **A chip reads the same everywhere.** `chipLabel` resolves both dialects to the reference's own
  name (`69d828ac` reverted "REF 1" precisely for this), so the same image looks identical whether
  the operator typed it into an instruction or the model wrote it into a beat.
- **`@` autocomplete works in every box**, offering the same connected library in the same order.

`GeneratedPromptBody` stays for the read-only **Prompt** tab, which shows the whole compiled string —
look block, ladder, chips and all — as it will be sent.

### Durations are shown, never edited here

The output card's timecode is read-only and clicking it focuses the Multishot node. Durations have
exactly one home. This is what lets the LLM schema drop `seconds` altogether.

### The plan is JSON; the ladder is rendered from it

```ts
// src/lib/nodes/multishot-plan.ts
export type MultishotPlan = {
  version: 1;
  /** The look & atmosphere block. Written by the model, governs every beat, rendered
   *  ABOVE the ladder and shown as its own card. Required — a sequence without one is
   *  a set of unrelated clips, which is the failure this whole feature exists to avoid. */
  look: string;
  beats: Array<{ cutId: string; text: string }>;
};

/** `look`, a blank line, then the timecode ladder. One function, so the compiled prompt
 *  and the breakup view cannot put the look in different places. */
export function renderPlan(plan: MultishotPlan, cuts: MultishotCut[]): string;
export function parsePlan(raw: unknown, cuts: MultishotCut[]): MultishotPlan | ParseFailure;
export function refsCitedIn(text: string): number[];
```

**No `seconds` in the schema.** Code joins each beat to its cut on `cutId` and takes the seconds from
there, so the writer physically cannot break the operator's budget. `renderPlan` walks the cuts in
order, accumulating time — the same construction as today's `renderShotLadder`, which is what makes
the ladder and the request's `duration` agree by construction rather than by check.

**No `refs` in the schema either.** `refsCitedIn` derives them by scanning the beat's text for
`/<IMAGE_REF_(\d+)>/g`. This is the "break it with regex" from the brief, pointed at a
machine-emitted token where a regex is exact — not at prose, where splitting on `[0-2s]`-shaped
headings would be a drift bug waiting for its first unusual beat.

**The breakup view and the prompt actually sent cannot disagree**, because the flat ladder is
generated from the same plan the cards render. This is the whole reason for asking for JSON rather
than prose-plus-JSON: two representations that a model produces independently will eventually
diverge, and the one the operator reads is not the one that gets billed.

`parsed` on this node is **always** a `MultishotPlan`. That is a large part of why it is its own
type: a `parsed` that is a string on some nodes and a structured plan on others would have to be
narrowed at every read, and the compiler could not tell which was which.

### Editing and re-running

Editing the look block or a beat's text writes to the plan and re-renders. No LLM call, and the
reference chips stay chips throughout — the operator can retype the prose around a reference without
ever handling its token.

The per-beat **re-run** rewrites one beat and leaves the others untouched — LTX Studio's "regenerate
the shot that missed the brief without disturbing the rest of the storyboard". The request carries
the full plan as context so the rewritten beat still cuts against its neighbours.

The look block has its **own** re-run, and it is the one place a re-run is not local: rewriting the
look changes what every beat is supposed to obey. It rewrites the look **only** — the beats are left
exactly as they are, and the operator re-runs the ones that no longer fit. Silently regenerating
every beat because the look changed would throw away hand-edits the operator had already made.

### Route and prompt

A new route, `src/app/api/nodes/[id]/multishot-prompt/route.ts`, sibling of `video-prompt/route.ts`
and following the same `withClient` / `withTryCatch` / `apiOk` conventions. It asks for structured
output against the plan schema.

A new prompt file, `src/prompts/multishot-prompt-generate.ts`. It is a single prompt with no provider
routing — Omni is the only target — and it carries the vendor's documented ladder guidance plus the
plan schema. Per the reusability rule, whatever it shares verbatim with
`video-prompt-generate.ts` (the avoid-list, the reference-identification block) is exported from the
canonical file and imported here rather than copied.

`video-prompt/route.ts` correspondingly **loses** its `upstreamMultishot` branch and its Omni
coercion, and `video-prompt-generate.ts` loses its `multishot` routing key.

---

## 9. Deleted

**The shot lane:**

- `src/lib/nodes/split-multishot.ts` and `merge-shots.ts`, with their tests — no split, no merge, because the node count is the same in both modes
- `splitMultishotNode` and `mergeSelectedShots` in `canvas-store.ts`, with their tests
- `multishot-toggle.tsx` and its confirm dialog — the switch is in the Script now
- The merge action in `node-context-menu.tsx`
- `ShotNodeData.multishot` — replaced by the node's type
- The beat-chip strip in `shot-node.tsx` — a Shot node has one take
- `groupShotsForFanOut`'s `clamped` / `overCap` — computed and never read (recorded in the followups doc); the Multishot node shows its own budget now

**The video-prompt lane, which goes back to being one thing:**

- `resolve-inputs.ts`'s `upstreamMultishot`, and the multishot branch of `mapUpstreamForVideo`
- `compileVideoPrompt`'s `multishot` param, and `videoPromptGeneratePromptFor`'s `multishot` routing key
- `video-prompt/route.ts`'s Omni coercion — coercion now happens on the `multishot-prompt → video-gen` connection
- `renderMultishotBrief` and `renderShotLadder` — replaced by `renderPlan`, which walks cuts rather than `visual_script.shots`
- `VideoControls.look`, `.voice`, `LOOK_PRESETS`, `VOICE_PRESETS`, `ContractField` — D222/D225, deferred until the flow is settled. **The operator-authored control goes; the look itself does not** — the model now writes it into the plan and the breakup view shows it (§8). What is deleted is the field, the preset catalog and the verbatim-reproduction machinery, not the concept

**Flagged:**

- `sequence-roles.ts` with its tests, and the Composer's multishot branch — see below

### `sequence-roles.ts` — flagged for review

D224's SEQUENCE_ROLES catalog exists only to serve the **multishot branch of the Shot Composer**,
and the Multishot node has no Composer. Its consumers — `shot-compose-sheet.tsx`, `shot-compose.ts`,
`compose/route.ts` — all lose their multishot path with it.

**It is deleted here by default**, with the rest of D222's authoring surface, on the same reasoning:
the multishot flow is being rebuilt and its controls should return only once the flow they serve is
settled. But it is 134 lines of documented cutting patterns (Rosenblum's five-shot method, the
30-degree rule per pattern, the graphic-match chain) that were researched rather than invented, and
it is the one deletion in this list that destroys work rather than machinery.

**Reverse this line if the catalog should be parked instead.** It recovers from git either way; the
question is only whether it stays in the tree.

The Composer itself is **untouched for single Shot nodes** — `SHOT_ROLES` and the whole single-shot
compose path stay exactly as they are.

---

## 10. Error handling

**The returned plan** — rejected whole, never partially applied. A half-applied plan leaves the node
in a state neither the model nor the operator authored:

- **An unknown `cutId`** — reject, surface *"the writer referenced a shot that isn't in this node"*, keep the previous version.
- **A missing cut** — same. A ladder with a hole generates a gap at full price.
- **A missing or empty `look`** — same. The look is what makes the cuts one film; a sequence without it is a set of unrelated clips.
- **Beats out of cut order** — not an error. Reordered to cut order, because cut order is the edit and beat order in the JSON is an artifact.

**The compiled prompt:**

- **`<IMAGE_REF_N>` cites an index with no connected image** — rendered as a broken chip showing the index; the prompt still compiles. A dangling token is visible, a silently dropped one is not.

**The node surface:**

- **A cut drag would take a neighbour below 1s** — stops at 1s. Cuts are never deleted by dragging.
- **`sum(cuts.seconds) !== totalSeconds` on load** — cannot happen; every mutation preserves it. Assert in dev, do not write repair code for it.

**The graph:**

- **Flipping a generation with outgoing edges** — confirm, naming what disconnects. Without them, silent.
- **Fan-out with every generation already present** — the toast says so rather than appearing to do nothing.
- **A re-parse orphans a `groupModes` key** — dropped on next write; that generation returns to default.

---

## 11. Testing

**Pure, unit-tested:**

- `describeGenerations` — default modes match `groupShotsForFanOut`; an override flips exactly one
  generation; a stale key affects nothing; an empty script yields no generations.
- `shotDataToMultishot` / `multishotDataToShot` — **round-trips**: text, seconds and the envelope
  survive both directions; the budget equals the sum; `shot_type` is re-derived, not carried.
- The budget invariant — drag redistributes without changing the total; delete redistributes; add
  takes from the largest; every path leaves `sum === totalSeconds` and every cut ≥ 1s.
- `parsePlan` — the rejection cases in §10; beats reordered to cut order; a valid plan round-trips;
  a plan with a missing or empty `look` is rejected.
- `renderPlan` — the look block comes first and is separated from the ladder; cumulative timecodes;
  the ladder's last timestamp equals `totalSeconds` (the property that keeps the request's duration
  honest); a beat's text is never merged into the look or vice versa.
- `refsCitedIn` — finds every token, deduplicates, ignores malformed ones, returns them in order.
- **The chip editor, per box** (extending `mention-instruction-editor.test.tsx`) — a per-cut
  instruction round-trips `@[Label](id)`; a beat round-trips `<IMAGE_REF_N>`; editing text either
  side of a chip leaves the chip intact; deleting a chip removes the whole token, never half of it;
  and both dialects render the same reference under the same name.
- `renderShotForVideo` — a multi-row Shot node joins **every** row, not just the first.

**The lane separation** (`canvas-nodes.test.ts`) — this is the enforcement, so it is tested as such:

- `multishot → multishot-prompt` and `multishot-prompt → video-gen` connect; `multishot → video-prompt`, `multishot → prompt` and `shot → multishot-prompt` **do not**.
- Connecting `video-gen` to a `multishot-prompt` coerces its `modelId` to Omni — asserted on the
  node's stored value, not on which chips render. That distinction is the whole D216 lesson.

**Store-level:**

- `fanOutShots` — a second call with no changes creates nothing; a new generation creates only that
  one; changed boundaries create a new node and leave the old one alone.
- `setGenerationMode` — swaps type in place preserving id, position and incoming edges; drops
  outgoing; is a no-op when no node exists yet.

No migration tests — nothing is migrated (§3).

**Not coverable by test, needs a browser and human eyes** — carried forward from the followups doc,
still open and now load-bearing for this design:

1. **Does Omni actually cut by default?** The entire multishot design rests on Google's documented
   *"By default Omni Flash will try to create a video with a few different shots"* and no generation
   has demonstrated it. Every live run so far was 3 seconds — too short to show a cut.
2. **Do the image role tags work?** `<FIRST_FRAME>`, `<LAST_FRAME>`, `<IMAGE_REF_N>` are generated
   correctly and schema-verified, but no run with real images has confirmed the model honours them.

Neither blocks building this. Both block trusting it.

---

## 12. ADR entries to append to §7

- **D226** — Multishot is a node type, not a flag — and so is its prompt
- **D227** — The mode switch lives on a generation bracket in the Script
- **D228** — Fan-out is incremental, matched on exact `shotIndexes`
- **D229** — Flipping the mode swaps the node type in place; there is no split and no merge
- **D230** — A Multishot node is a fixed budget divided into cuts
- **D231** — The multishot prompt returns JSON — a model-written look block plus beats keyed by `cutId` — and the compiled prompt is rendered from it
- **D232** — Per-cut references are `@`-mentions, not a second picker

Each supersedes or refines: D226 supersedes the flag half of D214 and D216; D227 supersedes D221;
D229 supersedes D223; D230 and D231 supersede D222's controls and brief. D224 (sequence roles) and
D225 (the VOICE contract) are **parked, not superseded** — nothing here replaces what they decided,
and both are candidates to return once the flow they serve is settled.

---

## 13. Phasing

The work splits at the node boundary, and each phase is reviewable on its own:

**Phase 1 — the shot lane.** §3 data, §4 the bracket toggle, §5 incremental fan-out, §6
the type swap, §7 the Multishot node, and the shot-lane half of §9.

**Phase 2 — the prompt lane.** §8 in full: the new node type, its route and prompt file, the JSON
plan, `renderPlan`, per-beat re-run — and the video-prompt-lane half of §9, which is where
`video-prompt` sheds its multishot branch.

**They ship together.** Unlike the earlier single-prompt-node draft, phase 1 is *not* independently
shippable: a Multishot node's only downstream consumer is the node built in phase 2, so between the
phases it is a dead end on the canvas. Both land on one branch before merge. Splitting them is for
reviewability, not for release.

The `sequence-roles.ts` deletion belongs to phase 1 — it goes with the Composer's multishot branch,
which is also the last convenient moment to reverse that call.

---

## 14. What this does not change

The Script node's parse (still v2 — one entry per timecoded block, per the D219/D220 revert),
`groupShotsForFanOut`'s packing arithmetic, the Shot Composer for single shots, `SHOT_ROLES`,
`renderShotForImage`, the Video Gen node, the generation tray, versioning, approvals, and every
non-video node type.
