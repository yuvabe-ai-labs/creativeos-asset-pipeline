# Per-shot voiceover Implementation Plan

> **SUPERSEDED, NOT EXECUTED (2026-09-22).** Its spec was superseded by
> `docs/superpowers/specs/2026-09-16-script-voiceover-in-generation-design.md` before Task 1 was
> dispatched — see that spec's header for why. The build order to follow is that design's §9; its
> item 1 is already ported here. Nothing in this plan was implemented; it is kept only as the
> record of the discarded approach.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry each script shot's spoken line from the parse through to the beat written for that shot, so the multishot writer places the line it is given instead of guessing which beat a reel-wide voiceover belongs in.

**Architecture:** The spoken line becomes a field on the shot row (`ReelShot.voiceover`), copied onto `MultishotCut`, and printed inside that shot's own block in the multishot user turn. The reel-level `ReelScript.voiceover` field and the whole-script voiceover block in the user turn are deleted — one home for the words, no second copy to drift.

**Tech Stack:** TypeScript, Next.js 16, Vitest, OpenAI structured outputs (strict JSON Schema), Zustand canvas store, shadcn/Base UI components.

**Spec:** `docs/superpowers/specs/2026-09-22-per-shot-voiceover-design.md`

## Deviations from the spec

1. **`voiceoverForWriter` is renamed, not deleted.** The spec said to delete it with the
   whole-script block. It is kept as `spokenLineForWriter` and applied per line, because scripts
   fill the speech label with a stated absence — the help chapter's own block template literally
   suggests `Creator: <spoken line or voiceover, or "(No dialogue)">`. Without it, `(No dialogue)`
   reaches the writer as something to say out loud. Its unit changes from the reel blob to one
   line, hence the name, and it now also strips surrounding brackets.
2. **The spec's "parse fixture" test is a manual check, not a unit test.** Asserting that the
   Jackfruit365 script parses to one line per shot would require a live OpenAI call on every test
   run. The repo's existing parse tests (`script-parse-schema.test.ts`) assert the schema and the
   system text only, and this plan follows that. The real parse is verified once, by hand, in the
   "Manual check" section at the end.

## Global Constraints

- **Never run bare `npx vitest run`** — the full run has ~11 pre-existing timeout flakes. Always scope to a file or directory.
- **Never `git add -A` / `git add .`** — stage only the named files of that task, by explicit path.
- **No destructive git commands** — no `checkout`, `restore`, `stash`, `reset`, `clean`, `rm`. Undo by editing.
- **Never stage `package.json` / `package-lock.json`.**
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Controls in JSX must be shadcn primitives from `src/components/ui/*` (Base UI `render` prop, never `asChild`); never a raw `<button>/<input>/<textarea>/<select>`.
- OpenAI strict mode: every property of an object schema must also appear in that object's `required` array, and `additionalProperties: false` stays.
- Verification for every task: `npx tsc --noEmit -p .` clean, plus the task's own scoped test command.
- A concurrent session commits to this branch. Stage only the files your task names.

---

### Task 1: The parser reads a shot's spoken line

**Files:**
- Modify: `src/prompts/script-parse.ts` (shot schema ~line 56-69, field list ~line 106-111, `version` ~line 182)
- Test: `src/prompts/__tests__/script-parse-schema.test.ts`

**Interfaces:**
- Produces: `scriptParsePrompt.schema.properties.visual_script.properties.shots.items.properties.voiceover === { type: "string" }`, present in that item's `required`. Top-level `voiceover` no longer exists in `schema.properties` or `schema.required`. `scriptParsePrompt.version === 8`.

- [ ] **Step 1: Write the failing test**

In `src/prompts/__tests__/script-parse-schema.test.ts`, change the version test and add the new ones. Replace:

```ts
  it("is version 7", () => {
    expect(scriptParsePrompt.version).toBe(7);
  });
```

with:

```ts
  it("is version 8", () => {
    expect(scriptParsePrompt.version).toBe(8);
  });

  // The spoken line belongs to the shot it is spoken over — the help chapter's own template
  // already asks creators to write it that way ("Creator: <spoken line …>" inside each block).
  // A reel-level blob cannot say which beat a line belongs to, and the writer then guessed:
  // CLIP 6's "read the reviews… link in bio" CTA landed in CLIP 1's kitchen beat.
  it("declares voiceover as a required string on every shot", () => {
    expect(shotProps.properties.voiceover).toEqual({ type: "string" });
    expect(shotProps.required).toContain("voiceover");
  });

  it("has no reel-level voiceover field — the shot row is the only home for a line", () => {
    const schema = scriptParsePrompt.schema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties).not.toHaveProperty("voiceover");
    expect(schema.required).not.toContain("voiceover");
  });

  it("tells the model where a line comes from and what an absent one is", () => {
    expect(scriptParsePrompt.system).toMatch(/Creator:/);
    expect(scriptParsePrompt.system).toMatch(/No dialogue/i);
    expect(scriptParsePrompt.system).toMatch(/first shot/i);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/prompts/__tests__/script-parse-schema.test.ts`
Expected: FAIL — "is version 8" gets 7, `shotProps.properties.voiceover` is `undefined`, and the schema still has a top-level `voiceover`.

