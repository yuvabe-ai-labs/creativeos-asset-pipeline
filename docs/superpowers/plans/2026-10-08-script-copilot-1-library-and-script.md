# Script Copilot · Spec 1 (Library, Script, Handoff) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client has a Scripts library with a read-only script view, and an approved script can be dragged from a new Scripts tab in the canvas gallery onto a canvas, where it becomes a Script node that parses exactly like an upload, with the lead's avatar attached.

**Architecture:** One new table, `client_scripts`, holds each script as a validated JSON document (header, context card, cast, shots) plus its stage. Pure modules in `src/lib/scripts/` own the shape (zod), the timeline and beat grouping, and the printer that turns a script into the team's existing outline layout. Two read-only API routes serve the library page, the script view and the canvas gallery's Scripts tab. The canvas side reuses the existing Script node, its parse route, and the avatar-attach hook; the parse retry loop the canvas copilot already uses is extracted so the drop shares it.

**Tech Stack:** Next.js (App Router, this repo's version: read `node_modules/next/dist/docs/` first), React 19, TypeScript, Supabase (service-role server client), zod 4, TanStack Query, `@xyflow/react`, shadcn on Base UI (`src/components/ui/*`), Lucide, sonner, vitest (node environment).

**Spec:** [docs/superpowers/specs/2026-10-08-script-copilot-1-library-and-script-design.md](../specs/2026-10-08-script-copilot-1-library-and-script-design.md). Parent: [2026-10-07-script-copilot-design.md](../specs/2026-10-07-script-copilot-design.md). Read both before Task 1.

## Global Constraints

- **No AI in this spec.** No model calls are added. The only model call involved is the existing Script node parse, unchanged.
- **The parse prompt (`src/prompts/script-parse.ts`) and the parse route (`src/app/api/nodes/[id]/parse/route.ts`) do not change.**
- **Controls are shadcn primitives from `src/components/ui/*` only** (Base UI, `render` prop, not `asChild`). Never a raw `<button>`, `<input>`, `<select>`, checkbox or switch.
- **Design system:** colors only through the shadcn CSS variables in `globals.css`; Clash Display via `font-display` for headings, Gilroy body; purple `primary` used sparingly; resting cards `shadow-card`; eyebrow labels use `.text-eyebrow`; Lucide icons at `strokeWidth={1.5}`; easing `cubic-bezier(0.22,1,0.36,1)` only.
- **Wording:** "avatar" means the asset, a person in the client's Avatars library. Never "presenter" in user-facing text (code identifiers such as `presenterOf` stay). "Avatar" is never a format name; the founder format is "Founder-led".
- **Formats and names are shown exactly as the script holds them.** No product list of formats.
- **API routes:** `withClient` for every route under `src/app/api/clients/[id]/`, `apiOk` / `apiError` only (never `NextResponse.json`), `withTryCatch` for multi-step handlers.
- **Data fetching in the browser** goes through a service in `src/services/` and a TanStack Query hook in `src/hooks/queries/` whose keys are built in that file only.
- **Reuse, don't redefine:** `isUuid` from `@/lib/avatars/utils`; `CURRENT_GROUPING_VERSION` from `@/lib/nodes/group-shots`; `useAddAvatarNode` from `@/hooks/use-add-avatar-node`.
- **Migration number:** `0051` (the newest on `origin/staging` is `0050_kb_safe_writes.sql`). Re-check `git ls-tree --name-only origin/staging supabase/migrations/` before committing; bump if taken.
- **ADR numbers:** next free is `D319` (the log ends at D318). Re-check the log before writing Task 11; another person may have taken numbers.
- **One component per file, named exports, split at about 200 lines** (`docs/component-structure.md`).

## Review Focus

1. **A shot's text contains `|` or a line break** → the printed table must still have four cells per row, so the parse sees the right shots. Test in Task 3.
2. **A stored script row fails validation** (hand-edited or from an older shape) → the library still loads and skips that row; the script view for it is a 404, not a crash. Test in Task 4.
3. **The lead's avatar was archived, deleted, or is still a draft** → the script still arrives and parses, with no avatar attached. Test in Task 5.
4. **The script is dropped before the new node has autosaved** → the parse retries past the autosave; if it still fails, the node keeps its text and the error says to parse it from the node. Test in Task 9.
5. **A script id from another client is requested under this client's URL** → 404, never the other client's script. Test in Task 5.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0051_client_scripts.sql` | The `client_scripts` table |
| `src/lib/scripts/constants.ts` | Stages, stage labels, the drag MIME type |
| `src/lib/scripts/schema.ts` | zod schemas and types for the script document |
| `src/lib/scripts/timeline.ts` | Shot timecodes, total length, beat grouping |
| `src/lib/scripts/print.ts` | Prints a script in the team's outline layout |
| `src/lib/scripts/utils.ts` | Small display helpers shared by three screens |
| `src/lib/scripts/rows.ts` | Database row to `Script` |
| `src/lib/scripts/canvas.ts` | Drag payload parse for the canvas |
| `src/lib/scripts/fixtures/reel-01.json` | The seeded Reel 01 |
| `src/lib/db/scripts.ts` | `listScripts`, `getScript` |
| `src/app/api/clients/[id]/scripts/route.ts` | GET list, optional stage filter |
| `src/app/api/clients/[id]/scripts/[scriptId]/route.ts` | GET one, plus the lead's usable avatar id |
| `src/services/scripts.service.ts` | Browser calls to the two routes |
| `src/hooks/queries/scripts.ts` | Query keys and hooks |
| `scripts/seed-script.mjs` | Developer seed for a script fixture |
| `src/app/clients/[id]/scripts/page.tsx` | Library page |
| `src/app/clients/[id]/scripts/[scriptId]/page.tsx` | Script view page |
| `src/components/scripts/*.tsx` | Library and view components |
| `src/components/clients/client-settings-menu.tsx` | Adds the Scripts entry |
| `src/lib/nodes/parse-script-node.ts` | Shared parse call with autosave retry |
| `src/components/canvas/use-copilot-chat.ts` | Uses the shared parse call |
| `src/hooks/use-add-script-node.ts` | Drop or add a script onto the canvas |
| `src/components/canvas/gallery-drawer/gallery-scripts-tab.tsx` | The gallery's Scripts tab |
| `src/components/canvas/gallery-drawer/{types.ts,gallery-tabs.tsx,gallery-drawer.tsx}` | Tab wiring |
| `src/hooks/use-gallery-pane-drop.ts` | Accepts a dropped script |
| `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` | ADR entries |

---

### Task 1: The script's shape and the seeded Reel 01

**Files:**
- Create: `src/lib/scripts/constants.ts`
- Create: `src/lib/scripts/schema.ts`
- Create: `src/lib/scripts/fixtures/reel-01.json`
- Test: `src/lib/scripts/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `SCRIPT_STAGES`, `ScriptStage`, `SCRIPT_STAGE_LABEL`, `SCRIPT_DRAG_MIME` from `constants.ts`; `scriptDocSchema`, `ScriptDoc`, `ScriptHeader`, `ContextCard`, `CastMember`, `Shot`, `Script` from `schema.ts`.

- [ ] **Step 0: Read the docs this plan depends on**

Read `AGENTS.md`, `docs/component-structure.md`, `docs/api-routes.md`, and the App Router routing and dynamic-route pages under `node_modules/next/dist/docs/01-app/`. Then read the spec.

- [ ] **Step 1: Write the constants**

```ts
// src/lib/scripts/constants.ts
// Spec 1 (script copilot) — the stages a script moves through. Spec 2 owns "Mark final"
// (generate → visualise); spec 4 owns "Send" and "Approve" (visualise → in_review → approved).
export const SCRIPT_STAGES = ["generate", "visualise", "in_review", "approved"] as const;
export type ScriptStage = (typeof SCRIPT_STAGES)[number];

export const SCRIPT_STAGE_LABEL: Record<ScriptStage, string> = {
  generate: "Generate",
  visualise: "Visualise",
  in_review: "In review",
  approved: "Approved",
};

/** The gallery's Scripts tab drags `{ scriptId }` under this type (mirrors AVATAR_DRAG_MIME). */
export const SCRIPT_DRAG_MIME = "application/x-creativeos-script";

export function isScriptStage(value: unknown): value is ScriptStage {
  return typeof value === "string" && (SCRIPT_STAGES as readonly string[]).includes(value);
}
```

- [ ] **Step 2: Write the failing schema test**

```ts
// src/lib/scripts/__tests__/schema.test.ts
import { describe, it, expect } from "vitest";
import { scriptDocSchema, type ScriptDoc } from "../schema";
import reel01 from "../fixtures/reel-01.json";

const clone = (): ScriptDoc => structuredClone(reel01) as ScriptDoc;

describe("scriptDocSchema", () => {
  it("accepts the seeded Reel 01", () => {
    const parsed = scriptDocSchema.safeParse(reel01);
    expect(parsed.success).toBe(true);
  });

  it("Reel 01 has 14 shots, Meenakshi as the lead, and her husband in the cast", () => {
    const doc = scriptDocSchema.parse(reel01);
    expect(doc.shots).toHaveLength(14);
    expect(doc.cast.filter((c) => c.isLead).map((c) => c.name)).toEqual(["Meenakshi"]);
    expect(doc.cast.map((c) => c.name)).toContain("Meenakshi's husband");
    expect(doc.header.format).toBe("UGC");
  });

  it("rejects a cast with no lead", () => {
    const doc = clone();
    doc.cast = doc.cast.map((c) => ({ ...c, isLead: false }));
    expect(scriptDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a cast with two leads", () => {
    const doc = clone();
    doc.cast = doc.cast.map((c) => ({ ...c, isLead: true }));
    expect(scriptDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a shot that names someone outside the cast", () => {
    const doc = clone();
    doc.shots[0] = { ...doc.shots[0], onScreen: ["nobody-here"] };
    expect(scriptDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects duplicate shot ids", () => {
    const doc = clone();
    doc.shots[1] = { ...doc.shots[1], id: doc.shots[0].id };
    expect(scriptDocSchema.safeParse(doc).success).toBe(false);
  });

  it("accepts any free-text beat label and format", () => {
    const doc = clone();
    doc.shots[0] = { ...doc.shots[0], beat: "WHAT IT IS" };
    doc.header = { ...doc.header, format: "Founder-led (option)" };
    expect(scriptDocSchema.safeParse(doc).success).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/scripts/__tests__/schema.test.ts`
Expected: FAIL, cannot resolve `../schema` and `../fixtures/reel-01.json`.

- [ ] **Step 4: Write the schema**

```ts
// src/lib/scripts/schema.ts
import { z } from "zod";
import type { ScriptStage } from "./constants";

// Spec 1 §2 — a script is a header, a context card, a cast and an ordered list of shots.
// Stored whole as one JSON document (client_scripts.doc) and validated here on every read.

export const scriptHeaderSchema = z.object({
  reelNumber: z.number().int().positive().nullable(),
  title: z.string().trim().min(1).max(120),
  /** The client's own word for the format, inferred from their scripts (spec 1 §2.1). */
  format: z.string().trim().max(60),
  region: z.string().trim().max(60),
  /** As written: "Sun 11 Oct (first day of Navratri)". */
  postDate: z.string().trim().max(80),
  theme: z.string().trim().max(120),
  aspect: z.string().trim().max(20),
  targetLength: z.string().trim().max(40),
});

export const contextCardSchema = z.object({
  purpose: z.string().trim().max(2000),
  settingAndCamera: z.string().trim().max(2000),
  disclaimers: z.string().trim().max(2000),
  watchOuts: z.array(z.string().trim().min(1).max(1000)),
});

export const castMemberSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  /** The person in words: age, place, clothing, identity markers, voice. */
  description: z.string().trim().max(2000),
  /** The client Avatar this person is, once one exists (spec 3 makes or picks it). */
  avatarId: z.uuid().nullable(),
  isLead: z.boolean(),
});

export const shotSchema = z.object({
  id: z.string().min(1).max(64),
  /** Free text: HOOK, STEP, PROOF, or a label the script invents ("WHAT IT IS"). */
  beat: z.string().trim().max(40),
  lengthSeconds: z.number().positive().max(60),
  /** What happens, including setting changes and transitions, written as prose. */
  visual: z.string().trim().max(2000),
  vo: z.string().trim().max(1000),
  onScreenText: z.string().trim().max(500),
  /** Cast member ids on screen; empty means nobody (B-roll). */
  onScreen: z.array(z.string().min(1)),
});

export const scriptDocSchema = z
  .object({
    header: scriptHeaderSchema,
    context: contextCardSchema,
    cast: z.array(castMemberSchema).min(1),
    shots: z.array(shotSchema).min(1),
  })
  .superRefine((doc, ctx) => {
    const leads = doc.cast.filter((c) => c.isLead).length;
    if (leads !== 1) {
      ctx.addIssue({ code: "custom", path: ["cast"], message: "A script needs exactly one lead." });
    }
    const castIds = doc.cast.map((c) => c.id);
    if (new Set(castIds).size !== castIds.length) {
      ctx.addIssue({ code: "custom", path: ["cast"], message: "Cast member ids must be unique." });
    }
    const shotIds = doc.shots.map((s) => s.id);
    if (new Set(shotIds).size !== shotIds.length) {
      ctx.addIssue({ code: "custom", path: ["shots"], message: "Shot ids must be unique." });
    }
    const known = new Set(castIds);
    doc.shots.forEach((shot, i) => {
      for (const id of shot.onScreen) {
        if (!known.has(id)) {
          ctx.addIssue({ code: "custom", path: ["shots", i, "onScreen"], message: `Unknown cast member "${id}".` });
        }
      }
    });
  });

export type ScriptHeader = z.infer<typeof scriptHeaderSchema>;
export type ContextCard = z.infer<typeof contextCardSchema>;
export type CastMember = z.infer<typeof castMemberSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type ScriptDoc = z.infer<typeof scriptDocSchema>;

export type Script = {
  id: string;
  clientId: string;
  stage: ScriptStage;
  doc: ScriptDoc;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 5: Write the Reel 01 fixture**

Split by hand from the outline's 9 rows (`docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md`, Reel 01). Every VO word is the outline's, split at sentence boundaries; the totals come to 52 seconds.

```json
{
  "header": {
    "reelNumber": 1,
    "title": "Golu starts today",
    "format": "UGC",
    "region": "South",
    "postDate": "Sun 11 Oct (first day of Navratri)",
    "theme": "Navratri / Golu",
    "aspect": "9:16",
    "targetLength": "45 to 55 sec"
  },
  "context": {
    "purpose": "Open the series on the first morning of Golu in a Chennai home. Festival week doesn't have to mean looking away from health: the batter gets its spoon, and the pack's claim carries the benefit.",
    "settingAndCamera": "Chennai flat with a Golu of five or seven steps (padi) in the hall and a pair of marapachi bommai at the centre. Kitchen in soft morning daylight with a gas stove and an iron dosa tawa. Gentle handheld, top-down on the batter bowl.",
    "disclaimers": "D3 applies as well as D1, D2 and D4, because the study is named.",
    "watchOuts": [
      "Post Sun 11 Oct, the first day of Navratri, and confirm it in a Panchang. Onion and garlic stay off screen. Golu is kept in many Tamil, Telugu and Kannada homes, not all.",
      "Meenakshi never says her family's sugar is in check. The only health line is the pack's own claim, which legal should clear in her voice, with D1 on screen.",
      "Sundal on the Golu tray, no mithai."
    ]
  },
  "cast": [
    {
      "id": "meenakshi",
      "name": "Meenakshi",
      "description": "Meenakshi, 54, Chennai. Cotton saree in the kitchen, silk with a zari border for guests. Glass bangles, kumkum pottu, reading glasses on a chain. Easy, amused English with a Tamil lilt.",
      "avatarId": null,
      "isLead": true
    },
    {
      "id": "husband",
      "name": "Meenakshi's husband",
      "description": "Her husband, 58, in a veshti.",
      "avatarId": null,
      "isLead": false
    }
  ],
  "shots": [
    { "id": "s01", "beat": "HOOK", "lengthSeconds": 3, "visual": "First morning of Golu. Early light in the hall. Meenakshi straightens the last doll on the steps.", "vo": "Golu starts today.", "onScreenText": "Golu starts today.", "onScreen": ["meenakshi"] },
    { "id": "s02", "beat": "HOOK", "lengthSeconds": 2, "visual": "She turns to camera with a small laugh.", "vo": "Nine nights of guests, and the kitchen doesn't close.", "onScreenText": "", "onScreen": ["meenakshi"] },
    { "id": "s03", "beat": "INTRO", "lengthSeconds": 4, "visual": "The same morning, in the kitchen. Sambar simmering, the iron tawa heating, a bowl of dosa batter on the counter.", "vo": "Festival week is busy, but that's no reason to let health slide.", "onScreenText": "Festivals, without compromising on health", "onScreen": [] },
    { "id": "s04", "beat": "INTRO", "lengthSeconds": 3, "visual": "Cut to the kitchen door. Through it, the Golu steps wait in the hall.", "vo": "So breakfast stays simple: dosa and sambar.", "onScreenText": "", "onScreen": [] },
    { "id": "s05", "beat": "STORY", "lengthSeconds": 4, "visual": "Meenakshi holds the pack up beside the batter bowl.", "vo": "This is where Jackfruit365 comes in.", "onScreenText": "One bowl. One stir.", "onScreen": ["meenakshi"] },
    { "id": "s06", "beat": "STORY", "lengthSeconds": 3, "visual": "She tilts the bowl towards camera. Her husband sits down at the table behind her.", "vo": "I put it in the batter, so one stir covers the whole breakfast.", "onScreenText": "", "onScreen": ["meenakshi", "husband"] },
    { "id": "s07", "beat": "STEP", "lengthSeconds": 6, "visual": "Top-down on the bowl. Meenakshi levels one tablespoon of flour, then a second, and stirs both into the batter.", "vo": "One level tablespoon of the flour for each person. Two of us at breakfast, so two spoons.", "onScreenText": "Just 1 tablespoon per meal", "onScreen": ["meenakshi"] },
    { "id": "s08", "beat": "REVIEW", "lengthSeconds": 8, "visual": "A real Amazon review card slides in with a Verified Purchase badge. Meenakshi glances at it. Use a real, cleared review on this theme: fitting the habit into a busy week.", "vo": "One customer wrote on Amazon: \"[real review, verbatim]\".", "onScreenText": "Customer review on Amazon · Verified Purchase", "onScreen": ["meenakshi"] },
    { "id": "s09", "beat": "BODY", "lengthSeconds": 2.5, "visual": "A dosa sizzles on the iron tawa.", "vo": "Then it's dosas, sambar and chutney, same as always.", "onScreenText": "No change to your diet", "onScreen": [] },
    { "id": "s10", "beat": "BODY", "lengthSeconds": 2.5, "visual": "Soft dissolve to the family at the breakfast table with dosas, sambar, coconut chutney and a little podi.", "vo": "No change to our diet.", "onScreenText": "No change to your diet", "onScreen": ["meenakshi", "husband"] },
    { "id": "s11", "beat": "PAYOFF", "lengthSeconds": 3.5, "visual": "Meenakshi taps the claim line on the pack.", "vo": "Breakfast is done. Jackfruit365 helps control blood sugar levels, and that's how we're starting Golu.", "onScreenText": "Helps control blood sugar levels*", "onScreen": ["meenakshi"] },
    { "id": "s12", "beat": "PAYOFF", "lengthSeconds": 3.5, "visual": "She lights the kuthuvilakku while her husband finishes his coffee. The silk saree waits on a chair for the evening.", "vo": "Now, let the guests come.", "onScreenText": "Guests tonight.", "onScreen": ["meenakshi", "husband"] },
    { "id": "s13", "beat": "PROOF", "lengthSeconds": 3, "visual": "Slow push-in on the open pack. Hold the claim card for 3 seconds.", "vo": "It's clinically tested green jackfruit flour.", "onScreenText": "Helps control blood sugar levels* · Clinically tested. Nutrition & Diabetes, 2021", "onScreen": [] },
    { "id": "s14", "beat": "OUTRO", "lengthSeconds": 4, "visual": "Pack on the steel counter beside the brass lamp.", "vo": "Jackfruit365 Green Jackfruit Flour. Available on Amazon.", "onScreenText": "Pack shot. Available on Amazon. Disclaimer line.", "onScreen": [] }
  ]
}
```

If `import reel01 from "../fixtures/reel-01.json"` fails type-checking, confirm `"resolveJsonModule": true` in `tsconfig.json` (Next sets it by default) rather than changing the import.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/scripts/__tests__/schema.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scripts/constants.ts src/lib/scripts/schema.ts src/lib/scripts/fixtures/reel-01.json src/lib/scripts/__tests__/schema.test.ts
git commit -m "feat(scripts): script document shape and the seeded Reel 01"
```

---

### Task 2: Timeline and beat grouping

**Files:**
- Create: `src/lib/scripts/timeline.ts`
- Create: `src/lib/scripts/utils.ts`
- Test: `src/lib/scripts/__tests__/timeline.test.ts`

**Interfaces:**
- Consumes: `Shot`, `ScriptDoc`, `ScriptHeader` from Task 1.
- Produces: `TimedShot = { shot: Shot; index: number; start: number; end: number }`, `BeatGroup = { beat: string; start: number; end: number; shots: TimedShot[] }`, `timeShots(shots: Shot[]): TimedShot[]`, `totalSeconds(shots: Shot[]): number`, `formatSeconds(n: number): string`, `formatRange(start: number, end: number): string`, `groupByBeat(timed: TimedShot[]): BeatGroup[]`; from `utils.ts`: `reelLabel(n: number | null): string | null`, `headerLine(h: ScriptHeader): string`, `shotSummary(doc: ScriptDoc): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scripts/__tests__/timeline.test.ts
import { describe, it, expect } from "vitest";
import { timeShots, totalSeconds, formatSeconds, formatRange, groupByBeat } from "../timeline";
import { reelLabel, headerLine, shotSummary } from "../utils";
import { scriptDocSchema, type Shot } from "../schema";
import reel01 from "../fixtures/reel-01.json";

const doc = scriptDocSchema.parse(reel01);
const shot = (id: string, beat: string, lengthSeconds: number): Shot => ({
  id, beat, lengthSeconds, visual: "", vo: "", onScreenText: "", onScreen: [],
});

describe("timeline", () => {
  it("works out timecodes from lengths, including half seconds", () => {
    const timed = timeShots([shot("a", "BODY", 2.5), shot("b", "BODY", 2.5), shot("c", "PAYOFF", 3.5)]);
    expect(timed.map((t) => [t.start, t.end])).toEqual([[0, 2.5], [2.5, 5], [5, 8.5]]);
  });

  it("Reel 01 runs 52 seconds", () => {
    expect(totalSeconds(doc.shots)).toBe(52);
  });

  it("formats seconds and ranges the way the outlines write them", () => {
    expect(formatSeconds(3)).toBe("3");
    expect(formatSeconds(35.5)).toBe("35.5");
    expect(formatRange(33, 35.5)).toBe("33-35.5s");
  });

  it("groups back-to-back shots that share a beat", () => {
    const groups = groupByBeat(timeShots(doc.shots));
    expect(groups.map((g) => g.beat)).toEqual([
      "HOOK", "INTRO", "STORY", "STEP", "REVIEW", "BODY", "PAYOFF", "PROOF", "OUTRO",
    ]);
    expect(groups[0]).toMatchObject({ start: 0, end: 5 });
  });

  it("a beat that comes back later starts its own group (timeline order wins)", () => {
    const groups = groupByBeat(timeShots([shot("a", "HOOK", 2), shot("b", "STEP", 2), shot("c", "hook ", 2)]));
    expect(groups.map((g) => g.beat)).toEqual(["HOOK", "STEP", "HOOK"]);
  });

  it("each Reel 01 beat's voiceover is the outline's row, word for word", () => {
    const vo = groupByBeat(timeShots(doc.shots)).map((g) => g.shots.map((t) => t.shot.vo).join(" "));
    expect(vo).toEqual([
      "Golu starts today. Nine nights of guests, and the kitchen doesn't close.",
      "Festival week is busy, but that's no reason to let health slide. So breakfast stays simple: dosa and sambar.",
      "This is where Jackfruit365 comes in. I put it in the batter, so one stir covers the whole breakfast.",
      "One level tablespoon of the flour for each person. Two of us at breakfast, so two spoons.",
      'One customer wrote on Amazon: "[real review, verbatim]".',
      "Then it's dosas, sambar and chutney, same as always. No change to our diet.",
      "Breakfast is done. Jackfruit365 helps control blood sugar levels, and that's how we're starting Golu. Now, let the guests come.",
      "It's clinically tested green jackfruit flour.",
      "Jackfruit365 Green Jackfruit Flour. Available on Amazon.",
    ]);
  });
});

describe("display helpers", () => {
  it("labels reels with two digits, and none without a number", () => {
    expect(reelLabel(1)).toBe("Reel 01");
    expect(reelLabel(12)).toBe("Reel 12");
    expect(reelLabel(null)).toBeNull();
  });

  it("joins the header's non-empty parts", () => {
    expect(headerLine(doc.header)).toBe("UGC · South · Sun 11 Oct (first day of Navratri)");
    expect(headerLine({ ...doc.header, region: "" })).toBe("UGC · Sun 11 Oct (first day of Navratri)");
  });

  it("summarises shots and length", () => {
    expect(shotSummary(doc)).toBe("14 shots · 52s");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/scripts/__tests__/timeline.test.ts`
Expected: FAIL, cannot resolve `../timeline`.

- [ ] **Step 3: Write `timeline.ts`**

```ts
// src/lib/scripts/timeline.ts
import type { Shot } from "./schema";

// Spec 1 §2.4 — the running timecode is worked out from the lengths, never typed. Rounded to a
// tenth so 2.5 + 2.5 + 3.5 never shows floating-point noise.
const round = (n: number) => Math.round(n * 10) / 10;

export type TimedShot = { shot: Shot; index: number; start: number; end: number };
export type BeatGroup = { beat: string; start: number; end: number; shots: TimedShot[] };

export function timeShots(shots: Shot[]): TimedShot[] {
  let t = 0;
  return shots.map((shot, index) => {
    const start = t;
    t = round(t + shot.lengthSeconds);
    return { shot, index, start, end: t };
  });
}

export function totalSeconds(shots: Shot[]): number {
  return round(shots.reduce((sum, s) => sum + s.lengthSeconds, 0));
}

export function formatSeconds(n: number): string {
  return String(round(n));
}

export function formatRange(start: number, end: number): string {
  return `${formatSeconds(start)}-${formatSeconds(end)}s`;
}

const beatKey = (beat: string) => beat.trim().toUpperCase();

/** Back-to-back shots with the same beat form one group. The timeline order always wins: a
 *  beat that comes back later starts a new group rather than merging with the first. */
export function groupByBeat(timed: TimedShot[]): BeatGroup[] {
  const groups: BeatGroup[] = [];
  for (const t of timed) {
    const key = beatKey(t.shot.beat);
    const last = groups[groups.length - 1];
    if (last && last.beat === key) {
      last.shots.push(t);
      last.end = t.end;
    } else {
      groups.push({ beat: key, start: t.start, end: t.end, shots: [t] });
    }
  }
  return groups;
}
```

- [ ] **Step 4: Write `utils.ts`**

```ts
// src/lib/scripts/utils.ts
import type { ScriptDoc, ScriptHeader } from "./schema";
import { formatSeconds, totalSeconds } from "./timeline";

// Shared by the library card, the script view and the gallery's Scripts tab.

export function reelLabel(reelNumber: number | null): string | null {
  return reelNumber === null ? null : `Reel ${String(reelNumber).padStart(2, "0")}`;
}

export function headerLine(header: ScriptHeader): string {
  return [header.format, header.region, header.postDate].filter((p) => p.trim()).join(" · ");
}

export function shotSummary(doc: ScriptDoc): string {
  const n = doc.shots.length;
  return `${n} shot${n === 1 ? "" : "s"} · ${formatSeconds(totalSeconds(doc.shots))}s`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/scripts/__tests__/timeline.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scripts/timeline.ts src/lib/scripts/utils.ts src/lib/scripts/__tests__/timeline.test.ts
git commit -m "feat(scripts): timecodes from lengths and beat grouping"
```

---

### Task 3: Print a script in the team's layout

**Files:**
- Create: `src/lib/scripts/print.ts`
- Test: `src/lib/scripts/__tests__/print.test.ts`

**Interfaces:**
- Consumes: `ScriptDoc` (Task 1), `timeShots`, `formatRange` (Task 2), `reelLabel` (Task 2).
- Produces: `printScript(doc: ScriptDoc): string`.

The layout matches the Jackfruit365 outlines (spec 1 §5.2): title line, header row, Purpose, Character, Setting and camera, the four-column table with **one row per shot**, then Disclaimers and Watch-outs.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scripts/__tests__/print.test.ts
import { describe, it, expect } from "vitest";
import { printScript } from "../print";
import { scriptDocSchema, type ScriptDoc } from "../schema";
import reel01 from "../fixtures/reel-01.json";

const doc = scriptDocSchema.parse(reel01);
const tableRows = (text: string) =>
  text.split("\n").filter((l) => l.startsWith("| **") && !l.startsWith("| **Beat"));

describe("printScript", () => {
  const text = printScript(doc);

  it("opens with the reel's title line and header row", () => {
    expect(text.startsWith("**Reel 01  Golu starts today**\n")).toBe(true);
    expect(text).toContain(
      "| UGC | South   ·   Sun 11 Oct (first day of Navratri)   ·   Navratri / Golu   ·   9:16, 45 to 55 sec |",
    );
  });

  it("prints the three sections the outlines use, with the cast as Character", () => {
    expect(text).toContain("**Purpose.**  Open the series on the first morning of Golu");
    expect(text).toContain(
      "**Character.**  Meenakshi, 54, Chennai. Cotton saree in the kitchen, silk with a zari border for guests. Glass bangles, kumkum pottu, reading glasses on a chain. Easy, amused English with a Tamil lilt. Her husband, 58, in a veshti.",
    );
    expect(text).toContain("**Setting and camera.**  Chennai flat with a Golu");
  });

  it("prints the outlines' table header and one row per shot", () => {
    expect(text).toContain("| Beat | Visual | VO | On-screen text |\n| :---- | :---- | :---- | :---- |");
    const rows = tableRows(text);
    expect(rows).toHaveLength(14);
    expect(rows[0]).toBe("| **HOOK 0-3s** | First morning of Golu. Early light in the hall. Meenakshi straightens the last doll on the steps. | Golu starts today. | **Golu starts today.** |");
    expect(rows[8]).toContain("| **BODY 33-35.5s** |");
  });

  it("leaves an empty on-screen text cell empty, not bold markers", () => {
    expect(tableRows(text)[1].endsWith("| Nine nights of guests, and the kitchen doesn't close. |  |")).toBe(true);
  });

  it("prints disclaimers and watch-outs after the table", () => {
    const table = text.indexOf("| Beat |");
    expect(text.indexOf("**Disclaimers.**  D3 applies")).toBeGreaterThan(table);
    expect(text).toContain("**Watch-outs**\n\n* Post Sun 11 Oct");
    expect(text).toContain("* Sundal on the Golu tray, no mithai.");
  });

  it("keeps four cells when text holds a pipe or a line break", () => {
    const tricky: ScriptDoc = structuredClone(doc);
    tricky.shots[0] = { ...tricky.shots[0], visual: "Left | right\nnext line", vo: "A | B" };
    const row = tableRows(printScript(tricky))[0];
    expect(row).toBe("| **HOOK 0-3s** | Left \\| right next line | A \\| B | **Golu starts today.** |");
    expect(row.split(/(?<!\\)\|/).length).toBe(6); // 4 cells between 5 pipes
  });

  it("omits empty sections and a missing reel number", () => {
    const bare: ScriptDoc = structuredClone(doc);
    bare.header = { ...bare.header, reelNumber: null };
    bare.context = { ...bare.context, disclaimers: "", watchOuts: [] };
    const out = printScript(bare);
    expect(out.startsWith("**Golu starts today**\n")).toBe(true);
    expect(out).not.toContain("**Disclaimers.**");
    expect(out).not.toContain("**Watch-outs**");
  });

  it("prints a cast member with no description by name", () => {
    const named: ScriptDoc = structuredClone(doc);
    named.cast[1] = { ...named.cast[1], description: "" };
    expect(printScript(named)).toContain("a Tamil lilt. Meenakshi's husband.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/scripts/__tests__/print.test.ts`
Expected: FAIL, cannot resolve `../print`.

- [ ] **Step 3: Write `print.ts`**

```ts
// src/lib/scripts/print.ts
import type { ScriptDoc } from "./schema";
import { formatRange, timeShots } from "./timeline";
import { reelLabel } from "./utils";

// Spec 1 §5 — the handoff prints the script in the layout of the team's existing outlines
// (docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md), which the Script
// node's parse already handles, so the parse needs no change. ONE ROW PER SHOT: the parse makes
// one shot per row, so the canvas gets exactly the shots the client approved.

const HEADER_SEP = "   ·   ";

/** A table cell: one line, with pipes escaped so a cell can never split into two. */
function cell(text: string): string {
  return text.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
}

const bold = (text: string) => (text.trim() ? `**${cell(text)}**` : "");

function character(doc: ScriptDoc): string {
  return doc.cast
    .map((c) => (c.description.trim() ? c.description.trim() : `${c.name}.`))
    .join(" ");
}

export function printScript(doc: ScriptDoc): string {
  const { header, context } = doc;
  const label = reelLabel(header.reelNumber);
  const lines: string[] = [];

  lines.push(`**${label ? `${label}  ` : ""}${header.title}**`, "");

  const aspectLength = [header.aspect, header.targetLength].filter((p) => p.trim()).join(", ");
  const facts = [header.region, header.postDate, header.theme, aspectLength].filter((p) => p.trim());
  lines.push(`| ${cell(header.format)} | ${facts.map(cell).join(HEADER_SEP)} |`, "| :---- | :---- |", "");

  if (context.purpose.trim()) lines.push(`**Purpose.**  ${context.purpose.trim()}`, "");
  lines.push(`**Character.**  ${character(doc)}`, "");
  if (context.settingAndCamera.trim()) lines.push(`**Setting and camera.**  ${context.settingAndCamera.trim()}`, "");

  lines.push("| Beat | Visual | VO | On-screen text |", "| :---- | :---- | :---- | :---- |");
  for (const t of timeShots(doc.shots)) {
    const beat = `${t.shot.beat.trim().toUpperCase()} ${formatRange(t.start, t.end)}`.trim();
    lines.push(`| **${cell(beat)}** | ${cell(t.shot.visual)} | ${cell(t.shot.vo)} | ${bold(t.shot.onScreenText)} |`);
  }
  lines.push("");

  if (context.disclaimers.trim()) lines.push(`**Disclaimers.**  ${context.disclaimers.trim()}`, "");
  if (context.watchOuts.length > 0) {
    lines.push("**Watch-outs**", "", ...context.watchOuts.map((w) => `* ${w.trim()}`), "");
  }

  return lines.join("\n").trimEnd() + "\n";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/scripts/__tests__/print.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/print.ts src/lib/scripts/__tests__/print.test.ts
git commit -m "feat(scripts): print a script in the team's outline layout, one row per shot"
```

---

### Task 4: The table, row mapping and reads

**Files:**
- Create: `supabase/migrations/0051_client_scripts.sql`
- Create: `src/lib/scripts/rows.ts`
- Create: `src/lib/db/scripts.ts`
- Test: `src/lib/scripts/__tests__/rows.test.ts`

**Interfaces:**
- Consumes: `scriptDocSchema`, `Script` (Task 1), `isScriptStage` (Task 1), `isUuid` from `@/lib/avatars/utils`.
- Produces: `ScriptRow`, `rowToScript(row: ScriptRow): Script | null`; `listScripts(clientId: string, opts?: { stage?: ScriptStage }): Promise<Script[]>`, `getScript(clientId: string, scriptId: string): Promise<Script | null>`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0051_client_scripts.sql
-- Script copilot spec 1: a client's reel scripts. See
-- docs/superpowers/specs/2026-10-08-script-copilot-1-library-and-script-design.md.
-- Purely additive: one new table, nothing existing is altered.

create table client_scripts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  stage       text not null default 'generate'
                check (stage in ('generate', 'visualise', 'in_review', 'approved')),
  -- The whole script (header, context card, cast, shots), validated by scriptDocSchema
  -- (src/lib/scripts/schema.ts) on every read. JSONB because it is always read and written
  -- whole; nothing filters on its fields in SQL.
  doc         jsonb not null,
  approved_at timestamptz,
  archived_at timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The library and the gallery's Scripts tab always read one client's live scripts.
create index client_scripts_client_idx on client_scripts (client_id, archived_at, stage);

-- Default-deny RLS with zero policies, as 0041_client_avatars.sql: the app reads and writes
-- through the service-role client; this only closes the direct-REST path the anon key opens.
alter table client_scripts enable row level security;
```

- [ ] **Step 2: Write the failing rows test**

```ts
// src/lib/scripts/__tests__/rows.test.ts
import { describe, it, expect, vi } from "vitest";
import { rowToScript, type ScriptRow } from "../rows";
import reel01 from "../fixtures/reel-01.json";

const row = (overrides: Partial<ScriptRow> = {}): ScriptRow => ({
  id: "6f1c2b1e-0000-4000-8000-000000000001",
  client_id: "c1",
  stage: "approved",
  doc: reel01,
  approved_at: "2026-10-10T10:00:00.000Z",
  archived_at: null,
  created_at: "2026-10-08T10:00:00.000Z",
  updated_at: "2026-10-10T10:00:00.000Z",
  ...overrides,
});

describe("rowToScript", () => {
  it("maps a valid row", () => {
    const script = rowToScript(row());
    expect(script).toMatchObject({ id: row().id, clientId: "c1", stage: "approved", approvedAt: "2026-10-10T10:00:00.000Z" });
    expect(script?.doc.shots).toHaveLength(14);
  });

  it("returns null, and warns, for a doc that fails validation", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(rowToScript(row({ doc: { header: {} } }))).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null for an unknown stage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(rowToScript(row({ stage: "shipped" }))).toBeNull();
    warn.mockRestore();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/scripts/__tests__/rows.test.ts`
Expected: FAIL, cannot resolve `../rows`.

- [ ] **Step 4: Write `rows.ts`**

```ts
// src/lib/scripts/rows.ts
import { scriptDocSchema, type Script } from "./schema";
import { isScriptStage } from "./constants";

export type ScriptRow = {
  id: string;
  client_id: string;
  stage: string;
  doc: unknown;
  approved_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A row the app can show, or null. A row that fails validation (hand-edited, or from an
 *  older shape) is skipped with a warning rather than breaking the whole library. */
export function rowToScript(row: ScriptRow): Script | null {
  const doc = scriptDocSchema.safeParse(row.doc);
  if (!doc.success || !isScriptStage(row.stage)) {
    console.warn(`[scripts] skipping script ${row.id}: ${doc.success ? `unknown stage "${row.stage}"` : doc.error.message}`);
    return null;
  }
  return {
    id: row.id,
    clientId: row.client_id,
    stage: row.stage,
    doc: doc.data,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 5: Write `src/lib/db/scripts.ts`**

```ts
// src/lib/db/scripts.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { rowToScript, type ScriptRow } from "@/lib/scripts/rows";
import type { Script } from "@/lib/scripts/schema";
import type { ScriptStage } from "@/lib/scripts/constants";
import { isUuid } from "@/lib/avatars/utils";

// Every query filters on client_id as well as the script id. withClient authorises the CLIENT in
// the URL, not the script id beside it (the same reasoning as src/lib/db/avatars.ts).

const byReel = (a: Script, b: Script) =>
  (a.doc.header.reelNumber ?? Number.MAX_SAFE_INTEGER) - (b.doc.header.reelNumber ?? Number.MAX_SAFE_INTEGER) ||
  b.updatedAt.localeCompare(a.updatedAt);

export async function listScripts(clientId: string, opts: { stage?: ScriptStage } = {}): Promise<Script[]> {
  const supabase = createServerSupabase();
  let query = supabase.from("client_scripts").select("*").eq("client_id", clientId).is("archived_at", null);
  if (opts.stage) query = query.eq("stage", opts.stage);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ScriptRow[])
    .map(rowToScript)
    .filter((s): s is Script => s !== null)
    .sort(byReel);
}

export async function getScript(clientId: string, scriptId: string): Promise<Script | null> {
  // Postgres throws on a non-UUID id; a malformed id is simply not found.
  if (!isUuid(scriptId)) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts")
    .select("*")
    .eq("id", scriptId)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToScript(data as ScriptRow) : null;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/scripts`
Expected: PASS, all script tests.

- [ ] **Step 7: Apply the migration to the staging database (the user does this)**

Ask the user to run `supabase/migrations/0051_client_scripts.sql` in the staging Supabase SQL editor, the same way 0047 and 0050 were applied. Do not apply it yourself. Continue with Task 5 while waiting; Task 6 needs it.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0051_client_scripts.sql src/lib/scripts/rows.ts src/lib/db/scripts.ts src/lib/scripts/__tests__/rows.test.ts
git commit -m "feat(scripts): client_scripts table and reads"
```

---

### Task 5: API routes

**Files:**
- Create: `src/app/api/clients/[id]/scripts/route.ts`
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/route.ts`
- Test: `src/app/api/clients/[id]/scripts/route.test.ts`
- Test: `src/app/api/clients/[id]/scripts/[scriptId]/route.test.ts`

**Interfaces:**
- Consumes: `listScripts`, `getScript` (Task 4); `getAvatar` from `@/lib/db/avatars`; `isScriptStage` (Task 1).
- Produces: `GET /api/clients/:id/scripts[?stage=<ScriptStage>]` → `{ scripts: Script[] }`; `GET /api/clients/:id/scripts/:scriptId` → `{ script: Script, leadAvatarId: string | null }`. `leadAvatarId` is the lead's avatar id only when that avatar exists for this client, is ready, and is not archived.

- [ ] **Step 1: Write the failing list-route test**

```ts
// src/app/api/clients/[id]/scripts/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ listScripts: vi.fn(), getScript: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { listScripts } from "@/lib/db/scripts";

const params = Promise.resolve({ id: "c1" });
const get = (qs = "") => new NextRequest(`http://localhost/api/clients/c1/scripts${qs}`);

describe("GET /api/clients/[id]/scripts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
    vi.mocked(listScripts).mockResolvedValue([]);
  });

  it("lists the client's scripts", async () => {
    const { GET } = await import("./route");
    const res = await GET(get(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scripts: [] });
    expect(listScripts).toHaveBeenCalledWith("c1", {});
  });

  it("filters by a known stage", async () => {
    const { GET } = await import("./route");
    await GET(get("?stage=approved"), { params });
    expect(listScripts).toHaveBeenCalledWith("c1", { stage: "approved" });
  });

  it("rejects an unknown stage", async () => {
    const { GET } = await import("./route");
    const res = await GET(get("?stage=shipped"), { params });
    expect(res.status).toBe(400);
    expect(listScripts).not.toHaveBeenCalled();
  });

  it("is a 404 for a client in another org", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Other", org_id: "org-2" } as never);
    const { GET } = await import("./route");
    const res = await GET(get(), { params });
    expect(res.status).toBe(404);
    expect(listScripts).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/api/clients/[id]/scripts/route.test.ts"`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Write the list route**

```ts
// src/app/api/clients/[id]/scripts/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { listScripts } from "@/lib/db/scripts";
import { isScriptStage } from "@/lib/scripts/constants";

// GET /api/clients/:id/scripts[?stage=approved] — the client's live scripts. The canvas
// gallery's Scripts tab asks for approved ones only (spec 1 §5.1).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the scripts.", async () => {
      const stage = new URL(req.url).searchParams.get("stage");
      if (stage !== null && !isScriptStage(stage)) return apiError("Unknown stage.", 400);
      return apiOk({ scripts: await listScripts(clientId, stage ? { stage } : {}) });
    }),
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "src/app/api/clients/[id]/scripts/route.test.ts"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing detail-route test**

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";
import { scriptDocSchema, type Script } from "@/lib/scripts/schema";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ listScripts: vi.fn(), getScript: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getAvatar } from "@/lib/db/avatars";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const AVATAR_ID = "7a2d3c4e-0000-4000-8000-000000000002";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const req = () => new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}`);

function scriptWithLead(avatarId: string | null): Script {
  const doc = scriptDocSchema.parse(reel01);
  doc.cast = doc.cast.map((c) => (c.isLead ? { ...c, avatarId } : c));
  return { id: SCRIPT_ID, clientId: "c1", stage: "approved", doc, approvedAt: null, createdAt: "x", updatedAt: "x" };
}

describe("GET /api/clients/[id]/scripts/[scriptId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  });

  it("returns the script and the lead's avatar when it is ready", async () => {
    vi.mocked(getScript).mockResolvedValue(scriptWithLead(AVATAR_ID));
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ id: AVATAR_ID, status: "ready", archivedAt: null }));
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.script.id).toBe(SCRIPT_ID);
    expect(body.leadAvatarId).toBe(AVATAR_ID);
    expect(getScript).toHaveBeenCalledWith("c1", SCRIPT_ID);
    expect(getAvatar).toHaveBeenCalledWith("c1", AVATAR_ID);
  });

  it("gives no lead avatar when the lead has none yet", async () => {
    vi.mocked(getScript).mockResolvedValue(scriptWithLead(null));
    const { GET } = await import("./route");
    const body = await (await GET(req(), { params })).json();
    expect(body.leadAvatarId).toBeNull();
    expect(getAvatar).not.toHaveBeenCalled();
  });

  it("gives no lead avatar when that avatar was archived", async () => {
    vi.mocked(getScript).mockResolvedValue(scriptWithLead(AVATAR_ID));
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ id: AVATAR_ID, archivedAt: "2026-10-09T00:00:00.000Z" }));
    const { GET } = await import("./route");
    expect((await (await GET(req(), { params })).json()).leadAvatarId).toBeNull();
  });

  it("gives no lead avatar when that avatar is a draft or gone", async () => {
    vi.mocked(getScript).mockResolvedValue(scriptWithLead(AVATAR_ID));
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ id: AVATAR_ID, status: "draft" }));
    const { GET } = await import("./route");
    expect((await (await GET(req(), { params })).json()).leadAvatarId).toBeNull();
    vi.mocked(getAvatar).mockResolvedValue(null);
    expect((await (await GET(req(), { params })).json()).leadAvatarId).toBeNull();
  });

  it("is a 404 when the script is not this client's", async () => {
    vi.mocked(getScript).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run "src/app/api/clients/[id]/scripts/[scriptId]/route.test.ts"`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 7: Write the detail route**

Check how `withClient` passes extra params by reading `src/lib/api/route-helpers.ts` and an existing nested route such as `src/app/api/clients/[id]/avatars/[avatarId]/route.ts`; follow that exactly. The shape below assumes the avatar route's pattern of awaiting `params` for the child id.

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { getAvatar } from "@/lib/db/avatars";

type Params = Promise<{ id: string; scriptId: string }>;

// GET /api/clients/:id/scripts/:scriptId — one script, plus the lead's avatar id when that
// avatar can go on a canvas: this client's, ready, not archived (spec 1 §5.4). Otherwise null,
// and the script still arrives without an avatar.
export async function GET(req: Request, { params }: { params: Params }) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the script.", async () => {
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      const lead = script.doc.cast.find((c) => c.isLead);
      const avatar = lead?.avatarId ? await getAvatar(clientId, lead.avatarId) : null;
      const leadAvatarId = avatar && avatar.status === "ready" && !avatar.archivedAt ? avatar.id : null;
      return apiOk({ script, leadAvatarId });
    }),
  );
}
```

- [ ] **Step 8: Run both route tests**

Run: `npx vitest run "src/app/api/clients/[id]/scripts"`
Expected: PASS, 9 tests.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/clients/[id]/scripts"
git commit -m "feat(scripts): list and detail routes"
```

---

### Task 6: Browser service, query hooks, and the seed

**Files:**
- Create: `src/services/scripts.service.ts`
- Create: `src/hooks/queries/scripts.ts`
- Create: `scripts/seed-script.mjs`

**Interfaces:**
- Consumes: the two routes (Task 5), `readJson` from `@/services/read-json`.
- Produces: `scriptsService.list(clientId, stage?)`, `scriptsService.get(clientId, scriptId): Promise<{ script: Script; leadAvatarId: string | null }>`; `scriptKeys`, `useApprovedScripts(clientId)`, `useRefreshScripts(clientId)`.

- [ ] **Step 1: Write the service**

```ts
// src/services/scripts.service.ts
import type { Script } from "@/lib/scripts/schema";
import type { ScriptStage } from "@/lib/scripts/constants";
import { readJson } from "./read-json";

class ScriptsService {
  async list(clientId: string, stage?: ScriptStage): Promise<Script[]> {
    const qs = stage ? `?stage=${stage}` : "";
    const res = await fetch(`/api/clients/${clientId}/scripts${qs}`);
    return (await readJson<{ scripts: Script[] }>(res, "Could not load the scripts.")).scripts;
  }

  async get(clientId: string, scriptId: string): Promise<{ script: Script; leadAvatarId: string | null }> {
    const res = await fetch(`/api/clients/${clientId}/scripts/${scriptId}`);
    return readJson<{ script: Script; leadAvatarId: string | null }>(res, "Could not load the script.");
  }
}

export const scriptsService = new ScriptsService();
```

- [ ] **Step 2: Write the query hooks**

```ts
// src/hooks/queries/scripts.ts
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { scriptsService } from "@/services/scripts.service";

// Script copilot spec 1 — the scripts resource, through TanStack Query. Keys are built here only.
export const scriptKeys = {
  all: (clientId: string) => ["scripts", clientId] as const,
  approved: (clientId: string) => [...scriptKeys.all(clientId), "approved"] as const,
};

/** The client's approved scripts: what the canvas gallery's Scripts tab offers (spec 1 §5.1).
 *  Approval happens on another page, so this revalidates whenever the tab mounts. */
export function useApprovedScripts(clientId: string) {
  return useQuery({
    queryKey: scriptKeys.approved(clientId),
    queryFn: () => scriptsService.list(clientId, "approved"),
    enabled: Boolean(clientId),
    staleTime: 0,
  });
}

export function useRefreshScripts(clientId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: scriptKeys.all(clientId) });
}
```

- [ ] **Step 3: Write the seed script**

```js
// scripts/seed-script.mjs
// Seeds one script for a client from a fixture (spec 1 §6). Developer-only: there is no button for
// this in the product, so the copilot stays the only way a user makes a script.
//
//   node scripts/seed-script.mjs <client-slug> [--file src/lib/scripts/fixtures/reel-01.json]
//        [--stage approved|visualise|in_review|generate] [--lead-avatar <avatar-uuid>] [--dry]
//
// Writes client_scripts directly with the service-role key (the API is session-authenticated).
// Idempotent: a live script with the same reel number and title for this client is updated in
// place, not duplicated. The app validates the doc on every read (scriptDocSchema), so a broken
// fixture shows up as a skipped row and a console warning, never a crash.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    try {
      const text = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
      const env = {};
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
      if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return { env, name };
    } catch {
      /* try the next candidate */
    }
  }
  console.error("No .env or .env.local with Supabase credentials found.");
  process.exit(1);
}

const STAGES = ["generate", "visualise", "in_review", "approved"];
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const slug = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const file = flag("--file", "src/lib/scripts/fixtures/reel-01.json");
const stage = flag("--stage", "approved");
const leadAvatar = flag("--lead-avatar", null);
const dry = args.includes("--dry");

if (!slug || !STAGES.includes(stage)) {
  console.error("Usage: node scripts/seed-script.mjs <client-slug> [--file <path>] [--stage <stage>] [--lead-avatar <uuid>] [--dry]");
  process.exit(1);
}

const doc = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const leads = (doc.cast ?? []).filter((c) => c.isLead);
if (leads.length !== 1) {
  console.error(`The fixture needs exactly one lead; it has ${leads.length}.`);
  process.exit(1);
}
if (leadAvatar) leads[0].avatarId = leadAvatar;

const { env, name } = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
console.log(`Using ${name} → ${env.NEXT_PUBLIC_SUPABASE_URL}`);

const { data: client, error: clientError } = await supabase.from("clients").select("id, name").eq("slug", slug).maybeSingle();
if (clientError) throw clientError;
if (!client) {
  console.error(`No client with slug "${slug}".`);
  process.exit(1);
}
if (leadAvatar) {
  const { data: avatar } = await supabase.from("client_avatars").select("id").eq("id", leadAvatar).eq("client_id", client.id).maybeSingle();
  if (!avatar) {
    console.error(`Avatar ${leadAvatar} is not one of ${client.name}'s avatars.`);
    process.exit(1);
  }
}

const { data: existing, error: listError } = await supabase
  .from("client_scripts").select("id, doc").eq("client_id", client.id).is("archived_at", null);
if (listError) throw listError;
const match = (existing ?? []).find(
  (r) => r.doc?.header?.reelNumber === doc.header.reelNumber && r.doc?.header?.title === doc.header.title,
);

const row = {
  client_id: client.id,
  stage,
  doc,
  approved_at: stage === "approved" ? new Date().toISOString() : null,
  updated_at: new Date().toISOString(),
};

if (dry) {
  console.log(`[dry] would ${match ? `update ${match.id}` : "insert"} "${doc.header.title}" for ${client.name} at stage ${stage}.`);
  process.exit(0);
}

const result = match
  ? await supabase.from("client_scripts").update(row).eq("id", match.id).select("id").single()
  : await supabase.from("client_scripts").insert(row).select("id").single();
if (result.error) throw result.error;
console.log(`${match ? "Updated" : "Inserted"} "${doc.header.title}" (${result.data.id}) for ${client.name}, stage ${stage}.`);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in the files of Tasks 1 to 6. Errors in other files may already exist on the base commit; to tell, run the same command on commit `934d928d` and compare. Never use `git stash` to check (the stash is shared with other worktrees).

- [ ] **Step 5: Dry-run the seed, then seed (after the user applied 0051)**

Run: `node scripts/seed-script.mjs jackfruit365 --dry`
Expected: `[dry] would insert "Golu starts today" for Jackfruit365 at stage approved.` If the slug differs, find it with `node scripts/db-inspect.mjs` or ask the user.

Then, only once the user confirms 0051 is applied: `node scripts/seed-script.mjs jackfruit365`
Expected: `Inserted "Golu starts today" (<uuid>) for Jackfruit365, stage approved.`

- [ ] **Step 6: Commit**

```bash
git add src/services/scripts.service.ts src/hooks/queries/scripts.ts scripts/seed-script.mjs
git commit -m "feat(scripts): browser service, query hooks and developer seed"
```

---

### Task 7: The Scripts library page

**Files:**
- Create: `src/app/clients/[id]/scripts/page.tsx`
- Create: `src/components/scripts/scripts-library.tsx`
- Create: `src/components/scripts/script-card.tsx`
- Create: `src/components/scripts/script-stage-badge.tsx`
- Modify: `src/components/clients/client-settings-menu.tsx`

**Interfaces:**
- Consumes: `listScripts` (Task 4), `SCRIPT_STAGES`, `SCRIPT_STAGE_LABEL` (Task 1), `reelLabel`, `headerLine`, `shotSummary` (Task 2).
- Produces: `ScriptStageBadge({ stage })` (used again in Task 8 and Task 10).

There is no component-test setup in this repo (vitest runs in node), so this task is verified in the running app.

- [ ] **Step 1: Write the stage badge**

```tsx
// src/components/scripts/script-stage-badge.tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SCRIPT_STAGE_LABEL, type ScriptStage } from "@/lib/scripts/constants";

// Approved is the one stage that reads as done, so it alone takes the strong treatment.
const TONE: Record<ScriptStage, string> = {
  generate: "",
  visualise: "border-primary/20 bg-primary/5 text-primary",
  in_review: "",
  approved: "border-foreground bg-foreground text-background",
};

export function ScriptStageBadge({ stage }: { stage: ScriptStage }) {
  return (
    <Badge variant={stage === "in_review" ? "secondary" : "default"} className={cn("font-medium", TONE[stage])}>
      {SCRIPT_STAGE_LABEL[stage]}
    </Badge>
  );
}
```

- [ ] **Step 2: Write the card**

```tsx
// src/components/scripts/script-card.tsx
import Link from "next/link";
import type { Script } from "@/lib/scripts/schema";
import { headerLine, reelLabel, shotSummary } from "@/lib/scripts/utils";
import { ScriptStageBadge } from "./script-stage-badge";

export function ScriptCard({ script, href }: { script: Script; href: string }) {
  const { header } = script.doc;
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{reelLabel(header.reelNumber) ?? "Reel"}</span>
        <ScriptStageBadge stage={script.stage} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-display text-lg font-medium leading-tight text-foreground">{header.title}</span>
        <span className="text-sm text-muted-foreground">{headerLine(header)}</span>
      </div>
      <span className="border-t border-border pt-3 text-sm text-muted-foreground">{shotSummary(script.doc)}</span>
    </Link>
  );
}
```

- [ ] **Step 3: Write the library**

```tsx
// src/components/scripts/scripts-library.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { Script } from "@/lib/scripts/schema";
import { SCRIPT_STAGES, SCRIPT_STAGE_LABEL, type ScriptStage } from "@/lib/scripts/constants";
import { ScriptCard } from "./script-card";

type Filter = "all" | ScriptStage;

// Spec 1 §3. No "New script" yet: it arrives with spec 2, because the copilot is the only way a
// script is made, and a button that does nothing would be worse than none.
export function ScriptsLibrary({ clientName, clientSlug, scripts }: { clientName: string; clientSlug: string; scripts: Script[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? scripts : scripts.filter((s) => s.stage === filter);
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: scripts.length },
    ...SCRIPT_STAGES.map((stage) => ({
      id: stage, label: SCRIPT_STAGE_LABEL[stage], count: scripts.filter((s) => s.stage === stage).length,
    })),
  ];

  return (
    <section className="animate-rise mt-4 flex flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <span className="text-eyebrow">{clientName}</span>
        <h1 className="font-display text-3xl font-medium">Scripts</h1>
        <p className="max-w-xl text-muted-foreground">Every reel script for this client, from first draft to client sign-off.</p>
      </header>

      {scripts.length === 0 ? (
        <EmptyState
          title="No scripts yet"
          body="Scripts are written with the copilot, then visualised and sent to the client for sign-off."
        />
      ) : (
        <>
          <div role="group" aria-label="Filter by stage" className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <Button
                key={f.id}
                variant="outline"
                size="sm"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn("rounded-full", filter === f.id && "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background")}
              >
                {f.label}
                <span className={cn("tabular-nums", filter === f.id ? "text-background/70" : "text-muted-foreground")}>{f.count}</span>
              </Button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scripts at this stage.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
              {shown.map((s) => (
                <ScriptCard key={s.id} script={s} href={`/clients/${clientSlug}/scripts/${s.id}`} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Write the page**

```tsx
// src/app/clients/[id]/scripts/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { listScripts } from "@/lib/db/scripts";
import { resolveOrgId } from "@/lib/dal";
import { ScriptsLibrary } from "@/components/scripts/scripts-library";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function ScriptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  // Org isolation, as the Avatars page: a client outside the caller's org redirects like a missing one.
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  const scripts = await listScripts(client.id);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <Breadcrumb className="animate-rise shrink-0">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink render={<Link href="/">Clients</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<Link href={`/clients/${client.slug}`}>{client.name}</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Scripts</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ScriptsLibrary clientName={client.name} clientSlug={client.slug} scripts={scripts} />
    </main>
  );
}
```

- [ ] **Step 5: Add Scripts to the client menu**

In `src/components/clients/client-settings-menu.tsx`, add `FileText` to the lucide import and this item at the **top** of `items` (it is the client's work, ahead of its setup pages):

```tsx
    {
      href: `/clients/${slug}/scripts`,
      icon: FileText,
      label: "Scripts",
      hint: "Reel scripts, draft to sign-off",
    },
```

Update the doc comment above the component to read: "Entry point to the client's surfaces beside its canvases: its scripts, its knowledge (Brand KB, Market) and its avatars."

- [ ] **Step 6: Verify in the app**

Run `npm run dev:next`, sign in, open the Jackfruit365 client, open Settings, choose Scripts.
Expected: Reel 01 card shows "Reel 01", the Approved badge, "Golu starts today", "UGC · South · Sun 11 Oct (first day of Navratri)", and "14 shots · 52s". Chips read All 1, Generate 0, Visualise 0, In review 0, Approved 1; choosing Generate shows "No scripts at this stage." For a client with no scripts, the empty state shows. Check the page in the dark theme too.

- [ ] **Step 7: Lint and commit**

```bash
npx eslint "src/app/clients/[id]/scripts/page.tsx" src/components/scripts src/components/clients/client-settings-menu.tsx
git add "src/app/clients/[id]/scripts/page.tsx" src/components/scripts src/components/clients/client-settings-menu.tsx
git commit -m "feat(scripts): client Scripts library"
```

---

### Task 8: The read-only script view

**Files:**
- Create: `src/app/clients/[id]/scripts/[scriptId]/page.tsx`
- Create: `src/components/scripts/script-view.tsx`
- Create: `src/components/scripts/script-context-card.tsx`
- Create: `src/components/scripts/script-cast-list.tsx`
- Create: `src/components/scripts/script-shot-list.tsx`
- Create: `src/components/scripts/script-shot-row.tsx`

**Interfaces:**
- Consumes: `getScript` (Task 4), `listAvatars` from `@/lib/db/avatars`, `timeShots`, `groupByBeat`, `formatRange` (Task 2), `headerLine`, `reelLabel`, `shotSummary` (Task 2), `ScriptStageBadge` (Task 7).
- Produces: `ScriptView({ script, avatarFaces })` where `avatarFaces: Record<string, string | null>` maps avatar id to its front image URL. Specs 2 to 4 put their work around this view (spec 1 §4).

- [ ] **Step 1: Write the context card**

```tsx
// src/components/scripts/script-context-card.tsx
import type { ScriptDoc } from "@/lib/scripts/schema";
import { headerLine, reelLabel, shotSummary } from "@/lib/scripts/utils";
import { ScriptStageBadge } from "./script-stage-badge";
import type { ScriptStage } from "@/lib/scripts/constants";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-eyebrow">{label}</span>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export function ScriptContextCard({ doc, stage }: { doc: ScriptDoc; stage: ScriptStage }) {
  const { header, context } = doc;
  return (
    <section aria-label="Context" className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{reelLabel(header.reelNumber)}</span>
          <h1 className="font-display text-2xl font-medium">{header.title}</h1>
          <span className="text-sm text-muted-foreground">
            {[headerLine(header), header.theme, [header.aspect, header.targetLength].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{shotSummary(doc)}</span>
          <ScriptStageBadge stage={stage} />
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {context.purpose && <Section label="Purpose">{context.purpose}</Section>}
        {context.settingAndCamera && <Section label="Setting and camera">{context.settingAndCamera}</Section>}
      </div>
      {(context.disclaimers || context.watchOuts.length > 0) && (
        <div className="grid gap-5 border-t border-border pt-5 md:grid-cols-2">
          {context.disclaimers && <Section label="Disclaimers">{context.disclaimers}</Section>}
          {context.watchOuts.length > 0 && (
            <Section label="Watch-outs">
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {context.watchOuts.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Section>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Write the cast list**

```tsx
// src/components/scripts/script-cast-list.tsx
import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CastMember } from "@/lib/scripts/schema";

export function ScriptCastList({ cast, avatarFaces }: { cast: CastMember[]; avatarFaces: Record<string, string | null> }) {
  return (
    <section aria-label="Cast" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Cast</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {cast.map((c) => {
          const face = c.avatarId ? avatarFaces[c.avatarId] ?? null : null;
          return (
            <li key={c.id} className="flex gap-3 rounded-xl border border-border bg-card p-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {face ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={face} alt={`${c.name}, avatar`} className="size-full object-cover" />
                ) : (
                  <UserRound className="absolute inset-0 m-auto size-6 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.isLead && <Badge variant="outline">Lead</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{c.description}</p>
                {!c.avatarId && <span className="text-xs text-muted-foreground">No avatar yet</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Write the shot row**

```tsx
// src/components/scripts/script-shot-row.tsx
import type { CastMember } from "@/lib/scripts/schema";
import type { TimedShot } from "@/lib/scripts/timeline";
import { formatRange } from "@/lib/scripts/timeline";

export function ScriptShotRow({ timed, cast }: { timed: TimedShot; cast: CastMember[] }) {
  const { shot } = timed;
  const names = shot.onScreen.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean);
  return (
    <li className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[4.5rem_minmax(0,2.2fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_8rem]">
      <span className="flex flex-col text-sm tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">S{timed.index + 1}</span>
        {formatRange(timed.start, timed.end)}
      </span>
      <span className="text-sm">{shot.visual}</span>
      <span className="text-sm text-muted-foreground">{shot.vo}</span>
      <span className="text-sm font-medium">{shot.onScreenText}</span>
      <span className="text-xs text-muted-foreground">{names.length > 0 ? names.join(", ") : "Nobody (B-roll)"}</span>
    </li>
  );
}
```

- [ ] **Step 4: Write the shot list**

```tsx
// src/components/scripts/script-shot-list.tsx
"use client";

import { useId, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { CastMember, Shot } from "@/lib/scripts/schema";
import { formatRange, groupByBeat, timeShots } from "@/lib/scripts/timeline";
import { ScriptShotRow } from "./script-shot-row";

const COLUMNS = ["Time", "Visual", "VO", "On-screen text", "On screen"];

export function ScriptShotList({ shots, cast }: { shots: Shot[]; cast: CastMember[] }) {
  const [grouped, setGrouped] = useState(true);
  const switchId = useId();
  const timed = timeShots(shots);

  return (
    <section aria-label="Shots" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-eyebrow">Shots</h2>
        <div className="flex items-center gap-2">
          <Switch id={switchId} checked={grouped} onCheckedChange={setGrouped} />
          <Label htmlFor={switchId}>Group by beat</Label>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden gap-3 border-b border-border bg-muted/50 px-4 py-2 md:grid md:grid-cols-[4.5rem_minmax(0,2.2fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_8rem]">
          {COLUMNS.map((c) => <span key={c} className="text-eyebrow">{c}</span>)}
        </div>
        {grouped ? (
          groupByBeat(timed).map((g, i) => (
            <div key={`${g.beat}-${i}`}>
              <div className="flex justify-between border-b border-border bg-muted/30 px-4 py-1.5">
                <span className="text-eyebrow">{g.beat || "No beat"}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{formatRange(g.start, g.end)}</span>
              </div>
              <ul>{g.shots.map((t) => <ScriptShotRow key={t.shot.id} timed={t} cast={cast} />)}</ul>
            </div>
          ))
        ) : (
          <ul>{timed.map((t) => <ScriptShotRow key={t.shot.id} timed={t} cast={cast} />)}</ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write the view**

```tsx
// src/components/scripts/script-view.tsx
import type { Script } from "@/lib/scripts/schema";
import { ScriptContextCard } from "./script-context-card";
import { ScriptCastList } from "./script-cast-list";
import { ScriptShotList } from "./script-shot-list";

/** Spec 1 §4 — the one script view. Read-only here; Generate, Visualise and Client review
 *  (specs 2 to 4) put their work around it rather than drawing the script their own way. */
export function ScriptView({ script, avatarFaces }: { script: Script; avatarFaces: Record<string, string | null> }) {
  return (
    <div className="flex flex-col gap-8">
      <ScriptContextCard doc={script.doc} stage={script.stage} />
      <ScriptCastList cast={script.doc.cast} avatarFaces={avatarFaces} />
      <ScriptShotList shots={script.doc.shots} cast={script.doc.cast} />
    </div>
  );
}
```

- [ ] **Step 6: Write the page**

```tsx
// src/app/clients/[id]/scripts/[scriptId]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { listAvatars } from "@/lib/db/avatars";
import { resolveOrgId } from "@/lib/dal";
import { ScriptView } from "@/components/scripts/script-view";
import { reelLabel } from "@/lib/scripts/utils";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function ScriptPage({ params }: { params: Promise<{ id: string; scriptId: string }> }) {
  const { id, scriptId } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  const script = await getScript(client.id, scriptId);
  if (!script) notFound();

  // Faces for the cast: only this client's live avatars, so another client's id shows no face.
  const avatars = await listAvatars(client.id);
  const avatarFaces = Object.fromEntries(avatars.map((a) => [a.id, a.front?.url ?? null]));
  const label = reelLabel(script.doc.header.reelNumber);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <Breadcrumb className="animate-rise mb-6 shrink-0">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink render={<Link href="/">Clients</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<Link href={`/clients/${client.slug}`}>{client.name}</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<Link href={`/clients/${client.slug}/scripts`}>Scripts</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{label ? `${label} · ` : ""}{script.doc.header.title}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ScriptView script={script} avatarFaces={avatarFaces} />
    </main>
  );
}
```

- [ ] **Step 7: Verify in the app**

Open Reel 01 from the library.
Expected: the context card shows the title, "UGC · South · Sun 11 Oct (first day of Navratri) · Navratri / Golu · 9:16, 45 to 55 sec", "14 shots · 52s", Approved, Purpose, Setting and camera, Disclaimers and three watch-outs. The cast shows Meenakshi with a Lead badge and her husband, both "No avatar yet". Shots are grouped HOOK 0-5s, INTRO 5-12s … OUTRO 48-52s; S9 reads 33-35.5s; S3 says "Nobody (B-roll)"; S6 says "Meenakshi, Meenakshi's husband". Turning off Group by beat shows a flat list of 14. A made-up script id in the URL gives the not-found page. Check dark theme and a narrow window (rows stack).

- [ ] **Step 8: Lint and commit**

```bash
npx eslint "src/app/clients/[id]/scripts" src/components/scripts
git add "src/app/clients/[id]/scripts/[scriptId]/page.tsx" src/components/scripts
git commit -m "feat(scripts): read-only script view with beat grouping"
```

---

### Task 9: One shared parse call with the autosave retry

**Files:**
- Create: `src/lib/nodes/parse-script-node.ts`
- Test: `src/lib/nodes/parse-script-node.test.ts`
- Modify: `src/components/canvas/use-copilot-chat.ts` (the `parseScript` recipe's retry loop, around lines 109-133)

**Interfaces:**
- Consumes: `ReelScript` from `@/lib/nodes/reel-script`.
- Produces: `parseScriptNode(nodeId: string, source: string, opts?: ParseOptions): Promise<ParseResult>` where `ParseResult = { ok: true; output: ReelScript } | { ok: false; reason: "saving" | "failed"; error: string }` and `ParseOptions = { attempts?: number; waitMs?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }`.

The canvas copilot's recipe and the script drop (Task 10) both need "POST the parse; on 404 the node is still autosaving, so wait and retry". Two call sites, so it is extracted (AGENTS.md, Reusability).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/nodes/parse-script-node.test.ts
import { describe, it, expect, vi } from "vitest";
import { parseScriptNode } from "./parse-script-node";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noSleep = () => Promise.resolve();

describe("parseScriptNode", () => {
  it("returns the parsed output on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { output: { title: "Golu starts today" } }));
    const result = await parseScriptNode("n1", "text", { fetchImpl, sleep: noSleep });
    expect(result).toEqual({ ok: true, output: { title: "Golu starts today" } });
    expect(fetchImpl).toHaveBeenCalledWith("/api/nodes/n1/parse", expect.objectContaining({ method: "POST", body: JSON.stringify({ source: "text" }) }));
  });

  it("retries while the node is still autosaving, then succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(404, { error: "Node not found." }))
      .mockResolvedValueOnce(json(200, { output: { title: "x" } }));
    const sleep = vi.fn(noSleep);
    const result = await parseScriptNode("n1", "text", { fetchImpl, sleep, waitMs: 900 });
    expect(result.ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(900);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up as 'saving' after the last attempt still 404s", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(404, { error: "Node not found." }));
    const result = await parseScriptNode("n1", "text", { fetchImpl, sleep: noSleep, attempts: 3 });
    expect(result).toMatchObject({ ok: false, reason: "saving" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("reports the server's error without retrying a real failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(500, { error: "Extraction failed" }));
    const result = await parseScriptNode("n1", "text", { fetchImpl, sleep: noSleep });
    expect(result).toEqual({ ok: false, reason: "failed", error: "Extraction failed" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to a plain message when the error body is not JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("oops", { status: 502 }));
    const result = await parseScriptNode("n1", "text", { fetchImpl, sleep: noSleep });
    expect(result).toEqual({ ok: false, reason: "failed", error: "Parsing failed." });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/nodes/parse-script-node.test.ts`
Expected: FAIL, cannot resolve `./parse-script-node`.

- [ ] **Step 3: Write the helper**

```ts
// src/lib/nodes/parse-script-node.ts
import type { ReelScript } from "./reel-script";

// POST a Script node's text to the existing parse route. A brand-new node 404s until its first
// autosave lands, so a 404 waits past the autosave debounce and tries again. Shared by the canvas
// copilot's parse recipe and the script drop from the gallery's Scripts tab (spec 1 §5.2).

export type ParseResult =
  | { ok: true; output: ReelScript }
  | { ok: false; reason: "saving" | "failed"; error: string };

export type ParseOptions = {
  attempts?: number;
  waitMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function parseScriptNode(nodeId: string, source: string, opts: ParseOptions = {}): Promise<ParseResult> {
  const { attempts = 3, waitMs = 900, fetchImpl = fetch, sleep = defaultSleep } = opts;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetchImpl(`/api/nodes/${nodeId}/parse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source }),
    });
    if (res.ok) return { ok: true, output: ((await res.json()) as { output: ReelScript }).output };
    if (res.status === 404) {
      if (attempt < attempts - 1) {
        await sleep(waitMs);
        continue;
      }
      return { ok: false, reason: "saving", error: "The script is still saving. Open it and parse it from the node." };
    }
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, reason: "failed", error: err.error ?? "Parsing failed." };
  }
  return { ok: false, reason: "saving", error: "The script is still saving. Open it and parse it from the node." };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/nodes/parse-script-node.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Use it in the canvas copilot**

In `src/components/canvas/use-copilot-chat.ts`, add `import { parseScriptNode } from "@/lib/nodes/parse-script-node";` and replace the body of the `try` block's loop in `parseScript` (from `let output: ReelScript | null = null;` through the `if (!output) { … return; }` block) with:

```ts
      const result = await parseScriptNode(target.id, source);
      if (!result.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: result.reason === "saving"
              ? "The node is still saving — ask me to parse it again in a moment."
              : result.error,
          },
        ]);
        return;
      }
      const output = result.output;
```

Leave everything after it (the `updateNodeData` with `CURRENT_GROUPING_VERSION`, `fanOutShots`, the messages) unchanged. The copilot's wording is kept exactly as before.

- [ ] **Step 6: Run the copilot's tests and the type check**

Run: `npx vitest run src/components/canvas src/lib/nodes && npx tsc --noEmit`
Expected: PASS; no new type errors. If `ReelScript` is now unused in `use-copilot-chat.ts`, remove its import.

- [ ] **Step 7: Commit**

```bash
git add src/lib/nodes/parse-script-node.ts src/lib/nodes/parse-script-node.test.ts src/components/canvas/use-copilot-chat.ts
git commit -m "refactor(canvas): share the Script node parse call and its autosave retry"
```

---

### Task 10: The Scripts tab and the drop onto the canvas

**Files:**
- Create: `src/lib/scripts/canvas.ts`
- Test: `src/lib/scripts/__tests__/canvas.test.ts`
- Create: `src/hooks/use-add-script-node.ts`
- Create: `src/components/canvas/gallery-drawer/gallery-scripts-tab.tsx`
- Modify: `src/components/canvas/gallery-drawer/types.ts:1`
- Modify: `src/components/canvas/gallery-drawer/gallery-tabs.tsx` (`TABS`)
- Modify: `src/components/canvas/gallery-drawer/gallery-drawer.tsx` (lines near 128, 281, 366, 498-509, 561)
- Modify: `src/hooks/use-gallery-pane-drop.ts`

**Interfaces:**
- Consumes: `SCRIPT_DRAG_MIME` (Task 1), `printScript` (Task 3), `reelLabel`, `shotSummary` (Task 2), `scriptsService.get` and `useApprovedScripts`, `useRefreshScripts` (Task 6), `parseScriptNode` (Task 9), `useAddAvatarNode` (existing), `CURRENT_GROUPING_VERSION` (existing), `useClientId`, `useClientSlug` (existing).
- Produces: `parseScriptDragPayload(raw: string): { scriptId: string } | null`; `useAddScriptNode(): (scriptId: string, position: XYPosition) => Promise<void>`.

- [ ] **Step 1: Write the failing payload test**

```ts
// src/lib/scripts/__tests__/canvas.test.ts
import { describe, it, expect } from "vitest";
import { parseScriptDragPayload } from "../canvas";

describe("parseScriptDragPayload", () => {
  it("reads a script id", () => {
    expect(parseScriptDragPayload(JSON.stringify({ scriptId: "s1" }))).toEqual({ scriptId: "s1" });
  });
  it("rejects anything else", () => {
    expect(parseScriptDragPayload("")).toBeNull();
    expect(parseScriptDragPayload("not json")).toBeNull();
    expect(parseScriptDragPayload(JSON.stringify({ scriptId: "" }))).toBeNull();
    expect(parseScriptDragPayload(JSON.stringify({ avatarId: "a1" }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/scripts/__tests__/canvas.test.ts`
Expected: FAIL, cannot resolve `../canvas`.

- [ ] **Step 3: Write `canvas.ts`**

```ts
// src/lib/scripts/canvas.ts
// The gallery's Scripts tab drags `{ scriptId }` under SCRIPT_DRAG_MIME (constants.ts), the same
// way the Avatars tab drags `{ avatarId }` (src/lib/avatars/canvas.ts).
export function parseScriptDragPayload(raw: string): { scriptId: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { scriptId?: unknown };
    return typeof parsed.scriptId === "string" && parsed.scriptId ? { scriptId: parsed.scriptId } : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/scripts/__tests__/canvas.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the add-script hook**

```ts
// src/hooks/use-add-script-node.ts
"use client";

import { useCallback } from "react";
import type { XYPosition } from "@xyflow/react";
import { toast } from "sonner";
import { useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useAddAvatarNode } from "./use-add-avatar-node";
import { scriptsService } from "@/services/scripts.service";
import { printScript } from "@/lib/scripts/print";
import { parseScriptNode } from "@/lib/nodes/parse-script-node";
import { CURRENT_GROUPING_VERSION } from "@/lib/nodes/group-shots";

// Spec 1 §5.2 — an approved script onto the canvas: a Script node holding the script printed in
// the team's layout, parsed straight away exactly like an upload (no fan-out, as the upload path),
// with the lead's avatar attached when it has a usable one. The node holds a COPY: re-approving
// the script later never changes a node already on a canvas (spec 1 §5.4).
export function useAddScriptNode() {
  const clientId = useClientId();
  const storeApi = useCanvasStoreApi();
  const addAvatarNode = useAddAvatarNode();

  return useCallback(
    async (scriptId: string, position: XYPosition) => {
      let detail;
      try {
        detail = await scriptsService.get(clientId, scriptId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load the script.");
        return;
      }
      if (detail.script.stage !== "approved") {
        toast.error("Only approved scripts can go on a canvas.");
        return;
      }

      const { header } = detail.script.doc;
      const source = printScript(detail.script.doc);
      const nodeId = crypto.randomUUID();
      const { addNode, updateNodeData } = storeApi.getState();
      addNode("script", position, nodeId);
      updateNodeData(nodeId, { title: header.title, source });
      if (detail.leadAvatarId) addAvatarNode(detail.leadAvatarId, { position, presenterOf: nodeId });

      const toastId = toast.loading(`Parsing "${header.title}"…`);
      const result = await parseScriptNode(nodeId, source);
      if (!result.ok) {
        toast.error(result.error, { id: toastId });
        return;
      }
      storeApi.getState().updateNodeData(nodeId, { parsed: result.output, groupingVersion: CURRENT_GROUPING_VERSION });
      const n = result.output.visual_script?.shots?.length ?? 0;
      toast.success(`"${header.title}" parsed into ${n} shot${n === 1 ? "" : "s"}`, { id: toastId });
    },
    [clientId, storeApi, addAvatarNode],
  );
}
```

- [ ] **Step 6: Write the Scripts tab**

```tsx
// src/components/canvas/gallery-drawer/gallery-scripts-tab.tsx
"use client";

import Link from "next/link";
import type { XYPosition } from "@xyflow/react";
import { ArrowUpRight, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientSlug } from "@/components/canvas/client-id-context";
import { useApprovedScripts } from "@/hooks/queries/scripts";
import { useAddScriptNode } from "@/hooks/use-add-script-node";
import { SCRIPT_DRAG_MIME } from "@/lib/scripts/constants";
import { reelLabel, shotSummary } from "@/lib/scripts/utils";

type Props = {
  clientId: string;
  /** Where a tile's add button places the node. */
  defaultPosition: () => XYPosition;
};

// Spec 1 §5.1 — the client's APPROVED scripts. Drag one onto the canvas, or use its button.
export function GalleryScriptsTab({ clientId, defaultPosition }: Props) {
  const clientSlug = useClientSlug();
  const scripts = useApprovedScripts(clientId);
  const addScriptNode = useAddScriptNode();
  const libraryHref = `/clients/${clientSlug}/scripts`;

  if (scripts.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (scripts.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">Could not load the scripts.</p>
        <Button variant="outline" size="sm" onClick={() => void scripts.refetch()}>Try again</Button>
      </div>
    );
  }

  const list = scripts.data ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <FileText className="size-10 text-muted-foreground/40" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">No approved scripts yet. A script appears here once the client approves it.</p>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={libraryHref} target="_blank" rel="noopener" />}>
          Open Scripts
          <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Drag an approved script onto the canvas. It parses into shots, with its lead's avatar attached.</p>
      <ul className="flex flex-col gap-2">
        {list.map((s) => {
          const { header } = s.doc;
          return (
            <li
              key={s.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(SCRIPT_DRAG_MIME, JSON.stringify({ scriptId: s.id }));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="flex cursor-grab items-center gap-3 rounded-lg border bg-card p-3 active:cursor-grabbing"
            >
              <FileText className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {reelLabel(header.reelNumber) ? `${reelLabel(header.reelNumber)} · ` : ""}{header.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.approvedAt ? `Approved ${new Date(s.approvedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ` : ""}
                  {shotSummary(s.doc)}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={`Add ${header.title} to the canvas`}
                title="Add to canvas"
                onClick={() => void addScriptNode(s.id, defaultPosition())}
              >
                <Plus className="size-3.5" strokeWidth={1.5} />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Wire the tab**

`src/components/canvas/gallery-drawer/types.ts`, line 1:

```ts
export type GalleryTab = "references" | "assets" | "moodboard" | "signals" | "avatars" | "scripts";
```

`src/components/canvas/gallery-drawer/gallery-tabs.tsx`, add to the end of `TABS`:

```ts
  { id: "scripts", label: "Scripts" },
```

`src/components/canvas/gallery-drawer/gallery-drawer.tsx`:
- add `import { GalleryScriptsTab } from "./gallery-scripts-tab";` and `import { useRefreshScripts } from "@/hooks/queries/scripts";` beside the avatars imports;
- beside `const refreshAvatars = useRefreshAvatars(clientId);` add `const refreshScripts = useRefreshScripts(clientId);`;
- in the refresh chain (near line 281) add `else if (tab === "scripts") void refreshScripts();`;
- everywhere the file excludes the avatars tab from the Drive/folder UI and the footer (the conditions near lines 366, 507-509 and 561: `tab !== "avatars"`), add `&& tab !== "scripts"` beside it, so the Scripts tab shows neither the folder toolbar, the image grid, nor the selection footer;
- after the `{tab === "avatars" && ( … )}` block, add:

```tsx
            {tab === "scripts" && (
              <GalleryScriptsTab clientId={clientId} defaultPosition={computeDefaultPosition} />
            )}
```

Read the whole file before editing; the line numbers above are from commit `934d928d` and may have moved.

- [ ] **Step 8: Accept a dropped script on the canvas**

In `src/hooks/use-gallery-pane-drop.ts`:
- add imports `import { SCRIPT_DRAG_MIME } from "@/lib/scripts/constants";`, `import { parseScriptDragPayload } from "@/lib/scripts/canvas";`, `import { useAddScriptNode } from "./use-add-script-node";`;
- inside the hook, `const addScriptNode = useAddScriptNode();`;
- in `onDragOver`, accept the new type: `if (!types.includes(GALLERY_DRAG_MIME) && !types.includes(AVATAR_DRAG_MIME) && !types.includes(SCRIPT_DRAG_MIME)) return;`;
- at the top of `onDrop`, before the avatar branch:

```ts
      // Spec 1 §5.2 — an approved script from the gallery's Scripts tab: a parsed Script node.
      const script = parseScriptDragPayload(e.dataTransfer.getData(SCRIPT_DRAG_MIME));
      if (script) {
        e.preventDefault();
        void addScriptNode(script.scriptId, reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        return;
      }
```

- add `addScriptNode` to the `useCallback` dependency list.

A script dropped onto an existing Script node falls through to the pane, because the node's own drop handler only claims `AVATAR_DRAG_MIME`, so it still becomes a new node.

- [ ] **Step 9: Run tests, type check and lint**

Run: `npx vitest run src/lib/scripts src/lib/nodes && npx tsc --noEmit && npx eslint src/hooks/use-add-script-node.ts src/hooks/use-gallery-pane-drop.ts src/components/canvas/gallery-drawer src/lib/scripts`
Expected: PASS, no new type or lint errors.

- [ ] **Step 10: Verify in the app**

On a Jackfruit365 canvas, open the gallery and choose Scripts.
Expected: Reel 01 is listed as "Reel 01 · Golu starts today", "Approved <date> · 14 shots · 52s". Drag it onto the canvas: a Script node titled "Golu starts today" appears where it was dropped; a "Parsing" toast becomes "parsed into 14 shots". Opening the node shows the printed text and 14 parsed shots. Drop it again: a second, independent node appears. Then give Meenakshi a ready avatar (`node scripts/seed-script.mjs jackfruit365 --lead-avatar <a ready avatar id>`), drop again: the avatar node appears to the left of the script, connected. Archive that avatar in the Avatar Studio and drop again: the script arrives with no avatar attached.

- [ ] **Step 11: Commit**

```bash
git add src/lib/scripts/canvas.ts src/lib/scripts/__tests__/canvas.test.ts src/hooks/use-add-script-node.ts src/hooks/use-gallery-pane-drop.ts src/components/canvas/gallery-drawer
git commit -m "feat(canvas): Scripts tab in the gallery; drop an approved script as a parsed Script node"
```

---

### Task 11: ADR entries

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, appended after the last entry)
- Modify: `docs/superpowers/specs/2026-10-08-script-copilot-1-library-and-script-design.md` (line 6: replace "ADR numbers are assigned when the plan is written." with the assigned range)

- [ ] **Step 1: Confirm the next free numbers**

Run: `grep -o '^### D[0-9]*' docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md | sed 's/### D//' | sort -n | tail -1` and the same against `git show origin/staging:docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`.
Expected: 318 on both. If higher, start at the next free number and shift every number below by the same amount.

- [ ] **Step 2: Append the entries**

Append, in the log's existing format (Decision / Why / Rejected / Refines / Originated):

```markdown
### D319 — Script copilot: four specs; Produce folds into spec 1 *(recorded 2026-10-08)*

**Decision.** In-platform script writing ships as four specs: 1 library, script and handoff; 2 Generate (the copilot); 3 Visualise; 4 Client review. Produce is part of spec 1.

**Why.** Produce's only new part is how a canvas picks up an approved script, and that depends on the script's shape, which spec 1 owns. AI sits only in specs 2 and 3.

**Rejected.** Five specs with Produce on its own (a spec for one action).

**Originated →** `2026-10-08-script-copilot-1-library-and-script-design.md` §0.

### D321 — A script has a cast of client Avatars, exactly one of them the lead *(recorded 2026-10-08)*

**Decision.** A script holds one or more people; each shot names who is on screen, or nobody. Each person points to a client Avatar, made once and reused across scripts. Exactly one is the lead.

**Why.** 15 of the 28 Jackfruit365 outlines put two or more people on screen, Reel 01 included. A person described only in words has no reference image, so their face changes panel to panel and the client reviews the wrong person. People recur across reels (James in 8; Rajan and Saraswathi in 04 and 21; Harpreet and Gurmeet in 16 and 27).

**Rejected.** One avatar per script (the parent spec's first answer). Supporting people as prose only. A cast owned by each script and regenerated every time.

**Refines →** D287–D297 (client Avatars). **Originated →** spec 1 §2.3.

### D322 — Only the lead's avatar crosses onto the canvas *(recorded 2026-10-08)*

**Decision.** When a script reaches a canvas, the lead's avatar is attached to the Script node. Supporting cast stay in the shot descriptions as words.

**Why.** A Script node holds one avatar (D298) and nothing after approval changes in this work. **Known gap:** a supporting person's face in the generated video will not match their storyboard face; closing it means a Script node that holds a cast, which changes the video pipeline.

**Rejected.** Teaching the canvas to hold a cast now (out of scope).

**Refines →** D298. **Originated →** spec 1 §5.5.

### D323 — Approved scripts reach a canvas from a Scripts tab in the gallery, as a copy *(recorded 2026-10-08)*

**Decision.** The canvas gallery has a Scripts tab listing the client's approved scripts. Dragging one makes a Script node holding a copy of the printed script; it can be dragged in more than once; re-approving a script never changes nodes already on a canvas.

**Why.** Every other client asset reaches a canvas this way, teams already group a month of reels on one canvas, and a live link would re-parse a canvas under someone mid-production.

**Rejected.** A "send to canvas" action with a canvas picker. A new canvas per script. A live link between script and node.

**Originated →** spec 1 §5.1, §5.4.

### D324 — The handoff prints the team's outline layout, one row per shot; the parse is unchanged *(recorded 2026-10-08)*

**Decision.** An approved script is printed as the Jackfruit365 outlines are written (header line, Purpose, Character, Setting and camera, a Beat · Visual · VO · On-screen text table, disclaimers) with one table row per shot, and parsed by the existing Script node parse with no prompt change.

**Why.** The parse is built for that layout and copies voiceover verbatim onto one shot per row, so one row per shot gives the canvas exactly the shots the client approved.

**Rejected.** Writing the structured shots straight into the node's parsed version (touches node versioning; the parsed shape lacks setting, transition and cast anyway). Extending the parse prompt.

**Refines →** D19, D267, D286. **Originated →** spec 1 §5.3.

### D325 — The script's shape follows the team's outlines; formats are the client's words *(recorded 2026-10-08)*

**Decision.** Header fields from the outlines' header line; the context card is Purpose, Setting and camera, disclaimers and watch-outs; beat labels are free text; setting changes and transitions are written into the visual. Formats and names are inferred from the client's scripts, not a product list. "Avatar" means the asset only; the founder format is "Founder-led".

**Why.** All 28 outlines share this skeleton; the founder reels invent their own beat labels; "avatar" naming both an asset and a format confused the team.

**Rejected.** Separate Setting and Transition fields. A fixed list of formats or beats.

**Originated →** spec 1 §2.

### D326 — A seeded Reel 01, loaded by a developer *(recorded 2026-10-08)*

**Decision.** Spec 1 ships Reel 01 split into 14 shots as a fixture (`src/lib/scripts/fixtures/reel-01.json`), seeded with `scripts/seed-script.mjs`. There is no product button for it.

**Why.** Specs 3 and 4 lead the demo and can be built before the copilot; the fixture is also the copilot's target and the handoff's test. Keeping it out of the product keeps the copilot the only way users make a script.

**Rejected.** Waiting for spec 2 before building Visualise and Client review. A user-facing import.

**Originated →** spec 1 §6.
```

- [ ] **Step 3: Point the spec at its ADRs**

In the spec's header, replace "ADR numbers are assigned when the plan is written." with "ADRs: D319–D326."

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md docs/superpowers/specs/2026-10-08-script-copilot-1-library-and-script-design.md
git commit -m "docs(adr): D319–D326 for script copilot spec 1"
```

---

### Task 12: Check spec 1's success criteria end to end

**Files:** none changed unless a check fails.

- [ ] **Step 1: Full test run and type check**

Run: `npm test && npx tsc --noEmit`
Expected: all new tests pass. Known pre-existing failures (memory: registry test, trigger.dev, Kling timeout flake) may appear; re-run once before investigating, and report any that are not in that list.

- [ ] **Step 2: Success criterion 1, the library**

Open Jackfruit365 › Settings › Scripts. Reel 01 shows its stage, header line and "14 shots · 52s"; the stage chips filter it.

- [ ] **Step 3: Success criterion 2, the script view**

Open Reel 01. Header, context card, cast and 14 shots show; Group by beat groups and ungroups. To check that a recurring beat starts its own group in the real view, temporarily seed a copy with a later shot relabelled HOOK (`--file` pointing at an edited copy in your scratch folder, never committed), confirm, then re-seed the original.

- [ ] **Step 4: Success criterion 3, the parse, on three drops**

Drag Reel 01 onto a canvas three times. For each node, open it and check: 14 parsed shots; every VO line identical to the fixture's `vo` for the matching shot; no manual fixes. Record the three results (shot counts and any VO mismatch) in the hand-off message. A mismatch is a finding to report, not something to fix by editing the parse prompt (Global Constraints).

- [ ] **Step 5: Success criterion 4, the lead's avatar**

With `--lead-avatar` set to a ready avatar, a drop attaches that avatar to the node. With the avatar archived, the drop attaches none and still parses.

- [ ] **Step 6: Report**

Summarise for the user: what passed, the three parse results, anything that failed with its output, and the migration and seed state on staging. Do not push or merge; the user decides.
