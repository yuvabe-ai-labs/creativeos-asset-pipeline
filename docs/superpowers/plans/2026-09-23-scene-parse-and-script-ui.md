# Parse the script as written Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One scene in the script becomes one generation, with its own seconds and its own spoken line — no packing to a model's window, no timings shown where they cannot be acted on, and a duration edit that actually changes the length.

**Architecture:** The parse learns the operator's vocabulary (`Scene N — Hook | 0–5 sec`, `VO + Text Overlay:`) and emits one shot row per scene. Grouping gains a version 3 whose rule is identity — one generation per row — leaving v1/v2 canvases packed exactly as they are. The Script node then shows seconds only for a multishot generation, and the control that shows them writes `duration_seconds`, the field every consumer actually reads.

**Tech Stack:** TypeScript, Next.js 16, Vitest, OpenAI structured outputs (strict JSON Schema), shadcn/Base UI components.

**Spec:** `docs/superpowers/specs/2026-09-23-scene-parse-and-script-ui-design.md`

## Deviation from the spec's test list

The spec asks for tests that "no seconds are rendered when multishot is off" and that "committing a
length writes `duration_seconds`". These components have **no test harness in this repo** — there
is no React testing library set up, and every existing component change here is verified by `tsc`,
`eslint` and reading. So Task 3's UI half is gated that way, and the behaviour is confirmed by the
manual check at the end of this plan. The pure halves it depends on (`deriveShotDuration`,
`scenesAsGenerations`, `describeGenerations`) ARE covered by unit tests.

## Global Constraints

- **Never run bare `npx vitest run`** — the full suite has ~11 pre-existing timeout flakes. Always scope to a file or directory.
- **Never `git add -A` / `git add .`** — stage only the named files of that task, by explicit path.
- **No destructive git commands** — no `checkout`, `restore`, `stash`, `reset`, `clean`, `rm`. Undo by editing.
- **Never stage `package.json` / `package-lock.json`.**
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Controls in JSX must be shadcn primitives from `src/components/ui/*` (Base UI `render` prop, never `asChild`); never a raw `<button>/<input>/<textarea>/<select>`. Inline-editable text uses `src/components/nodes/editable-field.tsx`; "Add" actions are dashed-border primary chips. Icons are Lucide at 1.5 stroke. Colours come from the shadcn CSS variables — never a hex value.
- OpenAI strict mode: every property of an object schema must also appear in that object's `required`, and `additionalProperties: false` stays.
- **A canvas parsed under grouping v1 or v2 must keep its exact generations.** Nothing is backfilled or repacked.
- Verification for every task: `npx tsc --noEmit -p .` clean, plus the task's own scoped test command and `npx eslint` on touched files.
- The branch is `fix/vo-script`. Do not switch branches.

---

### Task 1: The parser reads scenes, in the operator's own vocabulary

**Files:**
- Modify: `src/prompts/script-parse.ts` (the `visual_script` bullets in `system`, ~line 106-130; `version`, ~line 200)
- Test: `src/prompts/__tests__/script-parse-schema.test.ts`

**Interfaces:**
- Produces: `scriptParsePrompt.version === 9`. The JSON schema is UNCHANGED — this task is prompt text only.

- [ ] **Step 1: Write the failing test**

In `src/prompts/__tests__/script-parse-schema.test.ts`, change the version test from 8 to 9 and add the rules test beside it:

