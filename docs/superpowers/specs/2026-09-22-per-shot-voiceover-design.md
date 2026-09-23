# Per-shot voiceover — design

**Status: SUPERSEDED (2026-09-22) by `2026-09-16-script-voiceover-in-generation-design.md` (D267,
D268).** That design was written a week earlier on `feat/character-node` and this brainstorm did not
know it existed. It solves the same problem better in two ways, so it governs:

1. **A shot carries `VoLine[]`, not a string** — several lines, each with `speaker`, `delivery` and
   `language`, which is what Kling's `<speaker> says <delivery>` and Seedance's `{language, …}`
   syntaxes need.
2. **The writer never writes the lines at all.** This design had it place them verbatim; that one
   appends the exact words in code at render time, per model dialect, read from the cuts. A model
   that cannot place a line cannot place it wrong — the same move as D207 and D273.

It also KEEPS the reel-level `voiceover` field that this design deleted, and checks the mapped
lines against it (`voiceoverMappingIssue`), turning the duplication into a checked invariant.

Its item 1 (types, parse schema and rules, integrity check) is ported to this branch; items 2–5
are unbuilt everywhere. The problem statement below still stands and is why the work was picked up.

**Original status:** approved in brainstorm 2026-09-22 · **ADR:** D275 (never appended)

## Problem

A reel script binds each spoken line to the clip it is spoken over:

```
CLIP 1 (0–6 SEC)
Visual: … She casually reaches to the kitchen shelf, takes the Jackfruit365 pack …
Creator: "This has actually just become part of my regular cooking now."
```

The parser destroys that binding. `reelSchema` (`src/prompts/script-parse.ts`) stores shots as
`{ description, duration, duration_seconds, clip }` — no line — and concatenates every clip's
`Creator:` line into one reel-level `voiceover` string. `MultishotCut` carries
`{ id, text, seconds }`, so there is nowhere downstream to put a line either.

`buildMultishotUserTurn` (`src/lib/nodes/resolve-inputs.ts`) therefore sends a Multishot node's
shots together with the WHOLE reel's voiceover and this instruction:

> every line must appear exactly once

