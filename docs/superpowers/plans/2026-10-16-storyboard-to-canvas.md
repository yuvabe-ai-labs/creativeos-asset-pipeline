# Storyboard → Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An approved script's storyboard panels follow it onto the canvas: shots are named (S1, S2…) in the text, the parse keeps those names, Fan out wires each shot's approved panel into its Shot or Multishot node, and the gallery's References tab shows the whole storyboard.

**Architecture:** The shot name is the key, and it lives *in the script text*, so it survives edits. `printScript` writes a Shot column; the parse returns each row's `label`. When the script is added, the server hands over the approved panels (from the latest = approved review version), labelled by the script's own order. The Script node stores them, frozen (`ScriptNodeData.storyboard`). Fan out matches each new node's rows to panels by label and adds a File node per panel, wired into the node's `image` handle. The gallery reads the same field from the canvas's Script nodes.

**Tech Stack:** Next.js (App Router), React Flow (`@xyflow/react`), Zustand canvas store, Supabase, OpenAI structured outputs (`gpt-5.4-mini`, strict JSON schema), Vitest.

**Spec:** [docs/superpowers/specs/2026-10-16-storyboard-to-canvas-design.md](../specs/2026-10-16-storyboard-to-canvas-design.md)

## Global Constraints

- Shot names are `S1`, `S2`… in the script's order (spec A1). Built only with `shotLabel(index)`; never written inline.
- "The panel" is always the one in the version the client approved. Never the live `script_panel_picks`.
- Auto-wiring stops at the Shot / Multishot node. Nothing is wired into prompt, Image Gen, Composite, video prompt or Video Gen.
- A panel on a Multishot node feeds nothing (spec §3). The multishot prompt and Video Gen must not read it.
- A panel's canvas title is `"S3 · HOOK — storyboard"` (spec A4), built only by `panelTitle()`.
- The Storyboard group shows even when no Drive folder is linked (spec A2): one group per Script node, named by its title (A3).
- Panels attach only to shot nodes Fan out creates in that run (A5).
- User-facing copy says "storyboard panel" / "Storyboard". Never "sketch" (the canvas's name for Draw nodes).
- Controls are shadcn primitives from `src/components/ui/*` only. Colours come from CSS variables, icons are Lucide at 1.5 stroke, and labels use `.text-eyebrow` (AGENTS.md).
- ADRs D380–D383, appended to §7 of `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`.
- Run all commands from the worktree root `.claude/worktrees/storyboard-to-canvas`.

## Review Focus

1. **A re-parse returns a row with a missing, changed or lower-case name** (`""`, `"s3 "`, `"Shot 3"`). The row gets no panel, or the right one by case-/space-insensitive match. It must never crash or attach the wrong one. *Pinned in Task 3 (`panelForRow`) and Task 6 (fan-out with an unnamed row).*
2. **A Script node from before this change, or with an older (v11) parse that has no `label` on any row.** Fan out behaves exactly as today: no panels, row pitch 170. *Pinned in Task 6.*
3. **One generation covering several rows** (grouping v1/v2, or a merged single take). One panel per covered row, never two for the same shot. *Pinned in Task 6.*
4. **An approved script whose latest version froze no panels, or that has no review at all** (approved before panels existed). The storyboard is `[]`, the node gets no `storyboard` key, and the gallery shows no group. *Pinned in Task 3 (server loader) and Task 4.*
5. **Deleting a panel's File node** must not delete the panel image under `clients/{c}/scripts/{s}/panels/…`. *Pinned in Task 6 with a `removeNodeFileObject` test.*

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/scripts/storyboard.ts` (new) | Pure: `shotLabel`, `StoryboardPanel`/`ScriptStoryboard` types, `storyboardFor`, `panelTitle`, `panelForRow` |
| `src/lib/scripts/storyboard-server.ts` (new) | Server: `loadApprovedStoryboard(script)` from the latest review version |
| `src/lib/scripts/storyboard-canvas.ts` (new) | Pure: `storyboardPanelNodes(created, rows, panels)` → File nodes + `image` edges; layout constants |
| `src/lib/scripts/print.ts` | Adds the Shot column |
| `src/prompts/script-parse.ts` | `label` per row, named-shot rule, v12 |
| `src/lib/nodes/reel-script.ts` | `ReelShot.label` |
| `src/app/api/clients/[id]/scripts/[scriptId]/route.ts` | GET also returns `storyboard` |
| `src/services/scripts.service.ts` | `get` return type gains `storyboard` |
| `src/lib/scripts/add-to-canvas.ts` | Puts `storyboard` on the Script node |
| `src/lib/canvas-nodes.ts` | `ScriptNodeData.storyboard`; images may connect to `multishot` |
| `src/components/nodes/multishot-node.tsx` | `image` target handle |
| `src/lib/canvas-store.ts` | `fanOutShots` attaches panels and widens the pitch |
| `src/components/canvas/gallery-drawer/storyboard-images.ts` (new) | Pure: `storyboardGroups(nodes)` |
| `src/components/canvas/gallery-drawer/gallery-storyboard.tsx` (new) | The Storyboard group(s) UI |
| `src/components/canvas/gallery-drawer/gallery-image-title.ts` (new) | `galleryImageTitle(image)` (moves `stripExtension` out of the hook) |
| `src/components/canvas/gallery-drawer/types.ts` | `source: "storyboard"` |
| `src/components/canvas/gallery-drawer/gallery-drawer.tsx` | Renders the group in References; includes its images in select/preview |
| `src/hooks/use-gallery-drawer.ts` | Uses `galleryImageTitle` |
| `scripts/probe-shot-names.itest.ts` (new) | Real-model check of the named-shot parse |
| `scripts/probe-script-writer.itest.ts` | Its round-trip check also checks names |

---

### Task 1: Shots are named in the printed script

**Files:**
- Create: `src/lib/scripts/storyboard.ts` (`shotLabel` only in this task; Task 3 adds the rest)
- Modify: `src/lib/scripts/print.ts`
- Test: `src/lib/scripts/__tests__/print.test.ts`, `src/lib/scripts/__tests__/add-to-canvas.test.ts:32`

**Interfaces:**
- Produces: `shotLabel(index: number): string` → `"S1"` for index 0. A new first table column `Shot`.

- [ ] **Step 1: Write the failing tests**

In `print.test.ts`, change `tableRows` to match the new row start, then update the header and row assertions:

```ts
const tableRows = (text: string) =>
  text.split("\n").filter((l) => /^\| S\d+ \| /.test(l));
```

Replace the test `"prints the outlines' table header and one row per shot"` with:

```ts
  it("prints the table with a Shot column naming every shot S1, S2… in order (D380)", () => {
    expect(text).toContain("| Shot | Beat | Visual | VO | On-screen text |\n| :---- | :---- | :---- | :---- | :---- |");
    const rows = tableRows(text);
    expect(rows).toHaveLength(14);
    expect(rows[0]).toBe("| S1 | **HOOK 0-3s** | First morning of Golu. Early light in the hall. Meenakshi straightens the last doll on the steps. | Golu starts today. | **Golu starts today.** |");
    expect(rows[8]).toContain("| S9 | **BODY 33-35.5s** |");
    expect(rows.map((r) => r.split(" | ")[0])).toEqual(doc.shots.map((_, i) => `| S${i + 1}`));
  });
```

In `"keeps four cells when text holds a pipe or a line break"`, rename it to `"keeps five cells when text holds a pipe or a line break"` and change the expectations to:

```ts
    expect(row).toBe("| S1 | **HOOK 0-3s** | Left \\| right next line | A \\| B | **Golu starts today.** |");
    expect(row.split(/(?<!\\)\|/).length).toBe(7); // 5 cells between 6 pipes
```

Add a test of the helper at the end of the file:

```ts
import { shotLabel } from "../storyboard";

describe("shotLabel", () => {
  it("names shots S1, S2… from a zero-based index", () => {
    expect(shotLabel(0)).toBe("S1");
    expect(shotLabel(13)).toBe("S14");
  });
});
```

In `add-to-canvas.test.ts:32` change the expected header substring to `"| Shot | Beat | Visual | VO | On-screen text |"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scripts/__tests__/print.test.ts src/lib/scripts/__tests__/add-to-canvas.test.ts`
Expected: FAIL — `Cannot find module '../storyboard'` and the header/row mismatches.

- [ ] **Step 3: Implement**

Create `src/lib/scripts/storyboard.ts`:

```ts
// D380 — a shot's name on the canvas. The copilot already calls its shots S1, S2… everywhere the
// team reads them; the canvas copy prints the same names into the script text, so they survive
// every edit, and a parsed row finds its storyboard panel by its name.

/** The name of the shot at `index` (zero-based) in the script's order. */
export const shotLabel = (index: number): string => `S${index + 1}`;
```

In `src/lib/scripts/print.ts`, import it and change the table:

```ts
import { shotLabel } from "./storyboard";
```

Update the header comment's last sentence to: `ONE ROW PER SHOT, each named in a Shot column (S1, S2…, D380): the parse keeps one row per named shot and its name, so a row can find its approved storyboard panel.`

Replace the two table lines and the loop:

```ts
  lines.push("| Shot | Beat | Visual | VO | On-screen text |", "| :---- | :---- | :---- | :---- | :---- |");
  timeShots(doc.shots).forEach((t, i) => {
    const beat = `${t.shot.beat.trim().toUpperCase()} ${formatRange(t.start, t.end)}`.trim();
    lines.push(`| ${shotLabel(i)} | **${cell(beat)}** | ${cell(t.shot.visual)} | ${cell(t.shot.vo)} | ${bold(t.shot.onScreenText)} |`);
  });
```

(Check that `timeShots` returns entries in `doc.shots` order. It does, because `print.test.ts` asserts row 0 is the hook.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/scripts/__tests__/print.test.ts src/lib/scripts/__tests__/add-to-canvas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/storyboard.ts src/lib/scripts/print.ts src/lib/scripts/__tests__/print.test.ts src/lib/scripts/__tests__/add-to-canvas.test.ts
git commit -m "feat(scripts): the canvas copy of a script names its shots S1, S2… in a Shot column (D380)"
```

---

### Task 2: The parse keeps named shots, one row each, with their names

**Files:**
- Modify: `src/prompts/script-parse.ts` (schema, system text, `SETTING_ONLY`, version + note)
- Modify: `src/lib/nodes/reel-script.ts` (`ReelShot.label`)
- Test: `src/prompts/__tests__/script-parse-schema.test.ts`, `src/lib/nodes/__tests__/normalize-beats.test.ts` (create the `describe` if absent; check the folder first with `ls src/lib/nodes/__tests__ | grep normalize`)

**Interfaces:**
- Produces: `ReelShot.label?: string`, the shot's name as written; `""` or absent means unnamed. The parse output always carries `label` from v12 on.

- [ ] **Step 1: Write the failing tests**

In `script-parse-schema.test.ts`, change `"is version 11"` to:

```ts
  it("is version 12", () => {
    expect(scriptParsePrompt.version).toBe(12);
  });
```

and add:

```ts
  // D380 — each row carries the shot's own name, and named shots are never merged or split.
  it("declares a required string label on every shot", () => {
    expect(shotProps.properties.label).toEqual({ type: "string" });
    expect(shotProps.required).toContain("label");
  });

  it("tells the model a named shot is exactly one row, in order, keeping its name as written", () => {
    expect(scriptParsePrompt.system).toMatch(/every named shot is EXACTLY ONE row, in the script's order/);
    expect(scriptParsePrompt.system).toMatch(/A bare timecode is not a name/);
    expect(scriptParsePrompt.system).toContain('"S3", "Shot 3", "Scene 3", "CLIP 3"');
  });

  it("keeps the shot names fixed under a market signal too", () => {
    expect(scriptParsePrompt.signalModes.tint).toMatch(/keeps its label/);
    expect(scriptParsePrompt.signalModes.rewrite).toMatch(/keeps its label/);
  });
```

Add a test that the post-parse normaliser keeps the name. Put it in `src/lib/nodes/__tests__/normalize-beats.test.ts`, appending if the file exists:

```ts
import { describe, it, expect } from "vitest";
import { stampSceneBeats } from "../normalize-beats";

describe("stampSceneBeats keeps the shot's name (D380)", () => {
  it("passes label through untouched", () => {
    const out = stampSceneBeats({
      visual_script: { shots: [{ label: "S3", description: "A", duration_seconds: 3, beats: [] }] },
    });
    expect(out.visual_script?.shots?.[0].label).toBe("S3");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/prompts/__tests__/script-parse-schema.test.ts src/lib/nodes/__tests__/normalize-beats.test.ts`
Expected: FAIL — version is 11, no `label` property; the normaliser test fails to type-check `label` (or passes at runtime; that's fine, it pins the behaviour).

- [ ] **Step 3: Implement**

`src/lib/nodes/reel-script.ts`: add as the first field of `ReelShot`:

```ts
  /**
   * D380 — the shot's own name as the script writes it ("S3", "Shot 3", "Scene 3"). "" or absent =
   * the script names none. A copilot script's names are S1, S2…, which is how a row finds its
   * approved storyboard panel; they live in the text, so they survive edits and re-parses.
   */
  label?: string;
```

`src/prompts/script-parse.ts`:

1. In `reelSchema` → `visual_script.properties.shots.items`, make `required` `["label", "description", "duration", "duration_seconds", "clip", "voiceover", "beats"]` and add `label: { type: "string" },` as the first property.
2. In `system`, change the `visual_script:` line to:
   `- visual_script: { shots: [{ label, description, duration, duration_seconds, clip, voiceover, beats }], execution_refinement } — one row per SCENE, in the order the script writes them.`
   and insert directly after the line beginning `  - Each scene produces EXACTLY ONE row.`:

```
  - When a script names its shots — a "Shot" column in a table, or numbered headings ("Shot 3", "Scene 3", "CLIP 3") — every named shot is EXACTLY ONE row, in the script's order. Never merge two named shots into one row, never split one named shot into two, never drop or add one. In a table with a Shot column, each table row is one shot.
  - label: that shot's own name exactly as the script writes it — "S3", "Shot 3", "Scene 3", "CLIP 3" — from its Shot cell or its heading, without the timing or the title after it. "" when the script names none. A bare timecode is not a name. Never invent, renumber or reformat a name.
```

3. In `SETTING_ONLY`, change the sentence `The shot list is fixed: every source shot appears exactly once, in source order.` to `The shot list is fixed: every source shot appears exactly once, in source order, and keeps its label.` (Both signal modes include `SETTING_ONLY`, so both tests pass.)
4. Bump `version: 12` and add this note line after the v11 note:

```ts
  // v12: every row carries the shot's own name as written (`label`, D380), and a script that names
  // its shots — the copilot's Shot column, or "Shot 3" / "Scene 3" headings — gets exactly one row
  // per named shot, in order. A bare timecode is not a name.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/prompts src/lib/nodes/__tests__/normalize-beats.test.ts src/lib/nodes/__tests__/compile-script.test.ts`
Expected: PASS. If a compile-script snapshot pins the system text, update it, since the text change is intended.

- [ ] **Step 5: Commit**

```bash
git add src/prompts/script-parse.ts src/lib/nodes/reel-script.ts src/prompts/__tests__/script-parse-schema.test.ts src/lib/nodes/__tests__/normalize-beats.test.ts
git commit -m "feat(canvas): the script parse keeps named shots one row each, with their names (D380)"
```

---

### Task 3: The approved storyboard, labelled by shot, from the server

**Files:**
- Modify: `src/lib/scripts/storyboard.ts`
- Create: `src/lib/scripts/storyboard-server.ts`
- Modify: `src/app/api/clients/[id]/scripts/[scriptId]/route.ts`, `src/services/scripts.service.ts`
- Test: `src/lib/scripts/__tests__/storyboard.test.ts` (new), `src/lib/scripts/__tests__/storyboard-server.test.ts` (new), `src/app/api/clients/[id]/scripts/[scriptId]/route.test.ts`

**Interfaces:**
- Consumes: `shotLabel` (Task 1), `ReelShot.label` (Task 2), `PanelSnapshot` from `@/lib/script-review/types`, `getScriptReviewForScript` / `getLatestVersion` from `@/lib/db/script-reviews`.
- Produces:
  - `type StoryboardPanel = { label: string; beat: string; shotId: string; url: string }`
  - `type ScriptStoryboard = { scriptId: string; panels: StoryboardPanel[] }`
  - `storyboardFor(doc: ScriptDoc, panels: Record<string, PanelSnapshot>): StoryboardPanel[]`
  - `panelTitle(panel: Pick<StoryboardPanel, "label" | "beat">): string`
  - `panelForRow(panels: readonly StoryboardPanel[] | undefined, row: Pick<ReelShot, "label"> | undefined): StoryboardPanel | undefined`
  - `loadApprovedStoryboard(script: Script): Promise<StoryboardPanel[]>`
  - `GET /api/clients/:id/scripts/:scriptId` → `{ script, leadAvatarId, storyboard: StoryboardPanel[] }`
  - `scriptsService.get` → `Promise<{ script: Script; leadAvatarId: string | null; storyboard: StoryboardPanel[] }>`

- [ ] **Step 1: Write the failing tests**

`src/lib/scripts/__tests__/storyboard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { panelForRow, panelTitle, storyboardFor, type StoryboardPanel } from "../storyboard";
import { scriptDocSchema } from "../schema";
import reel01 from "../fixtures/reel-01.json";

const doc = scriptDocSchema.parse(reel01);
const url = (id: string) => `https://x.supabase.co/storage/v1/object/public/assets/clients/c/scripts/s/panels/${id}/panel__a.png`;

describe("storyboardFor", () => {
  it("lists the approved panels in the script's order, named by position", () => {
    const [first, , third] = doc.shots;
    const out = storyboardFor(doc, {
      [third.id]: { takeId: "t3", url: url(third.id) },
      [first.id]: { takeId: "t1", url: url(first.id) },
    });
    expect(out).toEqual([
      { label: "S1", beat: first.beat, shotId: first.id, url: url(first.id) },
      { label: "S3", beat: third.beat, shotId: third.id, url: url(third.id) },
    ]);
  });

  it("ignores a frozen panel for a shot the script no longer has", () => {
    expect(storyboardFor(doc, { gone: { takeId: "t", url: url("gone") } })).toEqual([]);
  });
});

describe("panelTitle", () => {
  it("reads S3 · HOOK — storyboard, and drops an empty beat", () => {
    expect(panelTitle({ label: "S3", beat: "Hook" })).toBe("S3 · HOOK — storyboard");
    expect(panelTitle({ label: "S4", beat: "  " })).toBe("S4 — storyboard");
  });
});

describe("panelForRow", () => {
  const panels: StoryboardPanel[] = [{ label: "S3", beat: "HOOK", shotId: "s03", url: url("s03") }];

  it("matches a row by its name, ignoring case and spaces", () => {
    expect(panelForRow(panels, { label: "S3" })?.shotId).toBe("s03");
    expect(panelForRow(panels, { label: " s3 " })?.shotId).toBe("s03");
  });

  it("gives an unnamed, renamed or missing row nothing", () => {
    expect(panelForRow(panels, { label: "" })).toBeUndefined();
    expect(panelForRow(panels, {})).toBeUndefined();
    expect(panelForRow(panels, { label: "Shot 3" })).toBeUndefined();
    expect(panelForRow(panels, undefined)).toBeUndefined();
    expect(panelForRow(undefined, { label: "S3" })).toBeUndefined();
  });
});
```

`src/lib/scripts/__tests__/storyboard-server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scriptDocSchema, type Script } from "../schema";
import reel01 from "../fixtures/reel-01.json";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/script-reviews", () => ({ getScriptReviewForScript: vi.fn(), getLatestVersion: vi.fn() }));

import { getLatestVersion, getScriptReviewForScript } from "@/lib/db/script-reviews";
import { loadApprovedStoryboard } from "../storyboard-server";

const doc = scriptDocSchema.parse(reel01);
const script = (stage: Script["stage"] = "approved"): Script => ({
  id: "sc1", clientId: "c1", stage, doc, approvedAt: null, createdAt: "x", updatedAt: "x",
});
const s1 = doc.shots[0].id;

describe("loadApprovedStoryboard", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the panels frozen in the latest (approved) version", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue({ id: "r1" } as never);
    vi.mocked(getLatestVersion).mockResolvedValue({
      visuals: { avatars: {}, panels: { [s1]: { takeId: "t1", url: "https://x/p.png" } } },
    } as never);
    expect(await loadApprovedStoryboard(script())).toEqual([
      { label: "S1", beat: doc.shots[0].beat, shotId: s1, url: "https://x/p.png" },
    ]);
    expect(getLatestVersion).toHaveBeenCalledWith("r1");
  });

  it("is empty for a script that is not approved, without reading reviews", async () => {
    expect(await loadApprovedStoryboard(script("in_review"))).toEqual([]);
    expect(getScriptReviewForScript).not.toHaveBeenCalled();
  });

  it("is empty when the script was never shared, or its version froze no panels", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue(null);
    expect(await loadApprovedStoryboard(script())).toEqual([]);
    vi.mocked(getScriptReviewForScript).mockResolvedValue({ id: "r1" } as never);
    vi.mocked(getLatestVersion).mockResolvedValue({ visuals: { avatars: {}, panels: {} } } as never);
    expect(await loadApprovedStoryboard(script())).toEqual([]);
  });
});
```

In `route.test.ts`, add the mock next to the others, import it, default it in `beforeEach`, and add one test:

```ts
vi.mock("@/lib/scripts/storyboard-server", () => ({ loadApprovedStoryboard: vi.fn() }));
// …
import { loadApprovedStoryboard } from "@/lib/scripts/storyboard-server";
// in beforeEach:
    vi.mocked(loadApprovedStoryboard).mockResolvedValue([]);