```ts
  it("is version 9", () => {
    expect(scriptParsePrompt.version).toBe(9);
  });

  // The operator's own creators write "Scene 3 — How to Use | 10–18 sec" and "VO + Text Overlay:".
  // A parser that only knew CLIP/Creator turned their six-scene script into whatever the packer
  // wanted, and dropped the label it did not recognise.
  it("names every heading and speech label a script may use", () => {
    for (const word of ["Scene", "Shot", "CLIP", "VO", "Voiceover", "Creator", "Narrator"]) {
      expect(scriptParsePrompt.system, word).toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  // One scene is one row, whatever its visual describes. Splitting a montage into rows is the
  // parser deciding where the cuts are, which is the operator's call, not its own.
  it("tells the model a scene is exactly one shot row", () => {
    expect(scriptParsePrompt.system).toMatch(/exactly one/i);
    expect(scriptParsePrompt.system).toMatch(/montage/i);
  });

  // "VO + Text Overlay: <words>" means those words are SPOKEN. Duplicating them into
  // on_screen_text would put the same sentence in the prompt twice, once as speech and once as
  // on-screen type the request forbids.
  it("treats a VO + Text Overlay block as the spoken line only", () => {
    expect(scriptParsePrompt.system).toMatch(/Text Overlay/i);
    expect(scriptParsePrompt.system).toMatch(/not.*duplicate|never.*duplicate/i);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/prompts/__tests__/script-parse-schema.test.ts`
Expected: FAIL — version is 8, and the system prompt names neither "Scene" nor "Text Overlay".

- [ ] **Step 3: Teach the parser the vocabulary**

In `src/prompts/script-parse.ts`, in the `system` string, REPLACE this line:

```
- visual_script: { shots: [{ description, duration, duration_seconds, clip, voiceover }], execution_refinement } — split the shot list into individual shots.
```

with:

```
- visual_script: { shots: [{ description, duration, duration_seconds, clip, voiceover }], execution_refinement } — one row per SCENE, in the order the script writes them.
  - A scene begins at a heading, whatever the script calls it: "Scene 3 — How to Use | 10–18 sec", "Shot 2", "CLIP 4 (10–20 SEC)", or a bare timecode line ("0–5 sec"). A title after a dash or a pipe is part of the heading, not content.
  - Each scene produces EXACTLY ONE row. A scene whose visual lists several beats — a montage, "A → B → C", "quick cuts of X, Y, Z" — is still one row, and its description keeps that prose as written. Do NOT split a montage into rows: where the cuts fall is the operator's decision, made after the parse.
```

- [ ] **Step 4: Teach it the speech labels**

In the same `system` string, REPLACE the first line of the `voiceover` sub-bullet:

```
  - voiceover: the VO lines that play over THIS shot, as [{ text, speaker, delivery, language }].
```

with:

```
  - voiceover: the VO lines that play over THIS shot, as [{ text, speaker, delivery, language }]. The line sits under a speech label — "VO:", "VO + Text Overlay:", "Voiceover:", "Creator:", "Narrator:", "Spokesperson:" or the speaker's own name — inside that scene.
    - "VO + Text Overlay: <words>" means those words are SPOKEN. Put them here and do NOT duplicate them into on_screen_text; the same sentence must not appear twice.
```

- [ ] **Step 5: Bump the version**

In the `scriptParsePrompt` record, change `version: 8,` to `version: 9,` and add this line to the version comment block directly above it:

```ts
  // v9: one row per SCENE, in the script's own vocabulary (Scene / Shot / CLIP / bare timecode),
  // with the speech labels real scripts use. A montage inside a scene stays one row — where the
  // cuts fall is the operator's call. Packing to a model's window is gone (grouping v3).
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/prompts/__tests__/script-parse-schema.test.ts`
Expected: PASS, including the existing schema and clip tests, which this task does not touch.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit -p .` — expected clean.

```bash
git add src/prompts/script-parse.ts src/prompts/__tests__/script-parse-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(script-parse): one row per scene, in the script's own vocabulary

v9 teaches the parser the headings and speech labels real scripts use -
"Scene 3 - How to Use | 10-18 sec", "VO + Text Overlay:" - and fixes one
scene as exactly one row. A montage inside a scene stays one row: where the
cuts fall is the operator's decision, not the parser's.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Grouping v3 — one generation per scene

**Files:**
- Modify: `src/lib/nodes/group-shots.ts` (`GroupingVersion` ~line 39, `CURRENT_GROUPING_VERSION` ~line 40, `ceilingForVersion` ~line 42, `defaultMultishotFor` ~line 57, `describeGenerations` ~line 246)
- Test: `src/lib/nodes/__tests__/group-shots.test.ts`

