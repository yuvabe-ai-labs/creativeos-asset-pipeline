# Pack ceiling, multishot opt-in, and the model select

*Design — 2026-09-10*

Seedance 2.5 generates up to 30s, but fan-out packing still cuts every script into
10s groups. This raises the ceiling to the widest window any model offers, stops
fan-out from deciding multishot on the operator's behalf, and repairs the model
select that has been rendering a raw model id.

Decisions: **D257**–**D260**, appended to the ADR log
(`2026-05-30-creativeos-staging-roadmap.md` §7).

---

## 1. The problem

`groupShotsForFanOut` packs to `OMNI_MAX_SECONDS = 10`
(`src/lib/nodes/group-shots.ts`). That was correct when Gemini Omni was the only
multishot model. D235 then made per-model limits a lookup (`MULTISHOT_MODELS`) but
deliberately left grouping out of it, on the reasoning that packing runs at parse
time, before a model is chosen, so Omni's 10s is "the safe floor — a group that fits
Omni also fits Kling."

Seedance 2.5 breaks the economics of that carve-out. Its 30s window means a whole
22–26s reel is one generation, and packing to 10s splits it into three that no
longer need splitting. The safe floor is now costing three generations where one
would do.

Two adjacent problems surfaced while designing the fix:

- Fan-out auto-enables multishot for any group of 2+ shots
  (`group-shots.ts:144`). With longer groups this decides more on the operator's
  behalf, in a direction that is expensive to undo — turning it back off
  disconnects downstream nodes.
- The Multishot focus view's model `Select` renders `<SelectValue />` with no
  children. Base UI's `Select.Value` falls back to the raw value, so the trigger
  reads `gemini:gemini-omni-1.1-flash` rather than `Gemini Omni 1.1`.

## 2. What is not changing

The parse prompt and schema, `generationKey`'s shape, the greedy-plus-rebalance
algorithm, and every `checkLadder` sentence.

In particular, **the Script node says nothing about models.** Capability is the
Multishot node's business, where `checkLadder` already names the model and the
limit in one sentence, shown verbatim across three surfaces so they "cannot
describe the same violation three different ways" (`multishot-models.ts:132-139`).
An earlier draft of this design put per-model band chips (`Seedance only`,
`Kling or Seedance`) on each generation; that was rejected as a second vocabulary
for limits that already have one.

## 3. Grouping is versioned, and pinned at parse

`ScriptNodeData` gains one field:

```ts
groupingVersion?: 1 | 2   // absent = 1
```

| | v1 — existing nodes | v2 — new parses |
|---|---|---|
| Pack ceiling | 10s | 30s |
| Multishot default | `shotIndexes.length > 1` | always `false` |

Both behaviours move together because they were decided together: a canvas packed
under v1 rules was also defaulted under them. Splitting the flag would let a node
sit in a state no parse ever produced.

Absence is the migration. Nothing is backfilled, no canvas reshapes under the
operator, and a re-parse adopts v2 wholesale. This mirrors `multishotCapabilityFor`,
where an absent `targetModel` "is not defensive padding — it IS the migration."

Without the pin, both changes would apply retroactively on next render:
`describeGenerations` re-derives from stored shots, so brackets would resize,
`groupModes` overrides keyed by `generationKey` would orphan, and already-seeded
nodes (matched on exact index set, `canvas-store.ts:437-450`) would stop matching —
fan-out would then offer to build the new grouping alongside the old nodes.

## 4. Limits are derived, never authored

In `src/lib/nodes/group-shots.ts`:

```ts
export const PACK_FLOOR_SECONDS   = Math.min(...MULTISHOT_MODELS.map(m => m.minTotalSeconds)); // 3
export const PACK_CEILING_SECONDS = Math.max(...MULTISHOT_MODELS.map(m => m.maxTotalSeconds)); // 30
export const LEGACY_PACK_CEILING  = 10;  // what v1 nodes were packed at
```

`OMNI_MIN_SECONDS` / `OMNI_MAX_SECONDS` are replaced. A fourth model, or a vendor
moving a limit, updates packing with no edit here — which is the D235 rule that a
limit we invented and a limit a vendor published must not be indistinguishable at
the call site.

`LEGACY_PACK_CEILING` is the one authored number, and it is deliberately not
derived: it is a historical fact about data already on disk, not a claim about any
model. Naming it after Omni would make it look like it would track Omni's window.

**This supersedes D235's carve-out.** That decision's header comment
(`multishot-models.ts:11-14`) states grouping is *not* parameterised by the
capability table, and must be rewritten rather than left to contradict the code.

### Signature changes

```ts
groupShotsForFanOut(shots, ceiling = LEGACY_PACK_CEILING): ShotGroup[]
describeGenerations(shots, overrides?, groupingVersion = 1): Generation[]
defaultMultishotFor(group: ShotGroup, groupingVersion: 1 | 2): boolean
```

`rebalanceTrailing` takes the ceiling as an argument — it currently tests against
`OMNI_MAX_SECONDS` when deciding whether a move would overflow the final group.
Its floor stays `PACK_FLOOR_SECONDS`, unchanged at 3.

`defaultMultishotFor` is extracted because the rule currently exists twice:
`describeGenerations` (`group-shots.ts:144`) and `setGenerationMode`
(`canvas-store.ts:553`), which computes `isDefault` to decide whether to store or
delete an override. Under v2 the second copy would be silently wrong — it would
store `false` as a deviation when `false` is the default, pinning a value that
"would outlive the grouping it describes."

