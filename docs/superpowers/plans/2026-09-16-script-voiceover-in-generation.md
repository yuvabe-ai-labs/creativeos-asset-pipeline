# Script Voiceover in Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a script has voiceover, every generation covering a shot with a VO line speaks it verbatim in that model's documented form, with the right lip-sync behaviour; when the script has none, generations follow the script.

**Architecture:**
- **Data.** The script parse maps each VO line to its shot as `VoLine` (`ReelShot.voiceover`). Fan-out carries the lines onto Shot nodes and Multishot cuts, where they are editable.
- **Rendering.** A pure renderer (`src/lib/nodes/voiceover.ts`) emits each line in the target model's dialect (`voDialect` on every video model spec):
  - multishot: inside `renderPlan`, reading the cuts;
  - single-take: in `resolveVideoGenPrompt`, reading the upstream Shot.
  - The paid request and the preview share those functions.
- **Writers.** They receive the lines as context plus one shared performance block, and never write the words.
- **Kling audio.** Kling 3.0 / 3.0 Omni audio defaults to `native` as a primary param.

**Tech Stack:** Next.js App Router, React 19, shadcn/Base UI, Zustand canvas store, OpenAI structured outputs (script parse, writers), Vitest (`npx vitest run <file>`).

**Spec:** `docs/superpowers/specs/2026-09-16-script-voiceover-in-generation-design.md` (ADRs D267, D268).

## Global Constraints

- **`VoLine` shape (verbatim):**
  ```ts
  { text: string; speaker: "narrator" | string; delivery?: string; language?: string }
  ```
  - `speaker === "narrator"` means off-screen; any other value is the on-screen person as the script names them.
  - Empty or whitespace `delivery` / `language` are treated as absent everywhere.
- **Dialect.** `voDialect: "veo" | "gemini-omni" | "kling" | "seedance" | "none"`:
  - Veo 3.1 Lite / Fast / Quality → `veo`
  - Gemini Omni → `gemini-omni`
  - Kling 3.0 and Kling 3.0 Omni → `kling`
  - Kling O1 → `none`
  - Seedance 2.5 → `seedance`
  - Sora → `none`
- **Render templates (exact).** `{d}` = delivery, `{lang}` = language, and a `[…]` part is omitted when its field is absent.

  | dialect | narrator | on-screen |
  |---|---|---|
  | gemini-omni | `Voiceover (off-screen narrator[, {d}][, in {lang}]): "{text}"` | `{speaker}, on screen, says[ in a {d} tone][ in {lang}]: "{text}"` |
  | kling | `An off-screen narrator says[ in a {d} tone][ in {lang}], "{text}"` | `{speaker} says[ in a {d} tone][ in {lang}], "{text}"` |
  | seedance | `Voiceover[ ({d})] in {lang or "English"}: {"{text}"}` | `{speaker} says[ ({d})] in {lang or "English"}: {"{text}"}` |
  | veo | `Narrator (off-screen[, {d}]): "{text}"` | `{speaker} says[ in a {d} tone], "{text}"` |

- **Voice note, once per prompt:**
  - **Narration only** (every line has speaker `narrator`):
    - gemini-omni: `Nobody on screen speaks and there is no lip movement.`
    - kling / seedance / veo: `No one on screen speaks.`
  - **Any on-screen line:**
    - gemini-omni: one `{speaker} speaks on camera with natural lip-sync.` per distinct on-screen speaker, joined by a space;
    - other dialects: no note.
  - **Silence rule (gemini-omni only):** when VO data is present and every list is empty, the note is `No dialogue.`
  - **No VO data** (old parse, no `voiceover` key anywhere): nothing is added for any dialect.
- **Joining.** Several lines on one cut are joined by a single space. VO text is never truncated.
- **Writer never writes the words.** The shared `VO_PERFORMANCE_RULES` text is copied verbatim from Task 5.
- **Kling audio.**
  - `kling30Params` and `kling30OmniParams`: audio default `"native"`, group `"primary"`.
  - `klingO1Params`: default `"off"`, group `"advanced"`.
- **Code conventions.**
  - Controls are shadcn primitives only (`Button`, `EditableField`, `Textarea`…); "Add" affordances are dashed primary chips; Lucide icons at `strokeWidth={1.5}`.
  - Import, don't redefine: templates and helpers live only in `src/lib/nodes/voiceover.ts`; the rules text lives only in `src/prompts/video-prompt-shared.ts`.
- **Workflow.**
  - Run only the tests you touched per task; the full suite has known timeout flakes.
  - Commit after every task; messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
  - Do NOT modify `trigger.config.ts`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/nodes/reel-script.ts` | `VoLine` type; `ReelShot.voiceover` |
| `src/prompts/script-parse.ts` | Shot schema gains `voiceover` items; parse rules; version 7 |
| `src/lib/nodes/voiceover.ts` (+ test) | `voiceoverMappingIssue`, `voDialectFor`, `renderVoLine`, `renderVoiceNote`, `renderCutVoiceover`, `hasVoData`, `describeVoLineForWriter`, `appendSingleTakeVoiceover` |
| `src/lib/nodes/multishot-cuts.ts` | `MultishotCut.voiceover`; `cutsFromShots` / `shotsFromCuts` carry it |
| `src/components/nodes/vo-lines-editor.tsx` | Edit a `VoLine[]` (speaker / text / delivery / language, add / remove) |
| `script-document.tsx`, `multishot-focus-view.tsx`, `shot-node.tsx`, `script-node.tsx` | Mount the editor; Script node mapping warning |
| `src/lib/video-gen/types.ts`, `providers/*.ts`, `client-models.ts` | `voDialect` on every spec |
| `src/lib/nodes/multishot-plan.ts` | `renderPlan` + `checkPlanLimits` render VO |
| `src/lib/video-gen/resolve-prompt.ts`, `video-generate/route.ts`, `upstream-images/route.ts` | Single-take VO; preview parity |
| `src/lib/nodes/resolve-inputs.ts` | Writer inputs (single-take + multishot, Kling room line) |
| `src/prompts/video-prompt-*.ts`, `multishot-prompt-*.ts`, `video-prompt-shared.ts` | `VO_PERFORMANCE_RULES`; Seedance dialogue removal; version bumps |
| `src/app/api/nodes/[id]/multishot-prompt/route.ts` | Pass dialect + room to the user turn |
| `src/lib/video-gen/params/kling.ts` | Audio default + group |

---

### Task 1: VoLine type, parse schema and rules, mapping integrity check

**Files:**
- Modify: `src/lib/nodes/reel-script.ts`
- Modify: `src/prompts/script-parse.ts` (shot item schema ~line 55-67; system "Fields" rules ~line 95-110; `version`)
- Create: `src/lib/nodes/voiceover.ts`
- Test: `src/prompts/__tests__/script-parse-schema.test.ts` (extend), `src/lib/nodes/__tests__/voiceover.test.ts` (create)
- Modify: `docs/superpowers/specs/2026-09-16-script-voiceover-in-generation-design.md` §3.3 (see Step 7)

**Interfaces:**
- Produces:
  - `export type VoLine = { text: string; speaker: string; delivery?: string; language?: string }` and `ReelShot.voiceover?: VoLine[]` in `reel-script.ts`.
  - `export function voiceoverMappingIssue(script: ReelScript | null): string | null` in `voiceover.ts`.

- [ ] **Step 1: Write the failing schema tests** — add to `script-parse-schema.test.ts`, inside `describe("script-parse schema")`. Also change the existing `it("is version 6"…)` to expect 7:

```ts
  it("declares a required voiceover list on every shot, strict-mode shaped", () => {
    expect(shotProps.required).toContain("voiceover");
    expect(shotProps.properties.voiceover).toEqual({
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "speaker", "delivery", "language"],
        properties: {
          text: { type: "string" },
          speaker: { type: "string" },
          delivery: { type: "string" },
          language: { type: "string" },
        },
      },
    });
  });

  it("tells the model to map VO lines to shots verbatim, with narrator as the default speaker", () => {
    expect(scriptParsePrompt.system).toMatch(/verbatim/i);
    expect(scriptParsePrompt.system).toContain('"narrator"');
    expect(scriptParsePrompt.system).toMatch(/timecode/i);
  });

  it("is version 7", () => {
    expect(scriptParsePrompt.version).toBe(7);
  });
```

- [ ] **Step 2: Write the failing integrity-check tests** — create `src/lib/nodes/__tests__/voiceover.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { voiceoverMappingIssue } from "../voiceover";
import type { ReelScript } from "../reel-script";

const script = (voiceover: string, lines: string[][] | null): ReelScript => ({
  voiceover,
  visual_script: {
    shots: (lines ?? [[], []]).map((l, i) => ({
      description: `shot ${i}`,
      ...(lines ? { voiceover: l.map((text) => ({ text, speaker: "narrator" })) } : {}),
    })),
  },
});

describe("voiceoverMappingIssue", () => {
  it("is null when the mapped lines reproduce the reel VO (timecodes and labels ignored)", () => {
    expect(
      voiceoverMappingIssue(
        script('VO (0-2s): "Every day takes you somewhere." 4-8s: "To work." "To chill."', [
          ["Every day takes you somewhere."],
          ["To work.", "To chill."],
        ]),
      ),
    ).toBeNull();
  });

  it("flags a dropped line", () => {
    expect(
      voiceoverMappingIssue(script("Every day takes you somewhere. To work. Step out different.", [
        ["Every day takes you somewhere."],
        ["To work."],
      ])),
    ).toBe("VO mapping dropped or changed a line — re-parse or edit the shot lines.");
  });

  it("flags a changed line", () => {
    expect(
      voiceoverMappingIssue(script("Every day takes you somewhere.", [["Every day takes you anywhere."], []])),
    ).toBe("VO mapping dropped or changed a line — re-parse or edit the shot lines.");
  });

  it("is null for a script with no voiceover and no mapped lines", () => {
    expect(voiceoverMappingIssue(script("None. Let the product carry it.", [[], []]))).toBeNull();
    expect(voiceoverMappingIssue(script("", [[], []]))).toBeNull();
  });

  it("flags lines mapped onto a script that says there is no voiceover", () => {
    expect(voiceoverMappingIssue(script("No voiceover", [["Hello."], []]))).toBe(
      "VO mapping dropped or changed a line — re-parse or edit the shot lines.",
    );
  });

  it("is null for an old parse with no per-shot voiceover key", () => {
    expect(voiceoverMappingIssue(script("Every day takes you somewhere.", null))).toBeNull();
  });

  it("is null for a null script", () => {
    expect(voiceoverMappingIssue(null)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/prompts/__tests__/script-parse-schema.test.ts src/lib/nodes/__tests__/voiceover.test.ts`
Expected: FAIL — `voiceover` not in the schema, version 6, and `../voiceover` unresolved.

- [ ] **Step 4: Add the type** — in `src/lib/nodes/reel-script.ts`, above `ReelShot`:

```ts
/**
 * D267 — one voiceover line, mapped by the script parse to the shot it plays over.
 * `speaker: "narrator"` is off-screen; any other value is the on-screen person as the script names
 * them. `delivery` / `language` are present only when the script states them — an empty string
 * (strict-mode structured outputs return "") means absent everywhere.
 */