**Interfaces:**
- Produces: `GroupingVersion = 1 | 2 | 3`; `CURRENT_GROUPING_VERSION === 3`; `scenesAsGenerations(shots: ReelShot[]): ShotGroup[]` exported from `group-shots.ts`; `describeGenerations(shots, overrides?, groupingVersion?)` unchanged in signature.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/nodes/__tests__/group-shots.test.ts`:

```ts
// D277 — the operator's script is the authority on what a generation is: "no need to do seedance
// specific parsing when more than 15s like that, just parse. If they want to do 30s continuous
// take it will be in script, they will mention it."
describe("grouping v3 — one generation per scene", () => {
  it("gives every scene its own generation, in order", () => {
    expect(shape(scenesAsGenerations(shots(5, 5, 8, 7, 6, 4)))).toEqual([
      { idx: [0], s: 5 },
      { idx: [1], s: 5 },
      { idx: [2], s: 8 },
      { idx: [3], s: 7 },
      { idx: [4], s: 6 },
      { idx: [5], s: 4 },
    ]);
  });

  // No floor clamp either: a 2s scene is a 2s scene. Clamping invents video the script did not
  // ask for, which is the same fault as packing, one number down.
  it("never packs, never rebalances and never clamps", () => {
    expect(shape(scenesAsGenerations(shots(2)))).toEqual([{ idx: [0], s: 2 }]);
    expect(shape(scenesAsGenerations(shots(35)))).toEqual([{ idx: [0], s: 35 }]);
  });

  it("is what describeGenerations uses at the current version", () => {
    const gens = describeGenerations(shots(5, 5, 8), {}, CURRENT_GROUPING_VERSION);
    expect(gens.map((g) => g.shotIndexes)).toEqual([[0], [1], [2]]);
    expect(gens.every((g) => g.multishot === false)).toBe(true);
    // One scene per generation: there is no multi-shot group left to recommend multishot for.
    expect(gens.every((g) => g.recommendMultishot === false)).toBe(true);
  });

  it("still says when a single scene is longer than any model can take", () => {
    const [gen] = describeGenerations(shots(35), {}, 3);
    expect(gen.overCeiling).toBe(true);
  });

  // The whole point of a version: a canvas parsed before this change keeps the generations it
  // already has, and nothing on screen moves under its operator.
  it("leaves v1 and v2 packing exactly as it was", () => {
    expect(shape(groupShotsForFanOut(shots(4, 5, 4), ceilingForVersion(1)))).toEqual(
      shape(groupShotsForFanOut(shots(4, 5, 4), LEGACY_PACK_CEILING)),
    );
    expect(describeGenerations(shots(5, 5, 8), {}, 1).map((g) => g.shotIndexes)).toEqual([
      [0, 1],
      [2],
    ]);
    expect(describeGenerations(shots(5, 5, 8), {}, 2).map((g) => g.shotIndexes)).toEqual([
      [0, 1, 2],
    ]);
  });
});
```

Add `scenesAsGenerations` to the import list at the top of that file.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts`
Expected: FAIL — `scenesAsGenerations` is not exported, and `CURRENT_GROUPING_VERSION` is 2.

- [ ] **Step 3: Add the version**

In `src/lib/nodes/group-shots.ts`, change the `GroupingVersion` type, its doc comment's list, and the current version:

```ts
 *   v1 — 10s ceiling, a group of 2+ shots defaults to multishot
 *   v2 — 30s ceiling, every generation defaults to single (D259)
 *   v3 — no packing at all: one generation per scene, defaulting to single (D277)
 */
export type GroupingVersion = 1 | 2 | 3;
export const CURRENT_GROUPING_VERSION: GroupingVersion = 3;
```

Change `ceilingForVersion` so v3 answers with the same ceiling v2 does (it is quoted by the
over-limit message; under v3 nothing packs with it):