- [ ] **Step 3: Add the field to the schema**

In `src/prompts/script-parse.ts`, in `reelSchema.properties.visual_script.properties.shots.items`, change:

```ts
            required: ["description", "duration", "duration_seconds", "clip"],
            properties: {
              description: { type: "string" },
              duration: { type: "string" },
              duration_seconds: { type: "integer" },
              clip: { type: "integer" },
            },
```

to:

```ts
            required: ["description", "duration", "duration_seconds", "clip", "voiceover"],
            properties: {
              description: { type: "string" },
              duration: { type: "string" },
              duration_seconds: { type: "integer" },
              clip: { type: "integer" },
              voiceover: { type: "string" },
            },
```

Then delete the reel-level field. Remove the line `    voiceover: { type: "string" },` from `reelSchema.properties`, and remove `"voiceover",` from the top-level `required` array.

- [ ] **Step 4: Tell the model how to fill it**

In the same file's `system` string, delete this line from the field list:

```
- voiceover: the VO script, or "" / "No voiceover".
```

and, under the `visual_script` bullet, add this sub-bullet directly after the `clip:` one:

```
  - voiceover: the line SPOKEN over that shot, verbatim from the script — the text under "Creator:", "VO:", "Voiceover:" or an equivalent speech label for that shot or its clip. Copy the words exactly; never paraphrase, shorten or reorder them, and never write a line the script does not have. Use "" when the shot has none, including when the script writes "(No dialogue)", "(None)" or "N/A" there. When a clip heading carries ONE line and holds SEVERAL shots, put the whole line on that clip's FIRST shot and give the others "" — do not split it and do not repeat it on each shot.
```

- [ ] **Step 5: Bump the version**

In the `scriptParsePrompt` record, change `version: 7,` to `version: 8,` and add this line to the version comment block above it, directly after the `// v7:` lines:

```ts
  // v8: per-shot `voiceover` — the line spoken over THAT shot, replacing the reel-level
  // blob. A blob could not say which beat a line belonged to, so the multishot writer
  // guessed and dropped the rest (CLIP 6's CTA in CLIP 1's beat).
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/prompts/__tests__/script-parse-schema.test.ts`
Expected: PASS, including the existing "keeps every shot property required" test.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: errors ONLY in files that read `script.voiceover` (`src/lib/nodes/reel-script.ts` still declares it, so likely zero errors here). If `tsc` is clean, continue; the readers are removed in Tasks 2, 3 and 5.

- [ ] **Step 8: Commit**

```bash
git add src/prompts/script-parse.ts src/prompts/__tests__/script-parse-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(script-parse): a shot carries the line spoken over it

v8 moves the voiceover onto the shot row and deletes the reel-level field. A
reel-wide blob cannot say which beat a line belongs to, which is how CLIP 6's
"read the reviews - link in bio" CTA ended up in CLIP 1's kitchen beat.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The line rides the shot row and the cut ladder

**Files:**
- Modify: `src/lib/nodes/reel-script.ts` (`ReelShot` ~line 5-22, `ReelScript.voiceover` ~line 37)
- Modify: `src/lib/nodes/multishot-cuts.ts` (`MultishotCut` ~line 37-48, `newCut` ~line 62, `cutsFromShots` ~line 69, `shotsFromCuts` ~line 75)
- Modify: `src/lib/nodes/group-shots.ts` (`mergeShotRows` ~line 82-97)
- Test: `src/lib/nodes/__tests__/multishot-cuts.test.ts`, `src/lib/nodes/__tests__/group-shots.test.ts`

**Interfaces:**
- Consumes: `ReelShot.voiceover?: string` (Task 1's parse output).
- Produces: `MultishotCut = { id: string; text: string; seconds: number; voiceover?: string }`; `newCut(text: string, seconds: number, voiceover?: string): MultishotCut`; `cutsFromShots(shots: ReelShot[]): MultishotCut[]` copying the line; `shotsFromCuts(cuts: MultishotCut[]): ReelShot[]` copying it back; `mergeShotRows(rows: ReelShot[]): ReelShot` joining non-empty lines with a single space.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/nodes/__tests__/multishot-cuts.test.ts`:

```ts
// The line is the shot's, so it travels with the shot — through fan-out into the ladder and back
// out on a flip to single-take (D229 keeps that pair lossless).
describe("the spoken line rides the cut", () => {
  it("copies a shot's line onto its cut", () => {
    const cuts = cutsFromShots([
      { description: "she takes the pack", duration_seconds: 6, voiceover: "part of my cooking now." },
      { description: "she pours the batter", duration_seconds: 4, voiceover: "" },
    ]);
    expect(cuts[0].voiceover).toBe("part of my cooking now.");
    expect(cuts[1].voiceover).toBe("");
  });

  it("round-trips through shotsFromCuts", () => {
    const shots = [
      { description: "a", duration_seconds: 3, voiceover: "the line" },
      { description: "b", duration_seconds: 3, voiceover: "" },
    ];
    const back = shotsFromCuts(cutsFromShots(shots));
    expect(back.map((s) => s.voiceover)).toEqual(["the line", ""]);
  });

  it("gives a hand-added cut no line", () => {
    expect(newCut("", 3).voiceover).toBe("");
  });
});
```

