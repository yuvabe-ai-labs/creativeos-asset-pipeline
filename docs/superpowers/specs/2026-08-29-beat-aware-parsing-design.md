# Beat-aware parsing and grouping

> **⚠️ §2 and §3 were built and then REVERTED** (implemented `0c64425`, reverted `7a4dfcf`). The
> parse stays at v2 — one entry per timecoded block — because that is what the operator wants to
> read, and the finer split changed no generation boundary on the script that motivated it. **§4
> shipped and stands**: every row of the Visual script list carries a Multishot / Single note.
>
> Kept as a record because the finding in §1 is real and the work is recoverable from `0c64425`.
> Read §7 first if you are thinking of reviving it — the split's quality was never verified against
> the live model, which is the thing that would decide whether it is worth having.

*Design spec — 2026-08-29. Decisions D219–D221 (D219/D220 reverted). Refines D214.*

Corrects a defect found by running a real client script through the shipped parse: the parse
treats a timecoded **block** as a shot, when a block is a **beat** containing several shots. The
CHUPPS 20s script parses to 5 entries; it contains 18 camera setups.

---

## 1. The defect

`script-parse`'s instruction reads *"split the shot list into individual shots"*. The script's shot
list **is** its timecoded blocks, so the model splits at block level and stops. What comes back is:

> 1. "Rapid close-ups. A young man picks up his keys. A woman steps out of a cab. Someone grabs a
>    coffee. Close-up of CHUPPS hitting the street." — `0-3 sec`

That is **four** camera setups in one entry. Every downstream consumer then treats it as one shot:
grouping packs blocks rather than shots, and the motion prompt writes one ladder beat for what
should be four.

Both reference decompositions of this script agree on the real shape —
`ref/multishot-refs/chupps-20s-gemini-omni-prompts.md` (Omni) and `chupps-20s-omni-prompts.md`
(Kling) — and the Omni one is what this pipeline targets:

| Gen | Script beats | Shots | Length |
|---|---|---|---|
| A | 0:00–0:08 Hook + Different lives | 8 | 8s |
| B | 0:08–0:14 Product + style | 6 | 8s |
| C | 0:14–0:20 Brand moment + close | 5 | 8s |

Its ladder runs `[0-1s] [1-2s] [2-3s]` — one shot per second, the format `renderShotLadder`
already emits.

---

## 2. The parse splits blocks into shots — version 3

A shot is **one camera setup**. Each gains two fields:

```ts
export type ReelShot = {
  description?: string;
  duration?: string;          // the parent BEAT's timing as written — "0-3 sec"
  duration_seconds?: number;  // THIS shot's length, integer ≥ 1
  beat_index?: number;        // 0-based index of the timecoded block it came from
  beat_label?: string;        // that block's heading — "0-3 SEC — THE HOOK"
};
```

The instruction gains what it was missing: **a timecoded block is a BEAT, and a beat usually
contains several shots.** Every distinct camera setup — a new subject, angle or location — is its
own entry, and consecutive entries from one block share a `beat_index`.

### Shot lengths need not sum to the beat's scripted length

Four shots in a 3s hook are 1s each — 4s generated for a 3s slot. That is correct, and both
reference plans do it deliberately: the generation runs slightly long and the edit trims a shot
carrying no voiceover. `duration_seconds` is therefore an integer **≥ 1**, never a fraction, and
the beat's own scripted timing stays in `duration` for display.

### Back-compatibility

Scripts parsed under v2 have no `beat_index`. Grouping treats a shot with no `beat_index` as its
own beat, so those scripts group exactly as they do today. Re-parsing with the Script node's
existing **Re-extract** button is what upgrades them; nothing migrates silently.

---

## 3. Grouping packs whole beats

`groupShotsForFanOut` becomes beat-aware:

1. Partition the shots by `beat_index` (a missing index makes that shot its own beat).
2. Fill a group with as many **consecutive whole beats** as fit under the 10s ceiling.
3. Split a beat **only** when that beat alone exceeds the ceiling — then pack greedily inside it.
4. The existing floor, trailing-rebalance and clamp rules still apply to whatever results.

**Why whole beats.** A beat boundary is a cut the script already asked for. Every generation seam
is an un-guaranteed transition — the one place two clips must join without the model having seen
both — so seams belong where a cut was wanted anyway. Packing shot-by-shot across a seam puts a
transition in the middle of a beat the script wrote as continuous.

On CHUPPS this yields the reference's three generations: `Hook+Lives` 8s, `Product` 6s,
`Brand+Close` 6s.

---

## 4. A label on every parsed shot

In the Script focus view's **Visual script** list (`script-document.tsx`), each shot row shows a
small label beside its duration saying whether it will be generated as part of a multishot group,
and which:

```
1.  Rapid close-ups. A young man picks up his keys…
    0-3 sec   ·   Multishot · Gen 1
```

It is computed with the **same** `groupShotsForFanOut` the fan-out uses, so what the list says is
what fan-out will do. A shot in a single-shot group reads `Single`.

The label is read-only text, not a control — it reflects the grouping rather than setting it. The
toggle that changes grouping lives on the Shot node after fan-out, where it already is.

---

## 5. What this does not change

The Shot node, the multishot toggle, the split action, `renderShotLadder`, the Omni-only model
filter and the provider are all untouched. A Shot node simply holds 8 beats where it held 2. No
node type changes, no new plan object, no new traversal.

---

## 6. Testing

- `script-parse` schema: `beat_index` and `beat_label` present and required; version 3; the
  instruction states that a block is a beat containing several shots.
- `groupShotsForFanOut` — **the CHUPPS fixture becomes beat-shaped**: 18 shots across 5 beats with
  lengths summing 4/5/6/4/2 must produce three groups — beats 0–1, beat 2, beats 3–4 — never
  splitting a beat. Plus: a beat longer than 10s splits internally; a shot with no `beat_index` is
  its own beat; the existing floor/rebalance/clamp cases still hold.
- `describeShotGrouping` (the label's source) — a shot in a multi-shot group reads its group
  number; a lone shot reads `Single`; an empty script yields no labels.

---

## 7. Risk

**The parse's split quality is now load-bearing and unverified.** Whether the model reliably finds
four camera setups in "Rapid close-ups. A young man picks up his keys…" is an empirical question no
test can answer — the schema can be right while the split is wrong. Run the CHUPPS script through
Re-extract and count: 18 shots across 5 beats. If it under-splits, the instruction needs a worked
example rather than a rule.