// new test inside the GET describe:
  it("returns the approved storyboard beside the script (D381)", async () => {
    vi.mocked(getScript).mockResolvedValue(scriptWithLead(null));
    const panels = [{ label: "S1", beat: "HOOK", shotId: "s01", url: "https://x/p.png" }];
    vi.mocked(loadApprovedStoryboard).mockResolvedValue(panels);
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).storyboard).toEqual(panels);
  });
```

(Use the file's existing names for the imported handler and response parsing. If it imports `GET` under another name, match it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scripts/__tests__/storyboard.test.ts src/lib/scripts/__tests__/storyboard-server.test.ts "[scriptId]/route.test.ts"` (vitest's file filter is a substring match, so the brackets need no escaping)
Expected: FAIL — missing exports / module, `storyboard` undefined.

- [ ] **Step 3: Implement**

Append to `src/lib/scripts/storyboard.ts`:

```ts
import type { ScriptDoc } from "./schema";
import type { PanelSnapshot } from "@/lib/script-review/types";
import type { ReelShot } from "@/lib/nodes/reel-script";

/** D381 — one approved panel as it travels to the canvas: its shot's name, beat and id, and the
 *  stored image (never copied; deleting a canvas node never deletes it). */
export type StoryboardPanel = { label: string; beat: string; shotId: string; url: string };

/** What a Script node keeps: the panels, frozen when the script was added. */
export type ScriptStoryboard = { scriptId: string; panels: StoryboardPanel[] };

/** The approved panels in the script's order, each named as `printScript` names its shot. A
 *  frozen panel for a shot the script no longer has is left out (spec 3 keeps orphaned takes). */
export function storyboardFor(doc: ScriptDoc, panels: Record<string, PanelSnapshot>): StoryboardPanel[] {
  return doc.shots.flatMap((shot, i) => {
    const panel = panels[shot.id];
    return panel ? [{ label: shotLabel(i), beat: shot.beat.trim(), shotId: shot.id, url: panel.url }] : [];
  });
}

/** Spec A4 — "S3 · HOOK — storyboard": the panel's name on the canvas and in the gallery. */
export function panelTitle(panel: Pick<StoryboardPanel, "label" | "beat">): string {
  const beat = panel.beat.trim().toUpperCase();
  return `${beat ? `${panel.label} · ${beat}` : panel.label} — storyboard`;
}

const nameKey = (label: string | undefined): string => (label ?? "").trim().toUpperCase();

/** The panel for a parsed row, by the row's name. A row with no name, or a name the storyboard
 *  does not have, gets none — an edit that drops or renames a shot just unlinks it (spec §3). */
export function panelForRow(
  panels: readonly StoryboardPanel[] | undefined,
  row: Pick<ReelShot, "label"> | undefined,
): StoryboardPanel | undefined {
  const key = nameKey(row?.label);
  if (!key || !panels) return undefined;
  return panels.find((p) => nameKey(p.label) === key);
}
```

(Move the three `import type` lines to the top of the file, above `shotLabel`.)

Create `src/lib/scripts/storyboard-server.ts`:

```ts
import "server-only";
import { getLatestVersion, getScriptReviewForScript } from "@/lib/db/script-reviews";
import type { Script } from "./schema";
import { storyboardFor, type StoryboardPanel } from "./storyboard";

/** D381 — the panels the client approved. Approval only ever approves the LATEST shared version
 *  (`script_review_approve` returns 'stale' otherwise), so an approved script's latest version
 *  holds them, frozen: a panel redrawn or re-picked since is not this one. Named by the script's
 *  own order, the order `printScript` writes. Not approved, never shared, or nothing frozen: []. */
export async function loadApprovedStoryboard(script: Script): Promise<StoryboardPanel[]> {
  if (script.stage !== "approved") return [];
  const review = await getScriptReviewForScript(script.id);
  if (!review) return [];
  const version = await getLatestVersion(review.id);
  return version ? storyboardFor(script.doc, version.visuals.panels) : [];
}
```

In the GET route, import `loadApprovedStoryboard`, update the header comment (`…plus the lead's avatar id… and the approved storyboard (D381)`), and replace the return:

```ts
      const storyboard = await loadApprovedStoryboard(script);
      return apiOk({ script, leadAvatarId, storyboard });
```

In `src/services/scripts.service.ts`, add `import type { StoryboardPanel } from "@/lib/scripts/storyboard";` and change both type annotations in `get` to `{ script: Script; leadAvatarId: string | null; storyboard: StoryboardPanel[] }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: the same command as Step 2, then `npx tsc --noEmit -p .`
Expected: PASS; tsc shows no new errors. (`add-to-canvas.ts`'s `getDetail` type is widened in Task 4. Until then it accepts the wider object.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/storyboard.ts src/lib/scripts/storyboard-server.ts src/lib/scripts/__tests__/storyboard.test.ts src/lib/scripts/__tests__/storyboard-server.test.ts "src/app/api/clients/[id]/scripts/[scriptId]/route.ts" "src/app/api/clients/[id]/scripts/[scriptId]/route.test.ts" src/services/scripts.service.ts
git commit -m "feat(scripts): an approved script's detail carries its approved storyboard, named by shot (D381)"
```

---

### Task 4: The Script node keeps the storyboard it arrived with

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (`ScriptNodeData.storyboard`)
- Modify: `src/lib/scripts/add-to-canvas.ts`
- Test: `src/lib/scripts/__tests__/add-to-canvas.test.ts`

**Interfaces:**
- Consumes: `StoryboardPanel`, `ScriptStoryboard` (Task 3).
- Produces: `ScriptNodeData.storyboard?: ScriptStoryboard`, present only when there are panels. `AddScriptDeps.getDetail` returns `{ script; leadAvatarId; storyboard: StoryboardPanel[] }`. `addScriptNode` / `fillScriptNode` data is `{ title: string; source: string; storyboard?: ScriptStoryboard }`.

- [ ] **Step 1: Write the failing tests**

In `add-to-canvas.test.ts`, make the default `getDetail` resolve `{ script: script(), leadAvatarId: null, storyboard: [] }`, and update every other `mockResolvedValue({ script: …, leadAvatarId: … })` in the file to add `storyboard: []`. Then add:

```ts
  const PANELS = [{ label: "S1", beat: "HOOK", shotId: "s01", url: "https://x/p.png" }];

  it("puts the approved storyboard on the new Script node (D381)", async () => {
    const d = deps({ getDetail: vi.fn().mockResolvedValue({ script: script(), leadAvatarId: null, storyboard: PANELS }) });
    await addScriptToCanvas("s1", POS, d);
    expect(d.addScriptNode).toHaveBeenCalledWith("n1", POS, expect.objectContaining({
      storyboard: { scriptId: "s1", panels: PANELS },
    }));
  });

  it("fills the seeded node with the storyboard too (Create canvas)", async () => {
    const d = deps({ getDetail: vi.fn().mockResolvedValue({ script: script(), leadAvatarId: null, storyboard: PANELS }) });
    await addScriptToCanvas("s1", POS, d, { into: "seeded" });
    expect(d.fillScriptNode).toHaveBeenCalledWith("seeded", expect.objectContaining({
      storyboard: { scriptId: "s1", panels: PANELS },
    }));
  });

  it("adds no storyboard key when there are no approved panels", async () => {
    const d = deps();
    await addScriptToCanvas("s1", POS, d);
    const data = vi.mocked(d.addScriptNode).mock.calls[0][2];
    expect(data).not.toHaveProperty("storyboard");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scripts/__tests__/add-to-canvas.test.ts`
Expected: FAIL — `storyboard` not on the node data.

- [ ] **Step 3: Implement**

`src/lib/canvas-nodes.ts`: add `import type { ScriptStoryboard } from "@/lib/scripts/storyboard";` with the other type imports. Add to `ScriptNodeData` after `signalMode`:

```ts
  /**
   * D381 — the approved storyboard this script arrived with, frozen when it was added: what Fan
   * out wires into each new shot (by the row's name) and what the gallery's Storyboard group
   * shows. Absent = it came with none. Saved with the node (only `parsed` is display-only).
   */
  storyboard?: ScriptStoryboard;
```

`src/lib/scripts/add-to-canvas.ts`:

```ts
import type { ScriptStoryboard, StoryboardPanel } from "./storyboard";

type ScriptNodeFill = { title: string; source: string; storyboard?: ScriptStoryboard };
```

Change the dep types:

```ts
  getDetail: (scriptId: string) => Promise<{ script: Script; leadAvatarId: string | null; storyboard: StoryboardPanel[] }>;
  addScriptNode: (nodeId: string, position: XYPosition, data: ScriptNodeFill) => void;
  // …
  fillScriptNode: (nodeId: string, data: ScriptNodeFill) => void;
```

Replace the node-filling lines in `addScriptToCanvas`:

```ts
  const { header } = detail.script.doc;
  const source = printScript(detail.script.doc);
  // D381 — the approved panels ride on the node, frozen; a script without any gets no key.
  const fill: ScriptNodeFill = {
    title: header.title,
    source,
    ...(detail.storyboard.length > 0 && { storyboard: { scriptId, panels: detail.storyboard } }),
  };
  const nodeId = opts.into ?? d.newId();
  if (opts.into) d.fillScriptNode(nodeId, fill);
  else d.addScriptNode(nodeId, position, fill);
```

(`use-add-script-node.ts` passes `data` straight to `updateNodeData`, so it needs no change.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/scripts/__tests__/add-to-canvas.test.ts src/lib/scripts/__tests__/add-from-url.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no new type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/scripts/add-to-canvas.ts src/lib/scripts/__tests__/add-to-canvas.test.ts
git commit -m "feat(canvas): a script added to the canvas keeps its approved storyboard on the node (D381)"
```

---

### Task 5: A Multishot node accepts an image (display only)

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (`VALID_CONNECTIONS`)
- Modify: `src/components/nodes/multishot-node.tsx:150-162`
- Test: `src/lib/canvas-nodes.test.ts`

**Interfaces:**
- Produces: `canConnect(x, "multishot")` is true for `file`, `draw`, `image-gen` and `composite`. The Multishot node has a bottom target handle with `id="image"`, the same id as the Shot node's, so an edge keeps its handle when the node flips type (`setGenerationMode` keeps the id and incoming edges).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/canvas-nodes.test.ts`:

```ts
describe("VALID_CONNECTIONS — an image into a Multishot (D383)", () => {
  it("lets a file, draw, image-gen or composite connect to a multishot", () => {
    for (const source of ["file", "draw", "image-gen", "composite"]) {
      expect(canConnect(source, "multishot")).toBe(true);
    }
  });

  it("still feeds a multishot nothing else", () => {
    expect(canConnect("text", "multishot")).toBe(false);
    expect(canConnect("prompt", "multishot")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: FAIL — `canConnect("file", "multishot")` is false.

- [ ] **Step 3: Implement**

In `VALID_CONNECTIONS`, add `"multishot"` to the target lists of `file`, `draw`, `image-gen` and `composite`. Above `file:` add:

```ts
  // D383 — an image may sit on a Multishot (its storyboard panel, or any picture) to be SEEN there.
  // Nothing reads it: the multishot prompt resolves only its own direct upstream, so an image must
  // still be wired to the prompt to reach the writer or the video.
```

In `multishot-node.tsx`, replace the comment above the lineage handle and add the image handle after it:

```tsx
        {/* Lineage target (dashed Script->Multishot edge). */}
        <Handle
          type="target"
          position={Position.Left}
          className="size-4! border-2! border-card! bg-muted-foreground!"
        />
        {/* D383 — an image to see beside the sequence (its storyboard panel). Same id as the Shot's
            image handle, so the wire survives a shot ↔ multishot flip. It feeds nothing: references
            reach the sequence at the prompt node. */}
        <Handle
          id="image"
          type="target"
          position={Position.Bottom}
          className="size-4! border-2! border-card! bg-muted-foreground!"
        />
```

- [ ] **Step 4: Verify that nothing reads it, then run the tests**

Run: `grep -n "ups.find\|ups.filter\|getUpstreamOutputs" src/lib/nodes/resolve-inputs.ts | sed -n 1,20p`
Expected: `resolveMultishotPromptInputs` reads the multishot prompt's **direct** upstream only. The Multishot node's own upstream is never fetched, and Video Gen goes two levels up (Video Gen ← multishot prompt ← Multishot), so a panel three levels up can't reach it. If you find a traversal of the Multishot's upstream, stop and report it.

Run: `npx vitest run src/lib/canvas-nodes.test.ts src/lib/canvas-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-nodes.test.ts src/components/nodes/multishot-node.tsx
git commit -m "feat(canvas): a Multishot node takes an image to show, and nothing reads it yet (D383)"
```

---

### Task 6: Fan out wires each new shot's approved panel into it

**Files:**
- Create: `src/lib/scripts/storyboard-canvas.ts`
- Modify: `src/lib/canvas-store.ts` (`fanOutShots`, ~L485-629)
- Test: `src/lib/scripts/__tests__/storyboard-canvas.test.ts` (new), `src/lib/canvas-store.test.ts`, `src/lib/storage/node-file-cleanup.test.ts`

**Interfaces:**
- Consumes: `panelForRow`, `panelTitle`, `StoryboardPanel`, `ScriptStoryboard` (Task 3); `ScriptNodeData.storyboard` (Task 4); the `image` handle on Shot (existing) and Multishot (Task 5).
- Produces: `storyboardPanelNodes(created: readonly AppNode[], rows: readonly ReelShot[], panels: readonly StoryboardPanel[] | undefined): { nodes: AppNode[]; edges: Edge[] }`; constants `PANEL_DY = 190`, `STORYBOARD_ROW_PITCH = 360`, `SHOT_ROW_PITCH = 170`.

- [ ] **Step 1: Write the failing tests**

`src/lib/scripts/__tests__/storyboard-canvas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { AppNode } from "@/lib/canvas-nodes";
import { PANEL_DY, storyboardPanelNodes } from "../storyboard-canvas";
import type { StoryboardPanel } from "../storyboard";

const panel = (n: number): StoryboardPanel => ({
  label: `S${n}`, beat: "HOOK", shotId: `s0${n}`,
  url: `https://x.supabase.co/storage/v1/object/public/assets/clients/c/scripts/s/panels/s0${n}/panel__a.webp`,
});
const node = (id: string, type: "shot" | "multishot", shotIndexes: number[], y = 0): AppNode =>
  ({ id, type, position: { x: 400, y }, data: { seededFrom: { scriptNodeId: "sc", shotIndexes } } }) as AppNode;

describe("storyboardPanelNodes (D382)", () => {
  const rows = [{ label: "S1" }, { label: "S2" }, { label: "" }];
  const panels = [panel(1), panel(2), panel(3)];

  it("adds a File node per matching row, below its shot, wired into the image handle", () => {
    const { nodes, edges } = storyboardPanelNodes([node("a", "shot", [0], 100)], rows, panels);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: "file",
      position: { x: 400, y: 100 + PANEL_DY },
      data: { title: "S1 · HOOK — storyboard", fileKind: "image", fileUrl: panels[0].url, fileExt: "webp", filename: "S1-storyboard.webp" },
    });
    expect(edges).toEqual([{ id: expect.any(String), source: nodes[0].id, target: "a", targetHandle: "image" }]);
  });

  it("wires a Multishot the same way", () => {
    const { edges } = storyboardPanelNodes([node("m", "multishot", [1])], rows, panels);
    expect(edges[0]).toMatchObject({ target: "m", targetHandle: "image" });
  });

  it("gives an unnamed row nothing", () => {
    expect(storyboardPanelNodes([node("c", "shot", [2])], rows, panels).nodes).toEqual([]);
  });

  it("gives a node covering several rows one panel per row, never one shot twice", () => {
    const twice = [{ label: "S1" }, { label: "s1" }, { label: "S2" }];
    const { nodes } = storyboardPanelNodes([node("g", "shot", [0, 1, 2])], twice, panels);
    expect(nodes.map((n) => (n.data as { title: string }).title)).toEqual(["S1 · HOOK — storyboard", "S2 · HOOK — storyboard"]);
    expect(nodes[1].position.x).toBeGreaterThan(nodes[0].position.x);
  });

  it("does nothing without a storyboard", () => {
    expect(storyboardPanelNodes([node("a", "shot", [0])], rows, undefined)).toEqual({ nodes: [], edges: [] });
  });
});
```

Append to `src/lib/canvas-store.test.ts` (it already imports `createCanvasStore`, `AppNode`; add `import { generationKey } from "./nodes/group-shots";` if not present):

```ts
describe("fanOutShots with an approved storyboard (D382)", () => {
  const panels = [1, 2].map((n) => ({
    label: `S${n}`, beat: "HOOK", shotId: `s0${n}`,
    url: `https://x.supabase.co/storage/v1/object/public/assets/clients/c/scripts/s/panels/s0${n}/panel__a.png`,
  }));
  const scriptNode = (rows: object[], extra: object = {}): AppNode =>
    ({
      id: "sb", type: "script", position: { x: 0, y: 0 },
      data: { title: "Reel 12", groupingVersion: 3, parsed: { visual_script: { shots: rows } }, storyboard: { scriptId: "script-1", panels }, ...extra },
    }) as AppNode;
  const rows = [
    { label: "S1", description: "a", duration_seconds: 3 },
    { label: "S2", description: "b", duration_seconds: 4 },
  ];
  const panelNodes = (s: ReturnType<typeof createCanvasStore>) => s.getState().nodes.filter((n) => n.type === "file");

  it("wires each new shot's panel into its image handle, spaced so panels sit under their shots", () => {
    const store = createCanvasStore([scriptNode(rows)], []);
    store.getState().fanOutShots("sb");
    const shots = store.getState().nodes.filter((n) => n.type === "shot");
    expect(shots.map((s) => s.position.y)).toEqual([0, 360]);
    const files = panelNodes(store);
    expect(files).toHaveLength(2);
    const imageEdges = store.getState().edges.filter((e) => e.targetHandle === "image");
    expect(imageEdges.map((e) => e.target).sort()).toEqual(shots.map((s) => s.id).sort());
    expect(files.map((f) => f.position.y)).toEqual([190, 550]);
  });

  it("wires a row fanned out as a Multishot too", () => {
    const store = createCanvasStore([scriptNode(rows, { groupModes: { [generationKey([1])]: true } })], []);
    store.getState().fanOutShots("sb");
    const ms = store.getState().nodes.find((n) => n.type === "multishot")!;
    expect(store.getState().edges.some((e) => e.target === ms.id && e.targetHandle === "image")).toBe(true);
  });

  it("adds no second panel when fanned out again", () => {
    const store = createCanvasStore([scriptNode(rows)], []);
    store.getState().fanOutShots("sb");
    store.getState().fanOutShots("sb");
    expect(panelNodes(store)).toHaveLength(2);
  });

  it("gives a renamed row no panel", () => {
    const store = createCanvasStore([scriptNode([rows[0], { ...rows[1], label: "Shot 2" }])], []);
    store.getState().fanOutShots("sb");
    expect(panelNodes(store).map((f) => (f.data as { title: string }).title)).toEqual(["S1 · HOOK — storyboard"]);
  });

  it("is unchanged for a script without a storyboard, or a parse without names", () => {
    const plain = createCanvasStore([scriptNode(rows, { storyboard: undefined })], []);
    plain.getState().fanOutShots("sb");
    expect(panelNodes(plain)).toEqual([]);
    expect(plain.getState().nodes.filter((n) => n.type === "shot").map((s) => s.position.y)).toEqual([0, 170]);

    const unnamed = createCanvasStore([scriptNode(rows.map(({ label: _l, ...r }) => r))], []);
    unnamed.getState().fanOutShots("sb");
    expect(panelNodes(unnamed)).toEqual([]);
  });
});
```

Append to `src/lib/storage/node-file-cleanup.test.ts` (match how the file builds URLs and mocks; reuse its URL helper or bucket base):

```ts
  // Review focus 5 — a storyboard panel on the canvas is the script's image, not the node's upload.
  it("never deletes a storyboard panel when its File node goes", async () => {
    const panelUrl = `${BASE}/clients/c1/scripts/sc1/panels/s01/panel__a.png`;
    expect(await removeNodeFileObject("node-1", panelUrl)).toEqual({ removed: false, reason: "not-this-nodes-file" });
  });
