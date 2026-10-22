# Auto Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click, word-timed auto captions in the Rough Cut Editor, with one reel caption style, frame-exact preview sync, per-word Premiere titles, and undo/redo.

**Architecture:** A Trigger.dev task transcribes each piece's playing sound file once (ElevenLabs Scribe v2, by URL) into `media_transcripts`. The browser turns transcripts into captions with pure functions (`caption-words.ts`) through the editor store, so the server never overwrites an open edit. One shared frame rule (`wordFrames`) drives the stage and the Premiere writer.

**Tech Stack:** Next.js (this repo's version: read `node_modules/next/dist/docs/` before touching routes), TypeScript, Zod v4, Zustand (vanilla store), TanStack Query v5, Trigger.dev v4, Supabase Postgres, Vitest, shadcn/Base UI primitives, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-22-auto-captions-design.md` (D395–D401). **UX reference:** https://claude.ai/artifact/Mn98oVEBbzA6UCqMww3YS3 (v4).

## Global Constraints

- Branch: `feat/rough-cut-editor`. Commit after every task. **No AI attribution in commits** (no `Co-Authored-By`, no "Generated with").
- API routes: `apiError` / `apiOk` only; `withCanvas` for `/api/canvases/[cid]/*`; `withTryCatch` around multi-step handlers.
- Controls: shadcn primitives from `src/components/ui/*` only — never raw `<button>`, `<input>`, `<select>`, `<textarea>`. Fields with icons use `InputGroup`.
- Data: browser reads/writes through `src/services/*.service.ts` → `src/hooks/queries/*.ts` (keys via the factory only) → components. Polling uses `refetchInterval`.
- Performance rules: nothing per item (no fetch per caption/word/piece); selectors O(1)-ish; never write when nothing changed (a no-op returns the SAME doc); independent server reads in `Promise.all`; ask only for needed columns; never file bytes in task payloads (job id only).
- Paid work: background task, `maxAttempts: 1`, `failed` only when final, never retry after the provider answered.
- UI copy: plain words, no vendor names ("ElevenLabs", "Scribe"), no raw errors, no em-dash phrasing. Times shown `0:12.4`.
- Design system: Clash Display / Gilroy for UI (caption fonts are reel content, D393); purple only for primary/accents; `text-eyebrow` for small caps; Lucide icons at `strokeWidth={1.5}`; motion easing `cubic-bezier(0.22,1,0.36,1)`.
- Frame rule: start frame = `Math.round(seconds × fps)`; every word lasts ≥ 1 frame.
- Test command for a folder: `npx vitest run src/lib/editor` (the full suite has ~11 known timeout flakes in API route tests; run per directory).

## File map

| File | Responsibility |
|---|---|
| `src/lib/editor/caption-style.ts` (new) | `CaptionLook`/`CaptionStyle` types + schema, presets, defaults, `applyCaptionStyle`, `dimColor`, `displayText`, stroke/box sizes |
| `src/lib/editor/types.ts` | `Caption` v2 (no look), `CaptionWord`, `EditDoc` v2 with `captionStyle`, schema reading v1 |
| `src/lib/editor/caption-words.ts` (new) | `normalizeWords`, `groupWords`, `spreadWords`, `captionWords`, `retextCaption`, `replaceAutoCaptions`, `wordFrames`, `activeWord` |
| `src/lib/editor/captions.ts` | existing caption ops updated for v2 + words (retime scales words, split caption, edit text) |
| `src/lib/editor/sequence-plan.ts` | titles from `captionStyle`, per-word titles, `lines` for SRT |
| `src/lib/editor/package.ts` | SRT/manifest from `plan.lines` |
| `src/lib/editor/editor-store.ts` | history: `undo`, `redo`, `begin`, `commit` |
| `src/lib/transcribe/{types,providers,cost,elevenlabs,run}.ts` (new) | engine, parser, cost, task body with injected I/O |
| `src/lib/db/media-transcripts.ts` (new) | read/write `media_transcripts` |
| `supabase/migrations/0060_media_transcripts.sql` (new) | table |
| `src/lib/editor/transcribe-plan.ts` (new) | which files a run needs, from saved sources |
| `src/app/api/canvases/[cid]/editor/transcribe/route.ts` + `[jobId]/route.ts` + `../transcripts/route.ts` (new) | start, job status, stored transcripts |
| `trigger/editor-transcribe.ts` (new) | the task |
| `src/services/editor.service.ts`, `src/hooks/queries/editor.ts` | client calls + hooks |
| `src/hooks/use-auto-captions.ts` (new) | run orchestration: cost, start, fill pieces as transcripts land, failures |
| `src/hooks/use-reel-playback.ts` | frame-callback clock |
| `src/hooks/use-editor-shortcuts.ts` | undo/redo, arrows, S on caption |
| `src/components/editor/*` | panel, text tab, line, style tab, presets, auto button, lane states, history buttons, stage word rendering, overlay drag/resize |

---

### Task 1: Caption style and the v2 edit document

**Files:**
- Create: `src/lib/editor/caption-style.ts`
- Modify: `src/lib/editor/types.ts`, `src/lib/editor/caption-fonts.ts:20-21`, `src/lib/editor/captions.ts`, `src/lib/editor/reconcile.ts:123`, `src/lib/editor/sequence-plan.ts:156-176`
- Modify tests: `src/lib/editor/__tests__/fixtures.ts` (add `cap`), `types.test.ts`, `captions.test.ts`, `summary.test.ts`, `sequence-plan.test.ts`, `reconcile.test.ts`, `premiere-xml.test.ts`, `package.test.ts`, `export-run.test.ts`, `caption-fonts.test.ts`
- Test: `src/lib/editor/__tests__/caption-style.test.ts`

**Interfaces:**
- Produces: `CaptionLook`, `CaptionStyle`, `Upcoming`, `PresetKey`, `CAPTION_PRESETS`, `PRESET_KEYS`, `DEFAULT_CAPTION_STYLE`, `DEFAULT_POSITION`, `LOOK_KEYS`, `CaptionStyleSchema`, `applyCaptionStyle(doc, patch): EditDoc`, `presetOf(style): PresetKey | null`, `dimColor(style): string`, `displayText(text, style): string`, `strokePx(style, shortEdge): number`, `boxPadPx(style, shortEdge): number`, `BOX_OPACITY = 72`; `Caption` (v2), `CaptionWord`, `EditDoc` (`v: 2`, `captionStyle`).

- [ ] **Step 1: Write the failing test** `src/lib/editor/__tests__/caption-style.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { applyCaptionStyle, CAPTION_PRESETS, DEFAULT_CAPTION_STYLE, dimColor, displayText, presetOf, strokePx } from "../caption-style";
import { EditDocSchema, type EditDoc } from "../types";

const doc: EditDoc = { v: 2, shape: "9:16", sources: [], pieces: [], captions: [], captionStyle: DEFAULT_CAPTION_STYLE };

describe("caption style", () => {
  it("defaults to Bold pop, centred low", () => {
    expect(presetOf(DEFAULT_CAPTION_STYLE)).toBe("bold");
    expect(DEFAULT_CAPTION_STYLE).toMatchObject({ x: 0.5, y: 0.72, font: "montserrat", size: 84, wordByWord: true });
  });

  it("a preset changes the look, never the position", () => {
    const moved = applyCaptionStyle(doc, { x: 0.3, y: 0.4 });
    const boxed = applyCaptionStyle(moved, CAPTION_PRESETS.boxed.look);
    expect(boxed.captionStyle).toMatchObject({ x: 0.3, y: 0.4, box: true, font: "poppins" });
    expect(presetOf(boxed.captionStyle)).toBe("boxed");
  });

  it("returns the same doc for a no-op and clamps position into the frame", () => {
    expect(applyCaptionStyle(doc, { size: DEFAULT_CAPTION_STYLE.size })).toBe(doc);
    expect(applyCaptionStyle(doc, { x: 2, y: -1 }).captionStyle).toMatchObject({ x: 0.96, y: 0.04 });
    expect(applyCaptionStyle(doc, { size: 999 }).captionStyle.size).toBe(200);
  });

  it("dims as a solid colour mixed toward the box, or black", () => {
    expect(dimColor({ ...DEFAULT_CAPTION_STYLE, color: "#ffffff", box: false })).toBe("#737373");
    expect(dimColor({ ...DEFAULT_CAPTION_STYLE, color: "#ffffff", box: true, boxColor: "#111111" })).toBe("#7c7c7c");
  });

  it("upper-cases in code, so the stage and Premiere agree", () => {
    expect(displayText("Make dosa", { ...DEFAULT_CAPTION_STYLE, upper: true })).toBe("MAKE DOSA");
    expect(displayText("Make dosa", { ...DEFAULT_CAPTION_STYLE, upper: false })).toBe("Make dosa");
  });

  it("sizes the outline from the text size, at least 4 px on a 1080 frame", () => {
    expect(strokePx({ ...DEFAULT_CAPTION_STYLE, size: 84 }, 1080)).toBe(8);
    expect(strokePx({ ...DEFAULT_CAPTION_STYLE, size: 30 }, 1080)).toBe(4);
    expect(strokePx({ ...DEFAULT_CAPTION_STYLE, size: 84 }, 720)).toBe(5);
  });
});

describe("reading a v1 edit", () => {
  it("lifts the first caption's look into the reel style and drops per-caption looks", () => {
    const v1 = {
      v: 1, shape: "9:16", sources: [], pieces: [{ id: "p", sourceNodeId: "s", in: 0, out: 4, picture: "original", sound: "original" }],
      captions: [{ id: "c", pieceId: "p", at: 1, duration: 1, text: "Hi", x: 0.4, y: 0.6, font: "anton", size: 90, color: "#ffd60a" }],
    };
    const parsed = EditDocSchema.parse(v1);
    expect(parsed.v).toBe(2);
    expect(parsed.captionStyle).toMatchObject({ font: "anton", size: 90, color: "#ffd60a", x: 0.4, y: 0.6 });
    expect(parsed.captions[0]).toEqual({ id: "c", pieceId: "p", at: 1, duration: 1, text: "Hi" });
  });

  it("gives a v1 edit with no captions the default style", () => {
    const parsed = EditDocSchema.parse({ v: 1, shape: "16:9", sources: [], pieces: [], captions: [] });
    expect(parsed.captionStyle).toEqual(DEFAULT_CAPTION_STYLE);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/editor/__tests__/caption-style.test.ts`
Expected: FAIL, `Cannot find module '../caption-style'`.

- [ ] **Step 3: Create `src/lib/editor/caption-style.ts`**

```ts
// One caption style for the reel (D396): the look (font, size, colour, word by word and how
// words not said yet show, plus the outline / box / caps a preset sets) and where captions sit.
// Presets are looks: they never move or retime captions. The stage and the Premiere writer both
// read these helpers, so what the user sees is what Premiere shows.
import * as z from "zod";
import { CAPTION_FONT_KEYS, type CaptionFontKey } from "./caption-fonts";
import type { EditDoc } from "./types";

export const UPCOMING = ["show", "dim", "hide"] as const;
export type Upcoming = (typeof UPCOMING)[number];

export type CaptionLook = {
  font: CaptionFontKey;
  /** px on a frame 1080 px on its short edge */
  size: number;
  color: string;
  wordByWord: boolean;
  /** the word being said, when wordByWord */
  activeColor: string;
  upcoming: Upcoming;
  outline: boolean;
  box: boolean;
  boxColor: string;
  upper: boolean;
};
export type CaptionStyle = CaptionLook & { x: number; y: number };

export const LOOK_KEYS = ["font", "size", "color", "wordByWord", "activeColor", "upcoming", "outline", "box", "boxColor", "upper"] as const satisfies readonly (keyof CaptionLook)[];

const BASE: CaptionLook = {
  font: "poppins", size: 62, color: "#ffffff", wordByWord: false, activeColor: "#ffca2d",
  upcoming: "show", outline: false, box: false, boxColor: "#000000", upper: false,
};

export const PRESET_KEYS = ["clean", "bold", "karaoke", "boxed"] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];

export const CAPTION_PRESETS: Record<PresetKey, { label: string; sample: string; look: CaptionLook }> = {
  clean: { label: "Clean", sample: "Clean", look: BASE },
  bold: { label: "Bold pop", sample: "Bold", look: { ...BASE, font: "montserrat", size: 84, wordByWord: true, outline: true, upper: true } },
  karaoke: { label: "Karaoke", sample: "Sing", look: { ...BASE, font: "anton", size: 104, wordByWord: true, upcoming: "hide", outline: true, upper: true } },
  boxed: { label: "Boxed", sample: "Boxed", look: { ...BASE, font: "poppins", size: 58, wordByWord: true, activeColor: "#c4b5fd", upcoming: "dim", box: true, boxColor: "#111111" } },
};

export const DEFAULT_POSITION = { x: 0.5, y: 0.72 } as const;
export const DEFAULT_CAPTION_STYLE: CaptionStyle = { ...CAPTION_PRESETS.bold.look, ...DEFAULT_POSITION };

const EDGE = 0.04;
export const MIN_SIZE = 30;
export const MAX_SIZE = 200;
export const BOX_OPACITY = 72;
const STROKE_RATIO = 0.09;
const MIN_STROKE_PX = 4;
const BOX_PAD_RATIO = 0.2;
const DIM_KEEP = 0.45;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const CaptionStyleSchema = z.object({
  font: z.enum(CAPTION_FONT_KEYS as [CaptionFontKey, ...CaptionFontKey[]]),
  size: z.number().finite().min(MIN_SIZE).max(MAX_SIZE),
  color: hex,
  wordByWord: z.boolean(),
  activeColor: hex,
  upcoming: z.enum(UPCOMING),
  outline: z.boolean(),
  box: z.boolean(),
  boxColor: hex,
  upper: z.boolean(),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The doc with the style patched, or the SAME doc when nothing changed (rule 4). */
export function applyCaptionStyle(doc: EditDoc, patch: Partial<CaptionStyle>): EditDoc {
  const next: CaptionStyle = { ...doc.captionStyle, ...patch };
  next.x = clamp(next.x, EDGE, 1 - EDGE);
  next.y = clamp(next.y, EDGE, 1 - EDGE);
  next.size = clamp(Math.round(next.size), MIN_SIZE, MAX_SIZE);
  const changed = (Object.keys(next) as (keyof CaptionStyle)[]).some((k) => next[k] !== doc.captionStyle[k]);
  return changed ? { ...doc, captionStyle: next } : doc;
}

export function presetOf(style: CaptionStyle): PresetKey | null {
  return PRESET_KEYS.find((k) => LOOK_KEYS.every((key) => CAPTION_PRESETS[k].look[key] === style[key])) ?? null;
}

const toRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Words not said yet, dimmed: a solid colour (Premiere titles have no per-character opacity). */
export function dimColor(style: Pick<CaptionLook, "color" | "box" | "boxColor">): string {
  const a = toRgb(style.color);
  const b = toRgb(style.box ? style.boxColor : "#000000");
  return toHex(a.map((v, i) => v * DIM_KEEP + b[i] * (1 - DIM_KEEP)));
}

export function displayText(text: string, style: Pick<CaptionLook, "upper">): string {
  return style.upper ? text.toLocaleUpperCase() : text;
}

const scaled = (px: number, shortEdge: number) => (px * shortEdge) / 1080;

export function sizePx(style: Pick<CaptionLook, "size">, shortEdge: number): number {
  return Math.round(scaled(style.size, shortEdge));
}

export function strokePx(style: Pick<CaptionLook, "size">, shortEdge: number): number {
  return Math.round(scaled(Math.max(MIN_STROKE_PX, style.size * STROKE_RATIO), shortEdge));
}

export function boxPadPx(style: Pick<CaptionLook, "size">, shortEdge: number): number {
  return Math.round(scaled(style.size * BOX_PAD_RATIO, shortEdge));
}
```

Check: `dimColor` white over black = 255×0.45 = 114.75 → 115 = `0x73`; over `#111111` = 114.75 + 17×0.55 = 124.1 → 124 = `0x7c`.

- [ ] **Step 4: Rewrite the caption types in `src/lib/editor/types.ts`**

Replace the `Caption` type, `EditDoc`, `CaptionSchema` and `EditDocSchema` (lines 26–81) with:

```ts
/** A word's time inside its caption's piece, in SOURCE seconds like Caption.at (D397). */
export type CaptionWord = { text: string; at: number; duration: number };

/** at: SOURCE seconds in its piece's source. The look is the reel's (D396). */
export type Caption = {
  id: string;
  pieceId: string;
  at: number;
  duration: number;
  text: string;
  /** Present for auto captions, and once a line is retimed or split (D397). */
  words?: CaptionWord[];
  /** Written by Auto captions (D399). */
  auto?: true;
  /** Changed by the user since; Auto captions never rewrites it (D399). */
  edited?: true;
  /** The sound URL its words came from (D401). */
  from?: string;
};

export type EditDoc = {
  v: 2;
  shape: ReelShape;
  sources: EditSource[];
  pieces: Piece[];
  captions: Caption[];
  captionStyle: CaptionStyle;
};
```

and the schemas:

```ts
const WordSchema = z.object({ text: z.string().min(1).max(100), at: seconds, duration: z.number().finite().min(0) });

const CaptionSchema = z.object({
  id: z.string().min(1),
  pieceId: z.string().min(1),
  at: seconds,
  duration: z.number().finite().min(0.2),
  text: z.string().max(500),
  words: z.array(WordSchema).max(200).optional(),
  auto: z.literal(true).optional(),
  edited: z.literal(true).optional(),
  from: z.string().url().max(2048).optional(),
});

const docBase = {
  shape: z.enum(REEL_SHAPES),
  sources: z.array(z.object({ nodeId: z.string().min(1), edgeId: z.string().min(1), versionId: z.string().min(1) })).max(500),
  pieces: z.array(PieceSchema).max(500),
};

const V2Schema = z.object({ v: z.literal(2), ...docBase, captions: z.array(CaptionSchema).max(1000), captionStyle: CaptionStyleSchema });

// v1 (before D396): each caption carried its own look. The first caption's look becomes the reel's.
const V1CaptionSchema = CaptionSchema.extend({
  x: unit, y: unit,
  font: z.enum(CAPTION_FONT_KEYS as [CaptionFontKey, ...CaptionFontKey[]]),
  size: z.number().finite().min(8).max(400),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
const V1Schema = z.object({ v: z.literal(1), ...docBase, captions: z.array(V1CaptionSchema).max(1000) }).transform((d): EditDoc => {
  const first = d.captions[0];
  const captionStyle: CaptionStyle = first
    ? { ...DEFAULT_CAPTION_STYLE, font: first.font, size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, first.size)), color: first.color.toLowerCase(), x: first.x, y: first.y }
    : DEFAULT_CAPTION_STYLE;
  const captions = d.captions.map(({ x: _x, y: _y, font: _f, size: _s, color: _c, ...c }) => c);
  return { v: 2, shape: d.shape, sources: d.sources, pieces: d.pieces, captions, captionStyle };
});

/** Reads v1 and v2 edits; always returns v2. */
export const EditDocSchema = z.union([V2Schema, V1Schema]) as unknown as z.ZodType<EditDoc>;
```

Add imports at the top of `types.ts`: `import { CaptionStyleSchema, DEFAULT_CAPTION_STYLE, MAX_SIZE, MIN_SIZE, type CaptionStyle } from "./caption-style";`. (`caption-style.ts` imports `EditDoc` as a **type only**, so the cycle is erased at runtime.)

- [ ] **Step 5: Update the caption operations in `src/lib/editor/captions.ts`**

- Delete `nextLook` and `placeCaption`.
- `addCaption`: build `{ id: newId, ...anchor, duration: NEW_CAPTION_SECONDS, text: NEW_CAPTION_TEXT }` with `const NEW_CAPTION_SECONDS = 2;`.
- `editCaption(doc, id, text: string)`: text-only (Task 2 replaces its body with `retextCaption`); for now `return patchCaption(doc, id, { text: text.slice(0, MAX_CAPTION_TEXT) })`.
- `attachCues`: drop `...look`.
- In `caption-fonts.ts` delete `CAPTION_DEFAULTS` (and its test line in `caption-fonts.test.ts:19`).

- [ ] **Step 6: Update `reconcile.ts:123`** to `return { doc: { v: 2, shape, sources: sourcesOut, pieces, captions, captionStyle: prev?.captionStyle ?? DEFAULT_CAPTION_STYLE }, notices };` (import `DEFAULT_CAPTION_STYLE`). Check `doc !== prev` still works for an unchanged edit (reconcile must return `prev` itself when nothing changed — read the function; if it builds a new object unconditionally today, keep that behaviour).

- [ ] **Step 7: Update `sequence-plan.ts:156-176`** to read the reel style (per-word titles come in Task 3):

```ts
    const style = doc.captionStyle;
    const shortEdge = Math.min(frame.width, frame.height);
    for (const c of doc.captions) {
      const t = captionTimes(reel, c);
      if (!t) continue;
      const start = Math.round(t.start * fps);
      const end = Math.min(cursor, Math.round(t.end * fps));
      if (end <= start) continue;
      titles.push({
        start, end, text: c.text, fontKey: style.font, fontPostScript: captionFont(style.font).postScript,
        sizePx: sizePx(style, shortEdge), color: style.color, x: style.x, y: style.y, track: 0,
      });
    }
```

- [ ] **Step 8: Add a caption builder to `fixtures.ts` and fix every test that built v1 captions**

```ts
import { DEFAULT_CAPTION_STYLE } from "../caption-style";
import type { Caption, EditDoc } from "../types";
export const cap = (id: string, pieceId: string, at: number, duration = 1, extra: Partial<Caption> = {}): Caption => ({ id, pieceId, at, duration, text: id, ...extra });
export const emptyDoc = (o: Partial<EditDoc> = {}): EditDoc => ({ v: 2, shape: "9:16", sources: [], pieces: [], captions: [], captionStyle: DEFAULT_CAPTION_STYLE, ...o });
```

In `types.test.ts`, `captions.test.ts`, `summary.test.ts`, `sequence-plan.test.ts`, `reconcile.test.ts`, `premiere-xml.test.ts`, `package.test.ts`, `export-run.test.ts`: replace literal captions with `cap(...)`, docs with `v: 2` + `captionStyle: DEFAULT_CAPTION_STYLE`, and move font/colour assertions to `captionStyle` (e.g. `package.test.ts`'s fonts-used test sets `captionStyle: { ...DEFAULT_CAPTION_STYLE, font }`). Delete `captions.test.ts`'s "copies the last caption's look" and `placeCaption` tests; keep the anchoring tests. In `types.test.ts` replace the "x off the frame"/"named colour"/"unknown font" invalid cases with the same mutations on `captionStyle`.

- [ ] **Step 9: Run the editor tests and the type check**

Run: `npx vitest run src/lib/editor` then `npx tsc --noEmit -p .`
Expected: all editor tests PASS. `tsc` reports errors only in `src/components/editor/editor-caption-props.tsx`, `editor-stage-captions.tsx`, `editor-stage-with-caption.tsx`, `editor-caption-overlay.tsx`, `editor-captions-toolbar.tsx` (per-caption look). Make these compile minimally now: `captionTextStyle(c)` → `captionTextStyle(doc.captionStyle)`; overlay `onMove` → `apply((d) => applyCaptionStyle(d, { x, y }))`; caption props panel: remove the font/size/colour sections (Task 10 deletes the file). Re-run `tsc` until clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/editor src/components/editor
git commit -m "feat(editor): one caption style for the reel; edit document v2 (D396)"
```

---

### Task 2: Caption words — grouping, retyping, frames

**Files:**
- Create: `src/lib/editor/caption-words.ts`, `src/lib/transcribe/types.ts`
- Modify: `src/lib/editor/captions.ts` (`editCaption`, `retimeCaption`, new `splitCaption`)
- Test: `src/lib/editor/__tests__/caption-words.test.ts`, extend `captions.test.ts`

**Interfaces:**
- Consumes: `Caption`, `CaptionWord`, `EditDoc` (Task 1); `pieceOffsets`, `totalSeconds` (`timeline.ts`).
- Produces (`src/lib/transcribe/types.ts`): `TranscriptWord = { t: string; s: number; e: number; p: number }`, `Transcript = { url: string; language: string; words: TranscriptWord[]; engine: string; model: string; durationSeconds: number }`, `TranscribeFailureReason = "no-speech" | "no-sound" | "failed"`.
- Produces (`caption-words.ts`): `normalizeWords(words, fps): TranscriptWord[]`, `groupWords(words, o?): TranscriptWord[][]`, `spreadWords(text, at, duration): CaptionWord[]`, `captionWords(c): CaptionWord[]`, `retextCaption(c, text): { caption: Caption; spread: boolean } | null`, `replaceAutoCaptions(doc, pieceId, words, from, newId): EditDoc`, `wordFrames(doc, c, fps): WordFrame[] | null` with `WordFrame = { text: string; start: number; end: number; charStart: number; charEnd: number }`, `activeWord(frames, frame): number` (index or -1), `HOLD_SECONDS = 0.3`.
- Produces (`captions.ts`): `editCaption(doc, id, text): { doc: EditDoc; spread: boolean }`, `splitCaption(doc, id, reelT, newId): EditDoc`, `retimeCaption` (scales words).

- [ ] **Step 1: Create `src/lib/transcribe/types.ts`**

```ts
// A stored transcript (D395): every word of one file with its time in that file's seconds.
// p = the engine's confidence for the word, 0–1.
export type TranscriptWord = { t: string; s: number; e: number; p: number };

export type Transcript = {
  url: string;
  language: string;
  words: TranscriptWord[];
  engine: string;
  model: string;
  durationSeconds: number;
};

export type TranscribeFailureReason = "no-speech" | "no-sound" | "failed";
```

- [ ] **Step 2: Write the failing test** `src/lib/editor/__tests__/caption-words.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { activeWord, captionWords, groupWords, normalizeWords, replaceAutoCaptions, retextCaption, spreadWords, wordFrames } from "../caption-words";
import { cap, emptyDoc } from "./fixtures";
import type { Piece } from "../types";
import type { TranscriptWord } from "@/lib/transcribe/types";

const w = (t: string, s: number, e: number, p = 1): TranscriptWord => ({ t, s, e, p });
const piece = (id: string, inS: number, outS: number): Piece => ({ id, sourceNodeId: `s-${id}`, in: inS, out: outS, picture: "original", sound: "original" });

// Clip 4 of Reel 2, as the engine returned it.
const clip4 = [w("I", 0.26, 0.26), w("actually", 0.32, 0.6), w("started", 0.7, 1.04), w("paying", 1.08, 1.28), w("more", 1.32, 1.48),
  w("attention", 1.52, 1.96), w("to", 1.98, 2.06), w("what", 2.1, 2.24), w("I", 2.34, 2.42), w("eat", 2.48, 2.66), w("because", 2.76, 3.0),
  w("of", 3.04, 3.14), w("my", 3.16, 3.3), w("blood", 3.32, 3.52), w("sugar,", 3.6, 3.84), w("but", 4.6, 4.7), w("I", 4.78, 4.84)];

describe("normalizeWords", () => {
  it("gives a zero-length word one frame, never past the next word", () => {
    const out = normalizeWords([w("I", 0.26, 0.26), w("a", 0.28, 0.3)], 24);
    expect(out[0].e).toBeCloseTo(0.28, 9);
    expect(normalizeWords([w("I", 0.26, 0.26)], 24)[0].e).toBeCloseTo(0.26 + 1 / 24, 9);
  });
  it("drops empty words", () => {
    expect(normalizeWords([w(" ", 0, 0.1), w("hi", 0.1, 0.2)], 24).map((x) => x.t)).toEqual(["hi"]);
  });
});

describe("groupWords", () => {
  it("makes lines of up to 3 words, breaking after punctuation and pauses", () => {
    const lines = groupWords(normalizeWords(clip4, 24)).map((l) => l.map((x) => x.t).join(" "));
    expect(lines).toEqual(["I actually started", "paying more attention", "to what I", "eat because of", "my blood sugar,", "but I"]);
  });
  it("never puts more than 22 characters on a line", () => {
    const lines = groupWords([w("extraordinarily", 0, 0.5), w("unbelievable", 0.5, 1)]);
    expect(lines).toHaveLength(2);
  });
});

describe("spreadWords and captionWords", () => {
  it("spreads words over a span by their length", () => {
    const words = spreadWords("go now", 1, 1);
    expect(words.map((x) => x.text)).toEqual(["go", "now"]);
    expect(words[0]).toMatchObject({ at: 1 });
    expect(words[0].duration).toBeCloseTo(0.4, 9);
    expect(words[1].at).toBeCloseTo(1.4, 9);
  });
  it("spreads a hand-typed caption's text when it has no words", () => {
    expect(captionWords(cap("c", "p", 2, 2, { text: "Order now" })).map((x) => x.text)).toEqual(["Order", "now"]);
  });
});

describe("retextCaption", () => {
  const c = cap("c", "p", 1, 1.3, { text: "make dosa", words: [{ text: "make", at: 1, duration: 0.4 }, { text: "dosa", at: 1.5, duration: 0.5 }], auto: true });
  it("keeps every word's time when the word count is the same", () => {
    const r = retextCaption(c, "Make dosa!")!;
    expect(r.spread).toBe(false);
    expect(r.caption).toMatchObject({ text: "Make dosa!", edited: true });
    expect(r.caption.words).toEqual([{ text: "Make", at: 1, duration: 0.4 }, { text: "dosa!", at: 1.5, duration: 0.5 }]);
  });
  it("spreads the words over the line when the count changes", () => {
    const r = retextCaption(c, "make crispy dosa")!;
    expect(r.spread).toBe(true);
    expect(r.caption.words!.map((x) => x.text)).toEqual(["make", "crispy", "dosa"]);
    expect(r.caption.words![0].at).toBe(1);
  });
  it("returns null for empty text, and the same caption for unchanged text", () => {
    expect(retextCaption(c, "   ")).toBeNull();
    expect(retextCaption(c, "make dosa")!.caption).toBe(c);
  });
});

describe("replaceAutoCaptions", () => {
  const base = emptyDoc({ pieces: [piece("A", 0, 8)] });
  const words = normalizeWords(clip4, 24);
  let n = 0;
  const id = () => `n${++n}`;

  it("writes one auto caption per line, anchored in source seconds, marked with its file", () => {
    const doc = replaceAutoCaptions(base, "A", words, "https://x/a.mp4", id);
    expect(doc.captions).toHaveLength(6);
    expect(doc.captions[0]).toMatchObject({ pieceId: "A", at: 0.26, text: "I actually started", auto: true, from: "https://x/a.mp4" });
    expect(doc.captions[0].words).toHaveLength(3);
    // a line holds 0.3 s past its last word, cut short by the next line
    expect(doc.captions[0].at + doc.captions[0].duration).toBeCloseTo(1.08, 9);
  });

  it("keeps lines the user edited or added, and skips the words they cover", () => {
    const first = replaceAutoCaptions(base, "A", words, "https://x/a.mp4", id);
    const edited = { ...first, captions: first.captions.map((c, i) => (i === 0 ? { ...c, text: "I really started", edited: true as const } : c)) };
    const again = replaceAutoCaptions(edited, "A", words, "https://x/a.mp4", id);
    expect(again.captions.filter((c) => c.edited)).toHaveLength(1);
    expect(again.captions.map((c) => c.text)).not.toContain("I actually started");
    expect(again.captions).toHaveLength(6);
  });

  it("only uses words inside the piece's trim", () => {
    const trimmed = emptyDoc({ pieces: [piece("A", 2, 4)] });
    const doc = replaceAutoCaptions(trimmed, "A", words, "https://x/a.mp4", id);
    expect(doc.captions.every((c) => c.at >= 2 && c.at < 4)).toBe(true);
  });
});

describe("wordFrames", () => {
  const doc = emptyDoc({ pieces: [piece("A", 0, 4), piece("B", 1, 5)] });
  const c = cap("c", "B", 1.5, 1, { text: "fresh jackfruit", words: [{ text: "fresh", at: 1.5, duration: 0.3 }, { text: "jackfruit", at: 1.9, duration: 0.5 }] });

  it("puts each word on the sequence frame it starts, active until the next word", () => {
    // B starts at reel 4 s; fresh at source 1.5 = reel 4.5 s = frame 108
    expect(wordFrames(doc, c, 24)).toEqual([
      { text: "fresh", start: 108, end: 118, charStart: 0, charEnd: 5 },
      { text: "jackfruit", start: 118, end: 132, charStart: 6, charEnd: 15 },
    ]);
  });

  it("finds the active word for a frame", () => {
    const f = wordFrames(doc, c, 24)!;
    expect(activeWord(f, 107)).toBe(-1);
    expect(activeWord(f, 108)).toBe(0);
    expect(activeWord(f, 120)).toBe(1);
  });

  it("returns null for a caption whose piece is gone", () => {
    expect(wordFrames(doc, { ...c, pieceId: "gone" }, 24)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/editor/__tests__/caption-words.test.ts`
Expected: FAIL, cannot find `../caption-words`.

- [ ] **Step 4: Create `src/lib/editor/caption-words.ts`**

```ts
// Words inside captions (D397). Times are SOURCE seconds of the caption's piece, like Caption.at,
// so trimming or moving other pieces never knocks a word out of sync. wordFrames is the ONE place
// word times become frames: the stage and the Premiere writer both call it.
import type { TranscriptWord } from "@/lib/transcribe/types";
import { captionTimes, MAX_CAPTION_TEXT } from "./captions";
import { pieceOffsets } from "./timeline";
import type { Caption, CaptionWord, EditDoc } from "./types";

export const HOLD_SECONDS = 0.3;
const MAX_WORDS = 3;
const MAX_CHARS = 22;
const PAUSE_SECONDS = 0.35;
const LINE_END = /[.,?!;:]$/;
const MIN_CAPTION_SECONDS = 0.2;

/** Every word at least one frame long, never running into the next; empty words dropped. */
export function normalizeWords(words: TranscriptWord[], fps: number): TranscriptWord[] {
  const kept = words.filter((x) => x.t.trim().length > 0).map((x) => ({ ...x, t: x.t.trim() }));
  const frame = 1 / fps;
  return kept.map((x, i) => {
    let e = Math.max(x.e, x.s + frame);
    const next = kept[i + 1];
    if (next) e = Math.min(e, Math.max(x.s + frame, next.s));
    return { ...x, e };
  });
}

export function groupWords(words: TranscriptWord[], o: { maxWords?: number; maxChars?: number; pause?: number } = {}): TranscriptWord[][] {
  const maxWords = o.maxWords ?? MAX_WORDS;
  const maxChars = o.maxChars ?? MAX_CHARS;
  const pause = o.pause ?? PAUSE_SECONDS;
  const lines: TranscriptWord[][] = [];
  let cur: TranscriptWord[] = [];
  const flush = () => {
    if (cur.length) lines.push(cur);
    cur = [];
  };
  words.forEach((x, i) => {
    const chars = cur.reduce((n, y) => n + y.t.length + 1, 0) + x.t.length;
    if (cur.length && (cur.length >= maxWords || chars > maxChars)) flush();
    cur.push(x);
    const next = words[i + 1];
    if (LINE_END.test(x.t) || !next || next.s - x.e > pause) flush();
  });
  flush();
  return lines;
}

const tokens = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/** Words spread over [at, at + duration] by their length. */
export function spreadWords(text: string, at: number, duration: number): CaptionWord[] {
  const toks = tokens(text);
  const weights = toks.map((t) => Math.max(1, t.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  let cursor = at;
  return toks.map((t, i) => {
    const d = (duration * weights[i]) / sum;
    const word = { text: t, at: cursor, duration: d };
    cursor += d;
    return word;
  });
}

/** A caption's words: its own, or its text spread over its span (hand-typed captions). */
export function captionWords(c: Caption): CaptionWord[] {
  return c.words ?? spreadWords(c.text, c.at, c.duration);
}

/** New text for a line (spec §5). Null for empty text; the SAME caption when unchanged. */
export function retextCaption(c: Caption, text: string): { caption: Caption; spread: boolean } | null {
  const clean = text.slice(0, MAX_CAPTION_TEXT);
  const toks = tokens(clean);
  if (toks.length === 0) return null;
  if (clean.trim() === c.text.trim()) return { caption: c, spread: false };
  const old = captionWords(c);
  if (toks.length === old.length) {
    return { caption: { ...c, text: clean.trim(), words: old.map((w, i) => ({ ...w, text: toks[i] })), edited: true }, spread: false };
  }
  const end = old.length ? old[old.length - 1].at + old[old.length - 1].duration : c.at + c.duration;
  return { caption: { ...c, text: clean.trim(), words: spreadWords(clean, c.at, Math.max(MIN_CAPTION_SECONDS, end - c.at)), edited: true }, spread: true };
}

/** Kept = added by hand, or edited since Auto captions wrote it. */
const kept = (c: Caption) => !c.auto || c.edited === true;

/** Rewrites a piece's auto captions from its transcript, keeping the user's lines (D399). */
export function replaceAutoCaptions(doc: EditDoc, pieceId: string, words: TranscriptWord[], from: string, newId: () => string): EditDoc {
  const piece = doc.pieces.find((p) => p.id === pieceId);
  if (!piece) return doc;
  const others = doc.captions.filter((c) => c.pieceId !== pieceId || kept(c));
  const keptSpans = others.filter((c) => c.pieceId === pieceId).map((c) => ({ s: c.at, e: c.at + c.duration }));
  const usable = words.filter((x) => x.s >= piece.in && x.s < piece.out && !keptSpans.some((k) => x.s >= k.s - 0.01 && x.s < k.e));
  const lines = groupWords(usable);
  const starts = [...lines.map((l) => l[0].s), ...keptSpans.map((k) => k.s)].sort((a, b) => a - b);
  const added: Caption[] = lines.map((line) => {
    const at = line[0].s;
    const last = line[line.length - 1];
    const nextStart = starts.find((s) => s > at + 1e-9) ?? Infinity;
    const end = Math.min(last.e + HOLD_SECONDS, nextStart, piece.out);
    return {
      id: newId(),
      pieceId,
      at,
      duration: Math.max(MIN_CAPTION_SECONDS, end - at),
      text: line.map((x) => x.t).join(" "),
      words: line.map((x) => ({ text: x.t, at: x.s, duration: x.e - x.s })),
      auto: true,
      from,
    };
  });
  return { ...doc, captions: [...others, ...added] };
}

export type WordFrame = { text: string; start: number; end: number; charStart: number; charEnd: number };

/** Each word's sequence frames (start inclusive, end exclusive), and where it sits in the text. */
export function wordFrames(doc: EditDoc, c: Caption, fps: number): WordFrame[] | null {
  const index = doc.pieces.findIndex((p) => p.id === c.pieceId);
  const span = captionTimes(doc, c);
  if (index < 0 || !span) return null;
  const piece = doc.pieces[index];
  const offset = pieceOffsets(doc.pieces)[index];
  const lineEnd = Math.round(span.end * fps);
  const words = captionWords(c).filter((x) => x.at >= piece.in - 1e-9 && x.at < piece.out);
  let char = 0;
  const starts = words.map((x) => Math.round((offset + x.at - piece.in) * fps));
  return words.map((x, i) => {
    const charStart = char;
    char += x.text.length + 1;
    const start = starts[i];
    const end = i + 1 < words.length ? Math.max(start + 1, starts[i + 1]) : Math.max(start + 1, lineEnd);
    return { text: x.text, start, end, charStart, charEnd: charStart + x.text.length };
  });
}

/** The word being said on `frame`: the last one started, or -1 before the first. */
export function activeWord(frames: WordFrame[], frame: number): number {
  let active = -1;
  for (let i = 0; i < frames.length; i++) if (frames[i].start <= frame) active = i;
  return active;
}
```

Note the expected `wordFrames` values in the test: fresh 4.5 s → 108; jackfruit 4.9 s → 117.6 → **118**; line end: caption at 1.5, duration 1 → reel 4.5–5.5 → frame 132. Matches the test.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/editor/__tests__/caption-words.test.ts`
Expected: PASS. If `groupWords` line 4 differs ("eat because of" vs "eat because"), the 22-char rule is `chars > 22`; "eat because of" = 14 chars, 3 words → correct.

- [ ] **Step 6: Write failing tests for word-aware caption ops** — append to `captions.test.ts`:

```ts
import { editCaption, retimeCaption, splitCaption } from "../captions";
import { cap, emptyDoc } from "./fixtures";

describe("caption ops keep words in sync", () => {
  const p = { id: "A", sourceNodeId: "s", in: 0, out: 8, picture: "original" as const, sound: "original" as const };
  const c = cap("c", "A", 1, 2, { text: "one two three", words: [{ text: "one", at: 1, duration: 0.5 }, { text: "two", at: 1.6, duration: 0.4 }, { text: "three", at: 2.1, duration: 0.6 }], auto: true });
  const doc = emptyDoc({ pieces: [p], captions: [c] });

  it("moves words with the line and scales them when an edge is dragged", () => {
    const moved = retimeCaption(doc, "c", 2, 4).captions[0];
    expect(moved.words!.map((x) => x.at)).toEqual([2, 2.6, 3.1]);
    const stretched = retimeCaption(doc, "c", 1, 5).captions[0];
    expect(stretched.words![1].at).toBeCloseTo(2.2, 9);
    expect(stretched.edited).toBe(true);
  });

  it("splits at the first word at or after the playhead", () => {
    const out = splitCaption(doc, "c", 1.7, "c2");
    expect(out.captions.map((x) => x.text)).toEqual(["one two", "three"]);
    expect(out.captions[1]).toMatchObject({ id: "c2", at: 2.1, edited: true });
  });

  it("splits a line in the middle when the playhead is outside it, and leaves one-word lines alone", () => {
    expect(splitCaption(doc, "c", 7, "c2").captions.map((x) => x.text)).toEqual(["one two", "three"]);
    const one = emptyDoc({ pieces: [p], captions: [cap("o", "A", 1, 1, { text: "solo" })] });
    expect(splitCaption(one, "o", 1.2, "o2")).toBe(one);
  });

  it("edits text through retextCaption and reports a spread", () => {
    expect(editCaption(doc, "c", "one two three").doc).toBe(doc);
    expect(editCaption(doc, "c", "one 2 three").spread).toBe(false);
    expect(editCaption(doc, "c", "one two").spread).toBe(true);
    expect(editCaption(doc, "c", "").doc.captions).toEqual([]);
  });
});
```

- [ ] **Step 7: Implement in `captions.ts`**

Replace `editCaption` and `retimeCaption`, add `splitCaption`:

```ts
import { captionWords, retextCaption } from "./caption-words";

/** New reel times; words move with the line and scale when its length changes (D397). */
export function retimeCaption(doc: EditDoc, id: string, start: number, end: number): EditDoc {
  const anchor = anchorAt(doc, start);
  const current = doc.captions.find((c) => c.id === id);
  if (!anchor || !current) return doc;
  const duration = Math.max(MIN_CAPTION_SECONDS, end - start);
  if (anchor.pieceId === current.pieceId && Math.abs(anchor.at - current.at) < 1e-9 && Math.abs(duration - current.duration) < 1e-9) return doc;
  const k = duration / current.duration;
  const words = current.words?.map((w) => ({ ...w, at: anchor.at + (w.at - current.at) * k, duration: w.duration * k }));
  return patchCaption(doc, id, { ...anchor, duration, ...(words ? { words } : {}), edited: true });
}

/** Text edits keep word times when the count is unchanged (spec §5). Empty text removes it. */
export function editCaption(doc: EditDoc, id: string, text: string): { doc: EditDoc; spread: boolean } {
  const c = doc.captions.find((x) => x.id === id);
  if (!c) return { doc, spread: false };
  const r = retextCaption(c, text);
  if (!r) return { doc: removeCaption(doc, id), spread: false };
  if (r.caption === c) return { doc, spread: false };
  return { doc: withCaptions(doc, doc.captions.map((x) => (x.id === id ? r.caption : x))), spread: r.spread };
}

/** Splits a line before the first word at or after reel time t (the middle word otherwise). */
export function splitCaption(doc: EditDoc, id: string, t: number, newId: string): EditDoc {
  const c = doc.captions.find((x) => x.id === id);
  const index = c ? doc.pieces.findIndex((p) => p.id === c.pieceId) : -1;
  if (!c || index < 0) return doc;
  const words = captionWords(c);
  if (words.length < 2) return doc;
  const piece = doc.pieces[index];
  const local = piece.in + (t - pieceOffsets(doc.pieces)[index]);
  let k = words.findIndex((w) => w.at >= local - 1e-9);
  if (k <= 0) k = Math.ceil(words.length / 2);
  const a = words.slice(0, k);
  const b = words.slice(k);
  const end = c.at + c.duration;
  const first: Caption = { ...c, text: a.map((w) => w.text).join(" "), words: a, duration: Math.max(MIN_CAPTION_SECONDS, b[0].at - c.at), edited: true };
  const second: Caption = { ...c, id: newId, at: b[0].at, text: b.map((w) => w.text).join(" "), words: b, duration: Math.max(MIN_CAPTION_SECONDS, end - b[0].at), edited: true };
  const i = doc.captions.indexOf(c);
  const captions = doc.captions.slice();
  captions.splice(i, 1, first, second);
  return withCaptions(doc, captions);
}
```

(`patchCaption` must accept `words`/`edited` — its `Partial<Caption>` type already does. Import `pieceOffsets` from `./timeline`.) Update existing `captions.test.ts` cases that called `editCaption(doc, "c1", { text })` to the string form and `.doc`.

Fix the one caller of `editCaption` in `editor-caption-props.tsx` (`patch({ text })` → `apply((d) => editCaption(d, caption.id, value).doc)`) so `tsc` stays clean; Task 10 replaces that file.

- [ ] **Step 8: Run editor tests and tsc**

Run: `npx vitest run src/lib/editor` and `npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/editor src/lib/transcribe src/components/editor
git commit -m "feat(editor): words inside captions, grouping, retyping and one frame rule (D397)"
```

---

### Task 3: Premiere export of the reel style and word by word

**Files:**
- Modify: `src/lib/editor/sequence-plan.ts`, `src/lib/editor/package.ts:65,87-89`, `src/lib/editor/premiere-xml.ts:183` (pass new title fields through unchanged — verify only)
- Test: `src/lib/editor/__tests__/sequence-plan.test.ts`, `package.test.ts`

**Interfaces:**
- Consumes: `wordFrames` (Task 2), `dimColor`, `displayText`, `strokePx`, `boxPadPx`, `sizePx`, `BOX_OPACITY` (Task 1), `TextRun`/`TitleSpec` (`premiere-title.ts`, already committed).
- Produces: `SequencePlan.lines: { start: number; end: number; text: string }[]` (sequence frames, one per caption, display text).

- [ ] **Step 1: Write the failing tests** (append to `sequence-plan.test.ts`; reuse that file's existing source/piece builders — read its top to name them)

```ts
import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE } from "../caption-style";

describe("captions in the plan (D398)", () => {
  // one 24 fps piece, 0–5 s, 1080x1920 picture (adapt to the file's own builders)
  const words = [{ text: "make", at: 1, duration: 0.5 }, { text: "dosa", at: 1.5, duration: 0.5 }];
  const withStyle = (style: Partial<typeof DEFAULT_CAPTION_STYLE>) =>
    planSequence({ ...baseDoc, captions: [cap("c", "p1", 1, 1.3, { text: "make dosa", words })], captionStyle: { ...DEFAULT_CAPTION_STYLE, ...style } }, sources);

  it("writes one title per line when word by word is off, upper-cased by the style", () => {
    const r = withStyle({ ...CAPTION_PRESETS.clean.look, upper: true });
    if (!r.ok) throw new Error(r.reason);
    expect(r.plan.titles).toHaveLength(1);
    expect(r.plan.titles[0]).toMatchObject({ text: "MAKE DOSA", start: 24, end: 55 });
    expect(r.plan.lines).toEqual([{ start: 24, end: 55, text: "MAKE DOSA" }]);
  });

  it("writes one title per word, the said word coloured, upcoming dimmed", () => {
    const r = withStyle(CAPTION_PRESETS.boxed.look);
    if (!r.ok) throw new Error(r.reason);
    expect(r.plan.titles.map((t) => [t.start, t.end])).toEqual([[24, 36], [36, 55]]);
    expect(r.plan.titles[0].runs).toEqual([{ start: 0, end: 4, color: "#c4b5fd" }, { start: 5, end: 9, color: "#7c7c7c" }]);
    expect(r.plan.titles[1].runs).toEqual([{ start: 5, end: 9, color: "#c4b5fd" }]);
    expect(r.plan.titles[0].box).toEqual({ color: "#111111", opacity: 72, sizePx: 12 });
    expect(r.plan.lines).toHaveLength(1);
  });

  it("hides upcoming words for Karaoke and outlines the text", () => {
    const r = withStyle(CAPTION_PRESETS.karaoke.look);
    if (!r.ok) throw new Error(r.reason);
    expect(r.plan.titles[0].runs).toEqual([{ start: 0, end: 4, color: "#ffca2d" }, { start: 5, end: 9, hidden: true }]);
    expect(r.plan.titles[0].stroke).toEqual({ color: "#000000", widthPx: 9 });
  });
});
```

(Box `sizePx`: 58 × 0.2 = 11.6 → 12 at 1080. Karaoke stroke: 104 × 0.09 = 9.36 → 9.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/editor/__tests__/sequence-plan.test.ts`
Expected: FAIL (`lines` undefined, one title instead of two).

- [ ] **Step 3: Implement in `sequence-plan.ts`**

Add `lines: Array<{ start: number; end: number; text: string }>` to `SequencePlan`. Replace the caption loop with:

```ts
    const style = doc.captionStyle;
    const shortEdge = Math.min(frame.width, frame.height);
    const look = {
      fontKey: style.font,
      fontPostScript: captionFont(style.font).postScript,
      sizePx: sizePx(style, shortEdge),
      color: style.color,
      x: style.x,
      y: style.y,
      ...(style.outline ? { stroke: { color: "#000000", widthPx: strokePx(style, shortEdge) } } : {}),
      ...(style.box ? { box: { color: style.boxColor, opacity: BOX_OPACITY, sizePx: boxPadPx(style, shortEdge) } } : {}),
    };
    const dim = dimColor(style);
    const lines: SequencePlan["lines"] = [];
    for (const c of doc.captions) {
      const t = captionTimes(reel, c);
      if (!t) continue;
      const start = Math.round(t.start * fps);
      const end = Math.min(cursor, Math.round(t.end * fps));
      if (end <= start) continue;
      const frames = style.wordByWord ? wordFrames(reel, c, fps) : null;
      const text = displayText(frames ? frames.map((f) => f.text).join(" ") : c.text, style);
      lines.push({ start, end, text });
      if (!frames || frames.length === 0) {
        titles.push({ ...look, start, end, text, track: 0 });
        continue;
      }
      frames.forEach((f, i) => {
        const s = Math.max(start, f.start);
        const e = Math.min(end, f.end);
        if (e <= s) return;
        const runs: TextRun[] = [{ start: f.charStart, end: f.charEnd, color: style.activeColor }];
        if (style.upcoming !== "show") {
          for (const later of frames.slice(i + 1)) {
            runs.push(style.upcoming === "hide" ? { start: later.charStart, end: later.charEnd, hidden: true } : { start: later.charStart, end: later.charEnd, color: dim });
          }
        }
        titles.push({ ...look, start: s, end: e, text, runs, track: 0 });
      });
    }
    assignTitleTracks(titles);
```

and return `lines` in the plan. Imports: `wordFrames` from `./caption-words`; `BOX_OPACITY, boxPadPx, dimColor, displayText, sizePx, strokePx` from `./caption-style`; `type TextRun` from `./premiere-title`. Note the first word's clip starts at the line's start (`Math.max(start, f.start)`) only if the word starts there; a line's first word starts at `c.at`, so they coincide for auto captions.

- [ ] **Step 4: Point the SRT and manifest at `lines`** in `package.ts`:

```ts
    captions: plan.lines.map((l) => ({ text: l.text, start: l.start, end: l.end })),
```

```ts
  if (plan.lines.length > 0) {
    dir["captions.srt"] = strToU8(toSrt(plan.lines.map((l) => ({ start: l.start / plan.fps, end: l.end / plan.fps, text: l.text }))));
    dir.fonts = Object.fromEntries(bytes.fonts.map((f) => [f.name, f.bytes]));
  }
```

and `packageReadme`'s `titled` → `plan.lines.length > 0`. In `export-run.ts`, if `summary.captions` counts `plan.titles`, switch it to `plan.lines.length` (grep `titles.length`). Update any test fixture plans to include `lines: []`.

- [ ] **Step 5: Run the editor tests**

Run: `npx vitest run src/lib/editor`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/editor
git commit -m "feat(editor): Premiere gets the reel caption style, one title per word (D398)"
```

---

### Task 4: Undo and redo

**Files:**
- Modify: `src/lib/editor/editor-store.ts`, `src/hooks/use-editor-shortcuts.ts`, `src/components/editor/editor-header.tsx`, `src/components/editor/editor-caption-block.tsx`, `src/components/editor/editor-timeline-piece.tsx` (trim drags)
- Create: `src/components/editor/editor-history-buttons.tsx`
- Test: `src/lib/editor/__tests__/editor-store.test.ts`

**Interfaces:**
- Produces on `EditorStoreState`: `past: EditDoc[]`, `future: EditDoc[]`, `undo(): void`, `redo(): void`, `begin(): void`, `commit(): void`. `apply` records one step unless inside `begin()…commit()`.

- [ ] **Step 1: Write the failing test** (append to `editor-store.test.ts`)

```ts
import { emptyDoc } from "./fixtures";

describe("history (D400)", () => {
  const make = () => createEditorStore({ doc: emptyDoc(), sources: [] });
  const shape = (s: ReturnType<typeof make>, v: "9:16" | "16:9") => s.getState().apply((d) => (d.shape === v ? d : { ...d, shape: v }));

  it("undoes and redoes one apply at a time", () => {
    const s = make();
    shape(s, "16:9");
    s.getState().undo();
    expect(s.getState().doc.shape).toBe("9:16");
    s.getState().redo();
    expect(s.getState().doc.shape).toBe("16:9");
  });

  it("records nothing for a no-op and clears redo on a new edit", () => {
    const s = make();
    shape(s, "9:16");
    expect(s.getState().past).toHaveLength(0);
    shape(s, "16:9");
    s.getState().undo();
    shape(s, "16:9");
    expect(s.getState().future).toHaveLength(0);
  });

  it("records a whole drag as one step", () => {
    const s = make();
    s.getState().begin();
    shape(s, "16:9");
    shape(s, "9:16");
    shape(s, "16:9");
    s.getState().commit();
    expect(s.getState().past).toHaveLength(1);
    s.getState().undo();
    expect(s.getState().doc.shape).toBe("9:16");
  });

  it("keeps at most 100 steps and does nothing while read-only", () => {
    const s = make();
    for (let i = 0; i < 120; i++) shape(s, i % 2 ? "9:16" : "16:9");
    expect(s.getState().past).toHaveLength(100);
    s.getState().setEditable(false);
    s.getState().undo();
    expect(s.getState().past).toHaveLength(100);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/editor/__tests__/editor-store.test.ts`
Expected: FAIL, `undo is not a function`.

- [ ] **Step 3: Implement in `editor-store.ts`**

```ts
const HISTORY_LIMIT = 100;

export type EditorStoreState = {
  doc: EditDoc;
  sources: SourceView[];
  editable: boolean;
  selection: Selection;
  /** Earlier docs, oldest first (D400). */
  past: EditDoc[];
  future: EditDoc[];
  apply(fn: (doc: EditDoc) => EditDoc): void;
  undo(): void;
  redo(): void;
  /** A drag starts: its applies become one step at commit(). */
  begin(): void;
  commit(): void;
  select(selection: Selection): void;
  setEditable(editable: boolean): void;
};

export function createEditorStore(init: { doc: EditDoc; sources: SourceView[] }): StoreApi<EditorStoreState> {
  let dragFrom: EditDoc | null = null;
  const push = (past: EditDoc[], doc: EditDoc) => [...past, doc].slice(-HISTORY_LIMIT);
  return createStore<EditorStoreState>((set, get) => ({
    doc: init.doc,
    sources: init.sources,
    editable: true,
    selection: null,
    past: [],
    future: [],
    apply: (fn) => {
      const { doc, editable, selection, past } = get();
      if (!editable) return;
      const next = fn(doc);
      if (next === doc) return;
      if (dragFrom) set({ doc: next, selection: stillThere(next, selection) });
      else set({ doc: next, selection: stillThere(next, selection), past: push(past, doc), future: [] });
    },
    undo: () => {
      const { past, future, doc, editable, selection } = get();
      if (!editable || past.length === 0) return;
      const prev = past[past.length - 1];
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selection: stillThere(prev, selection) });
    },
    redo: () => {
      const { past, future, doc, editable, selection } = get();
      if (!editable || future.length === 0) return;
      const next = future[0];
      set({ doc: next, past: push(past, doc), future: future.slice(1), selection: stillThere(next, selection) });
    },
    begin: () => {
      if (!dragFrom) dragFrom = get().doc;
    },
    commit: () => {
      const from = dragFrom;
      dragFrom = null;
      if (from && from !== get().doc) set({ past: push(get().past, from), future: [] });
    },
    select: (selection) => {
      if (get().selection === selection) return;
      set({ selection });
    },
    setEditable: (editable) => {
      if (get().editable !== editable) set({ editable });
    },
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/editor/__tests__/editor-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire drags, shortcuts and buttons**

- `editor-caption-block.tsx` `begin()` → also call `onDragStart?.()`; `finish()` → `onDragEnd?.()`. Add those optional props; in `editor-caption-lane.tsx` pass `onDragStart={store.getState().begin}` and `onDragEnd={store.getState().commit}` (get `store` with `useEditorStoreApi()`).
- `editor-timeline-piece.tsx`: on the trim edges' pointer-down call `begin()`, pointer-up `commit()` (read the file; add the two calls next to the existing pointer handlers via new optional props wired in `editor-timeline.tsx` the same way).
- `use-editor-shortcuts.ts`: before the `ctrlKey` early return, handle history:

```ts
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && !isEditableTarget(e.target as HTMLElement | null)) {
        const k = e.key.toLowerCase();
        if (k === "z") { e.preventDefault(); if (e.shiftKey) store.getState().redo(); else store.getState().undo(); return; }
        if (k === "y") { e.preventDefault(); store.getState().redo(); return; }
      }
```

(`const store = useEditorStoreApi();` at the top; add `store` to the effect deps.)
- Create `editor-history-buttons.tsx`:

```tsx
"use client";

import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "./editor-store-provider";

/** Undo / redo in the header (D400). Ctrl+Z and Ctrl+Shift+Z do the same. */
export function EditorHistoryButtons() {
  const canUndo = useEditorStore((s) => s.editable && s.past.length > 0);
  const canRedo = useEditorStore((s) => s.editable && s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        <Undo2 className="size-4" strokeWidth={1.5} />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
        <Redo2 className="size-4" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
```

and render `<EditorHistoryButtons />` in `editor-header.tsx` right after the title block's `<div className="flex min-w-0 flex-col">…</div>`, only when `!readOnly`.

- [ ] **Step 6: Run tests and tsc**

Run: `npx vitest run src/lib/editor src/hooks` and `npx tsc --noEmit -p .`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/editor src/hooks src/components/editor
git commit -m "feat(editor): undo and redo, a drag is one step (D400)"
```

---

### Task 5: Transcription library, table and engine

**Files:**
- Create: `supabase/migrations/0060_media_transcripts.sql`, `src/lib/db/media-transcripts.ts`, `src/lib/transcribe/providers.ts`, `src/lib/transcribe/cost.ts`, `src/lib/transcribe/elevenlabs.ts`
- Modify: `src/lib/db/types.ts:133` (add `"transcribe"`), `src/lib/jobs/types.ts:8` (add `"editor-transcribe"`), `docs/auth-production-migration.md` (new migration listed)
- Test: `src/lib/transcribe/__tests__/elevenlabs.test.ts`, `src/lib/transcribe/__tests__/cost.test.ts`

**Interfaces:**
- Produces: `TRANSCRIBE_ENGINE = { provider: "elevenlabs", model: "scribe_v2", modelUsed: "elevenlabs:scribe_v2" }`; `STT_USD_PER_HOUR`; `transcribeCredits(seconds): number`; `parseScribeResponse(json): { language: string; words: TranscriptWord[] }`; `transcribeUrl(url, deps: { fetch: typeof fetch; apiKey: string }): Promise<{ language: string; words: TranscriptWord[] }>` throwing `TranscribeError` (`.reason: TranscribeFailureReason`, `.answered: boolean`); `listTranscripts(urls): Promise<Map<string, Transcript>>`; `saveTranscript(t: Transcript): Promise<void>`.

- [ ] **Step 1: Write the migration** `supabase/migrations/0060_media_transcripts.sql`

```sql
-- Auto captions (D395). Spec: docs/superpowers/specs/2026-10-22-auto-captions-design.md
--
-- media_transcripts: every word of one stored file with its time, once per file. Keyed by URL
-- like media_facts (0059): a take or dub file never changes, so its transcript never goes stale.
-- words: [{ t, s, e, p }] — text, start and end in seconds of the file, confidence 0–1.

create table media_transcripts (
  url              text primary key,
  language         text not null,
  words            jsonb not null,
  engine           text not null,
  model            text not null,
  duration_seconds double precision not null,
  created_at       timestamptz not null default now()
);

-- The app reads and writes through the service-role client.
alter table media_transcripts enable row level security;
```

Add a line for `0060_media_transcripts.sql` to `docs/auth-production-migration.md` in the same style as the 0059 entry (open the file and follow its list format).

- [ ] **Step 2: Write the failing tests**

`src/lib/transcribe/__tests__/elevenlabs.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { parseScribeResponse, transcribeUrl, TranscribeError } from "../elevenlabs";

// Trimmed from the real Reel 2 clip 5 response.
const SAMPLE = {
  language_code: "eng", language_probability: 0.99, text: "It just became",
  words: [
    { text: "It", start: 0.12, end: 0.2, type: "word", logprob: -0.01 },
    { text: " ", start: 0.2, end: 0.24, type: "spacing", logprob: 0 },
    { text: "just", start: 0.24, end: 0.4, type: "word", logprob: -0.5 },
    { text: "(laughs)", start: 0.4, end: 0.6, type: "audio_event", logprob: 0 },
    { text: "became", start: 0.6, end: null, type: "word", logprob: 0 },
  ],
};

describe("parseScribeResponse", () => {
  it("keeps timed words only, with confidence from logprob", () => {
    const r = parseScribeResponse(SAMPLE);
    expect(r.language).toBe("eng");
    expect(r.words).toEqual([
      { t: "It", s: 0.12, e: 0.2, p: Math.round(Math.exp(-0.01) * 1000) / 1000 },
      { t: "just", s: 0.24, e: 0.4, p: Math.round(Math.exp(-0.5) * 1000) / 1000 },
    ]);
  });
});

describe("transcribeUrl", () => {
  it("sends the file by URL with word timing and no language", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(SAMPLE), { status: 200 }));
    await transcribeUrl("https://storage.googleapis.com/b/a.mp4", { fetch, apiKey: "k" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("k");
    const form = init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("source_url")).toBe("https://storage.googleapis.com/b/a.mp4");
    expect(form.get("timestamps_granularity")).toBe("word");
    expect(form.get("language_code")).toBeNull();
  });

  it("says no-speech for an empty transcript, and marks a vendor error as answered", async () => {
    const empty = vi.fn(async () => new Response(JSON.stringify({ language_code: "eng", words: [] }), { status: 200 }));
    await expect(transcribeUrl("u", { fetch: empty, apiKey: "k" })).rejects.toMatchObject({ reason: "no-speech", answered: true });
    const bad = vi.fn(async () => new Response("nope", { status: 422 }));
    await expect(transcribeUrl("u", { fetch: bad, apiKey: "k" })).rejects.toBeInstanceOf(TranscribeError);
    await expect(transcribeUrl("u", { fetch: bad, apiKey: "k" })).rejects.toMatchObject({ reason: "failed", answered: true });
  });

  it("marks a network error as not answered, so it may be retried", async () => {
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(transcribeUrl("u", { fetch: down, apiKey: "k" })).rejects.toMatchObject({ reason: "failed", answered: false });
  });
});
```

`src/lib/transcribe/__tests__/cost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { STT_USD_PER_HOUR, transcribeCredits } from "../cost";
import { usdToFinalCredits } from "@/lib/credits/units";

describe("transcribeCredits", () => {
  it("is one conversion for the button and the reservation", () => {
    expect(transcribeCredits(37)).toBe(usdToFinalCredits((37 / 3600) * STT_USD_PER_HOUR));
    expect(transcribeCredits(0)).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/lib/transcribe`
Expected: FAIL, modules missing.

- [ ] **Step 4: Implement**

`src/lib/transcribe/providers.ts`:

```ts
// The one transcription engine for now (D395). Never shown in the UI.
export const TRANSCRIBE_ENGINE = { provider: "elevenlabs", model: "scribe_v2", modelUsed: "elevenlabs:scribe_v2" } as const;
```

`src/lib/transcribe/cost.ts`:

```ts
import { usdToFinalCredits } from "@/lib/credits/units";

/** ElevenLabs Speech-to-Text, per hour of audio on our plan. Check the plan's rate before launch. */
export const STT_USD_PER_HOUR = 0.4;

/** The figure on the Auto captions button IS the reservation (D377, D399). */
export function transcribeCredits(seconds: number): number {
  return seconds > 0 ? usdToFinalCredits((seconds / 3600) * STT_USD_PER_HOUR) : 0;
}
```

`src/lib/transcribe/elevenlabs.ts`:

```ts
// ElevenLabs Speech-to-Text (D395): the file by URL, word timestamps, language detected.
import { ELEVENLABS_API_BASE } from "@/lib/elevenlabs/constants";
import { TRANSCRIBE_ENGINE } from "./providers";
import type { TranscribeFailureReason, TranscriptWord } from "./types";

/** answered: the engine replied (and may have billed) — never retry it (rule 12). */
export class TranscribeError extends Error {
  constructor(public readonly reason: TranscribeFailureReason, public readonly answered: boolean, detail: string) {
    super(detail);
    this.name = "TranscribeError";
  }
}

type ScribeWord = { text: string; start: number | null; end: number | null; type: string; logprob?: number };

export function parseScribeResponse(json: unknown): { language: string; words: TranscriptWord[] } {
  const body = json as { language_code?: string; words?: ScribeWord[] };
  const words = (body.words ?? [])
    .filter((w) => w.type === "word" && typeof w.start === "number" && typeof w.end === "number" && w.text.trim())
    .map((w) => ({ t: w.text.trim(), s: w.start!, e: w.end!, p: Math.round(Math.exp(w.logprob ?? 0) * 1000) / 1000 }));
  return { language: body.language_code ?? "und", words };
}

export async function transcribeUrl(url: string, deps: { fetch: typeof fetch; apiKey: string }): Promise<{ language: string; words: TranscriptWord[] }> {
  const form = new FormData();
  form.set("model_id", TRANSCRIBE_ENGINE.model);
  form.set("source_url", url);
  form.set("timestamps_granularity", "word");
  form.set("tag_audio_events", "false");
  let res: Response;
  try {
    res = await deps.fetch(`${ELEVENLABS_API_BASE}/v1/speech-to-text`, { method: "POST", headers: { "xi-api-key": deps.apiKey }, body: form });
  } catch (e) {
    throw new TranscribeError("failed", false, `network: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await res.text();
  if (!res.ok) throw new TranscribeError("failed", true, `${res.status}: ${text.slice(0, 300)}`);
  const parsed = parseScribeResponse(JSON.parse(text));
  if (parsed.words.length === 0) throw new TranscribeError("no-speech", true, "no words");
  return parsed;
}
```

`src/lib/db/media-transcripts.ts`:

```ts
// Stored transcripts, once per file (D395, migration 0060).
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Transcript, TranscriptWord } from "@/lib/transcribe/types";

type Row = { url: string; language: string; words: TranscriptWord[]; engine: string; model: string; duration_seconds: number };

export async function listTranscripts(urls: string[]): Promise<Map<string, Transcript>> {
  const out = new Map<string, Transcript>();
  if (urls.length === 0) return out;
  const { data, error } = await createServerSupabase()
    .from("media_transcripts")
    .select("url, language, words, engine, model, duration_seconds")
    .in("url", urls);
  if (error) throw error;
  for (const r of (data ?? []) as Row[]) {
    out.set(r.url, { url: r.url, language: r.language, words: r.words, engine: r.engine, model: r.model, durationSeconds: r.duration_seconds });
  }
  return out;
}

/** Which of these files already have a transcript (no word payload). */
export async function listTranscribedUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const { data, error } = await createServerSupabase().from("media_transcripts").select("url").in("url", urls);
  if (error) throw error;
  return new Set(((data ?? []) as { url: string }[]).map((r) => r.url));
}

export async function saveTranscript(t: Transcript): Promise<void> {
  const { error } = await createServerSupabase().from("media_transcripts").upsert(
    { url: t.url, language: t.language, words: t.words, engine: t.engine, model: t.model, duration_seconds: t.durationSeconds },
    { onConflict: "url" },
  );
  if (error) throw error;
}
```

Edit `src/lib/db/types.ts:133` → `type: "image" | "video" | "prompt" | "voice" | "dub" | "lipsync" | "transcribe";` and `src/lib/jobs/types.ts:8` → `export type JobKind = "asset-import" | "image-analysis" | "editor-export" | "editor-transcribe";`. Grep for exhaustive switches over `GenerationRow["type"]` (`rg '"lipsync"' src`) and add a `transcribe` branch where one exists (e.g. generation tray labels: "Captions").

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/lib/transcribe` and `npx tsc --noEmit -p .`
Expected: PASS, clean.

- [ ] **Step 6: Apply the migration to the dev database**

Run the repo's migration flow for the active env (check `package.json` scripts, e.g. `npm run db:push`, or apply the SQL in the Supabase SQL editor for staging). Verify: `select count(*) from media_transcripts;` returns 0.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0060_media_transcripts.sql src/lib/db src/lib/transcribe src/lib/jobs/types.ts docs/auth-production-migration.md
git commit -m "feat(transcribe): word-timed transcripts stored once per file (D395)"
```

---

### Task 6: What a run needs, and the routes

**Files:**
- Create: `src/lib/editor/transcribe-plan.ts`, `src/app/api/canvases/[cid]/editor/transcribe/route.ts`, `src/app/api/canvases/[cid]/editor/transcribe/[jobId]/route.ts`, `src/app/api/canvases/[cid]/editor/transcripts/route.ts`
- Modify: `src/lib/editor/playback.ts` (export `pieceSoundFile`)
- Test: `src/lib/editor/__tests__/transcribe-plan.test.ts`, `src/app/api/canvases/[cid]/editor/transcribe/route.test.ts`

**Interfaces:**
- Consumes: `loadEditorState` (`load-state.ts`), `listTranscribedUrls`, `listTranscripts`, `transcribeCredits`, `TRANSCRIBE_ENGINE`, `insertGeneration`, `reserveCredits`, `refundReservation`, `failGeneration`, `insertJob`, `setJobRunId`, `failJob`, `getJob`, `failStaleJobs`.
- Produces: `pieceSoundFile(piece, source): MediaFile`; `planTranscription(doc, sources, pieceIds?): { files: TranscribeFile[]; noSound: string[] }` with `TranscribeFile = { url: string; seconds: number }`; `TranscribeJobInput = { canvasId; nodeId; generationId; orgId; files: TranscribeFile[] }`; `TranscribeJobResult = { failed: Array<{ url: string; reason: TranscribeFailureReason }> }`; `TranscribeStatus = { status: JobStatus; result: TranscribeJobResult | null; error: string | null }`. Routes: `POST /editor/transcribe` → `{ jobId: string | null, noSound: string[] }` (202 or 200); `GET /editor/transcribe/[jobId]` → `TranscribeStatus`; `GET /editor/transcripts` → `{ transcripts: Transcript[] }`.

- [ ] **Step 1: Write the failing plan test** `src/lib/editor/__tests__/transcribe-plan.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { planTranscription } from "../transcribe-plan";
import { audioFacts, emptyDoc, file, source } from "./fixtures";
import type { Piece } from "../types";

const piece = (id: string, src: string, sound: Piece["sound"] = "original"): Piece => ({ id, sourceNodeId: src, in: 0, out: 5, picture: "original", sound });

describe("planTranscription", () => {
  const a = source("a");
  const d = source("d", { kind: "dubbing" });
  const mute = source("m", { facts: { durationSeconds: 5, video: { fps: 24, frames: 120, width: 720, height: 1280 }, audio: null } });

  it("takes each piece's playing sound once: the dub when Dubbed, else the take", () => {
    const doc = emptyDoc({ pieces: [piece("1", "a"), piece("2", "a"), piece("3", "d", "dubbed")] });
    const r = planTranscription(doc, [a, d]);
    expect(r.files.map((f) => f.url)).toEqual([a.files.original.url, d.files.dubAudio!.url]);
    expect(r.files[0].seconds).toBeCloseTo(121 / 24, 9);
  });

  it("only the requested pieces, and refuses a file with no sound", () => {
    const doc = emptyDoc({ pieces: [piece("1", "a"), piece("2", "m")] });
    const r = planTranscription(doc, [a, mute], ["2"]);
    expect(r.files).toEqual([]);
    expect(r.noSound).toEqual(["2"]);
  });

  it("skips a piece whose source is missing", () => {
    expect(planTranscription(emptyDoc({ pieces: [piece("1", "gone")] }), [a]).files).toEqual([]);
  });
});
```

(Import `audioFacts`/`file` only if used; remove unused imports to keep lint clean.)

- [ ] **Step 2: Run to verify it fails**, then implement.

`playback.ts` — add and use inside `resolvePieceMedia`:

```ts
/** The file whose sound plays for a piece: the dub when its sound is Dubbed, else the take. */
export function pieceSoundFile(piece: Piece, source: SourceView): MediaFile {
  return piece.sound === "dubbed" && source.files.dubAudio ? source.files.dubAudio : source.files.original;
}
```

`src/lib/editor/transcribe-plan.ts`:

```ts
// Which stored files a run of Auto captions needs (D395): each piece's playing sound, once,
// resolved from the SAVED sources on the server (rule 14), never from the request.
import type { TranscribeFailureReason } from "@/lib/transcribe/types";
import type { JobStatus } from "@/lib/jobs/types";
import { pieceSoundFile } from "./playback";
import type { EditDoc, SourceView } from "./types";

export type TranscribeFile = { url: string; seconds: number };
export type TranscribeJobInput = { canvasId: string; nodeId: string; generationId: string; orgId: string; files: TranscribeFile[] };
export type TranscribeJobResult = { failed: Array<{ url: string; reason: TranscribeFailureReason }> };
export type TranscribeStatus = { status: JobStatus; result: TranscribeJobResult | null; error: string | null };

export function planTranscription(doc: EditDoc, sources: SourceView[], pieceIds?: string[]): { files: TranscribeFile[]; noSound: string[] } {
  const byId = new Map(sources.map((s) => [s.nodeId, s]));
  const wanted = pieceIds ? new Set(pieceIds) : null;
  const files = new Map<string, TranscribeFile>();
  const noSound: string[] = [];
  for (const p of doc.pieces) {
    if (wanted && !wanted.has(p.id)) continue;
    const source = byId.get(p.sourceNodeId);
    if (!source) continue;
    const f = pieceSoundFile(p, source);
    if (!f.facts?.audio) {
      noSound.push(p.id);
      continue;
    }
    if (!files.has(f.url)) files.set(f.url, { url: f.url, seconds: f.facts.durationSeconds });
  }
  return { files: [...files.values()], noSound };
}
```

Run: `npx vitest run src/lib/editor/__tests__/transcribe-plan.test.ts` → PASS.

- [ ] **Step 3: Write the failing route test** `src/app/api/canvases/[cid]/editor/transcribe/route.test.ts`

Copy the mock header from `exports/route.test.ts` (lines 1–15: `server-only`, `@/lib/dal` — add `email: "a@b.c"` to the caller — impersonation, clients, supabase `canvases` lookup), then:

```ts
vi.mock("@/lib/editor/load-state", () => ({ loadEditorState: vi.fn() }));
vi.mock("@/lib/editor/transcribe-plan", () => ({ planTranscription: vi.fn() }));
vi.mock("@/lib/db/media-transcripts", () => ({ listTranscribedUrls: vi.fn(), listTranscripts: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: vi.fn(), failGeneration: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => ({
  reserveCredits: vi.fn(), refundReservation: vi.fn(),
  CreditLimitError: class CreditLimitError extends Error {},
}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/jobs/db", () => ({ insertJob: vi.fn(), failStaleJobs: vi.fn(), setJobRunId: vi.fn(), failJob: vi.fn(), getJob: vi.fn() }));

import { tasks } from "@trigger.dev/sdk";
import { insertJob } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";
import { loadEditorState } from "@/lib/editor/load-state";
import { planTranscription } from "@/lib/editor/transcribe-plan";
import { listTranscribedUrls } from "@/lib/db/media-transcripts";
import { insertGeneration } from "@/lib/db/generations";
import { refundReservation, reserveCredits } from "@/lib/db/credit-transactions";
import { POST } from "./route";

const NODE = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ cid: "cv1" }) });

beforeEach(() => {
  process.env.ELEVEN_LABS_API_KEY = "k";
  vi.mocked(loadEditorState).mockResolvedValue({ editorNodeId: NODE, doc: {}, sources: [] } as never);
  vi.mocked(planTranscription).mockReturnValue({ files: [{ url: "https://s/a.mp4", seconds: 8 }, { url: "https://s/b.mp4", seconds: 9 }], noSound: [] });
  vi.mocked(listTranscribedUrls).mockResolvedValue(new Set());
  vi.mocked(insertGeneration).mockResolvedValue({ id: "gen1" } as never);
  vi.mocked(reserveCredits).mockResolvedValue({ ok: true });
  vi.mocked(insertJob).mockResolvedValue({ id: "job1" } as never);
  vi.mocked(tasks.trigger).mockReset().mockResolvedValue({ id: "run1" } as never);
});

describe("POST /api/canvases/[cid]/editor/transcribe", () => {
  it("needs no job when every file is already transcribed", async () => {
    vi.mocked(listTranscribedUrls).mockResolvedValue(new Set(["https://s/a.mp4", "https://s/b.mp4"]));
    const res = await post({ nodeId: NODE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jobId: null, noSound: [] });
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("reserves for the new files only and starts the task with the job id", async () => {
    vi.mocked(listTranscribedUrls).mockResolvedValue(new Set(["https://s/a.mp4"]));
    const res = await post({ nodeId: NODE, pieceIds: ["p1"] });
    expect(res.status).toBe(202);
    expect(planTranscription).toHaveBeenCalledWith({}, [], ["p1"]);
    expect(vi.mocked(insertGeneration).mock.calls[0][0]).toMatchObject({ nodeId: NODE, type: "transcribe", paramsSnapshot: { seconds: 9 } });
    expect(vi.mocked(insertJob).mock.calls[0][0]).toMatchObject({
      kind: "editor-transcribe", lockKey: `editor-transcribe:${NODE}`,
      input: { canvasId: "cv1", nodeId: NODE, generationId: "gen1", orgId: "org-1", files: [{ url: "https://s/b.mp4", seconds: 9 }] },
    });
    expect(tasks.trigger).toHaveBeenCalledWith("editor-transcribe", { jobId: "job1" });
  });

  it("402s at the credit limit and refunds", async () => {
    vi.mocked(reserveCredits).mockResolvedValue({ ok: false });
    expect((await post({ nodeId: NODE })).status).toBe(402);
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen1" });
  });

  it("409s while a run is going", async () => {
    vi.mocked(insertJob).mockRejectedValue(new JobLockedError(`editor-transcribe:${NODE}`));
    expect((await post({ nodeId: NODE })).status).toBe(409);
  });

  it("404s for another node, 400s for pieceIds that aren't strings", async () => {
    expect((await post({ nodeId: "22222222-2222-4222-8222-222222222222" })).status).toBe(404);
    expect((await post({ nodeId: NODE, pieceIds: [1] })).status).toBe(400);
  });
});
```

- [ ] **Step 4: Implement the three routes**

`transcribe/route.ts`:

```ts
import { tasks } from "@trigger.dev/sdk";
import * as z from "zod";
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { CreditLimitError, refundReservation, reserveCredits } from "@/lib/db/credit-transactions";
import { failGeneration, insertGeneration } from "@/lib/db/generations";
import { listTranscribedUrls } from "@/lib/db/media-transcripts";
import { loadEditorState } from "@/lib/editor/load-state";
import { planTranscription, type TranscribeJobInput } from "@/lib/editor/transcribe-plan";
import { failJob, failStaleJobs, insertJob, setJobRunId } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";
import { transcribeCredits } from "@/lib/transcribe/cost";
import { TRANSCRIBE_ENGINE } from "@/lib/transcribe/providers";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";

// Starts Auto captions (D395, D399). Files come from the SAVED edit's sources, read fresh here
// (rules 10, 14). Files already transcribed cost nothing and need no job. One run per Editor.
const STALE_MS = 15 * 60 * 1000;
const START_FAILED = "Couldn't start captions. Try again.";
const BodySchema = z.object({ nodeId: z.uuid(), pieceIds: z.array(z.string().min(1)).max(500).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId, canvas) =>
    withTryCatch(START_FAILED, async () => {
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Say which clips to caption.", 400);
      const { nodeId, pieceIds } = parsed.data;
      if (!process.env.ELEVEN_LABS_API_KEY) return apiError("Captions aren't set up yet.", 400);

      const [state, orgId, caller] = await Promise.all([loadEditorState(canvasId), resolveOrgId(), resolveCallerContext()]);
      if (!state || state.editorNodeId !== nodeId) return apiError("Editor not found.", 404);

      const { files, noSound } = planTranscription(state.doc, state.sources, pieceIds);
      const done = await listTranscribedUrls(files.map((f) => f.url));
      const fresh = files.filter((f) => !done.has(f.url));
      if (fresh.length === 0) return apiOk({ jobId: null, noSound });

      const seconds = fresh.reduce((s, f) => s + f.seconds, 0);
      const clientId = canvas.client_id;
      await failStaleJobs(clientId, "editor-transcribe", STALE_MS);
      const generation = await insertGeneration({
        nodeId, orgId, clientId, userId: caller.userId, userEmail: caller.email ?? null,
        type: "transcribe", modelUsed: TRANSCRIBE_ENGINE.modelUsed, paramsSnapshot: { seconds }, inputsSnapshot: { files: fresh },
      });
      const giveBack = async (message: string) => {
        await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
        await refundReservation({ orgId, generationId: generation.id }).catch(() => null);
      };

      let jobId: string;
      try {
        const reservation = await reserveCredits(orgId, generation.id, transcribeCredits(seconds));
        if (!reservation.ok) throw new CreditLimitError(CREDIT_LIMIT_TOAST_MESSAGE);
        const input: TranscribeJobInput = { canvasId, nodeId, generationId: generation.id, orgId, files: fresh };
        jobId = (await insertJob({ orgId, clientId, kind: "editor-transcribe", input, lockKey: `editor-transcribe:${nodeId}`, phaseMessage: "Listening…" })).id;
      } catch (err) {
        if (err instanceof CreditLimitError) {
          await giveBack(err.message);
          return apiError(CREDIT_LIMIT_TOAST_MESSAGE, 402);
        }
        if (err instanceof JobLockedError) {
          await giveBack("Already running.");
          return apiError("Captions are already being written for this reel.", 409);
        }
        throw err;
      }

      try {
        const run = await tasks.trigger("editor-transcribe", { jobId });
        await setJobRunId(jobId, run.id);
      } catch {
        await failJob(jobId, START_FAILED);
        await giveBack(START_FAILED);
        return apiError(START_FAILED, 502);
      }
      return apiOk({ jobId, noSound }, 202);
    }),
  );
}
```

(Check `CallerContext` has `email`; if not, pass `userEmail: null`. If `withTryCatch`'s uncaught error leaves a generation reserved, the stuck-reservation sweep settles it — same as dub.)

`transcribe/[jobId]/route.ts`:

```ts
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import type { TranscribeJobInput, TranscribeJobResult, TranscribeStatus } from "@/lib/editor/transcribe-plan";
import { getJob } from "@/lib/jobs/db";

// The editor polls this while Auto captions runs. A job is only visible through its canvas.
export async function GET(req: Request, { params }: { params: Promise<{ cid: string; jobId: string }> }) {
  const { cid, jobId } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't read the captions run.", async () => {
      const job = await getJob<TranscribeJobInput, TranscribeJobResult>(jobId);
      if (!job || job.kind !== "editor-transcribe" || job.input?.canvasId !== canvasId) return apiError("Not found.", 404);
      const status: TranscribeStatus = { status: job.status, result: job.result, error: job.error };
      return apiOk(status);
    }),
  );
}
```

`transcripts/route.ts`:

```ts
import { apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { listTranscripts } from "@/lib/db/media-transcripts";
import { loadEditorState } from "@/lib/editor/load-state";
import { planTranscription } from "@/lib/editor/transcribe-plan";

// Stored transcripts for the files this reel's pieces play (D395). URLs derived on the server.
export async function GET(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't read the captions.", async () => {
      const state = await loadEditorState(canvasId);
      if (!state) return apiOk({ transcripts: [] });
      const { files } = planTranscription(state.doc, state.sources);
      const found = await listTranscripts(files.map((f) => f.url));
      return apiOk({ transcripts: [...found.values()] });
    }),
  );
}
```

Note on cost of `GET /transcripts`: `loadEditorState` is the editor's one heavy read; this route runs it once per call. The client calls it on open and while a run is live (§4 call budget). If that proves heavy, add a `?urls` check against `state` later — not now.

- [ ] **Step 5: Run the route tests**

Run: `npx vitest run "src/app/api/canvases/[cid]/editor"`
Expected: PASS (including the existing exports tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/editor "src/app/api/canvases/[cid]/editor"
git commit -m "feat(editor): start Auto captions, read its run and stored transcripts (D395, D399)"
```

---

### Task 7: The transcription task

**Files:**
- Create: `src/lib/transcribe/run.ts`, `trigger/editor-transcribe.ts`
- Test: `src/lib/transcribe/__tests__/run.test.ts`

**Interfaces:**
- Consumes: `TranscribeJobInput`, `TranscribeJobResult` (Task 6), `transcribeUrl`, `TranscribeError` (Task 5), `transcribeCredits`, `normalizeWords` is NOT applied here (raw words stored; the client normalises with the piece's fps).
- Produces: `runTranscription(input, deps): Promise<{ result: TranscribeJobResult; secondsDone: number }>` with `deps = { transcribe(url): Promise<{ language; words }>; save(t: Transcript): Promise<void>; log?(msg, data?): void }`.

- [ ] **Step 1: Write the failing test** `src/lib/transcribe/__tests__/run.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { runTranscription } from "../run";
import { TranscribeError } from "../elevenlabs";

const input = { canvasId: "cv", nodeId: "n", generationId: "g", orgId: "o", files: [{ url: "a", seconds: 8 }, { url: "b", seconds: 4 }, { url: "c", seconds: 9 }] };

describe("runTranscription", () => {
  it("saves each file as it lands and reports the ones that failed", async () => {
    const save = vi.fn(async () => {});
    const transcribe = vi.fn(async (url: string) => {
      if (url === "b") throw new TranscribeError("no-speech", true, "empty");
      return { language: "eng", words: [{ t: "hi", s: 0, e: 0.2, p: 1 }] };
    });
    const r = await runTranscription(input, { transcribe, save });
    expect(save).toHaveBeenCalledTimes(2);
    expect(vi.mocked(save).mock.calls[0][0]).toMatchObject({ url: "a", language: "eng", engine: "elevenlabs", model: "scribe_v2", durationSeconds: 8 });
    expect(r.result.failed).toEqual([{ url: "b", reason: "no-speech" }]);
    expect(r.secondsDone).toBe(17);
  });

  it("retries a network error once, never an answered one", async () => {
    let calls = 0;
    const transcribe = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new TranscribeError("failed", false, "down");
      return { language: "eng", words: [{ t: "hi", s: 0, e: 0.2, p: 1 }] };
    });
    const r = await runTranscription({ ...input, files: [input.files[0]] }, { transcribe, save: async () => {} });
    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(r.result.failed).toEqual([]);

    const answered = vi.fn(async () => { throw new TranscribeError("failed", true, "422"); });
    const r2 = await runTranscription({ ...input, files: [input.files[0]] }, { transcribe: answered, save: async () => {} });
    expect(answered).toHaveBeenCalledTimes(1);
    expect(r2.result.failed).toEqual([{ url: "a", reason: "failed" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then implement `src/lib/transcribe/run.ts`:

```ts
// The editor-transcribe task's body (D395), with its I/O injected so tests drive it. Files run
// three at a time; each transcript is saved as soon as it lands, so the editor fills that clip
// while the others are still being listened to. A call the engine answered is never repeated
// (rule 12); only a network error before any answer is tried once more.
import type { TranscribeFile, TranscribeJobInput, TranscribeJobResult } from "@/lib/editor/transcribe-plan";
import { TranscribeError } from "./elevenlabs";
import { TRANSCRIBE_ENGINE } from "./providers";
import type { Transcript, TranscriptWord } from "./types";

const CONCURRENCY = 3;

type Deps = {
  transcribe(url: string): Promise<{ language: string; words: TranscriptWord[] }>;
  save(t: Transcript): Promise<void>;
  log?(message: string, data?: Record<string, unknown>): void;
};

export async function runTranscription(input: TranscribeJobInput, deps: Deps): Promise<{ result: TranscribeJobResult; secondsDone: number }> {
  const failed: TranscribeJobResult["failed"] = [];
  let secondsDone = 0;
  const queue = [...input.files];

  const once = async (f: TranscribeFile) => {
    try {
      return await deps.transcribe(f.url);
    } catch (e) {
      if (e instanceof TranscribeError && !e.answered) return deps.transcribe(f.url);
      throw e;
    }
  };

  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        const r = await once(f);
        await deps.save({ url: f.url, language: r.language, words: r.words, engine: TRANSCRIBE_ENGINE.provider, model: TRANSCRIBE_ENGINE.model, durationSeconds: f.seconds });
        secondsDone += f.seconds;
      } catch (e) {
        const reason = e instanceof TranscribeError ? e.reason : "failed";
        deps.log?.("transcribe failed", { url: f.url, reason, detail: e instanceof Error ? e.message : String(e) });
        failed.push({ url: f.url, reason });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, input.files.length) }, worker));
  return { result: { failed }, secondsDone };
}
```

Run: `npx vitest run src/lib/transcribe` → PASS.

- [ ] **Step 3: Write `trigger/editor-transcribe.ts`** (load the `trigger-authoring-chat-agent` skill only if touching chat agents — not needed here; follow `trigger/editor-export.ts`):

```ts
// trigger/editor-transcribe.ts
// Auto captions (D395): transcribes each new sound file once, saving each as it lands, then
// settles credits for the seconds that succeeded. Writes straight to Supabase (no webhook), like
// editor-export. Every @/lib import is dynamic (server-only modules, see editor-export.ts).
// maxAttempts 1: a retry would pay the engine twice (rule 12).
import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";

const STOPPED = "Captions stopped before they finished. Your credits were returned.";

export const editorTranscribeTask = task({
  id: "editor-transcribe",
  maxDuration: 900,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 4 },
  run: async (payload: { jobId: string }) => {
    const [jobs, { runTranscription }, { transcribeUrl }, { saveTranscript }, gens, credits, { transcribeCredits }] = await Promise.all([
      import("@/lib/jobs/db"),
      import("@/lib/transcribe/run"),
      import("@/lib/transcribe/elevenlabs"),
      import("@/lib/db/media-transcripts"),
      import("@/lib/db/generations"),
      import("@/lib/db/credit-transactions"),
      import("@/lib/transcribe/cost"),
    ]);
    type Input = import("@/lib/editor/transcribe-plan").TranscribeJobInput;
    const job = await jobs.getJob<Input>(payload.jobId);
    if (!job) throw new AbortTaskRunError(`No transcribe job ${payload.jobId}`);
    const input = job.input;
    await jobs.startJob(job.id, "Listening…");

    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) {
      await jobs.failJob(job.id, STOPPED);
      await credits.refundReservation({ orgId: input.orgId, generationId: input.generationId });
      await gens.failGeneration({ generationId: input.generationId, error: "not set up" });
      throw new AbortTaskRunError("ELEVEN_LABS_API_KEY is not set");
    }

    const { result, secondsDone } = await runTranscription(input, {
      transcribe: (url) => transcribeUrl(url, { fetch, apiKey }),
      save: saveTranscript,
      log: (message, data) => logger.info(message, data),
    });

    if (secondsDone === 0) {
      await credits.refundReservation({ orgId: input.orgId, generationId: input.generationId });
      await gens.failGeneration({ generationId: input.generationId, error: "no file transcribed" });
    } else {
      const charged = transcribeCredits(secondsDone);
      await credits.settleGeneration({ orgId: input.orgId, generationId: input.generationId, actualAmount: charged });
      await gens.succeedGeneration({ generationId: input.generationId, creditsCharged: charged, costUsd: (secondsDone / 3600) * (await import("@/lib/transcribe/cost")).STT_USD_PER_HOUR });
    }
    await jobs.succeedJob(job.id, result, result.failed.length ? "Done, with some clips not captioned" : "Done");
    return result;
  },
  // A timeout never reaches the end of run(): refund and settle the job here.
  onFailure: async ({ payload }) => {
    const [{ getJob, failJob }, { JOB_LIVE_STATUSES }, credits, gens] = await Promise.all([
      import("@/lib/jobs/db"), import("@/lib/jobs/types"), import("@/lib/db/credit-transactions"), import("@/lib/db/generations"),
    ]);
    const job = await getJob<import("@/lib/editor/transcribe-plan").TranscribeJobInput>(payload.jobId);
    if (!job || !JOB_LIVE_STATUSES.has(job.status)) return;
    await failJob(job.id, STOPPED);
    await credits.refundReservation({ orgId: job.input.orgId, generationId: job.input.generationId }).catch(() => null);
    await gens.failGeneration({ generationId: job.input.generationId, error: "stopped" }).catch(() => null);
  },
});
```

Check `startJob` / `succeedJob` exist in `src/lib/jobs/db.ts` with these signatures (`editor-export.ts` uses `startJob(id, phase)`, `succeedJob(id, result, phase)`, `failJob(id, message)`); if `succeedJob`'s result type is constrained, cast to `Record<string, unknown>`. Note: `settleGeneration` is idempotent; `refundReservation` too (both check `alreadySettled`).

- [ ] **Step 4: Type check and run the task locally once**

Run: `npx tsc --noEmit -p .` → clean. Then with the dev Trigger worker running (`npx trigger.dev@latest dev`), trigger a run from the editor in Task 11's manual check (no separate step here).

- [ ] **Step 5: Commit**

```bash
git add src/lib/transcribe trigger/editor-transcribe.ts
git commit -m "feat(transcribe): the editor-transcribe task, each file once, credits settled for what succeeded (D395)"
```

---

### Task 8: Client data and the Auto captions hook

**Files:**
- Modify: `src/services/editor.service.ts`, `src/hooks/queries/editor.ts`
- Create: `src/hooks/use-auto-captions.ts`, `src/lib/editor/auto-captions.ts` (pure helpers)
- Test: `src/lib/editor/__tests__/auto-captions.test.ts`

**Interfaces:**
- Consumes: `planTranscription`-like logic on the client is NOT reused (the client must not decide URLs for the server); the client computes the **display** cost from `pieceSoundFile` + media facts + which URLs have transcripts.
- Produces (`auto-captions.ts`): `pieceSound(doc, sources, pieceId): { url: string; seconds: number; hasSound: boolean } | null`, `autoCaptionCost(doc, sources, transcribed: Set<string>, pieceIds?): { credits: number; free: boolean }`, `staleAutoPieces(doc, sources): string[]` (pieces whose auto captions came `from` another URL than the piece's sound now), `fillFromTranscripts(doc, sources, pieceIds, transcripts: Map<string, Transcript>, newId): { doc: EditDoc; filled: string[]; added: string[] }`.
- Produces (queries): `editorKeys.transcripts(canvasId)`, `editorKeys.transcribe(canvasId, jobId)`, `useTranscripts(canvasId)`, `useStartTranscribe(canvasId)`, `useTranscribeStatus(canvasId, jobId)`.
- Produces (hook): `useAutoCaptions({ canvasId, nodeId })` → `{ cost(pieceIds?): { credits: number; free: boolean }; start(pieceIds?): void; listening: ReadonlySet<string>; failed: ReadonlyMap<string, TranscribeFailureReason>; stale: string[]; busy: boolean }`.

- [ ] **Step 1: Write the failing test** `src/lib/editor/__tests__/auto-captions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { autoCaptionCost, fillFromTranscripts, staleAutoPieces } from "../auto-captions";
import { transcribeCredits } from "@/lib/transcribe/cost";
import { cap, emptyDoc, source } from "./fixtures";
import type { Piece } from "../types";