On a node holding CLIP 1 — one shot, 6 seconds — that is unsatisfiable: six lines, roughly 40
seconds of speech, one beat. The writer resolved it by picking one line and silently dropping five.
Observed twice on the same node: once it chose line 1, once line 6 ("And there are so many similar
stories on Amazon. Read the reviews for yourself — link in bio."), which is CLIP 6's CTA landing in
CLIP 1's kitchen beat. It also traded away the shot's own action — "reaches to the shelf, takes the
pack, places it beside the batter" became "remains at the counter with the pack visible" — because
a 6-second beat cannot hold both that action and a long CTA. That breaks
`MULTISHOT_SHOT_TEXT_CONTRACT`, which should have won.

The information needed to get this right existed in the script and was discarded two steps before
the writer saw it.

## Decisions (from the brainstorm)

1. **The spoken line lives on the shot row, and nowhere else.** The reel-level `voiceover` field is
   removed rather than kept alongside — two copies of the same words drift the moment either is
   edited.
2. **Attribution is the parser's, by position in the script.** A line printed under a clip heading
   belongs to the shot it sits under. When a clip holds several shots and one line, the line goes
   to that clip's FIRST shot and the others get `""`. The parser never splits a line and never
   invents one.
3. **The writer places what it is given.** It no longer judges which beat a line belongs in; that
   judgement is what produced the bug.
4. **No migration.** Scripts already parsed carry no per-shot line and show no voiceover until they
   are re-parsed. The operator accepted this ("no need to worry about old data, we can just
   reparse").
5. **Scope: the multishot lane.** `renderShotForVideo` already excludes voiceover, so the
   single-take Video Prompt lane is untouched.

## Design

### Unit: parse (`src/prompts/script-parse.ts`, `src/lib/nodes/reel-script.ts`)

`reelSchema.visual_script.shots.items` gains a required `voiceover: string` — the line spoken over
that shot, verbatim, `""` when it has none. Top-level `voiceover` is deleted from the schema, from
`required`, and from the `ReelScript` type; `ReelShot` gains `voiceover?: string`.

The field list in the system prompt gains the attribution rule of decision 2, stated as the `clip`
rule is: quote the script's own words, never paraphrase, `""` when a shot has no line.

The prompt id bumps (script-parse v7 → v8).

### Unit: carry (`src/lib/nodes/multishot-cuts.ts`, `group-shots.ts`)

- `MultishotCut` gains `voiceover?: string`.
- `newCut(text, seconds, voiceover?)` and `cutsFromShots` copy it from the shot row.
- `shotsFromCuts` copies it back, so the Shot ⇄ Multishot flip stays lossless (D229).
- `mergeShotRows` joins its rows' non-empty lines with a space, so a merged single take still
  states what is spoken over it.

### Unit: the user turn (`src/lib/nodes/resolve-inputs.ts`)

Each shot block gains a third line, only when that shot has one:

```
Shot 1 — cutId: 4f8cfb01-… — 6s
  Shot text: Morning in a normal Indian home kitchen…
  Spoken over this shot: "This has actually just become part of my regular cooking now."
```

The whole-script voiceover block is deleted, with `voiceoverForWriter`, the `voiceover` field on
`ResolvedMultishotInputs`, the `voiceover` argument of `buildMultishotUserTurn`, and the
`voiceover: resolved.voiceover` hand-off in
`src/app/api/nodes/[id]/multishot-prompt/route.ts`.

### Unit: the writers (`src/prompts/multishot-prompt-{generate,kling,seedance}.ts`)

`voiceoverRules(lineForm)` changes from "judged by the shot texts and the shot lengths" to: write
the line given with this shot, verbatim; a shot with no line carries no spoken line; never move a
line to another shot, borrow one from another shot, paraphrase, shorten or reorder it. Each model
keeps its own `lineForm` (Omni prose, Kling `says`, Seedance `{}`). All three prompt ids bump.

### Unit: display (`src/components/nodes/script-document.tsx`, `src/lib/nodes/node-output.ts`)

- The shot row gains an editable voiceover field bound to
  `["visual_script", "shots", i, "voiceover"]`, the same pattern as `description` and `duration`.
- The reel-level "Voiceover" `Section` is deleted. A read-only box among editable ones invites
  exactly one confused edit.
- `renderScriptAsText` renders the Voiceover section by joining the shots' non-empty lines, so a
  Script node's downstream text still carries the reel's spoken copy.
- The market-signal rewrite instruction (`src/prompts/script-parse.ts`) is reworded: it rewrites
  each shot's own line rather than "the voiceover".

## Data flow

```
script text
  → parse            shots[i].voiceover  (reel-level voiceover no longer exists)
  → fan-out          cutsFromShots → MultishotCut.voiceover
  → user turn        "Spoken over this shot: …" inside that shot's block
  → writer           the beat for that shot speaks that line, verbatim
```

## Error handling

- A shot with no line prints no third line and the writer is told to leave the beat silent.
- A script with no `Creator:`/VO lines at all parses every shot's `voiceover` to `""`, and the user
  turn contains no spoken lines — the same as a script with no voiceover today.
- An already-parsed script (no per-shot field) behaves as "no voiceover" until re-parsed. This is
  the accepted cost of decision 4; it is visible — the Script document shows empty line fields —
  rather than silent.
- A line longer than its shot can speak is NOT corrected here. The operator sees it on the shot row
  and in the generated beat, and can edit either.

## Testing

- **Parse fixture** — the Jackfruit365 "A Day in Her Kitchen" script (6 clips, one `Creator:` line
  each): every shot carries its own line, no line appears on two shots, no line is dropped.
- **Attribution** — a clip with two shots and one line puts the whole line on the first shot and
  `""` on the second.
- **Round-trip** — `cutsFromShots` → `shotsFromCuts` preserves the line; `mergeShotRows` joins two
  rows' lines.
- **The regression** — `buildMultishotUserTurn` for a one-shot CLIP 1 node emits that shot's line
  and NO whole-script voiceover block, and the string "every line must appear exactly once" is gone
  from the turn.
- **Silence** — a cut with `voiceover: ""` emits no "Spoken over this shot" line.
- Existing multishot prompt and route tests updated for the removed argument.

## Out of scope

- Re-parsing or migrating existing scripts.
- Moving a line between shots anywhere other than by editing the two shot rows.
- The single-take Video Prompt lane, which does not send voiceover.
- Fitting a line to its shot's length (a check that a 6s shot cannot speak a 12-word CTA).