Make sure the file's import line includes every name used — at the top of that test file the import should read:

```ts
import { cutsFromShots, shotsFromCuts, newCut } from "../multishot-cuts";
```

(keep any other names the file already imports from that module in the same statement).

Append to `src/lib/nodes/__tests__/group-shots.test.ts`, inside the existing `describe("mergeShotRows", …)` block:

```ts
  // A merged take still states what is spoken over it. The single-take lane does not send the
  // line today, but the row is the node's only copy of it, so losing it here would lose it.
  it("joins the merged rows' spoken lines", () => {
    expect(
      mergeShotRows([
        { description: "a", duration_seconds: 3, voiceover: "First line." },
        { description: "b", duration_seconds: 3, voiceover: "" },
        { description: "c", duration_seconds: 3, voiceover: "Second line." },
      ]).voiceover,
    ).toBe("First line. Second line.");
  });

  it("leaves the line off when no merged row has one", () => {
    expect(
      mergeShotRows([
        { description: "a", duration_seconds: 3 },
        { description: "b", duration_seconds: 3, voiceover: "" },
      ]).voiceover,
    ).toBe("");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-cuts.test.ts src/lib/nodes/__tests__/group-shots.test.ts`
Expected: FAIL — `voiceover` is not a property of `MultishotCut` (TS error in the test) and `mergeShotRows(...).voiceover` is `undefined`.

- [ ] **Step 3: Add the field to the types**

In `src/lib/nodes/reel-script.ts`, add to `ReelShot`, after the `clip` field:

```ts
  /**
   * The line SPOKEN over this shot, verbatim from the script ("" when it has none). The shot row
   * is the ONLY home for a spoken line: a reel-level blob could not say which beat a line belonged
   * to, so the multishot writer guessed which one to keep and silently dropped the rest.
   */
  voiceover?: string;
```

and DELETE the reel-level field from `ReelScript`:

```ts
  voiceover?: string;
```

- [ ] **Step 4: Carry it through the ladder**

In `src/lib/nodes/multishot-cuts.ts`, add to `MultishotCut` after `seconds: number;`:

```ts
  /**
   * The line spoken over this shot, from the script row it was cut from ("" when none). The user
   * turn prints it inside THIS shot's block, so the writer places the line it is given rather than
   * judging which beat a reel-wide voiceover belongs in.
   */
  voiceover?: string;
```

Change `newCut`:

```ts
export function newCut(text: string, seconds: number, voiceover = ""): MultishotCut {
  return { id: crypto.randomUUID(), text, seconds, voiceover };
}
```

Change `cutsFromShots`'s map body:

```ts
  return shots.map((s) =>
    newCut(
      s.description ?? "",
      Math.max(MIN_CUT_SECONDS, Math.round(shotSeconds(s))),
      s.voiceover ?? "",
    )
  );
```

Change `shotsFromCuts`:

```ts
export function shotsFromCuts(cuts: MultishotCut[]): ReelShot[] {
  return cuts.map((c) => ({
    description: c.text,
    duration_seconds: c.seconds,
    voiceover: c.voiceover ?? "",
  }));
}
```

- [ ] **Step 5: Join the lines when rows merge**

In `src/lib/nodes/group-shots.ts`, in `mergeShotRows`, after the `const clip = rows[0]?.clip;` line add:

```ts
  // Joined, not dropped: the merged row is the node's only copy of what this take says.
  const voiceover = rows
    .map((r) => (r.voiceover ?? "").trim())
    .filter(Boolean)
    .join(" ");
```

and add `voiceover,` to the returned object, directly after `duration_seconds: total,`.

- [ ] **Step 6: Move the deleted field out of the convert fixture**

`src/lib/nodes/__tests__/multishot-convert.test.ts` has a typed `ShotNodeData` fixture with a
reel-level `voiceover`, which is now a TS error. In that file's `shotData`, delete the line
`    voiceover: "where are you headed?",` and put the line on the rows instead:

```ts
      shots: [
        { description: "close on keys", duration_seconds: 2, voiceover: "where are you headed?" },
        { description: "wide street", duration_seconds: 6, voiceover: "" },
      ],
```

Then in the test named "strips the shot list from the envelope but keeps everything else", replace:

```ts
    expect(result.script?.voiceover).toBe("where are you headed?");
```

with nothing (delete that line), and add a new test after it:

```ts
  // The envelope has no voiceover any more — the line travels on the cut it is spoken over.
  it("carries each row's spoken line onto its cut", () => {
    const result = shotDataToMultishot(shotData);
    expect(result.cuts?.map((c) => c.voiceover)).toEqual(["where are you headed?", ""]);
  });
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-cuts.test.ts src/lib/nodes/__tests__/group-shots.test.ts src/lib/nodes/__tests__/multishot-convert.test.ts`
Expected: PASS. The existing `mergeShotRows` "keeps a lone row exactly as it is" test still passes because a single row is returned untouched.

- [ ] **Step 8: Typecheck and run the neighbouring suites**