Callers to thread the version through: `script-document.tsx:88`,
`canvas-store.ts:431`, `canvas-store.ts:547`.

## 5. `Generation` gains two derived flags

```ts
overCeiling: boolean        // seconds > PACK_CEILING_SECONDS
recommendMultishot: boolean // shotIndexes.length > 1
```

Neither is stored. `overCeiling` is reachable only via a single shot longer than
30s, which packing keeps whole rather than splitting — where to cut a long shot "is
a creative decision, not an arithmetic one" (`group-shots.test.ts:77`). It is the
one case regrouping cannot fix, which is why it earns a warning where nothing else
does.

## 6. The Script node's two additions

In `generation-bracket.tsx`, both in the existing header row
(`generation-bracket.tsx:83-108`):

**Over-ceiling warning** — `<Badge variant="destructive">` with a Lucide
`TriangleAlert`, after the `Gen n · Ns` eyebrow. Tooltip: *"34s is longer than any
model can generate. Split this shot on the script."* No model names.

**Multishot recommendation** — when `recommendMultishot && !multishot`, a quiet
`Recommended` in `text-muted-foreground` beside the switch label. It never flips
the switch.

```
🎞  GEN 2 · 22S                       Recommended  Multishot ○━
🎞  GEN 3 · 34S  ⚠ over limit                      Multishot ○━
```

Neither element is interactive, so both are plain elements plus the vendored
`Badge` and `Tooltip` — no new control, and the shadcn-primitives rule is
satisfied without one.

`script-document.tsx:143` is the only `GenerationBracket` call site, so this reaches
the Script node and its focus view from one edit.

## 7. The model select

Three fixes in `multishot-focus-view.tsx:116-131`.

**The raw id.** Pass `items` to `Select` (Base UI's `Select.Root` accepts
`Record<string, ReactNode>` and resolves `Select.Value` against it):

```tsx
<Select items={Object.fromEntries(MULTISHOT_MODELS.map(m => [m.id, m.label]))} …>
```

**The sizing.** `className="h-9 w-[168px] text-sm"` hardcodes a height
`SelectTrigger` already owns through `size` (h-8 default, h-7 sm), making this the
only select in the app at 9 units, and pins a width that clips longer names. The
override is dropped entirely: the trigger takes `SelectTrigger`'s default size and
`min-w-[168px]` in place of the fixed `w-[168px]`, so it holds its current position
in the header row but grows for a longer model name instead of clipping it.

**The content.** Each option carries a secondary line summarising its window,
derived from `MULTISHOT_MODELS` — never authored copy:

```
Gemini Omni 1.1              ✓
3–10s
Kling 3.0 Omni
3–15s · max 6 shots
Seedance 2.5
4–30s
```

Every model stays selectable. A model that cannot hold the current ladder is not
disabled: D97 makes the app reject and explain rather than prevent, and
`checkLadder` already writes that explanation. Disabling would also hide *why* a
model is unavailable at the moment the operator is choosing.

The summary is built by a `describeCapability(cap): string` helper in
`multishot-models.ts`, beside the table it reads, so a `null` (vendor states no
limit) is rendered as absence rather than as an invented number.

## 8. Testing

**Band and ceiling derivation** — `PACK_CEILING_SECONDS` / `PACK_FLOOR_SECONDS`
computed from a stub table containing a fourth model, asserting they follow the
table rather than matching today's 30/3 by coincidence.

**Ceiling parameter** — every existing `group-shots` test passes untouched, since
the default is `LEGACY_PACK_CEILING`. New cases cover packing at 30, the
`rebalanceTrailing` overflow check against the passed ceiling, and a >30s single
shot passing through whole with `overCeiling: true`.

**Version resolution** — a v1 node packs and defaults exactly as today, asserted
against the current fixtures; a v2 node packs to 30 and defaults every generation
to `multishot: false`, including a 5-shot group.

**`defaultMultishotFor`** — one test that `setGenerationMode`'s `isDefault` and
`describeGenerations`' default agree under both versions, which is the duplication
being removed.

**Select** — the trigger renders the label, not the id, for each of the three
models.

## 9. Consequences accepted

> **Superseded by D261 (2026-09-10).** After the first operator test, a new Multishot node now
> starts on the tightest model its ladder fits (`bestFitMultishotModel`), so the common path no
> longer arrives failing. The reasoning below is kept as the record of the original call.

With a 30s ceiling and `DEFAULT_MULTISHOT_MODEL` still Gemini Omni (10s), a typical
reel packs into one generation that fails `checkLadder` on the default model until
the operator switches it. This is deliberate: the alternative — defaulting to
Seedance, or picking a default per generation length — would have the app choose a
paid model on the operator's behalf. The failure sentence already names the model
and the limit, and the model select now shows every window at the point of choice.

---

## ADR entries

Recorded in full in `2026-05-30-creativeos-staging-roadmap.md` §7 — that is the one
log, and these are pointers, not copies:

- **D257** — Grouping rules are pinned per parse as `groupingVersion` *(supersedes
  part of D235)*
- **D258** — Fan-out packs to the widest window any model offers, derived
  *(supersedes D235's grouping carve-out)*
- **D259** — Fan-out never turns multishot on; it recommends *(refines D227)*
- **D260** — The multishot model select renders labels and windows, and disables
  nothing *(refines D97, D236)*