```ts
export function ceilingForVersion(version: GroupingVersion): number {
  return version === 1 ? LEGACY_PACK_CEILING : PACK_CEILING_SECONDS;
}
```

Change `defaultMultishotFor` so v3 keeps v2's answer:

```ts
export function defaultMultishotFor(shotIndexes: number[], version: GroupingVersion): boolean {
  return version === 1 ? shotIndexes.length > 1 : false;
}
```

- [ ] **Step 4: Add the v3 rule**

In the same file, directly above `describeGenerations`, add:

```ts
/**
 * D277 — v3's whole grouping rule: one scene, one generation.
 *
 * Not a ceiling of infinity but the absence of packing. There is no greedy pass, no trailing
 * rebalance and no floor clamp, because each of those reshapes the operator's script toward what
 * some model can take. A scene too long for every model is reported by `overCeiling` and left
 * alone — where to cut it is a creative decision.
 */
export function scenesAsGenerations(shots: ReelShot[]): ShotGroup[] {
  return shots.map((shot, index) => ({ shotIndexes: [index], seconds: shotSeconds(shot) }));
}
```

- [ ] **Step 5: Branch `describeGenerations`**

Replace its body's first line so v3 uses the new rule and v1/v2 keep packing:

```ts
export function describeGenerations(
  shots: ReelShot[],
  overrides?: Record<string, boolean>,
  groupingVersion: GroupingVersion = 1,
): Generation[] {
  const groups =
    groupingVersion === 3
      ? scenesAsGenerations(shots)
      : groupShotsForFanOut(shots, ceilingForVersion(groupingVersion));

  return groups.map((group, index) => {
    const key = generationKey(group.shotIndexes);
    const override = overrides?.[key];
    return {
      index,
      shotIndexes: group.shotIndexes,
      seconds: group.seconds,
      multishot:
        typeof override === "boolean"
          ? override
          : defaultMultishotFor(group.shotIndexes, groupingVersion),
      overCeiling: group.seconds > PACK_CEILING_SECONDS,
      // A v3 generation is one scene, so there is no multi-shot group to recommend multishot for.
      recommendMultishot: groupingVersion !== 3 && group.shotIndexes.length > 1,
      key,
    };
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts`
Expected: PASS, including every existing packing test (they pass an explicit ceiling or version).

- [ ] **Step 7: Run the suites that depend on grouping**

Run: `npx vitest run src/lib/nodes src/lib/canvas-store.test.ts`
Expected: PASS. If a canvas-store fan-out test asserts packed generations while passing no
`groupingVersion`, it is exercising the v1 default and must keep its current expectation — do not
"fix" it to v3.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit -p .` — expected clean.

```bash
git add src/lib/nodes/group-shots.ts src/lib/nodes/__tests__/group-shots.test.ts
git commit -m "$(cat <<'EOF'
feat(script): grouping v3 - one generation per scene, no packing

Packing sized generations to the widest model window (30s), so a six-scene
35-second script arrived shaped by Seedance rather than by its scenes, and
CLIP headings existed only to fight it. v3's rule is identity: one scene, one
generation, no greedy pass, no rebalance, no floor clamp. A scene longer than
any model can take is reported, not split.

v1 and v2 canvases keep their exact generations - the version is what makes
that true.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Seconds appear only where they can be acted on — and editing them works