```

(`BASE` is whatever public-bucket prefix the existing tests use. Read the top of the file and reuse it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scripts/__tests__/storyboard-canvas.test.ts src/lib/canvas-store.test.ts src/lib/storage/node-file-cleanup.test.ts`
Expected: FAIL — module missing; no file nodes; pitch is 170. The cleanup test should already PASS: it pins existing behaviour.

- [ ] **Step 3: Implement**

Create `src/lib/scripts/storyboard-canvas.ts`:

```ts
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { ReelShot } from "@/lib/nodes/reel-script";
import { panelForRow, panelTitle, type StoryboardPanel } from "./storyboard";

/** Fan out's row pitch, and with a storyboard the pitch that leaves room for a panel under each
 *  shot (a Shot card ~150px, a File card with its thumbnail ~130px). */
export const SHOT_ROW_PITCH = 170;
export const STORYBOARD_ROW_PITCH = 360;
/** How far below its shot a panel sits — under the shot's bottom image handle. */
export const PANEL_DY = 190;
/** A second panel on one node (a generation covering several rows) sits beside the first. */
const PANEL_DX = 220;

function extOf(url: string): string {
  return (url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? "png").toLowerCase();
}

/**
 * D382 — a File node per approved panel of each NEW shot or multishot node, wired into its image
 * handle: on a Shot it grounds the Shot Composer, on a Multishot it is there to see (D383). The
 * node points at the panel's stored image, never a copy, and never-deleting it is node-file-
 * cleanup's rule (only a node's own upload slot is removed). Rows are matched by name; a row with
 * none, or a name the storyboard lacks, gets nothing. Nothing is wired past the shot (spec §2.5).
 */
export function storyboardPanelNodes(
  created: readonly AppNode[],
  rows: readonly ReelShot[],
  panels: readonly StoryboardPanel[] | undefined,
): { nodes: AppNode[]; edges: Edge[] } {
  const nodes: AppNode[] = [];
  const edges: Edge[] = [];
  if (!panels || panels.length === 0) return { nodes, edges };

  for (const target of created) {
    if (target.type !== "shot" && target.type !== "multishot") continue;
    const indexes = (target.data as { seededFrom?: { shotIndexes?: number[] } }).seededFrom?.shotIndexes ?? [];
    const placed = new Set<string>();
    for (const index of indexes) {
      const panel = panelForRow(panels, rows[index]);
      if (!panel || placed.has(panel.shotId)) continue;
      const ext = extOf(panel.url);
      const id = crypto.randomUUID();
      nodes.push({
        id,
        type: "file",
        position: { x: target.position.x + placed.size * PANEL_DX, y: target.position.y + PANEL_DY },
        data: {
          title: panelTitle(panel),
          filename: `${panel.label}-storyboard.${ext}`,
          fileExt: ext,
          fileKind: "image",
          fileUrl: panel.url,
        },
      } as AppNode);
      edges.push({ id: crypto.randomUUID(), source: id, target: target.id, targetHandle: "image" });
      placed.add(panel.shotId);
    }
  }
  return { nodes, edges };
}
```