export type VoLine = {
  text: string;
  speaker: "narrator" | (string & {});
  delivery?: string;
  language?: string;
};
```

In `ReelShot`, after `duration_seconds`:

```ts
  /**
   * D267 — the VO lines that play over THIS shot, verbatim. Absent on scripts parsed before the
   * field existed (nothing is rendered for them); `[]` means the script gives this shot no line.
   */
  voiceover?: VoLine[];
```

- [ ] **Step 5: Update the parse schema and rules** — in `src/prompts/script-parse.ts`:
  - In the shot item: add `"voiceover"` to `required`, and add to `properties`:

```ts
              voiceover: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["text", "speaker", "delivery", "language"],
                  properties: {
                    text: { type: "string" },
                    speaker: { type: "string" },
                    delivery: { type: "string" },
                    language: { type: "string" },
                  },
                },
              },
```

  - In the system prompt, directly after the `duration_seconds` bullet, add:

```
  - voiceover: the VO lines that play over THIS shot, as [{ text, speaker, delivery, language }].
    - Assign every line of the script's voiceover to exactly one shot: by the script's timecodes when it gives them, otherwise in script order across the shots. Never repeat a line on two shots, never drop one, never invent one.
    - text: the line VERBATIM — the spoken words only, without timecodes, "VO:" labels or quotation marks.
    - speaker: "narrator" for off-screen narration (the default for a voiceover). Use the on-screen person's name or description ONLY when the script puts the line in that person's mouth on camera.
    - delivery: how it is said ("warm, unhurried") only when the script states it; otherwise "".
    - language: the line's language ("English", "Tamil") only when the script states it or the line is plainly not English; otherwise "".
    - A shot with no line gets []. When the script's voiceover is "None" / "No voiceover", every shot gets [].
```

  - Change `version: 6` to `version: 7`. The record's `version` field is near the export; grep `version:` in the file.

- [ ] **Step 6: Write `voiceover.ts` with the integrity check**

```ts
// D267 — script voiceover: the mapping check, and (Task 3) the per-model renderer.
// Pure and browser-safe: the Script node, the renderers and the API routes all import it.
import type { ReelScript, VoLine } from "./reel-script";

export const VO_MAPPING_ISSUE =
  "VO mapping dropped or changed a line — re-parse or edit the shot lines.";

const NO_VO = /^\s*(none|no\s+voice[\s-]?over|n\/a)\b/i;

/** Words only: lower-case, quotes/punctuation stripped, whitespace collapsed. */
function words(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”"'‘’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Timecodes ("0-2s", "0:04–0:08", "4 sec") and speaker labels ("VO:", "Voiceover:", "Narrator:"). */
function stripScaffolding(s: string): string {
  return s
    .replace(/\d{1,2}(:\d{2})?(\.\d+)?\s*[-–]\s*\d{1,2}(:\d{2})?(\.\d+)?\s*(s|sec|secs|seconds)?\b/gi, " ")
    .replace(/\b\d+(\.\d+)?\s*(s|sec|secs|seconds)\b/gi, " ")
    .replace(/\b(vo|voice[\s-]?over|narrator|narration)\b\s*(\([^)]*\))?\s*:?/gi, " ");
}

/**
 * Whether the per-shot lines faithfully reproduce the reel-wide VO. Null when they do, when the
 * script has no VO and nothing was mapped, or when the parse predates per-shot lines.
 *
 * Refines spec §3.3's "joined equals reel VO": real scripts wrap the words in timecodes and labels,
 * so equality would warn on every script. The check is instead:
 * (1) every mapped line appears in the reel VO, in order;
 * (2) after removing the mapped lines and scaffolding, no more than two words remain.
 */
export function voiceoverMappingIssue(script: ReelScript | null): string | null {
  if (!script) return null;
  const shots = script.visual_script?.shots ?? [];
  if (!shots.some((s) => s.voiceover !== undefined)) return null;

  const lines = shots.flatMap((s) => s.voiceover ?? []).map((l) => words(l.text)).filter(Boolean);
  const reelRaw = (script.voiceover ?? "").trim();

  if (!reelRaw || NO_VO.test(reelRaw)) return lines.length === 0 ? null : VO_MAPPING_ISSUE;

  let remaining = words(stripScaffolding(reelRaw));
  let cursor = 0;
  for (const line of lines) {
    const at = remaining.indexOf(line, cursor);
    if (at === -1) return VO_MAPPING_ISSUE;
    remaining = remaining.slice(0, at) + " ".repeat(line.length) + remaining.slice(at + line.length);
    cursor = at + line.length;
  }
  const leftover = remaining.trim().split(/\s+/).filter(Boolean);
  return leftover.length > 2 ? VO_MAPPING_ISSUE : null;
}

export type { VoLine };
```

- [ ] **Step 7: Record the refinement in the spec** — replace spec §3.3's second sentence ("Joins every shot's `text` …" through "…ignoring 'None' / 'No voiceover' / ''.") with:

```
It checks that every mapped line appears in the reel VO in order, and that after removing the
mapped lines, timecodes and "VO:"-style labels no more than two words remain; a script saying
"None" / "No voiceover" must have no mapped lines. (Literal equality would warn on every script,
because scripts wrap the words in timecodes and labels.)
```

- [ ] **Step 8: Run to verify they pass, then type-check**

Run: `npx vitest run src/prompts/__tests__/script-parse-schema.test.ts src/lib/nodes/__tests__/voiceover.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean. If another test asserts the parse version 6 (`grep -rn "version).toBe(6" src`), update it to 7.

- [ ] **Step 9: Commit**