**Files:**
- Modify: `src/components/nodes/generation-bracket.tsx` (the header label, ~line 100-102)
- Modify: `src/components/nodes/script-document.tsx` (the shot row's duration field, ~line 163-169)
- Modify: `src/lib/nodes/derive-shot-duration.ts` (`deriveShotDuration`, ~line 22-28)
- Test: `src/lib/nodes/__tests__/derive-shot-duration.test.ts` (exists — extend it, do not create a second file)

**Interfaces:**
- Consumes: `Generation.multishot` and `Generation.seconds` (Task 2), `shotSeconds` from `group-shots.ts`.
- Produces: no new exports. `deriveShotDuration` returns the script's own total, unclamped.

- [ ] **Step 1: Write the failing test for the derived duration**

In `src/lib/nodes/__tests__/derive-shot-duration.test.ts`, read the file first and follow its
existing import style and fixture shape, then add:

```ts
// D277 — the script states the length; a model that cannot take it says so itself. Clamping here
// silently handed a 14s scene to a 10s request.
describe("deriveShotDuration", () => {
  it("returns the script's own length, however long", () => {
    expect(deriveShotDuration({ visual_script: { shots: [{ duration_seconds: 14 }] } })).toBe(14);
    expect(deriveShotDuration({ visual_script: { shots: [{ duration_seconds: 2 }] } })).toBe(2);
  });

  it("sums a multi-row script", () => {
    expect(
      deriveShotDuration({
        visual_script: { shots: [{ duration_seconds: 6 }, { duration_seconds: 4 }] },
      }),
    ).toBe(10);
  });

  it("is null when there is nothing to derive from", () => {
    expect(deriveShotDuration(null)).toBeNull();
    expect(deriveShotDuration({ visual_script: { shots: [] } })).toBeNull();
  });
});
```

If the file already exists, replace only its clamping assertions with these; keep every other test
in it untouched.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/nodes/derive-shot-duration.test.ts`
Expected: FAIL — 14 comes back as 10 and 2 comes back as 3 (the 3–10s clamp).

- [ ] **Step 3: Drop the clamp**

In `src/lib/nodes/derive-shot-duration.ts`, replace the function body's last line:

```ts
  return Math.min(SHOT_MAX_SECONDS, Math.max(SHOT_MIN_SECONDS, Math.round(total)));
```

with:

```ts
  // D277 — NOT clamped to a model's window. The script states the length; a model that cannot
  // take it reports that itself (checkLadder, the video params' own limits). Clamping here handed
  // a 14s scene to a 10s request with nothing said.
  return Math.round(total);
```

Then delete the now-unused `SHOT_MIN_SECONDS` constant. KEEP `SHOT_MAX_SECONDS` exported —
`src/components/nodes/generation-bracket.tsx:24,73` imports it for the multishot recommendation
tooltip. Update its doc comment to say it is that threshold and no longer a clamp.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/nodes/derive-shot-duration.test.ts`
Expected: PASS.

- [ ] **Step 5: Hide the seconds on a single-take bracket**

In `src/components/nodes/generation-bracket.tsx`, replace:

```tsx
        <span className="text-eyebrow">
          Gen {generation.index + 1} · {generation.seconds}s
        </span>
```

with:

```tsx
        {/* D277 — a single take's length is not tunable here, so it is not shown here. With
            multishot ON the seconds return, because then they are what the operator spends
            per cut. The over-limit badge below is deliberately NOT gated on the toggle: it
            reports a fact about the scene either way. */}
        <span className="text-eyebrow">
          Gen {generation.index + 1}
          {generation.multishot && ` · ${generation.seconds}s`}
        </span>
```

- [ ] **Step 6: Make the shot row's length control show only when tunable, and actually edit the length**

In `src/components/nodes/script-document.tsx`, replace the duration `EditableField` in the shot row:

```tsx
                      <EditableField
                        value={shots[i]?.duration ?? ""}
                        onCommit={set(["visual_script", "shots", i, "duration"])}
                        readOnly={readOnly}
                        placeholder="duration"
                        className="text-xs text-muted-foreground"
                      />
```

with:

```tsx
                      {/* D277 — shown only for a multishot generation, where seconds are what the
                          operator spends per cut. It edits `duration_seconds`, the field every
                          consumer reads (shotSeconds, grouping, the video request): the old
                          control edited the free-text `duration` label, so a timing edit changed
                          a string and no behaviour at all. */}
                      {generation.multishot && (
                        <EditableField
                          value={`${shotSeconds(shots[i] ?? {})}s`}
                          onCommit={(next) => {
                            const seconds = Number.parseInt(next.replace(/[^0-9]/g, ""), 10);
                            if (Number.isFinite(seconds) && seconds > 0) {
                              onChange?.(["visual_script", "shots", i, "duration_seconds"], seconds);
                            }
                          }}
                          readOnly={readOnly}
                          placeholder="seconds"
                          className="text-xs text-muted-foreground"
                        />
                      )}
```

Add `shotSeconds` to this file's existing import from `@/lib/nodes/group-shots`.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p .` — expected clean.
Run: `npx vitest run src/lib/nodes src/components` — expected PASS.
Run: `npx eslint src/components/nodes/generation-bracket.tsx src/components/nodes/script-document.tsx src/lib/nodes/derive-shot-duration.ts` — expected no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/generation-bracket.tsx src/components/nodes/script-document.tsx src/lib/nodes/derive-shot-duration.ts src/lib/nodes/derive-shot-duration.test.ts
git commit -m "$(cat <<'EOF'
fix(script): seconds show where they can be acted on, and editing one works

The shot row's duration field edited `duration` - the free-text timing label -
while shotSeconds, grouping, the generation length and the video request all
read `duration_seconds`. Nothing in the UI ever wrote that field, so editing a
timing changed a label and nothing else.

It now edits the real length, and appears only for a multishot generation,
where seconds are what the operator spends per cut; a single take's bracket
reads "Gen 1" with no seconds at all. deriveShotDuration also stops clamping
to Omni's 3-10s window - the script states the length, and a model that
cannot take it says so itself.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Voiceover that reads as speech

**Files:**
- Modify: `src/components/nodes/vo-lines-editor.tsx`
- Test: none — this is presentation; `npx tsc --noEmit -p .` and `npx eslint` are the gates.

**Interfaces:**
- Consumes: `VoLine` and the existing `VoLinesEditor({ lines, onChange, readOnly })` contract. No prop changes.

- [ ] **Step 1: Render the line as speech**

The line currently renders as small grey text under the description, which reads as metadata
("it does not feel like vo"). Change the row so the spoken words carry the shot text's own size and
sit in quotation marks, with the speaker as a tracked small-caps chip BEFORE them on the same line.

Replace the row's inner `<div className="min-w-0 flex-1">…</div>` with:

```tsx
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {/* The speaker leads, as the caption this view already uses for "Shot N" and "Cuts",
                so a line reads as `narrator · "…"` — who is speaking, then what is said. */}
            <span className="flex shrink-0 items-baseline gap-1.5">
              <EditableField
                // "narrator" is the unspoken default (D267 — the same convention renderVoiceover
                // uses), so it displays as empty with a placeholder rather than as literal text.
                value={line.speaker === "narrator" ? "" : line.speaker}
                onCommit={(speaker) =>
                  updateLine(i, { speaker: speaker.trim() === "" ? "narrator" : speaker })
                }
                readOnly={readOnly}
                placeholder="narrator"
                className="text-eyebrow text-muted-foreground"
                editClassName="h-auto rounded-md border-0 bg-primary/5 px-1.5 py-0.5 shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
              <span aria-hidden className="text-muted-foreground/50">
                ·
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <EditableField
                value={line.text}
                onCommit={(text) => updateLine(i, { text })}
                readOnly={readOnly}
                multiline
                placeholder="Spoken line…"
                className="text-sm leading-relaxed"
                // The quotation marks are DISPLAY ONLY — they are never stored in VoLine.text and
                // never reach renderVoiceover, which adds its own around the stored words.
                renderDisplay={(v) => `“${v}”`}
                editClassName="min-h-0 resize-none rounded-md border-0 bg-primary/5 px-1.5 py-1 shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-sm"
              />
            </div>
          </div>
```

- [ ] **Step 2: Check the quotes cannot leak into the data**

Run: `git grep -n "renderDisplay" -- src/components/nodes/editable-field.tsx`
Confirm from the source that `renderDisplay` affects only the committed DISPLAY and that edit mode
always opens on the raw `value`. If it did not, the next edit would commit `"…"` into
`VoLine.text` and `renderVoiceover` would double-quote it in the prompt.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p .` — expected clean.
Run: `npx eslint src/components/nodes/vo-lines-editor.tsx` — expected no new errors.
Run: `npx vitest run src/lib/nodes src/components` — expected PASS (no test asserts this markup;
this confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/vo-lines-editor.tsx
git commit -m "$(cat <<'EOF'
fix(script): a spoken line reads as speech, not as metadata

Small grey text under the description read as a field ("it does not feel like
vo"). The line now carries the shot text's own size in quotation marks, led by
the speaker as the tracked caption this view already uses - `narrator · "..."`.

The quotes are display only: they never enter VoLine.text, so renderVoiceover
still adds its own around the stored words.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Record the decision and verify the whole path

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, append after the last D-entry)

- [ ] **Step 1: Append the ADR**

Append after the last `### D` entry in §7:

```markdown
### D277 — A scene is a generation; the script is not packed to a model *(recorded 2026-09-23)*

**Decision.** Grouping v3 (`scenesAsGenerations`) gives every parsed scene its own generation:
no greedy packing, no trailing rebalance, no floor clamp, and no clip-boundary rule. script-parse
v9 reads one row per scene in the vocabulary real scripts use (`Scene 3 — How to Use | 10–18 sec`,
`VO + Text Overlay:`), and a montage inside a scene stays one row. A scene longer than any model's
window is reported by `overCeiling`, never split. The Script node shows seconds only for a
multishot generation, and that control writes `duration_seconds`. `deriveShotDuration` no longer
clamps to Omni's 3–10s window.

**Why.** Packing sized generations to `PACK_CEILING_SECONDS` — the widest window any multishot
model publishes — so a six-scene 35-second script arrived shaped by Seedance, and CLIP headings
(D273) existed only to fight that packing. The operator: "no need to do seedance specific parsing
when more than 15s like that, just parse. If they want to do 30s continuous take it will be in
script, they will mention it." Separately, the duration control edited the free-text `duration`
label while every consumer read `duration_seconds`, so a timing edit changed nothing — and the
seconds were displayed most prominently in the one mode (single take) where they could not be
tuned.

**Rejected.** Splitting a montage inside a scene into cuts (the parser deciding where the cuts
fall, which is the operator's call); removing the `clip` field and its help chapter (it is now
inert, and removing it rewrites documentation for no behaviour); renaming Shot to Scene across the
UI (a vocabulary change far wider than this problem).

**Not migrated.** v1 and v2 canvases keep their packed generations and their multishot
recommendations until they are re-parsed. `PACK_CEILING_SECONDS` survives as the number the
over-limit message quotes.

**Refines.** D257, D258, D259, D273. **Originated →**
`docs/superpowers/specs/2026-09-23-scene-parse-and-script-ui-design.md`.
```

- [ ] **Step 2: Verify the whole path**

Run: `npx tsc --noEmit -p .` — expected clean.
Run: `npx vitest run src/lib/nodes src/prompts src/components src/lib/canvas-store.test.ts` — expected PASS.
Run: `git grep -n "SHOT_MIN_SECONDS" -- src` — expected no output (the clamp's constant is gone).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "$(cat <<'EOF'
docs(adr): D277 - a scene is a generation; the script is not packed to a model

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Manual check after Task 5

Re-parse the operator's 35-second six-scene script (`Scene 1 — Hook | 0–5 sec` … `Scene 6 — CTA |
31–35 sec`) and confirm:

1. Six generations, in order, at 5s / 5s / 8s / 7s / 6s / 4s — not two packed ones.
2. Each bracket reads `Gen N` with no seconds, and no `0–10 SEC` line under the shot.
3. Each scene shows its own spoken line as `narrator · "…"`.
4. Turning Multishot on for one generation brings back `Gen N · Xs` and the per-shot length; editing
   that length changes the generation's seconds in the bracket.