Run: `npx tsc --noEmit -p .`
Expected: errors ONLY where the deleted `ReelScript.voiceover` is still read — `src/lib/nodes/resolve-inputs.ts`, `src/lib/nodes/node-output.ts`, `src/components/nodes/script-document.tsx`. Those are Tasks 3 and 5. Note them and continue.

Run: `npx vitest run src/lib/nodes`
Expected: PASS except tests that reference the reel-level voiceover (`resolve-multishot.test.ts`, `node-output.test.ts`), which Tasks 3 and 5 rewrite.

- [ ] **Step 9: Commit**

```bash
git add src/lib/nodes/reel-script.ts src/lib/nodes/multishot-cuts.ts src/lib/nodes/group-shots.ts src/lib/nodes/__tests__/multishot-cuts.test.ts src/lib/nodes/__tests__/group-shots.test.ts src/lib/nodes/__tests__/multishot-convert.test.ts
git commit -m "$(cat <<'EOF'
feat(nodes): the spoken line rides the shot row and the cut

ReelShot.voiceover is the only home for a line; the reel-level field is gone.
cutsFromShots copies it onto the cut and shotsFromCuts copies it back, so the
Shot <-> Multishot flip stays lossless, and mergeShotRows joins the lines of
the rows it merges instead of dropping them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The user turn prints each shot's own line

**Files:**
- Modify: `src/lib/nodes/resolve-inputs.ts` (`ResolvedMultishotInputs.voiceover` ~line 216-219, `NO_VOICEOVER_RE` + `voiceoverForWriter` ~line 222-238, `resolveMultishotPromptInputs` ~line 271-283, `buildMultishotUserTurn` args ~line 300-301 and body ~line 312-322 and ~line 338-348)
- Modify: `src/app/api/nodes/[id]/multishot-prompt/route.ts:124`
- Test: `src/lib/nodes/__tests__/resolve-multishot.test.ts`, `src/app/api/nodes/[id]/multishot-prompt/route.test.ts`

**Interfaces:**
- Consumes: `MultishotCut.voiceover` (Task 2).
- Produces: `spokenLineForWriter(line: string | undefined): string` exported from `src/lib/nodes/resolve-inputs.ts` (replaces `voiceoverForWriter`); `buildMultishotUserTurn` no longer accepts a `voiceover` argument; `ResolvedMultishotInputs` no longer has a `voiceover` field.

- [ ] **Step 1: Write the failing tests**

In `src/lib/nodes/__tests__/resolve-multishot.test.ts`, replace the whole `describe("buildMultishotUserTurn voiceover", …)` block and the whole `describe("voiceoverForWriter", …)` block with:

```ts
// The regression this whole change exists for. A Multishot node holding CLIP 1 — one 6s shot —
// used to receive the WHOLE reel's voiceover under "every line must appear exactly once". Six
// lines, ~40 seconds of speech, one beat: unsatisfiable, so the writer kept one line and dropped
// five. It chose CLIP 6's "read the reviews - link in bio" CTA and put it in the kitchen beat,
// then traded the shot's own action away to make room for it.
describe("buildMultishotUserTurn spoken lines", () => {
  const base = { clientContext: "", upstream: [], instruction: "", cutInstructions: {} };

  it("prints each shot's own line inside that shot's block", () => {
    const turn = buildMultishotUserTurn({
      ...base,
      cuts: [
        { id: "c1", text: "she takes the pack", seconds: 6, voiceover: "Part of my cooking now." },
        { id: "c2", text: "she pours the batter", seconds: 4, voiceover: "I just mix a little in." },
      ],
    });
    expect(turn).toContain(`Spoken over this shot: "Part of my cooking now."`);
    expect(turn).toContain(`Spoken over this shot: "I just mix a little in."`);
    // Inside the block, under its own shot — not in a list of its own somewhere else.
    expect(turn).toMatch(/she takes the pack[\s\S]{0,40}Part of my cooking now\./);
  });

  it("sends no whole-script voiceover block and no 'exactly once' order", () => {
    const turn = buildMultishotUserTurn({
      ...base,
      cuts: [{ id: "c1", text: "she takes the pack", seconds: 6, voiceover: "Part of my cooking now." }],
    });
    expect(turn).not.toMatch(/every line must appear exactly once/i);
    expect(turn).not.toMatch(/The script's voiceover/i);
  });

  it("says nothing for a shot with no line", () => {
    const turn = buildMultishotUserTurn({
      ...base,
      cuts: [
        { id: "c1", text: "she takes the pack", seconds: 6, voiceover: "" },
        { id: "c2", text: "steam off the tawa", seconds: 4 },
      ],
    });
    expect(turn).not.toMatch(/Spoken over this shot/);
  });

  // Scripts fill the speech label with a stated absence; the help template's own block format
  // literally suggests "(No dialogue)".
  it("treats a stated absence as no line", () => {
    const turn = buildMultishotUserTurn({
      ...base,
      cuts: [{ id: "c1", text: "a", seconds: 3, voiceover: "(No dialogue)" }],
    });
    expect(turn).not.toMatch(/Spoken over this shot/);
  });
});

describe("spokenLineForWriter", () => {
  it("keeps a real line", () => {
    expect(spokenLineForWriter("  Where are you headed?  ")).toBe("Where are you headed?");
  });

  it("treats a stated absence as no line", () => {
    for (const none of [
      "No voiceover",
      "none",
      "N/A",
      "No VO.",
      "-",
      "No voice over — music only",
      "(No dialogue)",
      "(None)",
    ]) {
      expect(spokenLineForWriter(none), none).toBe("");
    }
  });

  it("is empty for a missing field", () => {
    expect(spokenLineForWriter(undefined)).toBe("");
  });
});
```

Change that file's import line to:

```ts
import { buildMultishotUserTurn, spokenLineForWriter } from "../resolve-inputs";
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/resolve-multishot.test.ts`
Expected: FAIL — `spokenLineForWriter` is not exported, and the turn has no "Spoken over this shot" line.

- [ ] **Step 3: Rename and widen the absence filter**

In `src/lib/nodes/resolve-inputs.ts`, replace the `NO_VOICEOVER_RE` constant, its comment and `voiceoverForWriter` with:

```ts
// "No voiceover", "none", "N/A", "No VO — music only", "(No dialogue)", "(None)", "-": scripts
// routinely fill the speech label with a statement that there is none — the help chapter's own
// block template suggests exactly that ("Creator: <spoken line or voiceover, or "(No dialogue)">").
// Sent through as a line, the writer would put "(No dialogue)" in the beat as something spoken.
const NO_LINE_RE = /^\s*(?:-+|n\/?a|none|no\s*(?:vo|voice\s*-?\s*over|dialogue)\b.*)\s*\.?\s*$/i;

/**
 * One shot's spoken line as the writer should see it: trimmed, and empty when the script states
 * there is none. Surrounding brackets are stripped first, because a script writes the absence as
 * "(No dialogue)" as often as it writes it bare.
 */
export function spokenLineForWriter(line: string | undefined): string {
  const trimmed = (line ?? "").trim().replace(/^\((.*)\)$/s, "$1").trim();
  return NO_LINE_RE.test(trimmed) ? "" : trimmed;
}
```

- [ ] **Step 4: Print the line in the shot's block**

In the same file, in `buildMultishotUserTurn`, delete the whole voiceover block — this comment and `if`:

```ts
  // The lines the video speaks. Every multishot model gets them written into its beats (the
  // writers' shared VOICEOVER rule): which beat each line lands in is the writer's call from the
  // shot texts and lengths. Whether a given model renders the speech, and how, is the video
  // request's concern (audio params, lip-sync), not something the prompt withholds.
  const vo = (args.voiceover ?? "").trim();
  if (vo) {
    blocks.push(
      `The script's voiceover — spoken in the video. Write each line, verbatim, into the beat where ` +
        `it is spoken (see VOICEOVER); every line must appear exactly once:\n${vo}`,
    );
  }
```

Delete the `voiceover?: string;` argument and its `/** BUG-009 … */` comment from the parameter type of `buildMultishotUserTurn`. Then change the shot-block builder from:

```ts
      const steer = (args.cutInstructions[cut.id] ?? "").trim();
      if (steer) lines.push(`  Operator instruction for THIS shot: ${steer}`);
      return lines.join("\n");
```

to:

```ts
      // The line goes WITH its shot, never in a list of its own: a reel-wide list is what made
      // the writer choose which beat each line belonged to, and choose wrong.
      const spoken = spokenLineForWriter(cut.voiceover);
      if (spoken) lines.push(`  Spoken over this shot: "${spoken}"`);
      const steer = (args.cutInstructions[cut.id] ?? "").trim();
      if (steer) lines.push(`  Operator instruction for THIS shot: ${steer}`);
      return lines.join("\n");
```

- [ ] **Step 5: Stop resolving a reel-level voiceover**

In the same file, delete the `voiceover: string;` field and its `/** BUG-009 … */` comment from `ResolvedMultishotInputs`, and in `resolveMultishotPromptInputs` delete:

```ts
  const voiceover = voiceoverForWriter(
    typeof script?.voiceover === "string" ? script.voiceover : undefined,
  );
```

and the `voiceover,` entry from the returned object.

In `src/app/api/nodes/[id]/multishot-prompt/route.ts`, delete the line `        voiceover: resolved.voiceover,` from the `buildMultishotUserTurn({ … })` call.

- [ ] **Step 6: Fix the route test's fixtures**

In `src/app/api/nodes/[id]/multishot-prompt/route.test.ts`, delete every `voiceover: "",` line from the `resolveMultishotPromptInputs` mock return values (one in the `vi.mock` factory near line 59, and the per-test overrides near lines 247, 267 and 294 — search the file for `voiceover` and remove each occurrence).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/resolve-multishot.test.ts "src/app/api/nodes/[id]/multishot-prompt/route.test.ts"`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: errors ONLY in `src/lib/nodes/node-output.ts` and `src/components/nodes/script-document.tsx` (Task 5).

- [ ] **Step 9: Commit**

```bash
git add src/lib/nodes/resolve-inputs.ts "src/app/api/nodes/[id]/multishot-prompt/route.ts" src/lib/nodes/__tests__/resolve-multishot.test.ts "src/app/api/nodes/[id]/multishot-prompt/route.test.ts"
git commit -m "$(cat <<'EOF'
fix(multishot): each shot's line travels in that shot's block

The turn used to carry the whole reel's voiceover under "every line must
appear exactly once". On a one-shot CLIP 1 node that is unsatisfiable - six
lines, one beat - so the writer kept one and dropped five. Now the line prints
inside its own shot's block, and a shot with no line says nothing.

voiceoverForWriter becomes spokenLineForWriter, and also absorbs the bracketed
absences the help template suggests ("(No dialogue)").

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The writers place the line they are given

**Files:**
- Modify: `src/prompts/multishot-prompt-generate.ts` (`MULTISHOT_PROMPT_ID` line 21, `voiceoverRules` ~line 181-206)
- Modify: `src/prompts/multishot-prompt-kling.ts` (`MULTISHOT_KLING_PROMPT_ID` line 26)
- Modify: `src/prompts/multishot-prompt-seedance.ts` (`MULTISHOT_SEEDANCE_PROMPT_ID` line 30)
- Test: `src/prompts/__tests__/multishot-prompt-generate.test.ts`

**Interfaces:**
- Consumes: the user-turn line format from Task 3 — `  Spoken over this shot: "…"`.
- Produces: `voiceoverRules(lineForm: string): string` (signature unchanged); ids `multishot-prompt-generate@9`, `multishot-prompt-kling@6`, `multishot-prompt-seedance@6`.

- [ ] **Step 1: Write the failing test**

In `src/prompts/__tests__/multishot-prompt-generate.test.ts`, replace the body of the `it("is in every writer's system prompt, asking for verbatim lines in the beat they are spoken over", …)` test with:

```ts
    for (const m of MULTISHOT_MODELS) {
      const system = multishotPromptFor(m.id).system;
      expect(system, m.label).toContain("VOICEOVER");
      expect(system, m.label).toMatch(/VERBATIM/);
      // The writer is GIVEN the line with its shot; it no longer decides which beat a line
      // belongs to — that judgement is what put CLIP 6's CTA in CLIP 1's beat.
      expect(system, m.label).toMatch(/Spoken over this shot/);
      expect(system, m.label).toMatch(/never move it to another shot/i);
      expect(system, m.label).not.toMatch(/beat where it is spoken/);
      expect(system, m.label).not.toMatch(/no line is dropped/);
      expect(system, m.label).not.toMatch(/do not quote/i);
    }
```

and rename that test to `it("tells every writer to place the line given with the shot, verbatim", …)`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/prompts/__tests__/multishot-prompt-generate.test.ts`
Expected: FAIL — the system prompts still say "beat where it is spoken" and "no line is dropped".

- [ ] **Step 3: Rewrite the shared rule**

In `src/prompts/multishot-prompt-generate.ts`, replace the body of `voiceoverRules` (the template literal only — leave the function signature and its doc comment's first paragraph in place) with:

```ts
  return `VOICEOVER
A shot that has a spoken line comes with it, on its own line: \`Spoken over this shot: "…"\`. Write
that line into THAT shot's beat, VERBATIM — never paraphrased, shortened, reordered or re-punctuated.
It belongs to the shot it was given with: never move it to another shot, never borrow a line from a
shot it was not given with, and never invent one. A shot given no line carries no spoken line, and
its beat is silent. If the shot text names who speaks, it is that person's line; otherwise it is
off-screen narration. Do not put the line on screen as text.

Write a spoken line as: ${lineForm}`;
```

Update the doc comment above `voiceoverRules`: replace the final paragraph, which currently starts "The WHAT is the same everywhere and is not restricted per model: every line of the script's voiceover is written, verbatim, into the beat it is spoken over.", with:

```
 * The WHAT is the same everywhere and is not restricted per model: the line a shot is GIVEN is
 * written into that shot's beat, verbatim. The writer no longer decides which beat a line belongs
 * to — it used to receive the whole reel's voiceover and an order that every line appear exactly
 * once, which on a one-shot node is unsatisfiable: it kept one line, dropped five, and put CLIP 6's
 * "read the reviews — link in bio" CTA into CLIP 1's kitchen beat. Attribution now happens in the
 * parse (script-parse v8) and travels on the cut.
```

- [ ] **Step 4: Bump the three ids**

In `src/prompts/multishot-prompt-generate.ts`, change line 21 to:

```ts
export const MULTISHOT_PROMPT_ID = "multishot-prompt-generate@9";
```

and add this line to the version comment block above it:

```ts
// @9: the writer places the line GIVEN with each shot; the reel-wide voiceover block is gone.
```

In `src/prompts/multishot-prompt-kling.ts`, change `MULTISHOT_KLING_PROMPT_ID` to `"multishot-prompt-kling@6"` and add the comment line:

```ts
// @6: the writer places the line given with each shot, not one it chooses.
```

In `src/prompts/multishot-prompt-seedance.ts`, change `MULTISHOT_SEEDANCE_PROMPT_ID` to `"multishot-prompt-seedance@6"` and add the same comment line, worded for that file:

```ts
// @6: the writer places the line given with each shot, not one it chooses.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/prompts`
Expected: PASS. If another test in that directory asserts an old prompt id string, update it to the new id.

- [ ] **Step 6: Typecheck and run the multishot route suite**

Run: `npx tsc --noEmit -p .`
Expected: only the Task 5 errors (`node-output.ts`, `script-document.tsx`).

Run: `npx vitest run "src/app/api/nodes/[id]/multishot-prompt/route.test.ts"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/prompts/multishot-prompt-generate.ts src/prompts/multishot-prompt-kling.ts src/prompts/multishot-prompt-seedance.ts src/prompts/__tests__/multishot-prompt-generate.test.ts
git commit -m "$(cat <<'EOF'
feat(multishot-prompt): the writer places the line it is given

The shared VOICEOVER rule no longer asks the writer to judge which beat a line
belongs in - it writes the line handed to it with that shot, verbatim, and
leaves a shot with no line silent. All three ids bump.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The shot row is where a line is read and edited

**Files:**
- Modify: `src/components/nodes/script-document.tsx` (shot row ~line 156-170, "Add shot" default ~line 190, `Section label="Voiceover"` ~line 255-263)
- Modify: `src/lib/nodes/node-output.ts:118`
- Test: `src/lib/nodes/node-output.test.ts`

**Interfaces:**
- Consumes: `ReelShot.voiceover` (Task 2).
- Produces: no new exports. `renderScriptAsText` renders a `Voiceover:` line built from the shots' lines.

- [ ] **Step 1: Write the failing test**

In `src/lib/nodes/node-output.test.ts`, find the existing assertion that a reel-level `voiceover` is rendered and replace that test with:

```ts
  // The shot row is the only home for a spoken line, so the reel's voiceover is the join of them.
  it("renders the Voiceover line from the shots' own lines", () => {
    const text = renderScriptAsText({
      visual_script: {
        shots: [
          { description: "she takes the pack", duration_seconds: 6, voiceover: "Part of my cooking now." },
          { description: "she pours the batter", duration_seconds: 4, voiceover: "" },
          { description: "rotis into the box", duration_seconds: 5, voiceover: "The same rotis I pack." },
        ],
      },
    });
    expect(text).toContain("Voiceover: Part of my cooking now. The same rotis I pack.");
  });

  it("omits the Voiceover line when no shot has one", () => {
    const text = renderScriptAsText({
      visual_script: { shots: [{ description: "a", duration_seconds: 3 }] },
    });
    expect(text).not.toMatch(/Voiceover/);
  });
```

Then fix the file's two existing fixtures, which both carry a reel-level `voiceover`. In the
`getNodeOutput` fixture inside "renders a shot node as the shot's visual description + production
medium only (D23)" (~line 17), delete `          voiceover: "Soothing narration",` and put the line
on the shot instead:

```ts
          visual_script: {
            shots: [
              {
                description: "Turmeric root, side-lit on marble",
                duration: "3s",
                voiceover: "Soothing narration",
              },
            ],
          },
```

Do the same to the `const script` fixture in the `renderShotContext` describe (~line 121-127):
delete its `voiceover: "Soothing narration",` line and give its single shot
`voiceover: "Soothing narration"`. Both existing assertions then keep their meaning — "minimal mode"
still expects `not.toContain("Soothing narration")`, and "full mode" still expects
`toContain("Voiceover: Soothing narration")`, now rendered from the shot.

Also fix `src/lib/nodes/__tests__/render-shot-for-video.test.ts`: in its `script` fixture, delete
`  voiceover: "No voiceover",` and give the single shot `voiceover: "No voiceover"`. Its
`expect(out).not.toContain("No voiceover")` assertion becomes meaningful again — the single-take
lane must not leak a shot's spoken line into a motion prompt.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/nodes/node-output.test.ts`
Expected: FAIL — no `Voiceover:` line is rendered (and a TS error on any leftover reel-level `voiceover` fixture).

- [ ] **Step 3: Render it from the shots**

In `src/lib/nodes/node-output.ts`, replace:

```ts
  push("Voiceover", script.voiceover);
```

with:

```ts
  // Joined from the shots — the shot row is the only home for a spoken line (script-parse v8).
  push(
    "Voiceover",
    shots
      .map((s) => (s.voiceover ?? "").trim())
      .filter(Boolean)
      .join(" "),
  );
```

(`shots` is already in scope from the `const shots = script.visual_script?.shots ?? [];` above.)

- [ ] **Step 4: Put the field on the shot row**

In `src/components/nodes/script-document.tsx`, inside the shot `<li>`, after the `duration` `EditableField` and still inside the same `<div className="flex-1">`, add:

```tsx
                      <EditableField
                        value={shots[i]?.voiceover ?? ""}
                        onCommit={set(["visual_script", "shots", i, "voiceover"])}
                        readOnly={readOnly}
                        multiline
                        placeholder="Spoken line…"
                        className="text-xs"
                      />
```

Change the "Add shot" default object so a new row has the field:

```tsx
            onClick={() =>
              onAddItem?.(["visual_script", "shots"], {
                description: "",
                duration: "",
                voiceover: "",
              })
            }
```

- [ ] **Step 5: Delete the reel-level Voiceover section**

In the same file, delete this whole block:

```tsx
      <Section label="Voiceover">
        <EditableField
          value={script.voiceover ?? ""}
          onCommit={set(["voiceover"])}
          readOnly={readOnly}
          multiline
          placeholder="Add voiceover…"
        />
      </Section>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nodes/node-output.test.ts src/lib/nodes/__tests__/render-shot-for-video.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit -p .`
Expected: clean, no errors anywhere.

Run: `npx eslint src/components/nodes/script-document.tsx src/lib/nodes/node-output.ts`
Expected: no new errors (pre-existing warnings in these files are fine).

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/script-document.tsx src/lib/nodes/node-output.ts src/lib/nodes/node-output.test.ts src/lib/nodes/__tests__/render-shot-for-video.test.ts
git commit -m "$(cat <<'EOF'
feat(script): the spoken line is edited on the shot row

The reel-level Voiceover box is gone - a second copy of the same words drifts
the moment either is edited. Each shot row carries its own line, and the
Script node's rendered text joins them for the Voiceover section.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Record the decision and verify the whole path

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, append after the last D-entry)
- Modify: `src/prompts/script-parse.ts` (market-signal wording, `signalModes.rewrite` ~line 163)

**Interfaces:**
- Consumes: everything above. Produces no code exports.

- [ ] **Step 1: Reword the market-signal instruction**

In `src/prompts/script-parse.ts`, in `signalModes.rewrite`, the sentence listing what a full rewrite must adapt currently reads "Rewrite the thumbnail hook, the on-screen text (intro, every body line, outro), the voiceover where the script has one, and the caption…". Change "the voiceover where the script has one" to:

```
each shot's own spoken line where the script has one
```

- [ ] **Step 2: Run the parse tests**

Run: `npx vitest run src/prompts src/lib/nodes/__tests__/compile-script.test.ts`
Expected: PASS. If a signal-mode test asserts the old wording, update the assertion to the new sentence.

- [ ] **Step 3: Append the ADR**

Append to §7 of `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`, after the last `### D` entry in the file:

```markdown
### D275 — A spoken line belongs to its shot, not to the reel *(recorded 2026-09-22)*

**Decision.** `ReelShot.voiceover` is the ONLY home for a spoken line (script-parse v8). The
reel-level `ReelScript.voiceover` field is deleted. `cutsFromShots` copies the line onto
`MultishotCut`, `shotsFromCuts` copies it back, and `buildMultishotUserTurn` prints it inside that
shot's own block (`Spoken over this shot: "…"`). The writers' shared VOICEOVER rule changes from
judging which beat a line belongs in to writing the line it is given, verbatim, and leaving a
lineless shot silent. Attribution — including "a clip's one line goes to that clip's first shot" —
happens once, in the parse.

**Why.** The script binds each line to a clip; the parser concatenated them into one string, and the
cut ladder had nowhere to keep one. A Multishot node holding CLIP 1 (one 6s shot) therefore received
the whole reel's voiceover under "every line must appear exactly once" — six lines, ~40 seconds of
speech, one beat. Unsatisfiable, so the writer kept one line and dropped five: on one run CLIP 6's
"read the reviews — link in bio" CTA landed in CLIP 1's kitchen beat, and the shot's own action
("reaches to the shelf, takes the pack") was traded away to make room for it, breaking
MULTISHOT_SHOT_TEXT_CONTRACT. The binding existed in the script and was discarded two steps before
the writer saw it.

**Rejected.** Keeping the reel-level field alongside a per-shot one (two copies of the same words,
drifting on the first edit of either); a clip-level line map with the node resolving its own clip (an
extra lookup for the same answer, and the cut ladder still could not show the operator which line a
shot speaks); estimating speakable seconds and trimming the list to what the ladder can carry (it
treats the symptom — the writer would still be choosing).

**Not migrated.** Scripts parsed before v8 have no per-shot line and show none until re-parsed; the
operator accepted that rather than pay for a migration.

**Originated →** `docs/superpowers/specs/2026-09-22-per-shot-voiceover-design.md`.
```

- [ ] **Step 4: Verify the whole path**

Run: `npx tsc --noEmit -p .`
Expected: clean.

Run: `npx vitest run src/lib/nodes src/prompts "src/app/api/nodes/[id]/multishot-prompt/route.test.ts" src/lib/video-gen`
Expected: PASS, all suites.

Run: `git grep -n "script\.voiceover\|voiceoverForWriter" -- src`
Expected: no output. Any hit is a reader of the deleted field that was missed.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md src/prompts/script-parse.ts
git commit -m "$(cat <<'EOF'
docs(adr): D275 - a spoken line belongs to its shot, not to the reel

Also rewords the market-signal full-rewrite instruction, which named "the
voiceover" as one field, to name each shot's own line.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Manual check after Task 6

Re-parse the Jackfruit365 "A Day in Her Kitchen" script in the app and confirm:

1. Each shot row in the Script node shows its own creator line, and CLIP 1's shot shows "This has actually just become part of my regular cooking now."
2. There is no reel-level Voiceover box.
3. Fan out, open the Multishot Prompt node for CLIP 1, generate, and confirm the beat speaks that line — not the Amazon CTA — and that the beat still has her reaching for the pack and placing it beside the batter.