const a = source("a");
const b = source("b");
const piece = (id: string, src: string): Piece => ({ id, sourceNodeId: src, in: 0, out: 5, picture: "original", sound: "original" });
const doc = emptyDoc({ pieces: [piece("1", "a"), piece("2", "b"), piece("3", "a")] });

describe("autoCaptionCost", () => {
  it("prices each new file once and is free when all are transcribed", () => {
    expect(autoCaptionCost(doc, [a, b], new Set())).toEqual({ credits: transcribeCredits(2 * (121 / 24)), free: false });
    expect(autoCaptionCost(doc, [a, b], new Set([a.files.original.url, b.files.original.url]))).toEqual({ credits: 0, free: true });
  });
});

describe("fillFromTranscripts", () => {
  const words = [{ t: "hello", s: 0.5, e: 0.9, p: 1 }, { t: "there.", s: 1, e: 1.4, p: 1 }];
  it("fills each requested piece that has a transcript, once", () => {
    let n = 0;
    const transcripts = new Map([[a.files.original.url, { url: a.files.original.url, language: "eng", words, engine: "e", model: "m", durationSeconds: 5 }]]);
    const r = fillFromTranscripts(doc, [a, b], ["1", "2", "3"], transcripts, () => `n${++n}`);
    expect(r.filled).toEqual(["1", "3"]);
    expect(r.doc.captions.map((c) => c.pieceId)).toEqual(["1", "3"]);
    expect(r.added).toHaveLength(2);
  });
});