```bash
git add src/lib/nodes/reel-script.ts src/prompts/script-parse.ts src/lib/nodes/voiceover.ts src/lib/nodes/__tests__/voiceover.test.ts src/prompts/__tests__/script-parse-schema.test.ts docs/superpowers/specs/2026-09-16-script-voiceover-in-generation-design.md
git commit -m "feat(script): parse maps each voiceover line to its shot; mapping integrity check

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Cuts and fan-out carry VO; VO line editor on Script, Shot and Multishot; Script warning

**Files:**
- Modify: `src/lib/nodes/multishot-cuts.ts` (`MultishotCut`, `cutsFromShots`, `shotsFromCuts`)
- Create: `src/components/nodes/vo-lines-editor.tsx`
- Modify:
  - `src/components/nodes/script-document.tsx` (shot rows, ~line 150-170)
  - `src/components/nodes/multishot-focus-view.tsx` (cut card, ~line 203-225)
  - `src/components/nodes/shot-node.tsx` (below the description `Textarea`, ~line 103-110)
  - `src/components/nodes/script-node.tsx` (header `status`, ~line 88-95)
- Test: `src/lib/nodes/__tests__/multishot-cuts.test.ts` (extend), `src/lib/canvas-store.test.ts` (extend `fanOutShots`)

**Interfaces:**
- Consumes: `VoLine` (Task 1); `voiceoverMappingIssue` (Task 1).
- Produces: `MultishotCut.voiceover?: VoLine[]`; `VoLinesEditor({ lines, onChange, readOnly? })`.

- [ ] **Step 1: Failing tests** — in `multishot-cuts.test.ts`:

```ts
describe("voiceover round-trip", () => {
  const vo = [{ text: "To work.", speaker: "narrator" }];

  it("cutsFromShots carries each shot's voiceover onto its cut", () => {
    const cuts = cutsFromShots([
      { description: "a", duration_seconds: 2, voiceover: vo },
      { description: "b", duration_seconds: 2, voiceover: [] },
      { description: "c", duration_seconds: 2 },
    ]);
    expect(cuts[0].voiceover).toEqual(vo);
    expect(cuts[1].voiceover).toEqual([]);
    expect("voiceover" in cuts[2]).toBe(false);
  });

  it("shotsFromCuts carries it back", () => {
    const shots = shotsFromCuts([{ id: "x", text: "a", seconds: 2, voiceover: vo }]);
    expect(shots[0].voiceover).toEqual(vo);
  });

  it("resizeCut keeps a cut's voiceover", () => {
    const cap = { minCutSeconds: 1, maxTotalSeconds: 10 } as never;
    const next = resizeCut([{ id: "x", text: "a", seconds: 2, voiceover: vo }], 0, 3, cap);
    expect(next[0].voiceover).toEqual(vo);
  });
});
```

In `canvas-store.test.ts`, inside `describe("fanOutShots")`, mirror the existing "groups consecutive shots into multishot nodes" setup, but give the parsed shots `voiceover: [{ text: "Hi.", speaker: "narrator" }]` on shot 1. Assert that:
- the created Shot node's `script.visual_script.shots[0].voiceover` equals it (single-shot case), and
- a multishot node's `cuts[0].voiceover` equals it (grouped case).

Reuse the existing test's script/parse fixture builder verbatim; read the test first.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-cuts.test.ts src/lib/canvas-store.test.ts`
Expected: FAIL on the new voiceover assertions.

- [ ] **Step 3: Implement cuts** — in `multishot-cuts.ts`:

```ts
import type { ReelShot, VoLine } from "./reel-script"; // extend the existing ReelShot import

export type MultishotCut = {
  id: string;
  text: string;
  seconds: number;
  /** D267 — the VO lines playing over this cut, verbatim; carried from the shot it was built from. */
  voiceover?: VoLine[];
};

export function cutsFromShots(shots: ReelShot[]): MultishotCut[] {
  return shots.map((s) => ({
    ...newCut(s.description ?? "", Math.max(MIN_CUT_SECONDS, Math.round(shotSeconds(s)))),
    ...(s.voiceover !== undefined ? { voiceover: s.voiceover } : {}),
  }));
}

export function shotsFromCuts(cuts: MultishotCut[]): ReelShot[] {
  return cuts.map((c) => ({
    description: c.text,
    duration_seconds: c.seconds,
    ...(c.voiceover !== undefined ? { voiceover: c.voiceover } : {}),
  }));
}
```