In `src/lib/canvas-store.ts`:

1. Imports: `import { SHOT_ROW_PITCH, STORYBOARD_ROW_PITCH, storyboardPanelNodes } from "@/lib/scripts/storyboard-canvas";` and `import type { ScriptStoryboard } from "@/lib/scripts/storyboard";`.
2. In `fanOutShots`, add `storyboard?: ScriptStoryboard;` to the `data` cast's type.
3. After `const scriptTitle = …`, add:

```ts
      // D382 — with an approved storyboard each shot gets its panel underneath, so rows need room.
      const storyboardPanels = data.storyboard?.panels;
      const pitch = storyboardPanels?.length ? STORYBOARD_ROW_PITCH : SHOT_ROW_PITCH;
```

4. Replace `+ 170` in `baseY` with `+ pitch`, and `baseY + i * 170` with `baseY + i * pitch`.
5. After `createdEdges`, add `const panels = storyboardPanelNodes(created, shots, storyboardPanels);` and make the `set` call:

```ts
      set({
        nodes: [...get().nodes, ...created, ...panels.nodes],
        edges: [...get().edges, ...createdEdges, ...panels.edges],
      });
```

6. Update the block comment above `fanOutShots`. Add: `With an approved storyboard (D382) each NEW node also gets its panel, wired into its image handle. Only new nodes: a re-run never adds a second panel, and one the person deleted stays deleted (spec A5).`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/scripts src/lib/canvas-store.test.ts src/lib/storage/node-file-cleanup.test.ts`
Expected: PASS (existing fan-out tests are unchanged: no storyboard means pitch 170).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/storyboard-canvas.ts src/lib/scripts/__tests__/storyboard-canvas.test.ts src/lib/canvas-store.ts src/lib/canvas-store.test.ts src/lib/storage/node-file-cleanup.test.ts
git commit -m "feat(canvas): Fan out wires each new shot's approved storyboard panel into it (D382)"
```