describe("staleAutoPieces", () => {
  it("lists pieces whose auto captions came from another file", () => {
    const d = { ...doc, captions: [cap("c", "1", 1, 1, { auto: true, from: "https://old" }), cap("k", "2", 1, 1, { auto: true, from: b.files.original.url })] };
    expect(staleAutoPieces(d, [a, b])).toEqual(["1"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then implement `src/lib/editor/auto-captions.ts`:

```ts
// The browser side of Auto captions (D399, D401): what the button costs, which clips can be
// filled from stored transcripts, and which clips have a new take. Pure.
import type { Transcript } from "@/lib/transcribe/types";
import { transcribeCredits } from "@/lib/transcribe/cost";
import { normalizeWords, replaceAutoCaptions } from "./caption-words";
import { pieceSoundFile } from "./playback";
import type { EditDoc, SourceView } from "./types";

const FALLBACK_FPS = 24;

export function pieceSound(doc: EditDoc, sources: SourceView[], pieceId: string) {
  const p = doc.pieces.find((x) => x.id === pieceId);
  const s = p && sources.find((x) => x.nodeId === p.sourceNodeId);
  if (!p || !s) return null;
  const f = pieceSoundFile(p, s);
  return { url: f.url, seconds: f.facts?.durationSeconds ?? 0, hasSound: Boolean(f.facts?.audio), fps: s.files.original.facts?.video?.fps ?? FALLBACK_FPS };
}

export function autoCaptionCost(doc: EditDoc, sources: SourceView[], transcribed: ReadonlySet<string>, pieceIds?: string[]): { credits: number; free: boolean } {
  const ids = pieceIds ?? doc.pieces.map((p) => p.id);
  const fresh = new Map<string, number>();
  for (const id of ids) {
    const s = pieceSound(doc, sources, id);
    if (s && s.hasSound && !transcribed.has(s.url)) fresh.set(s.url, s.seconds);
  }
  const seconds = [...fresh.values()].reduce((a, b) => a + b, 0);
  return { credits: transcribeCredits(seconds), free: fresh.size === 0 };
}

export function fillFromTranscripts(doc: EditDoc, sources: SourceView[], pieceIds: string[], transcripts: ReadonlyMap<string, Transcript>, newId: () => string) {
  let next = doc;
  const filled: string[] = [];
  for (const id of pieceIds) {
    const s = pieceSound(next, sources, id);
    const t = s && transcripts.get(s.url);
    if (!s || !t) continue;
    next = replaceAutoCaptions(next, id, normalizeWords(t.words, s.fps), s.url, newId);
    filled.push(id);
  }
  const before = new Set(doc.captions.map((c) => c.id));
  return { doc: next, filled, added: next.captions.filter((c) => !before.has(c.id)).map((c) => c.id) };
}

export function staleAutoPieces(doc: EditDoc, sources: SourceView[]): string[] {
  const out = new Set<string>();
  for (const c of doc.captions) {
    if (!c.auto || !c.from) continue;
    const s = pieceSound(doc, sources, c.pieceId);
    if (s && s.url !== c.from) out.add(c.pieceId);
  }
  return [...out];
}
```

Run the test → PASS.

- [ ] **Step 3: Service methods** (append to `EditorService`):

```ts
  /** Starts Auto captions (D399). jobId null: every file was already transcribed. */
  async startTranscribe(canvasId: string, body: { nodeId: string; pieceIds?: string[] }): Promise<{ jobId: string | null; noSound: string[] }> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/transcribe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return readJson(res, "Couldn't start captions.");
  }

  async transcribeStatus(canvasId: string, jobId: string): Promise<TranscribeStatus> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/transcribe/${jobId}`);
    return readJson(res, "Couldn't read the captions run.");
  }

  async transcripts(canvasId: string): Promise<Transcript[]> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/transcripts`);
    return (await readJson<{ transcripts: Transcript[] }>(res, "Couldn't read the captions.")).transcripts;
  }
```

(Check `readJson`'s generic signature in `src/services/read-json.ts` and match it.)

- [ ] **Step 4: Query hooks** (in `src/hooks/queries/editor.ts`):

```ts
// in editorKeys:
  transcripts: (canvasId: string) => [...editorKeys.all(canvasId), "transcripts"] as const,
  transcribe: (canvasId: string, jobId: string) => [...editorKeys.all(canvasId), "transcribe", jobId] as const,

const TRANSCRIBE_POLL_MS = 1500;

/** Stored transcripts for this reel's sound files, keyed by URL. */
export function useTranscripts(canvasId: string) {
  return useQuery({
    queryKey: editorKeys.transcripts(canvasId),
    queryFn: async () => new Map((await editorService.transcripts(canvasId)).map((t) => [t.url, t])),
    enabled: Boolean(canvasId),
    staleTime: Infinity,
  });
}

export function useStartTranscribe(canvasId: string) {
  return useMutation({ mutationFn: (body: { nodeId: string; pieceIds?: string[] }) => editorService.startTranscribe(canvasId, body) });
}

/** A run's progress. Each poll also refreshes the transcripts, so clips fill as they land. */
export function useTranscribeStatus(canvasId: string, jobId: string | null) {
  const queryClient = useQueryClient();
  return useQuery<TranscribeStatus>({
    queryKey: editorKeys.transcribe(canvasId, jobId ?? ""),
    queryFn: async () => {
      const status = await editorService.transcribeStatus(canvasId, jobId!);
      await queryClient.invalidateQueries({ queryKey: editorKeys.transcripts(canvasId) });
      return status;
    },
    enabled: Boolean(canvasId && jobId),
    refetchInterval: (q) => (!q.state.data || JOB_LIVE_STATUSES.has(q.state.data.status) ? TRANSCRIBE_POLL_MS : false),
  });
}
```

- [ ] **Step 5: The hook** `src/hooks/use-auto-captions.ts`

```ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useEditorStore, useEditorStoreApi } from "@/components/editor/editor-store-provider";
import { useStartTranscribe, useTranscribeStatus, useTranscripts } from "@/hooks/queries/editor";
import { autoCaptionCost, fillFromTranscripts, pieceSound, staleAutoPieces } from "@/lib/editor/auto-captions";
import type { TranscribeFailureReason } from "@/lib/transcribe/types";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";

const FAILURE_COPY: Record<TranscribeFailureReason, string> = {
  "no-speech": "No speech found",
  "no-sound": "This clip has no sound",
  failed: "Couldn't caption this clip",
};
export const failureCopy = (r: TranscribeFailureReason) => FAILURE_COPY[r];

/** Auto captions for the editor page (D399): the cost on the button, the run, and filling each
 *  clip as its transcript lands. One run, one poll and one transcripts read for the whole reel. */
export function useAutoCaptions({ canvasId, nodeId }: { canvasId: string; nodeId: string }) {
  const store = useEditorStoreApi();
  const doc = useEditorStore((s) => s.doc);
  const sources = useEditorStore((s) => s.sources);
  const transcripts = useTranscripts(canvasId);
  const startMutation = useStartTranscribe(canvasId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [listening, setListening] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<ReadonlyMap<string, TranscribeFailureReason>>(new Map());
  const run = useRef<{ added: string[]; total: number } | null>(null);
  const status = useTranscribeStatus(canvasId, jobId);

  const transcribed = useMemo(() => new Set(transcripts.data?.keys() ?? []), [transcripts.data]);
  const cost = useCallback((pieceIds?: string[]) => autoCaptionCost(doc, sources, transcribed, pieceIds), [doc, sources, transcribed]);
  const stale = useMemo(() => staleAutoPieces(doc, sources), [doc, sources]);

  const finishRun = useCallback((failedCount: number) => {
    const r = run.current;
    run.current = null;
    if (!r) return;
    const added = r.added;
    const undo = () => store.getState().apply((d) => ({ ...d, captions: d.captions.filter((c) => !added.includes(c.id)) }));
    const ok = r.total - failedCount;
    toast(failedCount ? `${ok} clip${ok === 1 ? "" : "s"} captioned. ${failedCount} couldn't be.` : `${added.length} captions from ${r.total} clip${r.total === 1 ? "" : "s"}`, {
      action: added.length ? { label: "Undo", onClick: undo } : undefined,
    });
  }, [store]);

  // Fill the clips we're listening to as their transcripts arrive.
  useEffect(() => {
    if (!transcripts.data || listening.size === 0) return;
    const ids = [...listening];
    const { doc: next, filled, added } = fillFromTranscripts(store.getState().doc, store.getState().sources, ids, transcripts.data, () => crypto.randomUUID());
    if (filled.length === 0) return;
    store.getState().apply(() => next);
    if (run.current) run.current.added.push(...added);
    const left = new Set(listening);
    filled.forEach((id) => left.delete(id));
    setListening(left);
    if (left.size === 0 && !jobId) finishRun(failed.size);
  }, [transcripts.data, listening, store, jobId, failed.size, finishRun]);

  // When the run ends: mark failed clips, stop listening for them.
  useEffect(() => {
    const s = status.data;
    if (!s || JOB_LIVE_STATUSES.has(s.status)) return;
    const st = store.getState();
    const byUrl = new Map((s.result?.failed ?? []).map((f) => [f.url, f.reason]));
    const nextFailed = new Map(failed);
    const left = new Set<string>();
    for (const id of listening) {
      const sound = pieceSound(st.doc, st.sources, id);
      const reason = sound ? byUrl.get(sound.url) : undefined;
      if (reason) nextFailed.set(id, reason);
      else if (s.status === "failed") nextFailed.set(id, "failed");
      else left.add(id); // transcript saved; the fill effect picks it up
    }
    setFailed(nextFailed);
    setListening(left);
    setJobId(null);
    if (left.size === 0) finishRun(nextFailed.size);
  }, [status.data]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per finished poll

  const start = useCallback((pieceIds?: string[]) => {
    const st = store.getState();
    const ids = (pieceIds ?? st.doc.pieces.map((p) => p.id)).filter((id) => !listening.has(id));
    if (ids.length === 0) return;
    run.current = { added: [], total: ids.length };
    setFailed((f) => new Map([...f].filter(([id]) => !ids.includes(id))));
    setListening(new Set([...listening, ...ids]));
    startMutation.mutate({ nodeId, pieceIds }, {
      onSuccess: ({ jobId: id, noSound }) => {
        if (noSound.length) {
          setFailed((f) => new Map([...f, ...noSound.map((n) => [n, "no-sound" as const] as const)]));
          setListening((l) => new Set([...l].filter((x) => !noSound.includes(x))));
        }
        if (id) setJobId(id);
        else void transcripts.refetch();
      },
      onError: (err) => {
        setListening((l) => new Set([...l].filter((x) => !ids.includes(x))));
        run.current = null;
        const limit = (err as { status?: number }).status === 402;
        toast.error(limit ? CREDIT_LIMIT_TOAST_MESSAGE : "Couldn't start captions. Try again.");
      },
    });
  }, [store, listening, startMutation, nodeId, transcripts]);

  return { cost, start, listening, failed, stale, busy: listening.size > 0 };
}
```

Provide it once per page through a context (one instance, rule 1): create `src/components/editor/auto-captions-context.tsx` exporting `AutoCaptionsProvider` (calls the hook, provides its value) and `useAutoCaptionsContext()`. Mount `AutoCaptionsProvider` in `editor-shell.tsx` inside `EditorPlaybackProvider`, with `canvasId` and `initialState.editorNodeId`.

- [ ] **Step 6: Run tests and tsc**

Run: `npx vitest run src/lib/editor` and `npx tsc --noEmit -p .`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add src/services src/hooks src/lib/editor src/components/editor
git commit -m "feat(editor): Auto captions on the client: cost on the button, clips fill as they land (D399, D401)"
```

---

### Task 9: Frame-exact preview clock and frame stepping

**Files:**
- Modify: `src/hooks/use-reel-playback.ts`, `src/hooks/use-editor-shortcuts.ts`
- Test: manual (the hook drives a real `<video>`; jsdom has no frame callback)

**Interfaces:**
- Produces: `ReelPlayback.step(frames: number): void`; `ReelPlayback.fps: number` (the piece under the playhead's picture fps).

- [ ] **Step 1: Use the frame callback while playing.** In `use-reel-playback.ts`, keep the rAF loop as the fallback and add, inside the existing `useEffect` that defines `tickRef.current`, a frame-callback path:

```ts
type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?(cb: (now: number, meta: { mediaTime: number }) => void): number;
  cancelVideoFrameCallback?(id: number): void;
};
```

Replace the scheduling lines `rafRef.current = requestAnimationFrame(() => tickRef.current());` (in `tickRef.current` and in `play`) with a helper:

```ts
  const lastFrameAt = useRef(0);
  const schedule = useCallback(() => {
    const v = videoRef.current as VideoWithFrames | null;
    if (v?.requestVideoFrameCallback) {
      v.requestVideoFrameCallback((_now, meta) => {
        lastFrameAt.current = performance.now();
        frameTimeRef.current = meta.mediaTime;
        tickRef.current();
      });
    } else {
      rafRef.current = requestAnimationFrame(() => tickRef.current());
    }
  }, []);
```

with `const frameTimeRef = useRef<number | null>(null);`, and in `tickRef.current` read `const mediaTime = frameTimeRef.current ?? v.currentTime; frameTimeRef.current = null;` instead of `v.currentTime` when computing `local`. Add a watchdog effect that re-arms when frames stop arriving after a source swap:

```ts
  useEffect(() => {
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (playingRef.current && v && !v.paused && performance.now() - lastFrameAt.current > 400) {
        lastFrameAt.current = performance.now();
        schedule();
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [schedule]);
```

- [ ] **Step 2: Frame stepping.** Add to the hook's return:

```ts
  const fps = useMemo(() => {
    const at = locate(pieces, time);
    return (at && media(pieces[at.index])?.pictureFps) || 24;
  }, [pieces, media, time]);

  /** Pauses and moves by whole frames, landing mid-frame so the browser shows that frame. */
  const step = useCallback((frames: number) => {
    stop();
    const at = locate(piecesRef.current, timeRef.current);
    const f = at ? mediaRef.current(piecesRef.current[at.index])?.pictureFps ?? 24 : 24;
    const frame = Math.round(timeRef.current * f) + frames;
    seek((frame + 0.5) / f);
  }, [stop, seek]);
```

Return `{ ..., step, fps }`.

- [ ] **Step 3: Arrow keys** in `use-editor-shortcuts.ts`:

```ts
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        if (e.shiftKey) step(dir * Math.round(fps)); else step(dir);
      }
```

(destructure `step, fps` from `usePlayback()`; add to deps.)

- [ ] **Step 4: Verify manually**

Run `npm run dev`, open an Editor with Reel 2's clips, press Space, then ← / → while paused: the frame counter (or the playhead) moves one frame per press; Shift moves ~1 s. Play across a cut: playback continues past the cut (watchdog). Commit.

```bash
git add src/hooks
git commit -m "feat(editor): the preview clock follows the frame on screen; arrow keys step frames (D397)"
```

---

### Task 10: Captions on the stage — words, drag and resize

**Files:**
- Create: `src/components/editor/caption-look-css.ts`
- Modify: `src/components/editor/editor-stage-captions.tsx`, `src/components/editor/editor-caption-overlay.tsx`, `src/components/editor/editor-stage-with-caption.tsx`

**Interfaces:**
- Consumes: `wordFrames`, `activeWord` (Task 2); `dimColor`, `displayText`, `applyCaptionStyle`, `CaptionStyle` (Task 1); `usePlayback().time`, `.fps`; store `begin`/`commit` (Task 4).
- Produces: `captionBoxStyle(style): React.CSSProperties`, `wordStyle(style, state: "said" | "active" | "upcoming"): React.CSSProperties` in `caption-look-css.ts`; `<CaptionLine caption doc style frame fps />` rendered by both stage files.

- [ ] **Step 1: `caption-look-css.ts`** (shared CSS for the look; the stage uses container query units so it scales with the frame)

```ts
import type { CSSProperties } from "react";
import { dimColor, type CaptionStyle } from "@/lib/editor/caption-style";
import { CAPTION_FONT_CSS } from "./caption-font-faces";

const px = (n: number) => `calc(${n} / 1080 * 100cqmin)`;

/** The caption box: font, size and where it sits. Matches the Premiere title (D396). */
export function captionBoxStyle(style: CaptionStyle): CSSProperties {
  return {
    left: `${style.x * 100}%`,
    top: `${style.y * 100}%`,
    fontFamily: CAPTION_FONT_CSS[style.font],
    fontSize: px(style.size),
    lineHeight: 1.12,
    color: style.color,
  };
}

/** One word. Outline and shadow live on words; the box on the line. */
export function wordStyle(style: CaptionStyle, state: "said" | "active" | "upcoming"): CSSProperties {
  const base: CSSProperties = style.outline
    ? { WebkitTextStroke: `${px(Math.max(4, style.size * 0.09))} #000`, paintOrder: "stroke fill" }
    : style.box ? {} : { textShadow: "0 0.06em 0.3em rgba(0,0,0,.6)" };
  if (!style.wordByWord || state === "said") return base;
  if (state === "active") return { ...base, color: style.activeColor };
  if (style.upcoming === "hide") return { ...base, visibility: "hidden" };
  if (style.upcoming === "dim") return { ...base, color: dimColor(style) };
  return base;
}

export function lineStyle(style: CaptionStyle): CSSProperties {
  return style.box
    ? { background: `${style.boxColor}b8`, padding: "0.08em 0.32em", borderRadius: "0.18em", WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone" }
    : {};
}
```

(`b8` = 72% alpha.)

- [ ] **Step 2: `CaptionLine`** — create `src/components/editor/editor-caption-line-render.tsx`:

```tsx
"use client";

import { activeWord, wordFrames } from "@/lib/editor/caption-words";
import { displayText, type CaptionStyle } from "@/lib/editor/caption-style";
import type { Caption, EditDoc } from "@/lib/editor/types";
import { lineStyle, wordStyle } from "./caption-look-css";

/** A caption's words as the stage draws them on `frame` (the shared frame rule, D397). */
export function CaptionLineRender({ doc, caption, style, frame, fps }: { doc: EditDoc; caption: Caption; style: CaptionStyle; frame: number; fps: number }) {
  const frames = wordFrames(doc, caption, fps) ?? [];
  const active = activeWord(frames, frame);
  return (
    <span style={lineStyle(style)}>
      {frames.map((w, i) => (
        <span key={i} style={wordStyle(style, i < active ? "said" : i === active ? "active" : "upcoming")}>
          {displayText(w.text, style)}
          {i < frames.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 3: `editor-stage-captions.tsx`** renders every caption showing at the playhead with `CaptionLineRender` inside a positioned `<p>` using `captionBoxStyle(doc.captionStyle)` and classes `pointer-events-none absolute m-0 w-[88%] -translate-x-1/2 -translate-y-1/2 whitespace-pre-line text-center`. `frame = Math.round(time * fps)` with `const { time, fps } = usePlayback()`. Delete `captionTextStyle` (grep for other users and switch them to `captionBoxStyle`).

- [ ] **Step 4: `editor-caption-overlay.tsx`** — the selected caption, draggable for **every** caption (D396), with corner resize:

```tsx
"use client";
// The selected caption on the stage: drag inside it to move every caption, drag a corner to
// resize (D396). Snaps to both centre lines; a label says what is changing. One undo step per drag.
import { useRef, useState } from "react";
import { applyCaptionStyle } from "@/lib/editor/caption-style";
import type { Caption } from "@/lib/editor/types";
import { captionBoxStyle } from "./caption-look-css";
import { CaptionLineRender } from "./editor-caption-line-render";
import { useEditorStore, useEditorStoreApi } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

const EDGE = 0.04;
const SNAP = 0.015;
const CORNERS = ["-left-[7px] -top-[7px] cursor-nwse-resize", "-right-[7px] -top-[7px] cursor-nesw-resize", "-left-[7px] -bottom-[7px] cursor-nesw-resize", "-right-[7px] -bottom-[7px] cursor-nwse-resize"];

export function EditorCaptionOverlay({ caption, editable }: { caption: Caption; editable: boolean }) {
  const store = useEditorStoreApi();
  const doc = useEditorStore((s) => s.doc);
  const style = doc.captionStyle;
  const count = doc.captions.length;
  const { time, fps } = usePlayback();
  const drag = useRef<{ mode: "move" | "size"; dx: number; dy: number; size0: number; dist0: number; cx: number; cy: number } | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean } | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const frameOf = (el: HTMLElement) => el.closest("[data-stage-frame]")!.getBoundingClientRect();
  const clamp = (v: number) => Math.min(1 - EDGE, Math.max(EDGE, v));

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = frameOf(e.currentTarget);
    const corner = (e.target as HTMLElement).dataset.corner !== undefined;
    const cx = r.left + style.x * r.width;
    const cy = r.top + style.y * r.height;
    drag.current = { mode: corner ? "size" : "move", dx: (e.clientX - r.left) / r.width - style.x, dy: (e.clientY - r.top) / r.height - style.y, size0: style.size, dist0: Math.max(10, Math.hypot(e.clientX - cx, e.clientY - cy)), cx, cy };
    store.getState().begin();
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const r = frameOf(e.currentTarget);
    if (d.mode === "move") {
      let x = clamp((e.clientX - r.left) / r.width - d.dx);
      let y = clamp((e.clientY - r.top) / r.height - d.dy);
      const v = Math.abs(x - 0.5) < SNAP;
      const h = Math.abs(y - 0.5) < SNAP;
      if (v) x = 0.5;
      if (h) y = 0.5;
      setGuides({ v, h });
      setLabel(`Moving · all ${count} captions${v && h ? " · Centred" : ""}`);
      store.getState().apply((doc) => applyCaptionStyle(doc, { x, y }));
    } else {
      const size = d.size0 * (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) / d.dist0);
      store.getState().apply((doc) => applyCaptionStyle(doc, { size }));
      setLabel(`Size ${Math.round(store.getState().doc.captionStyle.size)} px · all ${count} captions`);
    }
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    store.getState().commit();
    setGuides(null);
    setLabel(null);
  };

  return (
    <>
      {guides?.v && <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/60" />}
      {guides?.h && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/60" />}
      {label && <span className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground/85 px-2.5 py-1 text-[11px] text-background">{label}</span>}
      <div
        role="presentation"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={captionBoxStyle(style)}
        className="absolute w-[88%] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none text-center outline outline-[1.5px] outline-offset-[6px] outline-white active:cursor-grabbing"
      >
        <CaptionLineRender doc={doc} caption={caption} style={style} frame={Math.round(time * fps)} fps={fps} />
        {editable && CORNERS.map((pos) => <span key={pos} data-corner="" aria-hidden className={`absolute size-[11px] rounded-[3px] border-[1.5px] border-primary bg-white ${pos}`} />)}
      </div>
    </>
  );
}
```

Add `data-stage-frame` to the frame `<div aria-label="Reel preview…">` in `editor-stage.tsx`. In `editor-stage-with-caption.tsx`, drop `onMove`/`placeCaption` and render `<EditorCaptionOverlay caption={caption} editable={editable} />`.

- [ ] **Step 5: Hover affordance for unselected captions** — in `editor-stage-captions.tsx`, make each showing caption clickable to select it (pointer-events on, `cursor-pointer`, dotted hover outline `hover:outline hover:outline-1 hover:outline-dashed hover:outline-white/60 hover:outline-offset-[6px]`), `onClick={() => select({ kind: "caption", id: c.id })}`.

- [ ] **Step 6: Verify and commit**

Run `npx tsc --noEmit -p .` → clean. Manual: select a caption, drag it (all captions move, label shows count, guides at centre), drag a corner (size changes), Ctrl+Z undoes the whole drag.

```bash
git add src/components/editor
git commit -m "feat(editor): captions draw word by word on the stage; drag and resize move every caption (D396, D397)"
```

---

### Task 11: The Captions panel (Text | Style) and the timeline controls

**Files:**
- Create: `src/components/editor/editor-captions-panel.tsx`, `editor-captions-text.tsx`, `editor-caption-line.tsx`, `editor-captions-style.tsx`, `editor-caption-presets.tsx`, `editor-auto-captions-button.tsx`, `editor-caption-lane-state.tsx`, `editor-captions-more-menu.tsx`
- Modify: `src/components/editor/editor-props-panel.tsx`, `editor-shell.tsx`, `editor-caption-lane.tsx`, `editor-timeline.tsx` (header `tools`), `use-timeline-actions.ts` (S splits a selected caption)
- Delete: `src/components/editor/editor-caption-props.tsx`, `editor-captions-toolbar.tsx`

**Interfaces:**
- Consumes: `useAutoCaptionsContext()` (Task 8), `editCaption`, `splitCaption`, `removeCaption`, `addCaption`, `attachCues`, `docToCues` (`captions.ts`), `CAPTION_PRESETS`, `presetOf`, `applyCaptionStyle` (Task 1), `failureCopy` (Task 8), `formatClock` (new tiny helper below).

- [ ] **Step 1: Read the primitives first.** Open `src/components/ui/tabs.tsx`, `switch.tsx`, `slider.tsx`, `select.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`; note each export's name and its Base UI props (`value`/`onValueChange`, `render` not `asChild`). Use only those exports below; adapt prop names to what the files export.

- [ ] **Step 2: `editor-auto-captions-button.tsx`**

```tsx
"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { useEditorStore } from "./editor-store-provider";

/** The one Auto captions button (D399). Its cost is on it, so there is no confirmation step. */
export function EditorAutoCaptionsButton({ pieceIds, label = "Auto captions", size = "sm", className }: { pieceIds?: string[]; label?: string; size?: "sm" | "default"; className?: string }) {
  const { cost, start, listening } = useAutoCaptionsContext();
  const editable = useEditorStore((s) => s.editable);
  const hasPieces = useEditorStore((s) => s.doc.pieces.length > 0);
  const busy = pieceIds ? pieceIds.some((id) => listening.has(id)) : listening.size > 0;
  const c = cost(pieceIds);
  const why = !editable ? "Someone else is editing this reel." : !hasPieces ? "Add a clip to the timeline first." : busy ? "Listening to the clips…" : undefined;
  return (
    <Button
      variant="outline"
      size={size}
      disabled={Boolean(why)}
      title={why}
      onClick={() => start(pieceIds)}
      className={cn("gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/5", className)}
    >
      <Sparkles className="size-3.5" strokeWidth={1.5} />
      {label}
      <span className="font-normal opacity-70">· {c.free ? "free" : `${c.credits} credits`}</span>
    </Button>
  );
}
```

- [ ] **Step 3: `editor-caption-lane-state.tsx`** — per-piece segments under the lane (Listening…, failed + Try again, new take):

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { pieceOffsets, pieceSeconds } from "@/lib/editor/timeline";
import { failureCopy, useAutoCaptionsContext } from "./auto-captions-context";
import { EditorAutoCaptionsButton } from "./editor-auto-captions-button";
import { useEditorStore } from "./editor-store-provider";

/** What each clip's part of the Captions lane says while captions are made (spec §2). */
export function EditorCaptionLaneState({ scale }: { scale: number }) {
  const pieces = useEditorStore((s) => s.doc.pieces);
  const { listening, failed, stale, start } = useAutoCaptionsContext();
  const offsets = pieceOffsets(pieces);
  return (
    <>
      {pieces.map((p, i) => {
        const box = { left: offsets[i] * scale, width: Math.max(6, pieceSeconds(p) * scale - 2) };
        if (listening.has(p.id)) return <div key={p.id} style={box} className="absolute inset-y-[3px] z-10 grid animate-pulse place-items-center rounded-md bg-primary/10 text-[11px] text-primary">Listening…</div>;
        const reason = failed.get(p.id);
        if (reason) return (
          <div key={p.id} style={box} className="absolute inset-y-[3px] z-10 flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md bg-destructive/10 px-2 text-[11px] text-destructive">
            {failureCopy(reason)}
            {reason !== "no-sound" && <Button variant="link" size="sm" className="h-auto p-0 text-[11px] text-destructive" onClick={() => start([p.id])}>Try again</Button>}
          </div>
        );
        if (stale.includes(p.id)) return (
          <div key={p.id} style={box} className="absolute inset-y-[3px] z-10 flex items-center justify-center overflow-hidden rounded-md border border-dashed border-primary/40 bg-card">
            <EditorAutoCaptionsButton pieceIds={[p.id]} label="Caption this clip" className="h-6 border-0 px-2 text-[11px]" />
          </div>
        );
        return null;
      })}
    </>
  );
}
```

(Move `failureCopy` into `auto-captions-context.tsx` as a re-export of the hook file's export.)

- [ ] **Step 4: Update `editor-caption-lane.tsx`** — empty state and lane states:

```tsx
  if (doc.captions.length === 0 && listening.size === 0 && failed.size === 0) {
    return (
      <div className="absolute inset-0 flex items-center gap-2.5 pl-1">
        <EditorAutoCaptionsButton />
        <span className="text-xs text-muted-foreground">
          Captions every clip from what&apos;s said, word by word. Or{" "}
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={!editable} onClick={addHere}>add one by hand</Button>.
        </span>
      </div>
    );
  }
```

where `addHere` is `const id = crypto.randomUUID(); apply((d) => addCaption(d, time, id)); select({ kind: "caption", id });`. After the existing blocks, render `<EditorCaptionLaneState scale={scale} />`. Pass caption text through `displayText(c.text, doc.captionStyle)`.

- [ ] **Step 5: Timeline header** — in `editor-shell.tsx`, replace `tools={<EditorCaptionsToolbar />}` with `tools={<EditorTimelineCaptionTools />}`, a tiny component (in `editor-auto-captions-button.tsx`) that renders `<EditorAutoCaptionsButton />` only when `doc.captions.length > 0 || listening.size > 0`. Delete `editor-captions-toolbar.tsx`.

- [ ] **Step 6: S splits a selected caption** — in `use-timeline-actions.ts` `split`:

```ts
    const { doc, sources, apply, selection } = store.getState();
    if (selection?.kind === "caption") {
      apply((d) => splitCaption(d, selection.id, time, crypto.randomUUID()));
      return;
    }
```

- [ ] **Step 7: `editor-captions-more-menu.tsx`** — `⋯` with Add a caption at the playhead, Import SRT…, Export SRT. Move the SRT import/export code from the deleted toolbar here unchanged (it uses `Input type="file"` hidden — keep that primitive), using `DropdownMenu` items from `src/components/ui/dropdown-menu.tsx`.

- [ ] **Step 8: `editor-caption-line.tsx`** — one row of the Text tab:

```tsx
"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { editCaption, removeCaption } from "@/lib/editor/captions";
import { captionWords } from "@/lib/editor/caption-words";
import type { Caption } from "@/lib/editor/types";
import { cn } from "@/lib/utils";
import { useEditorStore } from "./editor-store-provider";

const UNSURE = 0.9;

/** A caption line: click to fix its words, Enter saves, Esc cancels, hover to delete (spec §9). */
export function EditorCaptionLine({ caption, start, selected, playing, unsure, onSelect }: {
  caption: Caption; start: string; selected: boolean; playing: boolean; unsure: ReadonlySet<number>; onSelect(): void;
}) {
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft === null) return;
    let spread = false;
    apply((d) => { const r = editCaption(d, caption.id, draft); spread = r.spread; return r.doc; });
    if (spread) toast("The word count changed, so this line's timing is spread evenly. Auto captions again gives exact timing.");
    setDraft(null);
  };
  const words = captionWords(caption);
  return (
    <div
      data-caption-row={caption.id}
      onClick={onSelect}
      className={cn(
        "group relative grid cursor-pointer grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:bg-muted",
        selected && "border-primary/40 bg-primary/5",
        playing && "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
      )}
    >
      <span className="pt-0.5 text-[11px] tabular-nums text-muted-foreground">{start}</span>
      {draft !== null ? (
        <Input
          autoFocus
          value={draft}
          aria-label="Caption text"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.preventDefault(); save(); }
            if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
          }}
          className="h-7 text-[13.5px]"
        />
      ) : (
        <span
          onClick={(e) => { if (!editable) return; e.stopPropagation(); onSelect(); setDraft(caption.text); }}
          className="min-w-0 rounded-sm text-[13.5px] leading-snug decoration-transparent decoration-dotted decoration-2 underline-offset-4 hover:bg-primary/5 hover:underline hover:decoration-primary/50"
        >
          {words.map((w, i) => (
            <span key={i} title={unsure.has(i) ? "Might be misheard" : undefined} className={unsure.has(i) ? "underline decoration-wavy decoration-amber-500 underline-offset-[3px]" : undefined}>
              {w.text}{i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete caption"
        disabled={!editable}
        onClick={(e) => { e.stopPropagation(); apply((d) => removeCaption(d, caption.id)); }}
        className="size-6 opacity-0 transition-opacity duration-200 group-hover:opacity-100 data-[selected]:opacity-100"
        data-selected={selected || undefined}
      >
        <Trash2 className="size-3.5" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
```

Word confidence (`unsure`): the Text tab looks up each auto caption's words in the transcript by `from` URL + time (`p < UNSURE`) from `useTranscripts` data; pass the set of word indexes. (`amber-500` is a semantic warning tone; if the design tokens define a warning colour in `globals.css`, use that token instead.)

- [ ] **Step 9: `editor-captions-text.tsx`** — lines grouped by clip:

```tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { addCaption, captionTimes } from "@/lib/editor/captions";
import { pieceOffsets } from "@/lib/editor/timeline";
import { useTranscripts } from "@/hooks/queries/editor";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { EditorAutoCaptionsButton } from "./editor-auto-captions-button";
import { EditorCaptionLine } from "./editor-caption-line";
import { EditorCaptionsMoreMenu } from "./editor-captions-more-menu";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export function EditorCaptionsText({ canvasId }: { canvasId: string }) {
  const doc = useEditorStore((s) => s.doc);
  const sources = useEditorStore((s) => s.sources);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const { time, seek } = usePlayback();
  const { listening, failed } = useAutoCaptionsContext();
  const transcripts = useTranscripts(canvasId);
  const selectedId = selection?.kind === "caption" ? selection.id : null;

  useEffect(() => {
    if (selectedId) document.querySelector(`[data-caption-row="${selectedId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  if (doc.captions.length === 0 && listening.size === 0) {
    return (
      <div className="flex flex-col items-start gap-2.5">
        <p className="m-0 text-xs text-muted-foreground">Write captions from what&apos;s said in every clip, timed to each word. You can fix any word after.</p>
        <EditorAutoCaptionsButton size="default" />
        <Button variant="link" size="sm" className="h-auto p-0" disabled={!editable} onClick={() => { const id = crypto.randomUUID(); apply((d) => addCaption(d, time, id)); select({ kind: "caption", id }); }}>Or add one by hand</Button>
      </div>
    );
  }

  const offsets = pieceOffsets(doc.pieces);
  const showing = doc.captions.find((c) => { const t = captionTimes(doc, c); return t && time >= t.start && time < t.end; });
  const unsureOf = (c: (typeof doc.captions)[number]) => {
    const t = c.from ? transcripts.data?.get(c.from) : undefined;
    if (!t || !c.words) return new Set<number>();
    return new Set(c.words.flatMap((w, i) => (t.words.some((x) => Math.abs(x.s - w.at) < 0.02 && x.p < 0.9) ? [i] : [])));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2"><span className="flex-1 text-xs text-muted-foreground">Click a line to fix its words.</span><EditorCaptionsMoreMenu /></div>
      {doc.pieces.map((p, i) => {
        const lines = doc.captions.filter((c) => c.pieceId === p.id).sort((a, b) => a.at - b.at);
        const handle = sources.find((s) => s.nodeId === p.sourceNodeId)?.handle ?? `Clip ${i + 1}`;
        const reason = failed.get(p.id);
        return (
          <div key={p.id} className="flex flex-col gap-0.5">
            <div className="flex justify-between gap-2 px-2 pb-0.5 pt-2.5">
              <span className="text-eyebrow text-muted-foreground">{i + 1}. {handle}</span>
              <span className="text-[11px] text-muted-foreground">{listening.has(p.id) ? "Listening…" : reason ? "Not captioned" : `${lines.length} line${lines.length === 1 ? "" : "s"}`}</span>
            </div>
            {lines.map((c) => {
              const t = captionTimes(doc, c);
              return (
                <EditorCaptionLine
                  key={c.id}
                  caption={c}
                  start={clock(t ? t.start : offsets[i])}
                  selected={c.id === selectedId}
                  playing={c.id === showing?.id}
                  unsure={unsureOf(c)}
                  onSelect={() => { select({ kind: "caption", id: c.id }); if (t) seek(t.start + 0.001); }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```

(Keep this file under ~200 lines; if `unsureOf` grows, move it to `src/lib/editor/auto-captions.ts` as `unsureWordIndexes(caption, transcript)` with a unit test.)

- [ ] **Step 10: `editor-caption-presets.tsx` and `editor-captions-style.tsx`**

```tsx
// editor-caption-presets.tsx
"use client";

import { Button } from "@/components/ui/button";
import { applyCaptionStyle, CAPTION_PRESETS, PRESET_KEYS, presetOf } from "@/lib/editor/caption-style";
import { cn } from "@/lib/utils";
import { CAPTION_FONT_CSS } from "./caption-font-faces";
import { useEditorStore } from "./editor-store-provider";

/** Four looks (D396). A preset never moves or retimes captions. */
export function EditorCaptionPresets() {
  const style = useEditorStore((s) => s.doc.captionStyle);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const current = presetOf(style);
  return (
    <div role="radiogroup" aria-label="Caption presets" className="grid grid-cols-2 gap-2">
      {PRESET_KEYS.map((k) => {
        const { label, sample, look } = CAPTION_PRESETS[k];
        return (
          <Button
            key={k}
            role="radio"
            aria-checked={current === k}
            variant="outline"
            disabled={!editable}
            onClick={() => apply((d) => applyCaptionStyle(d, look))}
            className={cn("flex h-auto flex-col gap-1 rounded-[10px] bg-black py-3 text-white transition-transform duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006] hover:bg-black hover:text-white", current === k && "outline outline-2 outline-offset-2 outline-primary")}
          >
            <span
              className="text-[15px] leading-tight"
              style={{
                fontFamily: CAPTION_FONT_CSS[look.font],
                textTransform: look.upper ? "uppercase" : "none",
                ...(look.box ? { background: look.boxColor, padding: "1px 6px", borderRadius: 3 } : look.outline ? { WebkitTextStroke: "1.5px #000", paintOrder: "stroke fill" } : { textShadow: "0 1px 6px rgba(0,0,0,.6)" }),
              }}
            >
              {look.wordByWord ? <><span style={{ color: look.activeColor }}>{sample.slice(0, 2)}</span>{sample.slice(2)}</> : sample}
            </span>
            <span className="text-[10.5px] text-white/70">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
```

```tsx
// editor-captions-style.tsx
"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { CAPTION_FONTS } from "@/lib/editor/caption-fonts";
import { applyCaptionStyle, MAX_SIZE, MIN_SIZE, type CaptionStyle } from "@/lib/editor/caption-style";
import { CAPTION_FONT_CSS } from "./caption-font-faces";
import { EditorCaptionPresets } from "./editor-caption-presets";
import { useEditorStore, useEditorStoreApi } from "./editor-store-provider";

/** The reel's one caption style (D396): presets, font, size, colour, word by word. */
export function EditorCaptionsStyle() {
  const store = useEditorStoreApi();
  const style = useEditorStore((s) => s.doc.captionStyle);
  const count = useEditorStore((s) => s.doc.captions.length);
  const editable = useEditorStore((s) => s.editable);
  const set = (patch: Partial<CaptionStyle>) => store.getState().apply((d) => applyCaptionStyle(d, patch));

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-xs text-muted-foreground">
        {count ? `Changes apply to all ${count} captions.` : "Captions you add will use this style."} Drag a caption on the preview to move it; drag a corner to resize.
      </p>
      <EditorCaptionPresets />
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold">Font</Label>
            <Select value={style.font} onValueChange={(v) => v && set({ font: v as CaptionStyle["font"] })} disabled={!editable}>
              <SelectTrigger aria-label="Font"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CAPTION_FONTS.map((f) => <SelectItem key={f.key} value={f.key} style={{ fontFamily: CAPTION_FONT_CSS[f.key] }}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="flex justify-between text-xs font-semibold">Size <span className="font-normal tabular-nums text-muted-foreground">{style.size} px</span></Label>
            <Slider
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={2}
              value={[style.size]}
              disabled={!editable}
              onValueChange={(v: number[]) => { store.getState().begin(); set({ size: v[0] }); }}
              onValueCommitted={() => store.getState().commit()}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ColorField label="Colour" value={style.color} disabled={!editable} onChange={(color) => set({ color })} />
          {style.wordByWord && <ColorField label="Word being said" value={style.activeColor} disabled={!editable} onChange={(activeColor) => set({ activeColor })} />}
        </div>
        <Label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-semibold">
          <span>Word by word <span className="font-normal text-muted-foreground">{style.wordByWord ? "the word being said lights up" : "the whole line at once"}</span></span>
          <Switch checked={style.wordByWord} disabled={!editable} onCheckedChange={(v: boolean) => set({ wordByWord: v })} />
        </Label>
      </div>
      <p className="m-0 border-t border-border pt-3 text-xs text-muted-foreground">
        {style.wordByWord ? "Arrives in Premiere as editable text on V2, one clip per word." : "Arrives in Premiere as editable text on V2, one clip per line."} The fonts ship in the package.
      </p>
    </div>
  );
}

function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange(v: string): void }) {
  return (
    <Label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value.toLowerCase())} className="h-7 w-9 cursor-pointer p-0.5" />
      {label}
    </Label>
  );
}
```

(Adjust `Slider` / `Select` / `Switch` prop names to the vendored files from Step 1. If `Slider` has no commit event, call `begin()` on `onPointerDown` of a wrapper `div` and `commit()` on `onPointerUp`.) Colour picker drags record one step each `input` event; wrap with `begin`/`commit` on the input's pointer down/up the same way.

- [ ] **Step 11: `editor-captions-panel.tsx`** and the Properties wiring

```tsx
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditorCaptionsStyle } from "./editor-captions-style";
import { EditorCaptionsText } from "./editor-captions-text";
import { useEditorStore } from "./editor-store-provider";

/** Captions as one layer (D396): Text lists every line, Style sets the reel's look. */
export function EditorCaptionsPanel({ canvasId, tab, onTab }: { canvasId: string; tab: "text" | "style"; onTab(t: "text" | "style"): void }) {
  const count = useEditorStore((s) => s.doc.captions.length);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 font-display text-[15px] font-semibold">Captions</h2>
        <span className="text-xs text-muted-foreground">{count ? `${count} lines` : "None yet"}</span>
      </div>
      <Tabs value={tab} onValueChange={(v) => onTab(v as "text" | "style")}>
        <TabsList>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="style">Style</TabsTrigger>
        </TabsList>
        <TabsContent value="text" className="pt-3"><EditorCaptionsText canvasId={canvasId} /></TabsContent>
        <TabsContent value="style" className="pt-3"><EditorCaptionsStyle /></TabsContent>
      </Tabs>
    </div>
  );
}
```

`editor-props-panel.tsx`: replace the empty-state and caption branches — when a piece is selected show `EditorPieceProps` (unchanged), else render `<EditorCaptionsPanel canvasId={…} tab={tab} onTab={setTab} />`. Keep `tab` in local state; when the selection becomes a caption, set `tab` to `"text"` (`useEffect` on `selection`). Pass `canvasId` from `editor-shell.tsx` (`<EditorPropsPanel canvasId={canvasId} />`) and drop the `caption` render prop. Delete `editor-caption-props.tsx`.

- [ ] **Step 12: Type check, lint, run tests**

Run: `npx tsc --noEmit -p .`, `npx eslint src/components/editor src/hooks`, `npx vitest run src/lib/editor src/hooks`.
Expected: clean; PASS.

- [ ] **Step 13: Commit**

```bash
git add -A src/components/editor src/hooks
git commit -m "feat(editor): the Captions panel (Text | Style), Auto captions button and lane states (D396, D399, D401)"
```

---

### Task 12: Verify end to end

**Files:** none new (fix what the checks find, in the file concerned).

- [ ] **Step 1: Full editor + API test folders and type check**

Run: `npx vitest run src/lib/editor src/lib/transcribe src/hooks "src/app/api/canvases/[cid]/editor"` and `npx tsc --noEmit -p .`
Expected: PASS, clean.

- [ ] **Step 2: Run the app** (`npm run dev` and the Trigger dev worker `npx trigger.dev@latest dev`). On Jackfruit 365 / Reel 2, open the Editor with 5 clips:
  1. Empty lane shows **Auto captions · N credits**. Click: each clip shows Listening…, then fills; toast with Undo. Undo removes them; Redo brings them back.
  2. Click a line in Text, fix "jackfruit365" → "Jackfruit365": timing kept. Type an extra word: the spread toast appears once.
  3. Drag a caption on the timeline and its edge; S splits a selected caption; Delete removes it.
  4. Style: each preset; Font, Size, Colour, Word by word. Captions never move when switching presets.
  5. Drag on the preview (label "Moving · all N captions", centre guides), corner resize; Ctrl+Z undoes the drag in one step.
  6. Step frames with ←/→ over a word boundary: the highlight changes on the frame the word starts.
  7. Run Auto captions again: button says **· free**; edited lines stay.
  8. Switch a Dubbing clip's sound to Dubbed: its segment shows **Caption this clip · N credits**.
  9. Export to Premiere; open the package in Premiere (Project panel). Word by word: one clip per word on V2, colours as in the preview; compare one word's first frame with the editor's.
- [ ] **Step 3: Check the call budget** in the browser's Network tab: opening the editor adds one `/transcripts` request; a run is one POST, then one status + one transcripts request per 1.5 s until done; nothing per caption.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(editor): auto captions end-to-end fixes"
```

---

## Self-review notes

- Spec §2 states → Tasks 8 (failed/no-sound/new take data), 11 (lane + panel UI); §3–4 → Tasks 5–7; §5 → Tasks 1–2; §6 → Tasks 2, 9, 10; §7 → Tasks 1, 10, 11; §8 → Task 3 (+ probe already committed); §9 → Task 11; §10 → Task 4; §12 tests → each task; §13 → Task 12.
- `dimColor` over the Boxed preset's `#111111` is `#7c7c7c`, used in Tasks 1 and 3.
- Types used across tasks: `TranscriptWord {t,s,e,p}`, `CaptionWord {text,at,duration}`, `WordFrame {text,start,end,charStart,charEnd}`, `TranscribeJobInput`, `TranscribeStatus`, `useAutoCaptionsContext()` → `{ cost, start, listening, failed, stale, busy }`.