Keep the existing doc comments above `cutsFromShots`. Every other mutation (`resizeCut`, `removeCut`, and the focus view's text edit) already spreads `...c`, so voiceover survives. Fan-out copies the parsed shots, so Shot nodes and `cutsFromShots` get it with no store change.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-cuts.test.ts src/lib/canvas-store.test.ts`
Expected: PASS.

- [ ] **Step 5: The editor component** — create `src/components/nodes/vo-lines-editor.tsx`:

```tsx
"use client";

import { Mic, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VoLine } from "@/lib/nodes/reel-script";
import { EditableField } from "./editable-field";

type Props = {
  lines: VoLine[] | undefined;
  onChange: (next: VoLine[]) => void;
  readOnly?: boolean;
};

/**
 * D267 — the voiceover lines playing over one shot or cut. Exactly these words are rendered into
 * the paid prompt (src/lib/nodes/voiceover.ts), so the text is edited verbatim. Speaker "narrator"
 * is off-screen; any other speaker is the on-screen person who says it.
 */
export function VoLinesEditor({ lines, onChange, readOnly = false }: Props) {
  const list = lines ?? [];
  const patch = (i: number, part: Partial<VoLine>) =>
    onChange(list.map((l, j) => (j === i ? { ...l, ...part } : l)));

  if (readOnly && list.length === 0) return null;

  return (
    <div className="grid gap-1.5">
      {list.map((line, i) => (
        <div key={i} className="flex items-start gap-1.5 rounded-md bg-muted/40 px-2 py-1.5">
          <Mic className="mt-0.5 size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <EditableField
              value={line.text}
              onCommit={(text) => patch(i, { text })}
              readOnly={readOnly}
              multiline
              placeholder="Voiceover line…"
              className="text-sm"
            />
            <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <EditableField
                value={line.speaker}
                onCommit={(speaker) => patch(i, { speaker: speaker.trim() || "narrator" })}
                readOnly={readOnly}
                placeholder="narrator"
              />
              <EditableField
                value={line.delivery ?? ""}
                onCommit={(delivery) => patch(i, { delivery })}
                readOnly={readOnly}
                placeholder="delivery"
              />
              <EditableField
                value={line.language ?? ""}
                onCommit={(language) => patch(i, { language })}
                readOnly={readOnly}
                placeholder="language"
              />
            </div>
          </div>
          {!readOnly && (
            <Button
              variant="ghost"
              aria-label="Remove voiceover line"
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              className="nodrag h-auto rounded-md p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="ghost"
          onClick={() => onChange([...list, { text: "", speaker: "narrator" }])}
          className="nodrag h-auto w-fit rounded-md border border-dashed border-primary/40 px-2 py-1 text-xs text-primary hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="size-3.5" strokeWidth={1.5} /> Add VO line
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Mount the editor**

**`script-document.tsx`** — inside the shot `<li>`'s `<div className="flex-1">`, after the duration `EditableField`, add:

```tsx
                      <VoLinesEditor
                        lines={shots[i]?.voiceover}
                        onChange={(next) => onChange?.(["visual_script", "shots", i, "voiceover"], next)}
                        readOnly={readOnly}
                      />
```

Import `VoLinesEditor` from `./vo-lines-editor`. `onChange` already accepts `unknown` values (see `ScriptDocumentProps`).

**`multishot-focus-view.tsx`** — inside the cut card's scrolling `<div className="min-h-0 flex-1 overflow-y-auto pr-0.5">`, after the `EditableField`, add:

```tsx
                      <VoLinesEditor
                        lines={cut.voiceover}
                        onChange={(voiceover) =>
                          onChange(cuts.map((c, j) => (j === i ? { ...c, voiceover } : c)))
                        }
                        readOnly={isReadOnly}
                      />
```

**`shot-node.tsx`** — add a setter next to `setDescription`, then render per shot below the description `Textarea`:

```tsx
  function setShotVoiceover(index: number, voiceover: VoLine[]) {
    const base = d.script ?? {};
    const vs = base.visual_script ?? {};
    const next = (vs.shots ?? []).map((s, i) => (i === index ? { ...s, voiceover } : s));
    updateNodeData(id, { script: { ...base, visual_script: { ...vs, shots: next } } });
  }
```

```tsx
          <div className="nodrag grid gap-1 px-1.5 pt-1">
            {shots.map((s, i) => (
              <VoLinesEditor key={i} lines={s.voiceover} onChange={(next) => setShotVoiceover(i, next)} />
            ))}
          </div>
```

Import `VoLine` (type) from `@/lib/nodes/reel-script` and `VoLinesEditor`.

**`script-node.tsx`** — compute `const voIssue = voiceoverMappingIssue(parsed);`. In the header `status` element, next to the existing status dot, render:

```tsx
            {voIssue && (
              <AlertTriangle className="size-3 text-destructive" strokeWidth={1.5} aria-label={voIssue}>
                <title>{voIssue}</title>
              </AlertTriangle>
            )}
```

Import `AlertTriangle` from `lucide-react` and `voiceoverMappingIssue` from `@/lib/nodes/voiceover`. If the `status` prop is a single element, wrap both in `<div className="flex items-center gap-1">`.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/nodes/vo-lines-editor.tsx src/components/nodes/script-document.tsx src/components/nodes/multishot-focus-view.tsx src/components/nodes/shot-node.tsx src/components/nodes/script-node.tsx`
Expected: clean (pre-existing warnings only).

- [ ] **Step 8: Commit**

```bash
git add src/lib/nodes/multishot-cuts.ts src/lib/nodes/__tests__/multishot-cuts.test.ts src/lib/canvas-store.test.ts src/components/nodes/vo-lines-editor.tsx src/components/nodes/script-document.tsx src/components/nodes/multishot-focus-view.tsx src/components/nodes/shot-node.tsx src/components/nodes/script-node.tsx
git commit -m "feat(script): VO lines ride shots and cuts, editable on Script, Shot and Multishot; mapping warning

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `voDialect` on every model and the per-model renderer

**Files:**
- Modify:
  - `src/lib/video-gen/types.ts` (`VideoGenModelSpec`)
  - `src/lib/video-gen/providers/veo.ts` (3 specs), `gemini-omni.ts`, `kling.ts` (3 specs), `seedance.ts`, `sora.ts`
  - `src/lib/video-gen/client-models.ts` (every entry)
- Modify: `src/lib/nodes/voiceover.ts`
- Test: `src/lib/nodes/__tests__/voiceover.test.ts` (extend), `src/lib/video-gen/__tests__/kling-3-0-omni-registration.test.ts` (extend the existing "every registered model declares how it takes a voice" test)

**Interfaces:**
- Consumes: `VoLine` (Task 1).
- Produces (in `voiceover.ts`):
  - `export type VoDialect = "veo" | "gemini-omni" | "kling" | "seedance" | "none"`
  - `voDialectFor(modelId: string | null | undefined): VoDialect`
  - `renderVoLine(line: VoLine, dialect: VoDialect): string`
  - `renderVoiceNote(lines: VoLine[], dialect: VoDialect, hasData: boolean): string`
  - `renderCutVoiceover(lines: VoLine[] | undefined, dialect: VoDialect): string`
  - `hasVoData(items: Array<{ voiceover?: VoLine[] }>): boolean`
  - `describeVoLineForWriter(line: VoLine): string`
  - `VideoGenModelSpec.voDialect: VoDialect`

- [ ] **Step 1: Failing tests** — append to `voiceover.test.ts`:

```ts
import {
  renderVoLine, renderVoiceNote, renderCutVoiceover, hasVoData, describeVoLineForWriter, voDialectFor,
} from "../voiceover";

const narr = { text: "Every day takes you somewhere.", speaker: "narrator" };
const narrFull = { ...narr, delivery: "warm", language: "English" };
const riya = { text: "Let's go.", speaker: "Riya" };
const riyaFull = { ...riya, delivery: "cheerful", language: "Tamil" };

describe("renderVoLine", () => {
  it("gemini-omni", () => {
    expect(renderVoLine(narr, "gemini-omni")).toBe('Voiceover (off-screen narrator): "Every day takes you somewhere."');
    expect(renderVoLine(narrFull, "gemini-omni")).toBe('Voiceover (off-screen narrator, warm, in English): "Every day takes you somewhere."');
    expect(renderVoLine(riya, "gemini-omni")).toBe('Riya, on screen, says: "Let\'s go."');
    expect(renderVoLine(riyaFull, "gemini-omni")).toBe('Riya, on screen, says in a cheerful tone in Tamil: "Let\'s go."');
  });
  it("kling", () => {
    expect(renderVoLine(narr, "kling")).toBe('An off-screen narrator says, "Every day takes you somewhere."');
    expect(renderVoLine(narrFull, "kling")).toBe('An off-screen narrator says in a warm tone in English, "Every day takes you somewhere."');
    expect(renderVoLine(riyaFull, "kling")).toBe('Riya says in a cheerful tone in Tamil, "Let\'s go."');
  });
  it("seedance always states a language, defaulting to English", () => {
    expect(renderVoLine(narr, "seedance")).toBe('Voiceover in English: {"Every day takes you somewhere."}');
    expect(renderVoLine(riyaFull, "seedance")).toBe('Riya says (cheerful) in Tamil: {"Let\'s go."}');
  });
  it("veo", () => {
    expect(renderVoLine(narrFull, "veo")).toBe('Narrator (off-screen, warm): "Every day takes you somewhere."');
    expect(renderVoLine(riyaFull, "veo")).toBe('Riya says in a cheerful tone, "Let\'s go."');
  });
  it("none renders nothing, and blank delivery/language count as absent", () => {
    expect(renderVoLine(narr, "none")).toBe("");
    expect(renderVoLine({ ...narr, delivery: " ", language: "" }, "veo")).toBe('Narrator (off-screen): "Every day takes you somewhere."');
  });
});

describe("renderVoiceNote", () => {
  it("narration only", () => {
    expect(renderVoiceNote([narr], "gemini-omni", true)).toBe("Nobody on screen speaks and there is no lip movement.");
    expect(renderVoiceNote([narr], "kling", true)).toBe("No one on screen speaks.");
    expect(renderVoiceNote([narr], "seedance", true)).toBe("No one on screen speaks.");
    expect(renderVoiceNote([narr], "veo", true)).toBe("No one on screen speaks.");
  });
  it("on-screen speakers: omni names each once, others add nothing", () => {
    expect(renderVoiceNote([riya, narr, riya, { text: "Hi.", speaker: "Sam" }], "gemini-omni", true)).toBe(
      "Riya speaks on camera with natural lip-sync. Sam speaks on camera with natural lip-sync.",
    );
    expect(renderVoiceNote([riya], "kling", true)).toBe("");
  });
  it("silence: omni says No dialogue only when VO data exists", () => {
    expect(renderVoiceNote([], "gemini-omni", true)).toBe("No dialogue.");
    expect(renderVoiceNote([], "gemini-omni", false)).toBe("");
    expect(renderVoiceNote([], "kling", true)).toBe("");
    expect(renderVoiceNote([narr], "none", true)).toBe("");
  });
});

describe("renderCutVoiceover", () => {
  it("joins several lines with a single space and skips empty text", () => {
    expect(renderCutVoiceover([narr, { text: " ", speaker: "narrator" }, riya], "veo")).toBe(
      'Narrator (off-screen): "Every day takes you somewhere." Riya says, "Let\'s go."',
    );
    expect(renderCutVoiceover(undefined, "veo")).toBe("");
  });
});

describe("hasVoData / describeVoLineForWriter / voDialectFor", () => {
  it("hasVoData is true when any entry carries the key, even empty", () => {
    expect(hasVoData([{}, { voiceover: [] }])).toBe(true);
    expect(hasVoData([{}, {}])).toBe(false);
  });
  it("describes a line for the writer without a dialect", () => {
    expect(describeVoLineForWriter(narrFull)).toBe('narrator (off-screen, warm): "Every day takes you somewhere."');
    expect(describeVoLineForWriter(riya)).toBe('Riya (on screen): "Let\'s go."');
  });
  it("maps model ids to dialects, unknown → none", () => {
    expect(voDialectFor("gemini:gemini-omni-1.1-flash")).toBe("gemini-omni");
    expect(voDialectFor("kling:kling-o1")).toBe("none");
    expect(voDialectFor("nope")).toBe("none");
    expect(voDialectFor(null)).toBe("none");
  });
});
```

In `kling-3-0-omni-registration.test.ts`, inside the existing loop over `videoGenRegistry`, add:

```ts
    expect(["veo", "gemini-omni", "kling", "seedance", "none"]).toContain(spec.voDialect);
    expect(videoGenClientModelMap[id]?.voDialect).toBe(spec.voDialect);
```

and after the loop:

```ts
  expect(videoGenRegistry["kling:kling-o1"].voDialect).toBe("none");
  expect(videoGenRegistry["kling:kling-3-0-omni"].voDialect).toBe("kling");
  expect(videoGenRegistry["veo:veo-3.1-lite"].voDialect).toBe("veo");
  expect(videoGenRegistry["seedance:seedance-2-5"].voDialect).toBe("seedance");
  expect(videoGenRegistry["gemini:gemini-omni-1.1-flash"].voDialect).toBe("gemini-omni");
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/nodes/__tests__/voiceover.test.ts src/lib/video-gen/__tests__/kling-3-0-omni-registration.test.ts`
Expected: FAIL (the renderers are not exported and `voDialect` is undefined).

- [ ] **Step 3: Add `voDialect` to the model specs**
  - In `types.ts`, add after `voiceInput` in `VideoGenModelSpec`:

```ts
  /** D267 — how this model's prompt carries the script's voiceover lines. "none" = the model has no native speech. */
  voDialect: import("@/lib/nodes/voiceover").VoDialect;
```

    (If the inline import type trips lint, use a top-of-file `import type { VoDialect } from "@/lib/nodes/voiceover";`.)
  - Add `voDialect` next to every `voiceInput:` in each spec, using the table in Global Constraints: `veo.ts` ×3 `"veo"`, `gemini-omni.ts` `"gemini-omni"`, `kling.ts` `kling30` / `kling30Omni` `"kling"` and `klingO1` `"none"`, `seedance.ts` `"seedance"`, `sora.ts` `"none"`.
  - Mirror every entry in `client-models.ts`. The compiler lists every missing site.

- [ ] **Step 4: Implement the renderer** — append to `voiceover.ts`:

```ts
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";

export type VoDialect = "veo" | "gemini-omni" | "kling" | "seedance" | "none";

export function voDialectFor(modelId: string | null | undefined): VoDialect {
  return (modelId && videoGenClientModelMap[modelId]?.voDialect) || "none";
}

const present = (s: string | undefined): string => (s ?? "").trim();
const isNarrator = (l: VoLine) => l.speaker.trim().toLowerCase() === "narrator" || !l.speaker.trim();

/** One line, in the target model's documented form (spec §4.2). "" for dialect none or empty text. */
export function renderVoLine(line: VoLine, dialect: VoDialect): string {
  const text = line.text.trim();
  if (!text || dialect === "none") return "";
  const d = present(line.delivery);
  const lang = present(line.language);
  const speaker = line.speaker.trim();

  if (isNarrator(line)) {
    switch (dialect) {
      case "gemini-omni":
        return `Voiceover (off-screen narrator${d ? `, ${d}` : ""}${lang ? `, in ${lang}` : ""}): "${text}"`;
      case "kling":
        return `An off-screen narrator says${d ? ` in a ${d} tone` : ""}${lang ? ` in ${lang}` : ""}, "${text}"`;
      case "seedance":
        return `Voiceover${d ? ` (${d})` : ""} in ${lang || "English"}: {"${text}"}`;
      case "veo":
        return `Narrator (off-screen${d ? `, ${d}` : ""}): "${text}"`;
    }
  }
  switch (dialect) {
    case "gemini-omni":
      return `${speaker}, on screen, says${d ? ` in a ${d} tone` : ""}${lang ? ` in ${lang}` : ""}: "${text}"`;
    case "kling":
      return `${speaker} says${d ? ` in a ${d} tone` : ""}${lang ? ` in ${lang}` : ""}, "${text}"`;
    case "seedance":
      return `${speaker} says${d ? ` (${d})` : ""} in ${lang || "English"}: {"${text}"}`;
    case "veo":
      return `${speaker} says${d ? ` in a ${d} tone` : ""}, "${text}"`;
  }
}

/** Every line on a cut or shot, in order, joined by a single space. */
export function renderCutVoiceover(lines: VoLine[] | undefined, dialect: VoDialect): string {
  return (lines ?? []).map((l) => renderVoLine(l, dialect)).filter(Boolean).join(" ");
}

/**
 * The once-per-prompt rule (spec §4.2). `hasData` = at least one shot/cut carries a `voiceover`
 * key; without it (a pre-D267 parse) nothing is added, not even Omni's `No dialogue.`.
 */
export function renderVoiceNote(lines: VoLine[], dialect: VoDialect, hasData: boolean): string {
  if (dialect === "none" || !hasData) return "";
  const spoken = lines.filter((l) => l.text.trim());
  if (spoken.length === 0) return dialect === "gemini-omni" ? "No dialogue." : "";

  const onScreen = [...new Set(spoken.filter((l) => !isNarrator(l)).map((l) => l.speaker.trim()))];
  if (onScreen.length === 0) {
    return dialect === "gemini-omni"
      ? "Nobody on screen speaks and there is no lip movement."
      : "No one on screen speaks.";
  }
  return dialect === "gemini-omni"
    ? onScreen.map((s) => `${s} speaks on camera with natural lip-sync.`).join(" ")
    : "";
}

export function hasVoData(items: Array<{ voiceover?: VoLine[] }>): boolean {
  return items.some((i) => i.voiceover !== undefined);
}

/** How the WRITER is told about a line — dialect-free, never the rendered form. */
export function describeVoLineForWriter(line: VoLine): string {
  const d = present(line.delivery);
  return isNarrator(line)
    ? `narrator (off-screen${d ? `, ${d}` : ""}): "${line.text.trim()}"`
    : `${line.speaker.trim()} (on screen${d ? `, ${d}` : ""}): "${line.text.trim()}"`;
}
```

Keep the `import type { ReelScript, VoLine } from "./reel-script";` at the top, and move the new `import` of `client-models` to the top with it. `client-models.ts` imports only params and shapes, so there is no cycle.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/nodes/__tests__/voiceover.test.ts src/lib/video-gen/__tests__/kling-3-0-omni-registration.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nodes/voiceover.ts src/lib/nodes/__tests__/voiceover.test.ts src/lib/video-gen/types.ts src/lib/video-gen/providers src/lib/video-gen/client-models.ts src/lib/video-gen/__tests__/kling-3-0-omni-registration.test.ts
git commit -m "feat(video-gen): voDialect on every model and a per-model voiceover renderer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: VO reaches the request — `renderPlan`, `checkPlanLimits`, single-take, preview

**Files:**
- Modify: `src/lib/nodes/multishot-plan.ts` (`renderPlan` ~line 139-212, `withLook` ~118, `checkPlanLimits` ~338)
- Modify: `src/lib/video-gen/resolve-prompt.ts`
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts` (~line 73), `src/app/api/nodes/[id]/upstream-images/route.ts` (~lines 12, 74-90)
- Test: `src/lib/nodes/__tests__/multishot-plan.test.ts` (extend), `src/lib/video-gen/__tests__/resolve-prompt.test.ts` (extend)

**Interfaces:**
- Consumes: `voDialectFor`, `renderCutVoiceover`, `renderVoiceNote`, `hasVoData`, `MultishotCut.voiceover`, `ReelShot.voiceover`.
- Produces:
  - `export function appendSingleTakeVoiceover(prompt: string, shots: Array<{ voiceover?: VoLine[] }>, dialect: VoDialect): string` in `voiceover.ts`
  - `resolveVideoGenPrompt(upstream, fetchUpstream, voDialect?: VoDialect)` — defaults to `"none"`

- [ ] **Step 1: Failing `renderPlan` / limits tests** — append to `multishot-plan.test.ts`:

```ts
describe("renderPlan with voiceover (D267)", () => {
  const narr = { text: "To work.", speaker: "narrator" };
  const voCuts: MultishotCut[] = [
    { id: "c1", text: "keys", seconds: 2, voiceover: [narr] },
    { id: "c2", text: "cab", seconds: 2, voiceover: [] },
    { id: "c3", text: "street", seconds: 4, voiceover: [{ text: "Go; now.", speaker: "Riya" }] },
  ];
  const p = parsePlan(raw(), cuts);
  const plan = (p.ok ? p.plan : null)!;

  it("omni: lines on the beat line, the note after the look", () => {
    expect(renderPlan(plan, voCuts, OMNI)).toBe(
      "Late afternoon, warm low sun.\n\nRiya speaks on camera with natural lip-sync.\n\n" +
        '[0-2s] Tight on a hand lifting keys. Voiceover (off-screen narrator): "To work."\n' +
        "[2-4s] A cab door swings open.\n" +
        '[4-8s] Feet hit the street. Riya, on screen, says: "Go; now."',
    );
  });

  it("omni: No dialogue when every cut carries an empty list", () => {
    const silent = voCuts.map((c) => ({ ...c, voiceover: [] }));
    expect(renderPlan(plan, silent, OMNI)).toContain("\n\nNo dialogue.\n\n[0-2s]");
  });

  it("omni: nothing added for a pre-D267 ladder with no voiceover key", () => {
    expect(renderPlan(plan, cuts, OMNI)).not.toContain("No dialogue");
  });

  it("kling: lines inside the triple, semicolons made safe; no on-screen note", () => {
    const out = renderPlan(plan, voCuts, KLING);
    expect(out).toContain('shot 1, 2, Tight on a hand lifting keys. An off-screen narrator says, "To work.";');
    expect(out).toContain('shot 3, 4, Feet hit the street. Riya says, "Go, now.";');
  });

  it("seedance: lines last in the beat, narration note after the ladder", () => {
    const narrOnly = voCuts.map((c) => (c.id === "c3" ? { ...c, voiceover: [] } : c));
    const out = renderPlan(plan, narrOnly, SEEDANCE);
    expect(out).toContain('0-2s: Tight on a hand lifting keys. Voiceover in English: {"To work."}');
    expect(out.endsWith("\n\nNo one on screen speaks.")).toBe(true);
  });

  it("checkPlanLimits counts the voiceover against the per-beat ceiling and says so", () => {
    const long = { ...plan, beats: plan.beats.map((b) => ({ ...b, text: "x".repeat(480) })) };
    const r = checkPlanLimits(long, voCuts, KLING);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^Shot 1 is \d+ characters including its voiceover line/);
  });
});
```

- [ ] **Step 2: Failing single-take tests** — append to `resolve-prompt.test.ts`:

```ts
describe("resolveVideoGenPrompt single-take voiceover (D267)", () => {
  const vp = output({ nodeId: "vp-1", type: "video-prompt", activeOutput: "Slow dolly in on the product." });
  const shot = (voiceover?: unknown) =>
    output({
      nodeId: "s-1",
      type: "shot",
      data: { script: { visual_script: { shots: [{ description: "a", ...(voiceover ? { voiceover } : {}) }] } } },
    });

  it("appends the rendered lines and the note for the model's dialect", async () => {
    const r = await resolveVideoGenPrompt([vp], async () => [shot([{ text: "Hello.", speaker: "narrator" }])], "veo");
    expect(r.ok && r.prompt).toBe('Slow dolly in on the product.\n\nNarrator (off-screen): "Hello."\nNo one on screen speaks.');
  });

  it("adds No dialogue on Omni when the shot has an empty list", async () => {
    const r = await resolveVideoGenPrompt([vp], async () => [shot([])], "gemini-omni");
    expect(r.ok && r.prompt).toBe("Slow dolly in on the product.\n\nNo dialogue.");
  });

  it("leaves the prompt untouched with no dialect, no data, or dialect none", async () => {
    expect((await resolveVideoGenPrompt([vp], async () => [shot([{ text: "Hi.", speaker: "narrator" }])])).ok && "x").toBe("x");
    const none = await resolveVideoGenPrompt([vp], async () => [shot([{ text: "Hi.", speaker: "narrator" }])], "none");
    expect(none.ok && none.prompt).toBe("Slow dolly in on the product.");
    const old = await resolveVideoGenPrompt([vp], async () => [shot()], "gemini-omni");
    expect(old.ok && old.prompt).toBe("Slow dolly in on the product.");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts src/lib/video-gen/__tests__/resolve-prompt.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 4: `renderPlan` and `checkPlanLimits`** — in `multishot-plan.ts`, import `{ voDialectFor, renderCutVoiceover, renderVoiceNote, hasVoData }` from `./voiceover`, then:

```ts
/** A beat plus the VO lines that play over it — the text a model actually reads for one cut. */
function beatWithVoiceover(beat: string, cut: MultishotCut, cap: MultishotCapability): string {
  const vo = renderCutVoiceover(cut.voiceover, voDialectFor(cap.id));
  return vo ? `${beat.trim()} ${vo}`.trim() : beat.trim();
}

function voiceNoteFor(cuts: MultishotCut[], cap: MultishotCapability): string {
  return renderVoiceNote(cuts.flatMap((c) => c.voiceover ?? []), voDialectFor(cap.id), hasVoData(cuts));
}

/** Blank-line join of the non-empty parts. */
function blocks(...parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join("\n\n");
}
```

Change the three branches of `renderPlan`, and leave the existing comments in place:

- **triple:**
  - Build `text` as `beatWithVoiceover(byId.get(cut.id) ?? "", cut, cap).replace(/;/g, ",")`.
  - Return `blocks(plan.look, voiceNoteFor(cuts, cap), shots)`.
- **bare-timecode:**
  - Each line becomes `` `${from}-${at}s: ${beatWithVoiceover(byId.get(cut.id) ?? "", cut, cap)}` ``.
  - Return `blocks(plan.look, ladder, voiceNoteFor(cuts, cap))`.
- **timecode (Omni):**
  - Each line becomes `` `[${from}-${at}s] ${beatWithVoiceover(byId.get(cut.id) ?? "", cut, cap)}` ``.
  - Return `blocks(plan.look, voiceNoteFor(cuts, cap), ladder)`.

`withLook` becomes unused; delete it. `blocks(look, ladder)` with an empty note reproduces its output exactly, so every existing `renderPlan` test must still pass.

In `checkPlanLimits`, replace the per-cut loop body with:

```ts
      const text = beatWithVoiceover(byId.get(cut.id) ?? "", cut, cap);
      if (text.length > cap.maxCutChars) {
        const withVo = renderCutVoiceover(cut.voiceover, voDialectFor(cap.id)) ? " including its voiceover line" : "";
        return {
          ok: false,
          reason: `Shot ${i + 1} is ${text.length} characters${withVo} · ${cap.label} allows ${cap.maxCutChars}. Shorten it, or rewrite that shot with AI.`,
        };
      }
```

In the whole-prompt reason, append ` (including voiceover lines)` after `characters` when `cuts.some((c) => renderCutVoiceover(c.voiceover, voDialectFor(cap.id)))`.

- [ ] **Step 5: Single-take** — add to `voiceover.ts`:

```ts
/**
 * D267 — the single-take lane: the motion prompt, then the VO lines of every shot the Shot node
 * covers, then the voice note. Unchanged when there is nothing to add.
 */
export function appendSingleTakeVoiceover(
  prompt: string,
  shots: Array<{ voiceover?: VoLine[] }>,
  dialect: VoDialect,
): string {
  const lines = shots.flatMap((s) => s.voiceover ?? []);
  const rendered = lines.map((l) => renderVoLine(l, dialect)).filter(Boolean);
  const note = renderVoiceNote(lines, dialect, hasVoData(shots));
  const tail = [...rendered, note].filter(Boolean).join("\n");
  return tail ? `${prompt.trim()}\n\n${tail}` : prompt;
}
```

In `resolve-prompt.ts`, change the signature to `resolveVideoGenPrompt(upstream, fetchUpstream, voDialect: VoDialect = "none")`. In the `video-prompt` branch, after `promptUpstream` is fetched:

```ts
    const shotNode = promptUpstream.find((u) => u.type === "shot");
    const shots = ((shotNode?.data.script as ReelScript | undefined)?.visual_script?.shots ?? []);
    return {
      ok: true,
      prompt: appendSingleTakeVoiceover(String(promptNode.activeOutput), shots, voDialect),
      promptNode, promptUpstream, cuts: null, targetModel: null,
    };
```

Import `appendSingleTakeVoiceover`, `type VoDialect` from `@/lib/nodes/voiceover`, and `type ReelScript` from `@/lib/nodes/reel-script`. The multishot branch is unchanged: `renderPlan` already derives the dialect from the plan's model.

- [ ] **Step 6: Routes**
  - **`video-generate/route.ts`:** `resolveVideoGenPrompt(upstream, getUpstreamOutputs, config.voDialect)`.
  - **`upstream-images/route.ts`:**
    1. Change the handler to `async (nodeId, node) =>`.
    2. Compute `const voDialect = voDialectFor((node.data as { modelId?: string } | null)?.modelId);`.
    3. In the `video-prompt` branch, replace the raw string with:

```ts
        const ownUpstream = promptNodeIndex >= 0 ? promptUpstreamBatches[promptNodeIndex] : [];
        const shotNode = ownUpstream.find((u) => u.type === "shot");
        const shots = ((shotNode?.data.script as ReelScript | undefined)?.visual_script?.shots ?? []);
        promptText = typeof connectedPromptNode.activeOutput === "string"
          ? appendSingleTakeVoiceover(connectedPromptNode.activeOutput, shots, voDialect)
          : null;
```

    Import `voDialectFor`, `appendSingleTakeVoiceover` and the `ReelScript` type.

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts src/lib/video-gen/__tests__/resolve-prompt.test.ts "src/app/api/nodes/[id]/video-generate" && npx tsc --noEmit`
Expected: PASS, including every pre-existing `renderPlan` and route test; tsc clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/nodes/multishot-plan.ts src/lib/nodes/voiceover.ts src/lib/video-gen/resolve-prompt.ts "src/app/api/nodes/[id]/video-generate/route.ts" "src/app/api/nodes/[id]/upstream-images/route.ts" src/lib/nodes/__tests__/multishot-plan.test.ts src/lib/video-gen/__tests__/resolve-prompt.test.ts
git commit -m "feat(video-gen): script voiceover renders verbatim into every paid prompt, per model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Writers get the lines as context and the shared performance rules

**Files:**
- Modify: `src/prompts/video-prompt-shared.ts` (add `VO_PERFORMANCE_RULES`)
- Modify:
  - `src/prompts/video-prompt-veo.ts`, `video-prompt-kling.ts`, `video-prompt-gemini-omni.ts`, `video-prompt-seedance.ts`
  - `multishot-prompt-generate.ts`, `multishot-prompt-kling.ts`, `multishot-prompt-seedance.ts`
- Modify: `src/lib/nodes/resolve-inputs.ts` (`mapUpstreamForVideo` shot branch; `buildMultishotUserTurn`)
- Modify: `src/app/api/nodes/[id]/multishot-prompt/route.ts` (~line 100)
- Test:
  - `src/lib/nodes/__tests__/map-upstream-for-video.test.ts` and `src/lib/nodes/__tests__/resolve-multishot.test.ts` (extend)
  - a new `src/prompts/__tests__/vo-performance.test.ts`

**Interfaces:**
- Consumes: `describeVoLineForWriter`, `renderCutVoiceover`, `voDialectFor`, `VoDialect`.
- Produces:
  - `export const VO_PERFORMANCE_RULES: string`
  - `buildMultishotUserTurn({... , voDialect?: VoDialect, maxCutChars?: number | null })`

- [ ] **Step 1: Failing tests**

**`src/prompts/__tests__/vo-performance.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { VO_PERFORMANCE_RULES } from "../video-prompt-shared";
import { videoPromptGeneratePrompt } from "../video-prompt-veo";
import { videoPromptGenerateKlingPrompt } from "../video-prompt-kling";
import { videoPromptGenerateGeminiOmniPrompt } from "../video-prompt-gemini-omni";
import { videoPromptGenerateSeedancePrompt } from "../video-prompt-seedance";
import { multishotPromptGenerate } from "../multishot-prompt-generate";
import { multishotPromptKling } from "../multishot-prompt-kling";
import { multishotPromptSeedance } from "../multishot-prompt-seedance";

const systems = {
  veo: videoPromptGeneratePrompt.system,
  kling: videoPromptGenerateKlingPrompt.system,
  omni: videoPromptGenerateGeminiOmniPrompt.system,
  seedance: videoPromptGenerateSeedancePrompt.system,
  msOmni: multishotPromptGenerate().system,
  msKling: multishotPromptKling().system,
  msSeedance: multishotPromptSeedance().system,
};

describe("VO_PERFORMANCE_RULES", () => {
  it("forbids writing the words and covers both speaker kinds", () => {
    expect(VO_PERFORMANCE_RULES).toContain("NEVER write, quote or paraphrase them");
    expect(VO_PERFORMANCE_RULES).toContain("ON SCREEN");
    expect(VO_PERFORMANCE_RULES).toContain("NARRATOR");
  });
  it.each(Object.entries(systems))("%s writer carries the rules verbatim", (_, system) => {
    expect(system).toContain(VO_PERFORMANCE_RULES);
  });
  it("seedance writers no longer ask for {} dialogue", () => {
    expect(systems.seedance).not.toContain("{} for dialogue");
    expect(systems.msSeedance).not.toContain("{} for dialogue");
  });
});
```

(Check the exported name of `multishotPromptGenerate` in `multishot-prompt-generate.ts` line ~367. If it returns `{ id, model, system, schema }` under another export, use that name.)

**`map-upstream-for-video.test.ts`:**

```ts
  it("tells the single-take writer which VO lines play over the shot", () => {
    const u = mapUpstreamForVideo({
      nodeId: "s", versionId: null, type: "shot", activeOutput: null,
      data: { script: { visual_script: { shots: [
        { description: "hands lift keys", voiceover: [{ text: "To work.", speaker: "narrator", delivery: "warm" }] },
      ] } } },
    });
    expect(u.text).toContain('Voiceover on this shot: narrator (off-screen, warm): "To work."');
  });
```

**`resolve-multishot.test.ts`** — mirror the existing "lists every shot with its id, text and seconds" setup:

```ts
  it("lists each cut's VO lines under it, with Kling's remaining room", () => {
    const text = buildMultishotUserTurn({
      clientContext: "", upstream: [], instruction: "", cutInstructions: {},
      cuts: [
        { id: "c1", text: "keys", seconds: 2, voiceover: [{ text: "To work.", speaker: "narrator" }] },
        { id: "c2", text: "cab", seconds: 2, voiceover: [] },
      ],
      voDialect: "kling",
      maxCutChars: 512,
    });
    const rendered = 'An off-screen narrator says, "To work."';
    expect(text).toContain('  Voiceover on this shot: narrator (off-screen): "To work."');
    expect(text).toContain(`  Room for your beat: ${512 - rendered.length - 1} characters (its voiceover takes ${rendered.length + 1} of 512).`);
    expect(text.split("cutId: c2")[1]).not.toContain("Voiceover on this shot");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/prompts/__tests__/vo-performance.test.ts src/lib/nodes/__tests__/map-upstream-for-video.test.ts src/lib/nodes/__tests__/resolve-multishot.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the rules** — in `video-prompt-shared.ts`:

```ts
/**
 * D267 — shared by every writer, single-take and multishot. The script's voiceover words are
 * rendered into the prompt verbatim by src/lib/nodes/voiceover.ts; a writer that also wrote them
 * would duplicate or paraphrase client copy in a paid clip. What a writer CAN do is make the
 * visuals support the line.
 */
export const VO_PERFORMANCE_RULES = `VOICEOVER
When a shot lists voiceover lines, those exact words are added to the prompt after you write it. NEVER write, quote or paraphrase them, and never describe a voice.
- A line spoken by someone ON SCREEN: keep that person's face visible and readable toward the camera while they speak; give them one simple action; nothing covers the mouth; no fast head turns.
- A NARRATOR line: nobody on screen speaks, moves their lips as if talking, or addresses the camera.
- A shot with no voiceover lines: do not describe anyone speaking.`;
```

Re-export it from `video-prompt-generate.ts`'s export list.

- [ ] **Step 4: Put it in every writer and bump versions**
  - `video-prompt-veo.ts`, `video-prompt-kling.ts`, `video-prompt-gemini-omni.ts`: add `\n\n${VO_PERFORMANCE_RULES}` at the end of `system` (after the last block), import it from `./video-prompt-shared`, and increment `version` by 1.
  - `video-prompt-seedance.ts`:
    - Replace the SOUND TAGS body with:

```
Use the vendor's special characters to distinguish sound types: () for music, <> for sound effects,
and 【】 for subtitles. Never write dialogue or voiceover yourself — see VOICEOVER below.
```

    - Append `\n\n${VO_PERFORMANCE_RULES}` before `WORDS TO AVOID`, and increment `version`.
  - `multishot-prompt-generate.ts`:
    - Insert `${VO_PERFORMANCE_RULES}` on its own paragraph after `${MULTISHOT_SHARED_CRAFT}` in `SYSTEM`.
    - Import it from `@/prompts/video-prompt-generate`.
    - Change `MULTISHOT_PROMPT_ID` to `"multishot-prompt-generate@7"` and add the comment `// @7 (D267): voiceover performance rules; the words are rendered, never written.`
  - `multishot-prompt-kling.ts`: the same insertion after `${MULTISHOT_SHARED_CRAFT}`; ID `@4` with the matching comment.
  - `multishot-prompt-seedance.ts`:
    - Same insertion.
    - Replace the sentence `…marked with the vendor's own characters: () for music, <> for sound effects, {} for dialogue, and 【】 for subtitles. For non-Chinese dialogue, state the language before the line.` with `…marked with the vendor's own characters: () for music, <> for sound effects, and 【】 for subtitles. Dialogue and voiceover are added for you — never write them.`
    - Bump its ID `@N` → `@N+1` with the comment.
  - Update any test that pins these ids or versions (`grep -rn "multishot-prompt-generate@6\|kling@3\|seedance@3\|version).toBe" src/prompts src/lib`).

- [ ] **Step 5: Writer inputs** — in `resolve-inputs.ts`, import `describeVoLineForWriter`, `renderCutVoiceover`, `type VoDialect` from `@/lib/nodes/voiceover`.

**`mapUpstreamForVideo` shot branch:**

```ts
  if (u.type === "shot") {
    const script = (u.data.script ?? null) as ReelScript | null;
    const action = renderShotForVideo(script);
    const vo = (script?.visual_script?.shots ?? [])
      .flatMap((s) => s.voiceover ?? [])
      .filter((l) => l.text.trim())
      .map((l) => `Voiceover on this shot: ${describeVoLineForWriter(l)}`);
    const text = action ? [`${action}\n${SINGLE_TAKE_LINE}`, ...vo].join("\n") : vo.join("\n");
    return { ...base, text };
  }
```

**`buildMultishotUserTurn`** — add the args `voDialect?: VoDialect; maxCutChars?: number | null;`. Inside the `cuts.map`, after the `Shot text` line:

```ts
      const voLines = (cut.voiceover ?? []).filter((l) => l.text.trim());
      for (const l of voLines) lines.push(`  Voiceover on this shot: ${describeVoLineForWriter(l)}`);
      const rendered = args.voDialect ? renderCutVoiceover(cut.voiceover, args.voDialect) : "";
      if (rendered && args.maxCutChars) {
        const takes = rendered.length + 1; // the joining space before the lines
        lines.push(`  Room for your beat: ${Math.max(0, args.maxCutChars - takes)} characters (its voiceover takes ${takes} of ${args.maxCutChars}).`);
      }
```

**`multishot-prompt/route.ts`** — compute `const writerCap = multishotCapabilityFor(resolved.targetModel);` before `buildMultishotUserTurn`, and pass `voDialect: voDialectFor(writerCap.id), maxCutChars: writerCap.maxCutChars`. Import `voDialectFor`.

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/prompts src/lib/nodes/__tests__/map-upstream-for-video.test.ts src/lib/nodes/__tests__/resolve-multishot.test.ts src/lib/nodes/__tests__/video-prompt.test.ts "src/app/api/nodes/[id]/multishot-prompt" && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/prompts src/lib/nodes/resolve-inputs.ts "src/app/api/nodes/[id]/multishot-prompt/route.ts" src/lib/nodes/__tests__/map-upstream-for-video.test.ts src/lib/nodes/__tests__/resolve-multishot.test.ts
git commit -m "feat(prompts): writers see each shot's VO lines and shared performance rules, never the words to write

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Kling 3.0 / 3.0 Omni audio defaults to native as a primary param

**Files:**
- Modify: `src/lib/video-gen/params/kling.ts` (`audioParam` ~line 55-76, the three param lists ~144-190)
- Test: `src/lib/video-gen/__tests__/kling-params.test.ts` (extend or update)

**Interfaces:**
- Produces: `audioParam(options: string[], defaultValue: string, group: ParamGroup)`.

- [ ] **Step 1: Failing test** — add to `kling-params.test.ts`:

```ts
import { kling30Params, kling30OmniParams, klingO1Params } from "../params/kling";

describe("Kling audio (D268)", () => {
  const audio = (params: typeof kling30Params) => params.find((p) => p.name === "audio")!;
  it("3.0 and 3.0 Omni default to native, as a primary param", () => {
    for (const p of [kling30Params, kling30OmniParams]) {
      expect(audio(p).defaultValue).toBe("native");
      expect(audio(p).group).toBe("primary");
    }
  });
  it("O1 stays off and advanced — it has no native audio", () => {
    expect(audio(klingO1Params).defaultValue).toBe("off");
    expect(audio(klingO1Params).group).toBe("advanced");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/video-gen/__tests__/kling-params.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Change `audioParam` to take `group: ParamGroup` (import the type from `@/lib/image-gen/types`) and use `group`. Then:
- `kling30Params`: `audioParam(["native", "off"], "native", "primary")`
- `kling30OmniParams`: `audioParam(["native", "off"], "native", "primary")`
- `klingO1Params`: `audioParam(["native", "off"], "off", "advanced")`

Replace the comment block above `audioParam` with:

```ts
// D268 — on Kling 3.0 and 3.0 Omni, sound is a primary choice and on by default: both generate
// native dialogue, ambience and lip movement, and with D267 their prompts carry the script's
// voiceover, which an "off" default would silence. It costs more (+33% at 720p / +25% at 1080p on
// 3.0 Omni, cost.ts) and the estimate shows it. O1 stays off and advanced: Kling's own guide lists
// "VIDEO O1: No Native Audio".
```

- [ ] **Step 4: Run the affected tests**

Run: `npx vitest run src/lib/video-gen/__tests__/kling-params.test.ts src/lib/video-gen/__tests__/cost.test.ts src/lib/video-gen/__tests__/kling-provider.test.ts src/lib/video-gen/__tests__/kling-3-0-omni-registration.test.ts "src/app/api/nodes/[id]/video-generate" && npx tsc --noEmit`
Expected: PASS. If a test pinned `audio: "off"` as the resolved default for 3.0 or 3.0 Omni, update it to `"native"` and note the file in the commit body.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/params/kling.ts src/lib/video-gen/__tests__
git commit -m "feat(kling): 3.0 and 3.0 Omni audio defaults to native as a primary param

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Touched suites**

Run: `npx vitest run src/lib/nodes src/lib/video-gen src/prompts src/lib/canvas-store.test.ts "src/app/api/nodes/[id]/video-generate" "src/app/api/nodes/[id]/multishot-prompt" && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 2: Manual check (needs a browser and API keys; report honestly if not performed)**

1. Re-parse a script with VO, such as the Chupps reference script.
2. Each shot shows its VO lines, and the Script node shows no warning.
3. Fan out to a Multishot node on Gemini Omni and generate its prompt. The "what will be sent" preview shows `Voiceover (off-screen narrator): "…"` on the right beats and the no-lip-movement note.
4. Switch a sibling to Kling 3.0 Omni. Audio shows `native` in the main params; the beats carry `An off-screen narrator says, "…"`.
5. On a script whose VO is "None", an Omni plan ends its note with `No dialogue.`

- [ ] **Step 3: Commit** any test-fixture fixes found in Step 1 with `test: …` messages; there is otherwise nothing to commit.

---

## Self-review notes

- **Spec coverage:**
  - §3.1–3.2 → Task 1.
  - §3.3 → Task 1, including a recorded refinement: literal equality would warn on every real script.
  - §3.4–3.5 → Task 2.
  - §3.6 → `hasVoData` in Tasks 3–4.
  - §4.1–4.2 → Task 3.
  - §4.3–4.5 → Task 4.
  - §5 → Task 5.
  - §6 → Task 6.
  - §7 → Tasks 1, 4.
  - §8 → per-task tests.
  - §9 → task order.
- **Deviation recorded in Task 1 Step 7:** the integrity check matches words in order rather than requiring literal equality.
- **Type consistency:**
  - `VoLine`, `VoDialect`, `renderVoLine(line, dialect)`, `renderVoiceNote(lines, dialect, hasData)`, `renderCutVoiceover(lines, dialect)`, `hasVoData(items)`, `describeVoLineForWriter(line)` and `appendSingleTakeVoiceover(prompt, shots, dialect)` are defined in Tasks 1/3/4 and used with the same signatures in Tasks 4/5.
  - `voDialect` is the `VideoGenModelSpec` field name everywhere.
