# Parse the script as written — scenes, seconds and voiceover

**Status:** approved in brainstorm 2026-09-23 · **ADR:** D276 (to be appended on implementation)

## 1. Problem

Four separate things bend the operator's script toward the tools instead of reporting it.

**Packing.** `groupShotsForFanOut` packs consecutive shots greedily into generations up to
`PACK_CEILING_SECONDS` — 30s, the widest window any multishot model publishes (D258) — then
rebalances the tail. `CLIP` headings (D273) exist only as a manual override to fight that packing.
A 35-second, six-scene script therefore arrives as generations shaped by Seedance's window rather
than by its six scenes. The operator's words: "no need to do seedance specific parsing when more
than 15s like that, just parse. If they want to do 30s continuous take it will be in script, they
will mention it."

**Duration edits do nothing.** The Script document's shot row edits `duration` — the free-text
timing string ("0-10 sec") — while `shotSeconds`, grouping, `deriveShotDuration`, `cutsFromShots`
and the video request all read `duration_seconds`. Nothing in the UI writes `duration_seconds`, so
editing a timing changes a label and no behaviour.

**Seconds are shown where they cannot be acted on.** A single-take generation displays
`Gen 1 · 10s` and a `0–10 SEC` row, neither of which the operator can tune there. Multishot is off
by default (D259), so this is the common case.

**Voiceover reads as metadata.** The line renders as small grey text under the description —
"it does not feel like vo".

Separately, the parser does not know the vocabulary the operator's own creators use: their scripts
write `Scene 3 — How to Use | 10–18 sec` and `VO + Text Overlay:`, not `CLIP` and `Creator:`.

## 2. Decisions (from the brainstorm)

1. **One scene = one generation.** No packing, no ceiling, no rebalance, no clip boundary. A
   montage written inside one scene stays one scene — splitting it is the parser guessing.
2. **A scene too long for a model is stated, never split** (D97: the app rejects and explains
   rather than prevents).
3. **With multishot off, no seconds are shown in the Script node** — not on the bracket, not on the
   shot row. Turning it on brings them back, because then seconds are per-cut and tunable.
4. **A shown duration edits the real length** (`duration_seconds`); the timing text becomes display
   only.
5. **"Scene" is a parsing synonym, not a UI rename.** The app keeps saying Shot and Gen.
6. **`clip` stays in the schema** but stops affecting anything — removing it would mean rewriting
   the help chapter that teaches CLIP headings.
7. **Text overlays are not carried into any prompt.** `VO + Text Overlay:` means those words are
   SPOKEN; they are the scene's voiceover, not on-screen copy.
8. **Old canvases keep their shape.** This is grouping v3; nothing is backfilled.

## 3. Design

### 3.1 Parse (`src/prompts/script-parse.ts` → v9)

The system prompt's `visual_script` rules gain the operator's vocabulary and the one-row-per-scene
rule:

- A scene heading is any of `Scene N`, `Shot N`, `CLIP N`, or a bare timecode line, with or without
  a title and a `|` separator: `Scene 3 — How to Use | 10–18 sec`.
- **Each scene heading produces exactly ONE shot row.** A scene whose visual lists several beats
  ("one tablespoon added → mixing → roti cooking") stays one row; its description keeps the prose.
- `duration_seconds` is that scene's own length from its timecode range (`10–18 sec` → 8).
- The spoken line comes from `VO`, `VO + Text Overlay`, `Voiceover`, `Creator`, `Narrator` or an
  equivalent label, into `voiceover: VoLine[]` (D267, unchanged shape).
- `on_screen_text` keeps the script's overlay copy where a script states it separately, but a
  `VO + Text Overlay` block is the SPOKEN line and is not duplicated there.
- `clip` continues to be read; nothing consumes it.

### 3.2 Grouping (`src/lib/nodes/group-shots.ts`) — v3

`GroupingVersion` gains `3`, and `CURRENT_GROUPING_VERSION` becomes `3`.