---

### Task 7: The gallery's References tab shows the Storyboard

**Files:**
- Create: `src/components/canvas/gallery-drawer/storyboard-images.ts`, `src/components/canvas/gallery-drawer/gallery-storyboard.tsx`, `src/components/canvas/gallery-drawer/gallery-image-title.ts`
- Modify: `src/components/canvas/gallery-drawer/types.ts`, `src/components/canvas/gallery-drawer/gallery-drawer.tsx`, `src/hooks/use-gallery-drawer.ts`
- Test: `src/components/canvas/gallery-drawer/storyboard-images.test.ts` (new), `src/components/canvas/gallery-drawer/gallery-image-title.test.ts` (new)

**Interfaces:**
- Consumes: `ScriptNodeData.storyboard` (Task 4), `panelTitle` (Task 3).
- Produces: `type StoryboardGroup = { scriptNodeId: string; title: string; images: GalleryImage[] }`; `storyboardGroups(nodes: readonly AppNode[]): StoryboardGroup[]`; `galleryImageTitle(image: GalleryImage): string`; `GalleryImage.source` gains `"storyboard"`.

- [ ] **Step 1: Write the failing tests**

`storyboard-images.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { AppNode } from "@/lib/canvas-nodes";
import { storyboardGroups } from "./storyboard-images";

const panel = (n: number) => ({ label: `S${n}`, beat: "Hook", shotId: `s0${n}`, url: `https://x/p${n}.png` });
const script = (id: string, data: object): AppNode => ({ id, type: "script", position: { x: 0, y: 0 }, data }) as AppNode;

describe("storyboardGroups (D383)", () => {
  it("makes one group per Script node with a storyboard, in shot order, named by its title", () => {
    const groups = storyboardGroups([
      script("a", { title: "Reel 12", storyboard: { scriptId: "x", panels: [panel(1), panel(2)] } }),
      { id: "f", type: "file", position: { x: 0, y: 0 }, data: {} } as AppNode,
      script("b", { title: "Reel 13", storyboard: { scriptId: "y", panels: [panel(1)] } }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Reel 12", "Reel 13"]);
    expect(groups[0].images).toEqual([
      { id: "storyboard:a:s01", imageUrl: "https://x/p1.png", previewUrl: "https://x/p1.png", filename: "S1 · HOOK — storyboard", subtitle: "Reel 12", source: "storyboard" },
      expect.objectContaining({ id: "storyboard:a:s02", filename: "S2 · HOOK — storyboard" }),
    ]);
  });

  it("skips Script nodes with no storyboard or no panels, and names an untitled one Script", () => {
    expect(storyboardGroups([script("a", {}), script("b", { storyboard: { scriptId: "x", panels: [] } })])).toEqual([]);
    expect(storyboardGroups([script("c", { storyboard: { scriptId: "x", panels: [panel(1)] } })])[0].title).toBe("Script");
  });
});
```

`gallery-image-title.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { galleryImageTitle } from "./gallery-image-title";
import type { GalleryImage } from "./types";

const img = (source: GalleryImage["source"], filename: string): GalleryImage =>
  ({ id: "i", imageUrl: "u", filename, subtitle: "", source });

describe("galleryImageTitle", () => {
  it("drops the extension from a picked file's name", () => {
    expect(galleryImageTitle(img("drive", "hero-shot.png"))).toBe("hero-shot");
  });

  it("keeps a storyboard panel's title whole, dots and all", () => {
    expect(galleryImageTitle(img("storyboard", "S3 · STEP 2. POUR — storyboard"))).toBe("S3 · STEP 2. POUR — storyboard");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/canvas/gallery-drawer/storyboard-images.test.ts src/components/canvas/gallery-drawer/gallery-image-title.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement the pure parts**

`types.ts`: `source: "drive" | "generated" | "moodboard" | "storyboard";`

`gallery-image-title.ts`: move `stripExtension` and its comment out of `src/hooks/use-gallery-drawer.ts` and add the new function:

```ts
import type { GalleryImage } from "./types";

// Deliberately NOT lib/nodes/title.ts's titleFromFilename: a gallery pick keeps the file's
// name as-is minus the extension ("hero-shot"), where an uploaded file's auto-title also reads
// separators as spaces ("hero shot"). nextFileNodeTitle() knows about both spellings, so
// replacing the attachment on a node created here still re-derives its title.
function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/** The File node title for a gallery pick. A storyboard panel's name is already its title
 *  ("S3 · HOOK — storyboard", D383) and has no extension to drop — a beat may hold a dot. */
export function galleryImageTitle(image: GalleryImage): string {
  return image.source === "storyboard" ? image.filename : stripExtension(image.filename);
}
```

In `src/hooks/use-gallery-drawer.ts`, delete `stripExtension` and its comment, import `galleryImageTitle` from `@/components/canvas/gallery-drawer/gallery-image-title`, and replace `const title = stripExtension(image.filename);` with `const title = galleryImageTitle(image);`. A storyboard image goes down the existing final `else` branch, which sets `fileUrl: image.imageUrl` directly with no copy. That's correct for the same reason as Task 6.

`storyboard-images.ts`:

```ts
import type { AppNode, ScriptNodeData } from "@/lib/canvas-nodes";
import { panelTitle } from "@/lib/scripts/storyboard";
import type { GalleryImage } from "./types";

export type StoryboardGroup = { scriptNodeId: string; title: string; images: GalleryImage[] };

/** D383 — the References tab's Storyboard: one group per Script node on this canvas that came
 *  with approved panels, in shot order. Read from the canvas, so removing the Script node removes
 *  its group (spec A3), and a panel unlinked by an edit is still here (spec §3). */
export function storyboardGroups(nodes: readonly AppNode[]): StoryboardGroup[] {
  return nodes.flatMap((n) => {
    if (n.type !== "script") return [];
    const d = n.data as ScriptNodeData;
    const panels = d.storyboard?.panels ?? [];
    if (panels.length === 0) return [];
    const title = d.title?.trim() || "Script";
    return [{
      scriptNodeId: n.id,
      title,
      images: panels.map((p) => ({
        id: `storyboard:${n.id}:${p.shotId}`,
        imageUrl: p.url,
        previewUrl: p.url,
        filename: panelTitle(p),
        subtitle: title,
        source: "storyboard" as const,
      })),
    }];
  });
}
```

- [ ] **Step 4: Run the pure tests to verify they pass**

Run: `npx vitest run src/components/canvas/gallery-drawer`
Expected: PASS

- [ ] **Step 5: Implement the UI**

`gallery-storyboard.tsx`:

```tsx
"use client";

import { GalleryContent } from "./gallery-content";
import type { StoryboardGroup } from "./storyboard-images";
import type { GalleryImage, ViewMode } from "./types";

type Props = {
  groups: StoryboardGroup[];
  viewMode: ViewMode;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
  onDragStartImage: (image: GalleryImage, e: React.DragEvent) => void;
};

const noop = () => {};

/** D383 — the approved storyboard of every copilot script on this canvas, above the Drive folder.
 *  Its panels select, preview and drag like any reference. */
export function GalleryStoryboard({ groups, viewMode, selectedIds, onToggle, onPreview, onDragStartImage }: Props) {
  if (groups.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-4 border-b border-border pb-4">
      {groups.map((group) => (
        <section key={group.scriptNodeId} className="flex flex-col gap-2">
          <p className="text-eyebrow text-muted-foreground">Storyboard · {group.title}</p>
          <GalleryContent
            loading={false}
            loadError={null}
            onRetry={noop}
            images={group.images}
            emptyMessage=""
            viewMode={viewMode}
            selectedIds={selectedIds}
            onToggle={onToggle}
            onPreview={onPreview}
            onDragStartImage={onDragStartImage}
            onSentinelInView={noop}
            hasMore={false}
            loadingMore={false}
          />
        </section>
      ))}
    </div>
  );
}
```

In `gallery-drawer.tsx`:

1. Imports: `import { useCanvasStore } from "@/components/canvas/canvas-store-provider";`, `import { GalleryStoryboard } from "./gallery-storyboard";`, `import { storyboardGroups } from "./storyboard-images";`, and `cn` from `@/lib/utils` if not already imported.
2. After the `signalImages` memo:

```ts
  // D383 — the canvas's own approved storyboards, read from its Script nodes.
  const nodes = useCanvasStore((s) => s.nodes);
  const storyboard = useMemo(() => storyboardGroups(nodes), [nodes]);
  const storyboardImages = useMemo(() => storyboard.flatMap((g) => g.images), [storyboard]);
```

3. In `toggleSelect` and in `previewImage`, change both `[...references, ...assets, ...moodboardImages, ...signalImages]` to `[...storyboardImages, ...references, ...assets, ...moodboardImages, ...signalImages]`.
4. Immediately before the block `{tab !== "moodboard" && tab !== "signals" && tab !== "avatars" && tab !== "scripts" && (noFolderLinked ? (`, insert:

```tsx
            {tab === "references" && (
              <GalleryStoryboard
                groups={storyboard}
                viewMode={viewMode}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
                onPreview={setPreviewId}
                onDragStartImage={handleDragStartImage}
              />
            )}
```

5. On the "No Drive folder linked" container, replace `className="flex h-full flex-col items-center justify-center gap-4 text-center"` with `className={cn("flex flex-col items-center justify-center gap-4 text-center", storyboard.length > 0 ? "py-10" : "h-full")}`, so the empty state sits under the storyboard instead of filling the panel (spec A2).

- [ ] **Step 6: Type-check, lint and run the drawer's tests**

Run: `npx tsc --noEmit -p . && npx eslint src/components/canvas/gallery-drawer src/hooks/use-gallery-drawer.ts && npx vitest run src/components/canvas/gallery-drawer src/hooks`
Expected: no new errors; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/gallery-drawer src/hooks/use-gallery-drawer.ts
git commit -m "feat(canvas): the gallery's References tab shows each script's approved storyboard (D383)"
```

---

### Task 8: Measure the named-shot parse with real model calls

**Files:**
- Create: `scripts/probe-shot-names.itest.ts`
- Modify: `scripts/probe-script-writer.itest.ts` (its round-trip check also checks names)

**Interfaces:**
- Consumes: `printScript` (Task 1), `scriptParsePrompt` v12 (Task 2), `compileScript`, `createOpenAI`.

- [ ] **Step 1: Give the worktree its env file**

Run: `cp ../../../.env .env` (gitignored; check with `git check-ignore -q .env && echo ignored`). The probe reads `.env` via `process.loadEnvFile`.

- [ ] **Step 2: Write the probe**

`scripts/probe-shot-names.itest.ts`:

```ts
// D380 — does the parse keep named shots one row each, with their names? REAL model calls
// (a few cents). Not part of `npx vitest run`.
//
//   npx vitest run --config vitest.integration.config.ts scripts/probe-shot-names.itest.ts
//
// Env: PROBE_RUNS=3. Writes REPORT.md to <os tmpdir>/shot-names-probe; nothing in the repo.
import { describe, it, beforeAll, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";

beforeAll(() => {
  process.loadEnvFile(".env");
});

const RUNS = Number(process.env.PROBE_RUNS ?? 3);
const OUT = path.join(os.tmpdir(), "shot-names-probe");

const SHOT_HEADINGS = `Reel 7 — Morning ritual

Shot 1 — 0-3 sec
Close-up: steam rising from a steel tumbler of filter coffee.
VO: Every morning starts the same way.

Shot 2 — 3-7 sec
She pours the decoction, then the milk, from a height.
VO: Slow, from a height, the way her mother did.

Shot 3 — 7-10 sec
Quick cuts: the froth, her smile, the first sip.
VO: Some things you don't rush.

Shot 4 — 10-13 sec
Pack shot on the counter. Text: Brewed the old way.
VO: Brewed the old way.`;

const SCENE_HEADINGS = SHOT_HEADINGS.replace(/^Shot (\d) — (.*)$/gm, "Scene $1 | $2");

const UNNAMED = `Reel 7 — Morning ritual

0-3 sec
Close-up: steam rising from a steel tumbler of filter coffee.
VO: Every morning starts the same way.

3-7 sec
She pours the decoction, then the milk, from a height.
VO: Slow, from a height, the way her mother did.

7-13 sec
Pack shot on the counter.
VO: Brewed the old way.`;

describe("shot names probe", () => {
  it("keeps every named shot as one row, in order, with its name", async () => {
    const { scriptDocSchema } = await import("@/lib/scripts/schema");
    const { printScript } = await import("@/lib/scripts/print");
    const { compileScript } = await import("@/lib/nodes/script");
    const { scriptParsePrompt } = await import("@/prompts/script-parse");
    const { createOpenAI } = await import("@/lib/openai/server");

    const doc = scriptDocSchema.parse(reel01);
    const cases = [
      { key: "copilot", source: printScript(doc), expected: doc.shots.map((_, i) => `S${i + 1}`) },
      { key: "shot-headings", source: SHOT_HEADINGS, expected: ["Shot 1", "Shot 2", "Shot 3", "Shot 4"] },
      { key: "scene-headings", source: SCENE_HEADINGS, expected: ["Scene 1", "Scene 2", "Scene 3", "Scene 4"] },
      { key: "unnamed", source: UNNAMED, expected: ["", "", ""] },
    ];

    mkdirSync(OUT, { recursive: true });
    const report: string[] = ["# Shot names probe", "", `Prompt v${scriptParsePrompt.version} · ${scriptParsePrompt.model} · ${RUNS} runs each`, ""];
    const failures: string[] = [];

    for (const c of cases) {
      for (let n = 1; n <= RUNS; n++) {
        const { system, user } = compileScript(c.source, "", "", "tint");
        const completion = await createOpenAI().chat.completions.create({
          model: scriptParsePrompt.model,
          response_format: { type: "json_schema", json_schema: { name: "reel_script", schema: scriptParsePrompt.schema, strict: true } },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
        const labels: string[] = (parsed?.visual_script?.shots ?? []).map((s: { label?: string }) => (s.label ?? "").trim());
        const pass =
          labels.length === c.expected.length &&
          labels.every((l, i) => l.toUpperCase() === c.expected[i].toUpperCase());
        const line = `- ${pass ? "PASS" : "FAIL"} ${c.key} #${n}: ${JSON.stringify(labels)}`;
        report.push(line);
        if (!pass) failures.push(`${line} (expected ${JSON.stringify(c.expected)})`);
      }
    }

    writeFileSync(path.join(OUT, "REPORT.md"), report.join("\n"));
    console.log(`\nProbe written to ${OUT}\n\n${report.join("\n")}`);
    expect(failures).toEqual([]);
  }, 900_000);
});
```

- [ ] **Step 3: Extend the writer probe's round-trip check**

In `scripts/probe-script-writer.itest.ts`, directly after the `"parse round trip"` `checks.push(…)` line, add:

```ts
            // D380 — and each row keeps its shot's name, in order.
            const names: string[] = (parsed?.visual_script?.shots ?? []).map((s: { label?: string }) => (s.label ?? "").trim().toUpperCase());
            const want = doc.shots.map((_, i) => `S${i + 1}`);
            checks.push({ name: "shot names", pass: JSON.stringify(names) === JSON.stringify(want), detail: names.join(" ") });
```

- [ ] **Step 4: Run the probe**

Run: `npx vitest run --config vitest.integration.config.ts scripts/probe-shot-names.itest.ts`
Expected: PASS, 12/12 lines PASS. If a case fails, read its line in the report. Tighten the rule text from Task 2 only where the failing case points (the project measures prompt changes this way; see the notes on v10/v11 in `script-parse.ts`), re-run, and keep the final pass count for the ADR.

- [ ] **Step 5: Commit**

```bash
git add scripts/probe-shot-names.itest.ts scripts/probe-script-writer.itest.ts
git commit -m "test(scripts): probe that the parse keeps named shots one row each, with their names (D380)"
```

---

### Task 9: ADRs, full verification, and in-app check

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append after D379)

- [ ] **Step 1: Append the ADRs**

Append after D379's `**Originated →**` line, in its format (Decision / Why / Rejected / Refines / Originated), recording the probe's measured pass count in D380:

```markdown
### D380 — Shots are named in the script text, and the parse keeps the names *(recorded 2026-10-16)*

**Decision.** The canvas copy of a copilot script names its shots in a Shot column (S1, S2…, the names the copilot already shows). The Script node's parse (v12) returns each row's `label` as written, and a script that names its shots ("S3", "Shot 3", "Scene 3", "CLIP 3") gets exactly one row per named shot, in order. A bare timecode is not a name. Measured with real parses: <N>/<N> runs kept every name in order (scripts/probe-shot-names.itest.ts).

**Why.** The canvas threw away which shot a row was: the copilot's shot ids are not in the text, and the parse had no name field, so nothing on the canvas could say "this is shot 3". A name printed into the text survives every edit, paste and re-parse, which hidden ids cannot once editing is free. It also helps uploaded scripts that number their shots.

**Rejected.** A deterministic copilot → parsed-script converter that skips the LLM (two paths producing rows that drift, and edits would fall back to the LLM anyway). Printing the copilot's internal ids (unreadable in a script). Matching rows to shots by position (a merge or split shifts every later row).

**Refines →** D372, D286.

**Originated →** docs/superpowers/specs/2026-10-16-storyboard-to-canvas-design.md.

### D381 — A script arrives on the canvas with the storyboard the client approved, frozen on the node *(recorded 2026-10-16)*

**Decision.** Adding an approved script (Create canvas or the gallery) also hands over its approved panels: the ones frozen in the script's latest review version — the only version approval can approve — named by the script's order. The Script node keeps them as `storyboard`, never refreshed. A script with none gets no key.

**Why.** The panels the client signed off are the point; live picks can be redrawn during review or after a reopen. Keeping them on the node makes the canvas self-contained (Fan out and the gallery read the node, no extra fetch), and the node is already a frozen copy of the script (spec 1 §5.4).

**Rejected.** Reading `script_panel_picks` (not what the client approved). Fetching panels on demand from the canvas (a second source that can disagree with the text on the node).

**Refines →** D372, D351.

**Originated →** docs/superpowers/specs/2026-10-16-storyboard-to-canvas-design.md.

### D382 — Fan out wires each new shot's panel into it, and nothing further *(recorded 2026-10-16)*

**Decision.** For each node Fan out creates, every row it covers whose name matches a panel gets a File node pointing at the panel's stored image (no copy), placed under the shot and wired into its `image` handle. Only new nodes: a re-run adds no second panel, and a panel the person deleted stays deleted. Rows are spaced 360px instead of 170 when the script has a storyboard. Nothing is wired into prompt, Image Gen, Composite, the video prompt or Video Gen.

**Why.** On a Shot, an image on the image handle grounds the Shot Composer and nothing paid: the panel is three levels from Video Gen, which looks two up. Wiring past the shot is a choice the team should make after using this (operator, 2026-10-16).

**Rejected.** Wiring the panel into the image prompt automatically (deferred), or into Video Gen as a reference (reference support varies by model, and it skips the still).

**Refines →** D228, D28.

**Originated →** docs/superpowers/specs/2026-10-16-storyboard-to-canvas-design.md.

### D383 — A Multishot node shows an image; the gallery shows the whole storyboard *(recorded 2026-10-16)*

**Decision.** File, Draw, Image Gen and Composite may connect to a Multishot node, on an `image` handle with the Shot's id (so the wire survives a shot ↔ multishot flip). Nothing reads it: the multishot prompt resolves only its own direct upstream. The gallery's References tab shows a Storyboard group per Script node with panels, in shot order, labelled "S3 · HOOK — storyboard", even without a Drive folder.

**Why.** A Multishot row should carry its panel like any shot, but the multishot lane deliberately has no still (D230); reading the panel there is a separate decision. The gallery keeps every panel reachable when an edit unlinks one, which is why no warning is needed.

**Rejected.** Letting the multishot prompt read the panel now (deferred). A separate Storyboard gallery tab (the panels are references).

**Refines →** D230, D300.

**Originated →** docs/superpowers/specs/2026-10-16-storyboard-to-canvas-design.md.
```

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit -p . && npm run lint && npx vitest run`
Expected: no new type or lint errors; all tests pass. Some failures are known to pre-date this work: registry-test, trigger.dev and lint failures, and the Kling 5s cold-cache timeout, which should be re-run once before investigating. If a test fails, compare it against `staging` (`git stash` is shared, so use a second worktree or `git worktree add ../tmp-base staging` instead) before calling it pre-existing.

- [ ] **Step 3: In-app check (the `run` skill)**

Copy `.env.local` from the main checkout (`cp ../../../.env.local .env.local`), start the dev server, and on an approved copilot script that has panels:
1. Create canvas. The Script node's text has the Shot column, and the parse toast counts every shot.
2. Fan out. Each Shot has a "S1 · HOOK — storyboard" File node under it, wired into its bottom handle. Opening the Shot Composer shows the panel as an image.
3. Flip one row to multishot. Its panel stays wired, on the Multishot's bottom handle.
4. Gallery → References. A "Storyboard · <title>" group lists every panel in order, with or without a linked Drive folder. Dragging one onto the canvas adds a File node titled "S2 · BODY — storyboard".
5. Delete a panel node, then Fan out again. No panel comes back, and the panel is still in the gallery.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): D380-D383 the approved storyboard follows the script onto the canvas"
```