- `groupShotsForFanOut(shots, version)` returns **one group per shot** under v3: `[{ shotIndexes:
  [i], seconds }]`. The greedy pass, `rebalanceTrailing` and the clip-run split apply to v1/v2
  only, so canvases parsed under them keep their exact shape.
- `defaultMultishotFor` stays `false` for v2 and v3.
- `describeGenerations` keeps `overCeiling` (a scene longer than any model's window is worth
  saying) and sets `recommendMultishot` false under v3 — with one scene per generation there is
  nothing to recommend.

`PACK_CEILING_SECONDS` survives as the number the over-window message quotes, not as a packing
input.

### 3.3 Seconds in the Script node

`GenerationBracket` and the shot row take the generation's `multishot` flag as the condition:

| Multishot | Bracket | Shot row |
|---|---|---|
| off | `Gen 1` | description and voiceover only |
| on | `Gen 1 · 10s` | description, voiceover, and the length control |

The `over limit` badge is independent of the toggle — it reports a fact about the scene either way.

### 3.4 The length control

When shown, it edits **seconds**, writing `duration_seconds` on that shot row. The parsed `duration`
string is display only from here on, so the two can no longer disagree; a row with no
`duration_seconds` shows the assumed length (`ASSUMED_SHOT_SECONDS`) marked as assumed, as it does
today.

`deriveShotDuration` drops its clamp to Omni's 3–10s window: it returns the scene's own length, and
the model's own check reports a length that model cannot take.

### 3.5 Voiceover presentation (`vo-lines-editor.tsx`)

The line renders at the shot text's own size, in quotation marks, with the speaker as a tracked
small-caps chip beside it, so a scene reads as speech rather than as a field:

```
VOICEOVER
narrator · "One small addition fits right into the breakfast we already make."
```

Still `EditableField` for both parts, still the dashed Add-line chip, still the hover-only remove
control — the change is typography and the quotation marks, not new machinery. The quotes are
display only: they are never stored in `VoLine.text` and never reach `renderVoiceover`, which adds
its own.

## 4. Data flow

```
script text
  → parse v9      one shot row per scene, its own seconds, its own VoLine[]
  → grouping v3   one generation per shot row
  → Script node   seconds shown only when that generation is multishot
  → fan-out       Shot node (single take) or Multishot node (cuts), unchanged
```

## 5. Errors and states

| Situation | Behaviour |
|---|---|
| A scene longer than every model's window | `over limit` badge on the bracket, naming the length and the 30s maximum. Never split. |
| A scene with no parsable length | Counted as `ASSUMED_SHOT_SECONDS`, shown as assumed (unchanged). |
| A canvas parsed under v1/v2 | Keeps its packed generations and its recommendations until re-parsed. |
| A script with no VO at all | Every shot's `voiceover` is `[]`; the lane shows only the Add-line chip. |
| `VO + Text Overlay` block | Becomes the spoken line; not duplicated into `on_screen_text`. |

## 6. Testing

- **`script-parse-schema`**: v9; the system prompt names Scene/Shot/CLIP headings, the
  one-row-per-scene rule, and the `VO + Text Overlay` label.
- **`group-shots`**: under v3, six scenes of 5/5/8/7/6/4 produce six generations in that order;
  `rebalanceTrailing` and the clip split are not applied; v1 and v2 fixtures produce exactly what
  they produce today (regression); `recommendMultishot` is false under v3;
  `overCeiling` still fires for a 35s scene.
- **`derive-shot-duration`**: a 14s scene derives 14, not 10.
- **Duration edit**: committing a length writes `duration_seconds` and the generation's seconds
  change with it.
- **`script-document` / `generation-bracket`**: no seconds rendered when multishot is off; both
  rendered when on; the over-limit badge renders in both.

## 7. Out of scope

- Renaming Shot → Scene in the UI.
- Removing the `clip` field or the CLIP-heading help chapter.
- On-screen text in prompts.
- The single-take voiceover lane (still deferred from D267's item 5).
