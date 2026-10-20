# Rough Cut Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A canvas Editor node that assembles connected Video Gen and Dubbing clips into a trimmed, captioned reel on a full page, and exports it as a Premiere Pro package.

**Architecture:** The edit is a JSON document in its own table (`editor_edits`), keyed to the Editor node and saved under the canvas lock. Pure TypeScript modules in `src/lib/editor/` do all the timing work: timeline maths in seconds, captions tied to pieces, reconciling the edit with the current sources, and the sequence plan in frames. The writers are ported from the spike. Media facts are measured on the server from file headers with mediabunny and cached in `media_facts`. The package is built by a Trigger.dev task that tracks progress in a `background_jobs` row, and the page polls that row.

**Tech Stack:** Next 16 (app router, async `params`), React 19, zustand (vanilla stores), TanStack Query v5, Supabase (service-role client), Trigger.dev v4, GCS, zod v4, vitest, `mediabunny@1.61.2`, `fflate@0.8.3`, shadcn (Base UI registry), Lucide.

**Spec:** [docs/superpowers/specs/2026-10-20-rough-cut-editor-design.md](../specs/2026-10-20-rough-cut-editor-design.md) (approved 2026-10-20). Decisions **D387–D393** in [the ADR log §7](../specs/2026-05-30-creativeos-staging-roadmap.md). Handoff: [2026-10-20-rough-cut-editor-HANDOFF.md](2026-10-20-rough-cut-editor-HANDOFF.md). Mockups: https://claude.ai/artifact/SseUKVaihCKMsHZscoQDCR.

## Global Constraints

- Work on branch `feat/rough-cut-editor` in `.claude/worktrees/rough-cut-build`. Push only with `git push -u origin feat/rough-cut-editor`, and only when the user asks.
- **Never `git merge` or `git cherry-pick` spike commit `216ed101`** (D393). Port a spike file with `git checkout spike/rough-cut-editor -- <spike path>`, then `git mv` it to its product path.
- Migration number **0059**. ADRs are D387–D393 and are already written; a task that changes a decision updates its ADR in place.
- Add dependencies pinned exact: `"mediabunny": "1.61.2"`, `"fflate": "0.8.3"`.
- **Trims and caption anchors are stored in seconds.** Frames exist only inside `sequence-plan.ts` and the writers (D390).
- Package names, verbatim: folder `creativeos-reel/`, zip `creativeos-reel.zip`, sequence `CreativeOS Rough Cut`, files `creativeos-premiere.xml`, `timeline.otio`, `captions.srt`, `manifest.json`, `README.txt`, `media/`, `fonts/`.
- The opening instruction is always **"Drag creativeos-premiere.xml into Premiere's Project panel."** Never write "File > Import" for the XML.
- Every interactive control is a shadcn primitive from `src/components/ui/`, composed with `render`, never `asChild`. Lucide icons only, stroke 1.5. Colours only through the CSS variables in `globals.css`. Motion easing is `cubic-bezier(0.22,1,0.36,1)`.
- The caption fonts (D392) render only in captions on the stage and in the package. They are never used for UI chrome.
- API routes use `apiError` / `apiOk`, `withCanvas` and `withTryCatch` from `src/lib/api/route-helpers.ts`, and never throw.
- Browser data goes through three layers: `src/services/editor.service.ts`, then `src/hooks/queries/editor.ts` (key factory `editorKeys`), then components.
- Performance rules (AGENTS.md): nothing per item; O(1) per-node selectors; never write when nothing changed; no file bytes in task payloads or route bodies; independent queries run in `Promise.all`.
- Next 16: `params` is a Promise. A `route.ts` cannot sit in the same segment as a `page.tsx`.
- Trigger task style B (as in `trigger/archive-reference.ts`): import from `"@trigger.dev/sdk"`, and dynamically import every `server-only` module inside `run`.
- Commands: `npx vitest run <path>`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

The five inputs most likely to bite a user that the spec implies but doesn't spell out. Each is pinned by a test in the task named.

1. **A lip-synced file with another frame rate or a slightly shorter length** than the original (fal `sync_mode: "cut_off"`). The export must never ask Premiere for frames past the end of a file: the piece ends at the shorter file's last frame. Test: Task 7, "clamps a piece to a shorter lip-synced picture".
2. **Windows SRT files** with CRLF line endings, a UTF-8 BOM and short fractions (`,5`). These must import exactly. Test: Task 4, "parses CRLF, BOM and short fractions".
3. **A caption in a script its font lacks**, for example Hindi on a Hindi dub in Montserrat. The props panel warns, and names Poppins as the font that covers it. Test: Task 4, "knows which fonts cover Devanagari"; the warning is shown in Task 21.
4. **A source disconnected and reconnected between two openings of the editor.** Its edge id changes. It must come back as a fresh full-length piece, never with its old trims. Test: Task 6, "brings a reconnected source back fresh".
5. **A source file that can't be read** (deleted, 404). The editor shows it as unreadable, the export refuses and names the clip, and no job or zip is created. Tests: Task 7, "refuses when a used file can't be read"; Task 11, "a failed probe returns null and is not cached".

## Spike files: what is ported

| Spike file (`src/lib/rough-cut-spike/…` unless shown) | Product file | Task |
|---|---|---|
| `xml-node.ts` | `src/lib/editor/xml-node.ts` (as is) | 1 |
| `premiere-title.ts` | `src/lib/editor/premiere-title.ts` (input becomes `TitleSpec`) | 1 |
| `__tests__/caption-probe.test.ts` | `src/lib/editor/__tests__/caption-probe.test.ts` (env vars renamed) | 1 |
| `timeline.ts` | `src/lib/editor/timeline.ts` (rewritten to seconds) | 3 |
| `srt.ts` | `src/lib/editor/srt.ts` (cue type; fraction bug fixed) | 4 |
| `probe.ts` | `src/lib/editor/probe.ts` (`Source` input, Node) | 5 |
| `premiere-xml.ts` + `__tests__/premiere-xml.test.ts` | `src/lib/editor/premiere-xml.ts` + test (input becomes `SequencePlan`) | 8 |
| `otio.ts` | `src/lib/editor/otio.ts` (dub track, gaps) | 9 |
| `export-package.ts` | logic only, into `src/lib/editor/package.ts` | 9 |
| `silence.ts` | `src/lib/editor/silence.ts` (split into pure parts) | 20 |
| `src/components/rough-cut-spike/use-sequence-playback.ts` | `src/hooks/use-reel-playback.ts` (picture and sound switching) | 18 |
| `timeline-ruler.tsx`, `timeline-clip.tsx`, `timeline-lanes.tsx` (components) | pointer code reused in `src/components/editor/editor-timeline-*.tsx` | 19 |
| `caption-block.tsx`, `caption-overlay.tsx` (components) | `editor-caption-block.tsx`, `editor-caption-overlay.tsx` | 21 |
| `types.ts`, `export-package.ts` browser zip, panels, `rough-cut-spike.tsx`, `src/app/spike/**` | **not ported** | — |

## File structure

**Pure library, `src/lib/editor/`** (no React, no I/O unless marked):
- `xml-node.ts`, `premiere-title.ts`, `premiere-xml.ts`, `otio.ts`, `srt.ts`: the writers.
- `caption-fonts.ts`: the font list, PostScript names, and script coverage.
- `types.ts`: the edit document, its zod schema, media facts and the editor state types.
- `timeline.ts`: piece maths in seconds.
- `captions.ts`: captions tied to pieces, plus SRT attach and export.
- `shot-order.ts`, `sources.ts`, `reconcile.ts`: from canvas graph and edit to the current reel.
- `sequence-plan.ts`: edit and sources to a frame-exact plan. The only place frames are computed.
- `package.ts`: zip entries, README and manifest.
- `export-run.ts`: the export, with injected I/O.
- `generation-lock.ts`: the lock index and its copy.
- `rules.ts`: one Editor per canvas, and connect refusals.
- `playback.ts`, `pieces.ts`, `timeline-scale.ts`, `summary.ts`, `export-copy.ts`: small pure helpers for the UI.
- `silence.ts`: quiet-section maths (browser decode, pure analysis).
- Server-only: `probe.ts` (mediabunny), `media-facts.ts`, `load-state.ts`, `font-files.ts`, `lock-guard.ts`.

**Data:** `supabase/migrations/0059_rough_cut_editor.sql`; `src/lib/db/editor-edits.ts`, `media-facts.ts`, `generation-lock.ts`; additions to `edges.ts` and `nodes.ts`.

**Routes:** `src/app/api/canvases/[cid]/editor/route.ts` (GET, PATCH), `…/editor/exports/route.ts` (POST), `…/editor/exports/[jobId]/route.ts` (GET). **Task:** `trigger/editor-export.ts`.

**Page:** `src/app/clients/[id]/canvases/[cid]/edit/page.tsx` and `loading.tsx`. **Components:** `src/components/editor/*.tsx`, plus `src/components/nodes/editor-node.tsx` and `editor-node-strip.tsx`. **Hooks:** `src/hooks/use-reel-playback.ts`, `use-editor-autosave.ts`, `use-editor-shortcuts.ts`, `use-generation-lock.ts`, `use-lock-handoff-navigation.ts`.

**Fonts:** `src/fonts/captions/*.ttf` plus each family's `OFL.txt`.

---

# Phase A — Pure library (writers and models)

### Task 1: Port the XML primitives and the Premiere title writer

**Files:**
- Port: spike `xml-node.ts` → `src/lib/editor/xml-node.ts` (unchanged)
- Port: spike `premiere-title.ts` → `src/lib/editor/premiere-title.ts`
- Port: spike `__tests__/caption-probe.test.ts` → `src/lib/editor/__tests__/caption-probe.test.ts`
- Test: `src/lib/editor/__tests__/premiere-title.test.ts`

**Interfaces:**
- Produces: `x`, `serialize`, `rate`, `timecode`, `rateParts(fps): { timebase: number; ntsc: boolean }`, `type XNode` (xml-node.ts, as in the spike).
- Produces: `type TitleSpec = { text: string; fontPostScript: string; sizePx: number; color: string; x: number; y: number }`.
- Produces: `titleClipitem(opts: { n: number; title: TitleSpec; start: number; end: number; fps: number; width: number; height: number }): XNode`.
- Produces: `sourceTextJson(text: string, style: Pick<TitleSpec, "fontPostScript" | "sizePx" | "color">)`, `encodeSourceText(json: unknown): string`, and `hexToInt(hex: string): number`.

- [ ] **Step 1: Write the failing test** `premiere-title.test.ts`. Move the spike's title-encoding test here (premiere-xml.test.ts #6), and add the rest:

```ts
it("encodes title text the way Premiere stores it (u32 byte length, 4 zero bytes, UTF-16LE JSON)", () => {
  const b64 = encodeSourceText(sourceTextJson("Hello\nworld", { fontPostScript: "Montserrat-ExtraBold", sizePx: 56, color: "#ffffff" }));
  const bytes = Buffer.from(b64, "base64");
  expect(bytes.readUInt32LE(0)).toBe(bytes.length - 8);
  expect(bytes.readUInt32LE(4)).toBe(0);
  const sheet = JSON.parse(bytes.subarray(8).toString("utf16le")).mTextParam.mStyleSheet;
  expect(sheet.mText).toBe("Hello\rworld");
  expect(sheet.mFontName).toEqual([[0, "Montserrat-ExtraBold"], [11, "Montserrat-ExtraBold"]]);
  expect(sheet.mFillColor[0]).toEqual([0, 0xffffff]);
  expect(sheet.mBackFillVisible).toBe(false);
  expect(sheet.mShadowVisible).toBe(true);
});
it("writes one Graphic clipitem with Position as x:y", () => {
  const xml = serialize(titleClipitem({ n: 1, title: { text: "Hi", fontPostScript: "Anton-Regular", sizePx: 80, color: "#ff8800", x: 0.25, y: 0.3 }, start: 24, end: 72, fps: 24, width: 720, height: 1280 }));
  expect(xml).toContain("<mediaSource>GraphicAndType</mediaSource>");
  expect(xml).toContain("<start>24</start>");
  expect(xml).toContain("<end>72</end>");
  expect(xml).toContain("-91445760000000000,0.25:0.3,0,0,0,0,0,0,5,4,0,0,0,0");
});
it("reads colours and rates", () => {
  expect(hexToInt("#ff8800")).toBe(0xff8800);
  expect(hexToInt("bad")).toBe(0xffffff);
  expect(rateParts(23.976)).toEqual({ timebase: 24, ntsc: true });
  expect(rateParts(25)).toEqual({ timebase: 25, ntsc: false });
});
```
(The JSON path follows the spike's test; take it from there if it nests differently.)

- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/premiere-title.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Port the three files** with `git checkout spike/rough-cut-editor -- <path>` and `git mv`. In `premiere-title.ts`, replace the `SpikeCaption` / `CaptionStyle` inputs with `TitleSpec`. Keep every Premiere constant (`PARAM_TIME`, `GRAPHIC_DURATION`, the shadow values, `mBackFillVisible: false`). In the probe test, rename the env vars to `EDITOR_PROBE_OUT` and `EDITOR_PREMIERE_SAMPLE` and keep `describe.skipIf`.
- [ ] **Step 4: Run** the same command. Expected: PASS (the probe test is skipped).
- [ ] **Step 5: Commit**: `feat(editor): port Premiere XML primitives and title writer from the spike (D392, D393)`

### Task 2: Caption fonts (vendored, listed, verified)

**Files:**
- Create: `src/fonts/captions/` with `Montserrat-ExtraBold.ttf`, `Poppins-Bold.ttf`, `BebasNeue-Regular.ttf`, `Anton-Regular.ttf`, `PlayfairDisplay-Bold.ttf`, plus `Montserrat-OFL.txt`, `Poppins-OFL.txt`, `BebasNeue-OFL.txt`, `Anton-OFL.txt`, `PlayfairDisplay-OFL.txt`
- Create: `src/lib/editor/caption-fonts.ts`, `src/lib/editor/font-name.ts`, `src/components/editor/caption-font-faces.tsx`
- Test: `src/lib/editor/__tests__/caption-fonts.test.ts`

**Interfaces:**
- Produces:
```ts
export const CAPTION_FONTS = [
  { key: "montserrat", label: "Montserrat", postScript: "Montserrat-ExtraBold", file: "Montserrat-ExtraBold.ttf", licence: "Montserrat-OFL.txt", scripts: ["latin"] },
  { key: "poppins", label: "Poppins", postScript: "Poppins-Bold", file: "Poppins-Bold.ttf", licence: "Poppins-OFL.txt", scripts: ["latin", "devanagari"] },
  { key: "bebas-neue", label: "Bebas Neue", postScript: "BebasNeue-Regular", file: "BebasNeue-Regular.ttf", licence: "BebasNeue-OFL.txt", scripts: ["latin"] },
  { key: "anton", label: "Anton", postScript: "Anton-Regular", file: "Anton-Regular.ttf", licence: "Anton-OFL.txt", scripts: ["latin"] },
  { key: "playfair-display", label: "Playfair Display", postScript: "PlayfairDisplay-Bold", file: "PlayfairDisplay-Bold.ttf", licence: "PlayfairDisplay-OFL.txt", scripts: ["latin"] },
] as const;
export type CaptionFontKey = (typeof CAPTION_FONTS)[number]["key"];
export const CAPTION_FONT_KEYS: readonly CaptionFontKey[];
export function captionFont(key: CaptionFontKey): (typeof CAPTION_FONTS)[number];
/** false when the text has Devanagari (U+0900–U+097F) and the font lacks "devanagari". */
export function fontCoversText(key: CaptionFontKey, text: string): boolean;
export const CAPTION_DEFAULTS = { font: "montserrat", size: 84, color: "#ffffff", x: 0.5, y: 0.82, duration: 2 } as const;
```
- Produces: `readPostScriptName(ttf: Uint8Array): string | null`, which reads name ID 6 from the `name` table (`font-name.ts`).
- Produces: `CAPTION_FONT_CSS: Record<CaptionFontKey, string>` (each `next/font/local` face's CSS family), in `caption-font-faces.tsx`, following `src/components/nodes/post-fonts.tsx`.

`size` is pixels on a frame 1080 px on its short edge, as in D123. The default of 84 equals the spike's verified 56 px on a 720-wide frame.

- [ ] **Step 1: Write the failing test.** For each entry:
  - the `.ttf` and the licence file exist under `src/fonts/captions/`;
  - `readPostScriptName(bytes) === entry.postScript`.

  Then: `fontCoversText("montserrat", "नमस्ते") === false`, `fontCoversText("poppins", "नमस्ते") === true`, `fontCoversText("anton", "Hello") === true`, and `CAPTION_FONT_KEYS.length === 5` and includes `CAPTION_DEFAULTS.font`.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/caption-fonts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Vendor the fonts.**
  - Take each **static** TTF from `github.com/google/fonts` `ofl/<family>/` where a static file exists (Poppins, Bebas Neue, Anton).
  - For the families published there only as variable fonts (Montserrat, Playfair Display), take the static `ttf` build from the upstream repository linked on the family's Google Fonts page.
  - Copy each family's `OFL.txt` alongside.
  - Implement both modules. The `name` table is big-endian; platform 3 records are UTF-16BE, platform 1 records are Latin-1.
  - Write `caption-font-faces.tsx` with one `localFont({ src: "../../fonts/captions/<file>", display: "swap" })` per font.
- [ ] **Step 4: Run** the same test. Expected: PASS. A wrong PostScript name means the wrong file: replace the file, never the constant.
- [ ] **Step 5: Commit**: `feat(editor): caption font list, vendored static TTFs with licences (D392)`

### Task 3: The edit document and timeline maths in seconds

**Files:**
- Create: `src/lib/editor/types.ts`
- Port and rewrite: spike `timeline.ts` → `src/lib/editor/timeline.ts`
- Test: `src/lib/editor/__tests__/timeline.test.ts`, `src/lib/editor/__tests__/types.test.ts`

**Interfaces:**
- Consumes: `CaptionFontKey`, `CAPTION_FONT_KEYS` (Task 2).
- Produces (`types.ts`):
```ts
export const REEL_SHAPES = ["9:16", "16:9"] as const; export type ReelShape = (typeof REEL_SHAPES)[number];
export type PictureChoice = "original" | "lipSynced"; export type SoundChoice = "original" | "dubbed";
export type EditSource = { nodeId: string; edgeId: string; versionId: string };
/** in/out: SOURCE seconds, out exclusive, snapped to the picture file's frame grid. */
export type Piece = { id: string; sourceNodeId: string; in: number; out: number; picture: PictureChoice; sound: SoundChoice };
/** at: SOURCE seconds in its piece's source; size: px on a 1080 short edge; x/y: centre, 0–1. */
export type Caption = { id: string; pieceId: string; at: number; duration: number; text: string; x: number; y: number; font: CaptionFontKey; size: number; color: string };
export type EditDoc = { v: 1; shape: ReelShape; sources: EditSource[]; pieces: Piece[]; captions: Caption[] };
/** finite numbers; in ≥ 0; out > in; duration ≥ 0.2; x,y ∈ [0,1]; color /^#[0-9a-f]{6}$/i; size 8–400; text ≤ 500 chars; ≤ 500 pieces; ≤ 1000 captions */
export const EditDocSchema: z.ZodType<EditDoc>;
export type MediaFacts = { durationSeconds: number; video: { fps: number; frames: number; width: number; height: number } | null; audio: { channels: number; sampleRate: number } | null };
export type MediaFile = { url: string; facts: MediaFacts | null }; // null facts: couldn't be read
export type SourceKind = "video-gen" | "dubbing";
export type SourceView = { nodeId: string; edgeId: string; kind: SourceKind; handle: string; title: string; versionId: string; shotOrder: number | null; shotLabel: string | null; language: string | null; files: { original: MediaFile; lipSynced: MediaFile | null; dubAudio: MediaFile | null } };
export type EditorNoticeKind = "removed" | "trimmed" | "picture-fallback" | "sound-fallback" | "unreadable" | "no-take";
export type EditorNotice = { kind: EditorNoticeKind; sourceNodeId: string; message: string };
export type EditorState = { canvasId: string; editorNodeId: string; editorTitle: string; doc: EditDoc; changed: boolean; notices: EditorNotice[]; sources: SourceView[] };
export type GenerationLock = "editor" | "dub";
```
- Produces (`timeline.ts`):
  - `snap(seconds, fps): number`
  - `pieceSeconds(p): number`
  - `totalSeconds(pieces): number`
  - `pieceOffsets(pieces): number[]`
  - `locate(pieces, t): { index; local; offset } | null`
  - `setTrim(pieces, id, edge: "in" | "out", seconds, limit: { duration: number; fps: number }): Piece[]`
  - `splitPiece(pieces, id, sourceSeconds, newId, fps): Piece[] | null`
  - `movePiece(pieces, from, to): Piece[]`
  - `formatTime(seconds): string` (`MM:SS.ss`)

- [ ] **Step 1: Write the failing tests.** Fixture at 24 fps: `A{in 0, out 121/24}`, `B{in 0.4, out 3.75}`, `C{in 1, out 2}`.
```ts
it("locates half-open, last piece inclusive", () => {
  expect(locate(ps, 0)?.index).toBe(0);
  expect(locate(ps, 121 / 24)?.index).toBe(1);
  expect(locate(ps, totalSeconds(ps))?.index).toBe(2);
  expect(locate(ps, -1)).toBeNull();
});
it("snaps trims to the picture's frames, clamps, keeps one frame", () => {
  const lim = { duration: 121 / 24, fps: 24 };
  expect(setTrim(ps, "B", "in", 0.43, lim)[1].in).toBeCloseTo(10 / 24, 9);
  expect(setTrim(ps, "B", "out", 9, lim)[1].out).toBeCloseTo(121 / 24, 9);
  expect(setTrim(ps, "C", "in", 5, lim)[2].in).toBeCloseTo(2 - 1 / 24, 9);
});
it("returns the same array for a no-op", () => {
  expect(setTrim(ps, "C", "in", 1, { duration: 121 / 24, fps: 24 })).toBe(ps);
  expect(movePiece(ps, 1, 1)).toBe(ps);
});
it("splits strictly inside, copying choices", () => {
  const out = splitPiece(ps, "A", 2.01, "A2", 24)!;
  expect(out.map((p) => p.id)).toEqual(["A", "A2", "B", "C"]);
  expect(out[0].out).toBeCloseTo(2, 9);
  expect(out[1].in).toBeCloseTo(2, 9);
  expect(splitPiece(ps, "A", 0, "x", 24)).toBeNull();
});
it("formats time", () => expect(formatTime(65.5)).toBe("01:05.50"));
```
`types.test.ts`: `EditDocSchema` accepts a valid doc, and rejects `out <= in`, `x: 1.2`, `color: "white"` and an unknown font.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/timeline.test.ts src/lib/editor/__tests__/types.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Port the spike's `timeline.ts` structure (no-op returns the same array; locate is half-open with the last piece inclusive), changed to seconds. `snap` is `Math.round(s * fps) / fps`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(editor): edit document schema and timeline maths in seconds (D390)`

### Task 4: Captions tied to pieces, and SRT

**Files:**
- Create: `src/lib/editor/captions.ts`
- Port: spike `srt.ts` → `src/lib/editor/srt.ts`
- Test: `src/lib/editor/__tests__/captions.test.ts`, `src/lib/editor/__tests__/srt.test.ts`

**Interfaces:**
- Consumes: Task 3 types and `timeline.ts`; `CAPTION_DEFAULTS`, `fontCoversText` (Task 2).
- Produces (`srt.ts`): `type SrtCue = { start: number; end: number; text: string }`, `toSrt(cues: SrtCue[]): string`, `parseSrt(text: string): SrtCue[]`.
- Produces (`captions.ts`). Every function returns the **same doc** for a no-op.
  - `captionTimes(doc, c): { start; end } | null`
    - start = piece offset + clamp(at − in, 0, piece length); end = min(total, start + duration);
    - null when the piece is gone.
  - `addCaption(doc, t, newId): EditDoc`
    - attaches to the piece under `t`;
    - style and position come from the last caption, else `CAPTION_DEFAULTS`;
    - text is `"New caption"`.
  - `retimeCaption(doc, id, start, end): EditDoc`: re-attaches to the piece under the new start; minimum 0.2 s.
  - `placeCaption(doc, id, x, y): EditDoc`: clamps to [0.04, 0.96].
  - `editCaption(doc, id, patch: Partial<Pick<Caption, "text" | "font" | "size" | "color">>): EditDoc`
  - `removeCaption(doc, id): EditDoc`
  - `deletePiece(doc, pieceId): EditDoc`: removes the piece and its captions.
  - `splitPieceInDoc(doc, pieceId, sourceSeconds, newId, fps): EditDoc | null`: captions with `at ≥ split` move to the new piece.
  - `attachCues(doc, cues, newId: () => string): { doc; dropped: number }`: each cue attaches to the piece under its start; cues at or past the end are dropped.
  - `docToCues(doc): SrtCue[]`: reel times, sorted.

- [ ] **Step 1: Write the failing tests.** Fixture: `A{0..4}`, `B{1..3}`; caption `c1{pieceId B, at 1.5, duration 1}`.
  - `captionTimes(c1)` → `{ start: 4.5, end: 5.5 }`.
  - After trimming B's in to 2: c1 starts at 4 (clamped), and its stored `at` stays 1.5.
  - After moving B before A: c1 starts at 0.5 (it moves with its piece).
  - `addCaption(doc, 4.5, "c2")`: pieceId B, at 1.5, font `"montserrat"`, size 84, x 0.5, y 0.82. A second add copies c2's font, size, colour and x/y.
  - `retimeCaption(doc, "c1", 1, 2)`: pieceId A, at 1, duration 1. With `(1, 1.05)`: duration 0.2.
  - `deletePiece(doc, "B")` leaves no captions.
  - `splitPieceInDoc(doc, "B", 2, "B2", 24)`: c1 stays on B; a caption at 2.5 moves to B2.
  - `attachCues` with cues at 4.2 and 99: the first goes to B with at 1.2; `dropped === 1`.
  - `placeCaption(doc, "c1", c1.x, c1.y)` `toBe(doc)`.
  - **Review Focus 3**, "knows which fonts cover Devanagari": Montserrat false, Poppins true for `"नमस्ते"`.

  SRT:
  - `toSrt([{ start: 1, end: 2.5, text: "Hi" }]) === "1\n00:00:01,000 --> 00:00:02,500\nHi\n"`.
  - **Review Focus 2**, "parses CRLF, BOM and short fractions": `parseSrt("﻿1\r\n00:00:01,5 --> 00:00:02,000\r\nHi\r\nthere\r\n")` equals `[{ start: 1.5, end: 2, text: "Hi\nthere" }]`.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/captions.test.ts src/lib/editor/__tests__/srt.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Port `srt.ts`: strip a leading BOM, split cues on `/\r?\n\r?\n/`, and right-pad the fraction to 3 digits. Write `captions.ts` over `timeline.ts`; `splitPieceInDoc` uses `splitPiece`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(editor): captions belong to pieces; SRT import/export (D392)`

### Task 5: Measure media facts from file headers (mediabunny, Node)

**Files:**
- Modify: `package.json` (add `"mediabunny": "1.61.2"`)
- Port: spike `probe.ts` → `src/lib/editor/probe.ts`
- Test: `src/lib/editor/__tests__/probe.test.ts`

**Interfaces:**
- Consumes: `MediaFacts` (Task 3).
- Produces:
  - `probeMedia(source: Source): Promise<MediaFacts>`, where `Source` is mediabunny's type;
  - `probeMediaUrl(url: string): Promise<MediaFacts>`, which is `probeMedia(new UrlSource(url))`;
  - `class MediaReadError extends Error`.

Measured on 2026-10-20 (ADR D391): `UrlSource` read about 288 KB of a 5.15 MB CreativeOS clip in two range requests, and gave 24 fps, 121 frames, 720×1280, stereo at 32 kHz.

- [ ] **Step 1: Write the failing test.** In `beforeAll`, generate the fixtures into a temp dir. Use `process.env.FFMPEG_PATH ?? (await import("ffmpeg-static")).default`, the same binary lookup as `src/lib/media/__tests__/ffmpeg.test.ts`.
  - `clip.mp4`: `-f lavfi -i testsrc=size=720x1280:rate=24 -f lavfi -i sine=frequency=440:sample_rate=32000 -ac 2 -frames:v 121 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest`
  - `dub.wav`: `-f lavfi -i sine=frequency=330:sample_rate=44100 -ac 2 -t 5`

  Assertions:
  - `probeMedia(new BufferSource(mp4))` → `video: { fps: 24, frames: 121, width: 720, height: 1280 }`, `audio: { channels: 2, sampleRate: 32000 }`, `durationSeconds` close to 5.0417 (2 places).
  - The WAV → `video: null`, `audio: { channels: 2, sampleRate: 44100 }`, duration close to 5.
  - Random bytes reject with `MediaReadError`.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/probe.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Port the spike's two functions into one `probeMedia`:
    - video fps is `computeFrameRateMetrics().bestGuessFrameRate`;
    - frames is `round((computeDuration() − getFirstTimestamp()) × fps)`;
    - `durationSeconds` is the video track's span, or the audio track's span for audio-only files.
  - Wrap any failure in `MediaReadError`, and always `input.dispose()`.
  - `npm install mediabunny@1.61.2 --save-exact`.
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(editor): measure media facts from file headers with mediabunny (D391)`

### Task 6: Sources, shot order, and reconciling the edit

**Files:**
- Create: `src/lib/editor/shot-order.ts`, `src/lib/editor/sources.ts`, `src/lib/editor/reconcile.ts`
- Test: `src/lib/editor/__tests__/shot-order.test.ts`, `sources.test.ts`, `reconcile.test.ts`

**Interfaces:**
- Consumes:
  - `findAncestorOfType(nodeId, nodes, edges, type, maxDepth)` (`src/lib/canvas/graph.ts`);
  - `readDubbingOutput` (`src/lib/dubbing/types.ts`);
  - `nodeHandle`, `describeNode` (`src/lib/nodes/describe-node.ts`);
  - `AppNode` (`src/lib/canvas-nodes.ts`);
  - Task 3 types and timeline.
- Produces:
  - `shotOrderOf(nodeId: string, nodes: AppNode[], edges: Edge[]): { order: number | null; label: string | null }`
    - a Dubbing node starts from its first incoming Video Gen;
    - looks for the nearest `"shot"`, then `"multishot"`, ancestor (max depth 5);
    - order is that node's `data.order`; label is `` `Shot ${order}` ``.
  - `type IncomingEdge = { id: string; sourceNodeId: string; createdAt: string }`
  - `type SourceDraft = Omit<SourceView, "files"> & { urls: { original: string; lipSynced: string | null; dubAudio: string | null } }`
  - `sourceDrafts(a: { incoming: IncomingEdge[]; nodes: AppNode[]; edges: Edge[]; activeVersionOf: (nodeId: string) => string | null }): { drafts: SourceDraft[]; notices: EditorNotice[] }`
  - `attachFacts(drafts: SourceDraft[], facts: Map<string, MediaFacts | null>): SourceView[]`
  - `reconcile(prev: EditDoc | null, sources: SourceView[], newId: () => string): { doc: EditDoc; notices: EditorNotice[] }`. It returns **`prev` itself** when nothing changes.
  - `pieceLimit(piece: Piece, source: SourceView): { duration: number; fps: number } | null`: the chosen picture file's facts.

**Rules:**
- **Drafts:**
  - Incoming edges are taken in `createdAt` order, and only from video-gen and dubbing sources.
  - A Video Gen needs a string `data.parsed`. A Dubbing node needs a non-null `readDubbingOutput(data.parsed)`, and maps original, lipSynced, and `dubbedAudio` as dubAudio.
  - A source with neither is skipped, with a `no-take` notice.
- **Reconcile:**
  1. Drop the doc's sources, pieces and captions whose node is no longer a source, or whose `edgeId` differs (it was reconnected). One `removed` notice per dropped source.
  2. Where `versionId` changed, clamp each piece to `pieceLimit` (a `trimmed` notice if anything moved). A `lipSynced` picture the new version lacks becomes `original` (`picture-fallback`); a `dubbed` sound with no dubAudio becomes `original` (`sound-fallback`).
  3. A new source whose original file has `facts === null` gets no piece and an `unreadable` notice. Otherwise it gets one full-length piece `{ in 0, out: duration, original, original }`. It goes before the first existing piece whose source's `shotOrder` is greater (null counts as +∞); shotless sources go at the end, in connection order.
  4. With no prev, shape is `"9:16"` when the first piece's picture has height > width, else `"16:9"`. With no pieces, `"9:16"`.

**Notice copy (exact):**
- removed: `"A source was disconnected, so its pieces left the reel."`
- trimmed: `` `${handle} switched to a shorter version, so its trims were pulled in to fit.` ``
- picture-fallback: `` `${handle}'s current version has no lip-synced video, so its pieces show the original picture.` ``
- sound-fallback: `` `${handle}'s current version has no dub, so its pieces play the original sound.` ``
- unreadable: `` `Couldn't read ${handle}'s clip, so it isn't on the timeline. Reopen the editor to try again.` ``
- no-take: `` `${handle} has no finished take yet, so it isn't on the timeline.` ``

- [ ] **Step 1: Write the failing tests.**
  - **shot-order:**
    - shot(order 2) → video-prompt → video-gen gives `{ order: 2, label: "Shot 2" }`;
    - a dubbing node behind that video-gen gives the same;
    - multishot(order 1) → multishot-prompt → video-gen gives 1;
    - a lone video-gen gives `{ order: null, label: null }`.
  - **sources:**
    - drafts come in `createdAt` order;
    - a take-less Video Gen gives a `no-take` notice and no draft;
    - a Dubbing draft's `urls.dubAudio === output.dubbedAudio`.
  - **reconcile:**
    - first open: pieces follow [shot 1, shot 2, then shotless in connection order], each `0..duration`; shape is `"9:16"` for 720×1280 and `"16:9"` for 1280×720;
    - "removes a disconnected source with its captions";
    - **Review Focus 4**, "brings a reconnected source back fresh": prev X has edge `e1` and a piece 1..2; current X has edge `e2` → exactly one X piece, `0..duration`, at its shot position;
    - "pulls trims in for a shorter version": out 4.5 with a new duration of 3 → out 3, plus a `trimmed` notice with the exact copy;
    - "falls back when lip sync or dub disappears", for both fallbacks;
    - "inserts a new source by shot order into a user-reordered reel";
    - "an unreadable new source gets no piece" (`unreadable` notice);
    - "unchanged inputs return prev": `toBe(prev)`, and notices are `[]`.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/shot-order.test.ts src/lib/editor/__tests__/sources.test.ts src/lib/editor/__tests__/reconcile.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three modules to the rules above.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(editor): sources in shot order; reconcile the edit with connections and versions (D389, D390)`

### Task 7: The sequence plan (the only place frames are computed)

**Files:**
- Create: `src/lib/editor/sequence-plan.ts`
- Test: `src/lib/editor/__tests__/sequence-plan.test.ts`

**Interfaces:**
- Consumes: Task 3 types; `captionTimes` (Task 4); `captionFont` (Task 2); `TitleSpec` (Task 1); `pieceLimit` (Task 6).
- Produces:
```ts
export const SEQUENCE_NAME = "CreativeOS Rough Cut";
export const STANDARD_FRAME: Record<ReelShape, { width: number; height: number }> = { "9:16": { width: 1080, height: 1920 }, "16:9": { width: 1920, height: 1080 } };
export type PlanMedia = { id: number; url: string; fileName: string; kind: "video" | "audio"; role: "take" | "lip-synced" | "dub-audio"; facts: MediaFacts; sourceHandle: string };
export type PlanClip = { label: string; start: number; end: number; picture: { media: number; in: number }; sound: { media: number; in: number; channels: number } | null; dub: { media: number; in: number; out: number; channels: number } | null; scale: number | null };
export type PlanTitle = TitleSpec & { start: number; end: number; fontKey: CaptionFontKey };
export type SequencePlan = { name: string; shape: ReelShape; fps: number; width: number; height: number; sampleRate: number; media: PlanMedia[]; clips: PlanClip[]; titles: PlanTitle[] };
export type PlanResult = { ok: true; plan: SequencePlan } | { ok: false; reason: string };
export function planSequence(doc: EditDoc, sources: SourceView[]): PlanResult;
```

**Rules:**
- **Frame and size:**
  - `fps` is the first piece's picture fps.
  - Frame size is the first picture's size when its shape matches `doc.shape`, else `STANDARD_FRAME[doc.shape]`.
- **Each piece, in sequence frames:**
  - `inF = round(in×fps)`; `len = max(1, round(out×fps) − inF)`;
  - the length is clamped so `inF + len ≤ round(pictureDuration×fps)`;
  - `start` is the running cursor.
- **Picture, sound and dub:**
  - Picture is the lipSynced or the original file.
  - Sound is always the **original** file, null if it has no audio.
  - `dub` is set only when `sound === "dubbed"`: dubAudio, with `out = min(inF + len, round(dubDuration×fps))`.
- **Scale:** `scale = round2(min(W/w, H/h) × 100)` when the picture size differs from the frame size, else null.
- **Media:** de-duplicated by URL and numbered in first-use order. `fileName` is `` `${n:03}_${safe(handle)}_${role}${ext}` ``, where `safe` replaces `/[^A-Za-z0-9_.-]/g` with `_` and `ext` comes from the URL path (default `.mp4`).
- **Titles:**
  - times from `captionTimes`, rounded to frames; titles with `end ≤ start` are dropped;
  - `sizePx = round(size × min(W,H) / 1080)`;
  - `fontPostScript` from `captionFont`.
- **Sample rate:** the first audio media's sample rate, else 48000.
- **Refusals (exact):**
  - no pieces: `"Add a clip to the timeline first."`;
  - any used file with `facts === null`: `` `Couldn't read ${handle}'s ${roleLabel}, so the reel can't be exported. Reopen the editor to try again.` ``, where roleLabel is `"clip"`, `"lip-synced video"` or `"dub"`.

- [ ] **Step 1: Write the failing tests.** Fixtures are 24 fps, 121 frames, 720×1280, stereo 32 kHz.
  - "places pieces end to end at the source rate": pieces A 0..121/24, B 10/24..100/24, A 50/24..80/24 → fps 24; B `start 121, end 211, picture.in 10`; size 720×1280.
  - "names media in first-use order": `["001_VID-AAAA_take.mp4", "002_VID-BBBB_take.mp4"]`.
  - "takes lip-synced picture with original sound": picture.media is the lip-synced id; sound.media is the original id; dub null.
  - "puts a chosen dub on the plan, clamped to the dub's length": a 5.0 s WAV → `dub.out === 120`.
  - **Review Focus 1**, "clamps a piece to a shorter lip-synced picture": lip-synced at 25 fps and 4.90 s, piece 0..121/24 → `end − start === 118`.
  - "scales a 16:9 clip to fit a 9:16 reel": 1280×720 in 720×1280 → `scale 56.25`; same-size clips → `null`.
  - "turns captions into titles": a caption at reel 1–3 s → `start 24, end 72`; one past the end is dropped; `sizePx 56`; `fontPostScript "Montserrat-ExtraBold"`.
  - **Review Focus 5**, "refuses when a used file can't be read": a lip-synced file with null facts → the exact reason, with `"lip-synced video"`.
  - "refuses an empty reel".
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/sequence-plan.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `planSequence` to the rules above.
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(editor): frame-exact sequence plan from the edit (D388, D390)`

### Task 8: Port the Premiere XML writer onto the plan

**Files:**
- Port: spike `premiere-xml.ts` → `src/lib/editor/premiere-xml.ts`
- Port: spike `__tests__/premiere-xml.test.ts` → `src/lib/editor/__tests__/premiere-xml.test.ts`

**Interfaces:**
- Consumes: `SequencePlan` (Task 7); `titleClipitem`, `x`, `serialize`, `rate`, `timecode` (Task 1).
- Produces: `buildPremiereXml(plan: SequencePlan): string`, `mediaUrl(fileName: string): string` (`media/<encodeURIComponent>`), and the re-export `rateParts`.

**Changes from the spike:**
- **Dropped:** `PathMode`, absolute paths, `fileUrl` and `AudioLayout` (D388: relative paths only). Stereo pairing stays `min(2, channels)` tracks.
- **One file element per plan media:** `file-${id}` / `masterclip-${id}`, written in full on first use and by id after that.
- **The video clipitem** uses the picture media's file and masterclip.
- **Audio clipitems** use the sound media's file and masterclip, so picture and sound may come from different files.
- **Dub clipitems** go on the tracks after the originals, with `groupindex 2`. The original audio is `enabled FALSE` when a dub is present.
- **Links** join every clipitem of a clip, matching the spike.
- **Scale:** a clip with `scale !== null` gets a Basic Motion filter:
  `<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype><parameter authoringApp="PremierePro"><parameterid>scale</parameterid><name>Scale</name><valuemin>0</valuemin><valuemax>1000</valuemax><value>{scale}</value></parameter></effect></filter>`
- **Titles** go on V2 through `titleClipitem`.
- **Sequence** name, size, fps and sample rate come from the plan.

- [ ] **Step 1: Write the failing test.** Port the spike's tests 1–5 and 7–9 onto plan fixtures. Keep their numbers: `<timebase>24`, no 25, duration 241, clip 2 `start 121 / end 211 / in 10 / out 100`, 9 unique clipitem ids, 27 `<link>`, each file in full once, 1 GraphicAndType, `clipitem-t1` 24–72, 4 tracks, the dub case's 5 tracks, `clipitem-d1-1` out 120, `clipitem-a1-1` enabled FALSE, `clipitem-a1-2` TRUE. Add:
  - "takes picture and sound from different files": a lip-synced piece's video clipitem references the lip-synced media's `file-N`; its `clipitem-a1-*` references the original's; the links are still 3 per clipitem.
  - "scales only the clip that needs it": exactly one `<effectid>basic</effectid>`, with `<value>56.25</value>`.
  - Keep the `EDITOR_XML_OUT` dump test (no assertions).
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/premiere-xml.test.ts`. Expected: FAIL.
- [ ] **Step 3: Port and adapt** the writer as described.
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(editor): Premiere XML from the sequence plan; separate picture/sound files; fit scaling (D388)`

### Task 9: OTIO writer and the package (README, manifest, zip entries)

**Files:**
- Modify: `package.json` (add `"fflate": "0.8.3"`)
- Port: spike `otio.ts` → `src/lib/editor/otio.ts`
- Create: `src/lib/editor/package.ts`
- Test: `src/lib/editor/__tests__/otio.test.ts`, `src/lib/editor/__tests__/package.test.ts`

**Interfaces:**
- Consumes: `SequencePlan`, `mediaUrl`, `buildPremiereXml`, `toSrt`, `CAPTION_FONTS`.
- Produces:
```ts
export function buildOtio(plan: SequencePlan): string; // tracks: V1 clips; A1 sound (Gap.1 where sound is null); A2 "Dub" (Gap.1 where dub is null)
export const PACKAGE_DIR = "creativeos-reel"; export const PACKAGE_ZIP_NAME = "creativeos-reel.zip"; export const PREMIERE_XML_NAME = "creativeos-premiere.xml";
export function fontsUsed(plan: SequencePlan): CaptionFontKey[];
export function packageReadme(plan: SequencePlan): string;
export function packageManifest(plan: SequencePlan, createdAt: Date): Record<string, unknown>; // generator "creativeos-rough-cut-editor"
export function packageEntries(plan: SequencePlan, bytes: { media: Map<number, Uint8Array>; fonts: Array<{ name: string; bytes: Uint8Array }> }, createdAt: Date): Zippable;
```
**Zip layout, all under `creativeos-reel/`:**
- `creativeos-premiere.xml`, `timeline.otio`, `manifest.json`, `README.txt`
- `captions.srt`, only when there are titles
- `fonts/<file>` plus `fonts/<licence>` for each font used
- `media/<fileName>`, stored as `[bytes, { level: 0 }]`

**README:** exact lines, with the bracketed lines included only when they apply.
```
CreativeOS rough cut: Premiere Pro package

How to open it
1. Unzip this folder somewhere permanent, not a temp folder.
2. Drag creativeos-premiere.xml into Premiere's Project panel.
   Premiere's Import screen doesn't read it.
3. Open the "CreativeOS Rough Cut" sequence. If clips show offline, link one
   clip to the media folder and Premiere finds the rest.

What's in the sequence
- V1: the clips in order, with their trims.
- A1/A2: each clip's own sound, linked to its picture.
[- A3/A4: the dubbed sound, linked to its picture. The original sound is still
  on A1/A2, switched off, so it can be brought back.]
[- V2: the captions as editable Premiere text.
- captions.srt: the same captions as plain text (File > Import gives a plain
  caption track instead).
- fonts/: the caption fonts. Install them if Premiere doesn't have them.]
- media/: exactly the files this reel uses.
```
- [ ] **Step 1: Write the failing tests.**
  - OTIO: V1 has one `Clip.2` per clip. A1's total duration equals V1's, because gaps keep sync (a fix over the spike). A2 has `Gap.1` entries and one `Clip.2` for the dubbed piece. `target_url` is `"media/001_VID-AAAA_take.mp4"`.
  - Package: `unzipSync(zipSync(packageEntries(...)))` has exactly the layout names. Media entries are level 0. There is no `captions.srt` and no `fonts/` without titles. The fonts are only those used. The README contains `"Drag creativeos-premiere.xml into Premiere's Project panel."` and not `"File > Import > creativeos-premiere.xml"`. The manifest has `generator`, `sequence.fps` and `media[].fileName`.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/otio.test.ts src/lib/editor/__tests__/package.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `npm install fflate@0.8.3 --save-exact`.
  - Port the OTIO writer onto the plan. Source ranges are in sequence frames at `plan.fps`; `available_range` comes from facts.
  - Write `package.ts`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(editor): OTIO with dub track and gaps; package layout, README and manifest (D388)`

# Phase B — Data, routes, export

### Task 10: Migration 0059 and the database modules

**Files:**
- Create: `supabase/migrations/0059_rough_cut_editor.sql`
- Create: `src/lib/db/editor-edits.ts`, `src/lib/db/media-facts.ts`, `src/lib/db/generation-lock.ts`
- Modify: `src/lib/db/edges.ts` (add `listIncomingEdges`), `src/lib/db/nodes.ts` (add `getNodeTypeOnCanvas`)
- Test: `src/lib/db/__tests__/editor-db.test.ts` (chained Supabase stubs, as in `src/app/api/canvases/[cid]/client-feedback/route.test.ts`)

**Interfaces:**
- Produces:
  - `getEditorEdit(canvasId: string): Promise<{ nodeId: string; doc: unknown } | null>`
  - `saveEditorEdit(a: { nodeId: string; canvasId: string; doc: EditDoc }): Promise<void>`: upsert on `node_id`; sets `updated_at`.
  - `listMediaFacts(urls: string[]): Promise<Map<string, MediaFacts>>`: no query for `[]`.
  - `saveMediaFacts(rows: Array<{ url: string; facts: MediaFacts }>): Promise<void>`: no call for `[]`.
  - `getEditorGenerationLock(nodeId: string): Promise<GenerationLock | null>`: `rpc("editor_generation_lock", { p_node_id })`.
  - `listIncomingEdges(nodeId: string): Promise<IncomingEdge[]>`: `id, source_node_id, created_at`, ordered by `created_at`.
  - `getNodeTypeOnCanvas(nodeId: string, canvasId: string): Promise<string | null>`

**Migration** (header comment cites D387–D393 and the spec):
```sql
create table editor_edits (
  node_id    uuid primary key references nodes(id) on delete cascade,   -- D390: deleting the node deletes its edit
  canvas_id  uuid not null references canvases(id) on delete cascade,
  org_id     uuid not null references organizations(id),
  doc        jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index editor_edits_canvas_idx on editor_edits (canvas_id);
-- org_id filled from the canvas, as canvas_reviews does (0047)
create or replace function set_editor_edit_org_id() returns trigger language plpgsql as $$
begin if new.org_id is null then select cl.org_id into new.org_id from canvases cv join clients cl on cl.id = cv.client_id where cv.id = new.canvas_id; end if; return new; end; $$;
create trigger editor_edits_set_org_id before insert on editor_edits for each row execute function set_editor_edit_org_id();
alter table editor_edits enable row level security;  -- service-role only

create table media_facts (            -- D391: one row per stored file, measured once
  url              text primary key,
  duration_seconds double precision not null,
  video            jsonb,              -- { fps, frames, width, height }
  audio            jsonb,              -- { channels, sampleRate }
  measured_at      timestamptz not null default now()
);
alter table media_facts enable row level security;

create index if not exists edges_source_node_id_idx on edges (source_node_id);
create index if not exists edges_target_node_id_idx on edges (target_node_id);

-- D389: one round trip for every generate route
create or replace function editor_generation_lock(p_node_id uuid) returns text language sql stable as $$
  select case
    when exists (select 1 from edges e join nodes t on t.id = e.target_node_id
                 where e.source_node_id = p_node_id and t.type = 'editor') then 'editor'
    when exists (select 1 from edges e1 join nodes d on d.id = e1.target_node_id and d.type = 'dubbing'
                 join edges e2 on e2.source_node_id = d.id join nodes t on t.id = e2.target_node_id and t.type = 'editor'
                 where e1.source_node_id = p_node_id) then 'dub'
  end
$$;
```
- [ ] **Step 1: Write the failing tests.**
  - `listMediaFacts([])` makes no `from()` call.
  - Rows map to `MediaFacts` (`duration_seconds` → `durationSeconds`).
  - `getEditorGenerationLock` returns `"editor"`, `"dub"` or `null` from the RPC data, and throws on an RPC error, never returning null (rule 13).
  - `saveEditorEdit` upserts with `onConflict: "node_id"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/db/__tests__/editor-db.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the modules (`createServerSupabase()`, `import "server-only"`) and write the migration file.
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Apply the migration.** Ask the user before applying 0059 to any shared database, then apply it the way 0058 was applied.
- [ ] **Step 6: Commit**: `feat(editor): migration 0059 (editor_edits, media_facts, generation lock function, edge indexes)`

### Task 11: Loading and saving the edit (routes, service, query hooks)

**Files:**
- Create: `src/lib/editor/media-facts.ts`, `src/lib/editor/load-state.ts` (both `server-only`)
- Create: `src/app/api/canvases/[cid]/editor/route.ts` (GET, PATCH) and `route.test.ts`
- Create: `src/services/editor.service.ts`, `src/hooks/queries/editor.ts`
- Test: `src/lib/editor/__tests__/media-facts.test.ts`, `src/lib/editor/__tests__/load-state.test.ts`

**Interfaces:**
- Consumes: Tasks 5, 6 and 10; `listNodes`, `nodeRowToFlow`, `listEdges`, `getCanvasLockHolder`, `isOwnStoredUrl`, `withCanvas`, `withTryCatch`, `readJson`.
- Produces:
  - `ensureMediaFacts(urls: string[], deps?: { list; save; probe }): Promise<Map<string, MediaFacts | null>>`
    - de-duplicates;
    - URLs that aren't ours give null without a probe;
    - probes run 6 at a time;
    - successes are saved in one call; failures give null, are logged, and are not saved.
  - `loadEditorState(canvasId: string): Promise<EditorState | null>`
    1. `Promise.all([listNodes, listEdges, getEditorEdit])`.
    2. Find the `editor` node; return null if there is none.
    3. `listIncomingEdges`, then `sourceDrafts`, then `ensureMediaFacts`, then `attachFacts`.
    4. `EditDocSchema.safeParse(stored.doc)`. **An unparseable stored doc throws `EditUnreadableError`, and never resets to null** (rule 13: it would overwrite the user's edit).
    5. `reconcile`. `changed` is `doc !== prev`.
    6. `editorTitle` is `describeNode(editorNode)`.
  - Routes:
    - `GET /api/canvases/[cid]/editor` → `EditorState`, or 404 `"This canvas has no Editor yet."`.
    - `PATCH` with body `{ nodeId: uuid, sessionId: string, doc: EditDocSchema }`:
      - runs `Promise.all([getCanvasLockHolder, getNodeTypeOnCanvas])`;
      - a type other than editor → 404 `"Editor not found."` (rule 14);
      - a holder other than `sessionId` → 409 `LOCK_LOST_MESSAGE = "Someone else is editing this canvas now, so the editor is read-only."`;
      - otherwise saves and returns `{ ok: true }`.
  - `editorService`:
    - `state(canvasId): Promise<EditorState>`
    - `save(canvasId, body: { nodeId; sessionId; doc }): Promise<void>`
  - `editorKeys`: `all(canvasId) = ["editor", canvasId]`, `state(canvasId)`, `export(canvasId, jobId)`, `quiet(url)`.
  - `useEditorState(canvasId: string, opts?: { initialData?: EditorState; enabled?: boolean })`, with `staleTime: 30_000`.
  - `useSaveEdit(canvasId)`: `onSuccess` calls `setQueryData(state)` with `doc` = the saved doc, `changed: false`, `notices: []`.

- [ ] **Step 1: Write the failing tests.**
  - `ensureMediaFacts`:
    - "cached URLs are not probed";
    - **Review Focus 5**, "a failed probe returns null and is not cached";
    - "a foreign URL is never probed";
    - "duplicates probe once".
  - `load-state` (all db modules mocked):
    - "returns null without an Editor";
    - "throws when the stored doc is unreadable";
    - "reconciles and reports changed".
  - Route:
    - GET 404 without an Editor;
    - PATCH 400 on an invalid doc;
    - PATCH 404 for a node on another canvas;
    - PATCH 409 when the lock holder differs;
    - PATCH saves and returns `{ ok: true }`.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/media-facts.test.ts src/lib/editor/__tests__/load-state.test.ts "src/app/api/canvases/[cid]/editor/route.test.ts"`. Expected: FAIL.
- [ ] **Step 3: Implement** the modules, the route (`withCanvas(req, Promise.resolve({ id: cid }), …)` wrapped in `withTryCatch`), the service and the hooks.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(editor): load and save the edit; media facts measured on first use (D390, D391)`

### Task 12: The export job (Trigger.dev task, routes, polling)

**Files:**
- Modify:
  - `src/lib/jobs/types.ts` (`JobKind` += `"editor-export"`)
  - `src/lib/storage/gcs.ts` (`_put(path, body, contentType, opts?: { contentDisposition?: string })`)
  - `src/lib/storage/paths.ts`, `src/lib/storage/index.ts`
  - `trigger.config.ts` (add `additionalFiles({ files: ["./src/fonts/captions/**"] })` from `@trigger.dev/build/extensions/core`)
- Create:
  - `src/lib/editor/font-files.ts`, `src/lib/editor/export-run.ts`
  - `trigger/editor-export.ts`
  - `src/app/api/canvases/[cid]/editor/exports/route.ts` (POST)
  - `src/app/api/canvases/[cid]/editor/exports/[jobId]/route.ts` (GET), with tests
- Modify: `src/services/editor.service.ts`, `src/hooks/queries/editor.ts`
- Test: `src/lib/editor/__tests__/export-run.test.ts`

**Interfaces:**
- Consumes: Tasks 7–9 and 11; `insertJob`, `getJob`, `startJob`, `setJobPhase`, `succeedJob`, `failJob`, `failStaleJobs`, `setJobRunId`, `JobLockedError`, `JOB_LIVE_STATUSES`.
- Produces:
```ts
export function pathForEditorExport(a: { clientId: string; canvasId: string; nodeId: string; jobId: string }): string; // clients/{c}/canvases/{cv}/nodes/{n}/editor/{job}/creativeos-reel.zip
export async function uploadEditorExport(path: string, bytes: Buffer): Promise<UploadResult>; // contentDisposition: attachment; filename="creativeos-reel.zip"
export async function readCaptionFontFiles(keys: CaptionFontKey[]): Promise<Array<{ name: string; bytes: Uint8Array }>>; // ttf + licence, from path.join(process.cwd(), "src/fonts/captions")
export type ExportJobInput = { canvasId: string; nodeId: string; clientId: string; plan: SequencePlan };
export type ExportSummary = { clips: number; lipSynced: number; dubs: number; captions: number; fonts: number; durationSeconds: number; shape: ReelShape; fps: number };
export type ExportResult = { url: string; fileName: string; bytes: number; summary: ExportSummary };
export class ExportFailure extends Error {} // message is shown to the user as is
export const MAX_PACKAGE_MEDIA_BYTES = 700 * 1024 * 1024;
export async function runEditorExport(input: ExportJobInput, deps: { fetchBytes(url: string): Promise<Uint8Array>; readFonts(keys: CaptionFontKey[]): Promise<Array<{ name: string; bytes: Uint8Array }>>; upload(zip: Uint8Array): Promise<string>; setPhase(message: string): Promise<void>; now(): Date }): Promise<ExportResult>;
export type ExportStatus = { status: JobStatus; phase: string | null; error: string | null; result: ExportResult | null };
```
**Export behaviour:**
- **Phases, in order:** `"Collecting the media…"`, `"Writing the sequence…"`, `"Packaging creativeos-reel.zip…"`.
- **Failure messages (exact):**
  - download failure: `` `Couldn't download ${fileName} (HTTP ${status}).` ``
  - too large: `` `This reel's media is ${mb} MB, more than the 700 MB a package can hold. Remove some clips and try again.` ``
- **Upload is the last step,** and never happens on failure (spec §9: no partial package).
- **Task** `editor-export`: `{ id: "editor-export", machine: "medium-1x", maxDuration: 600, retry: { maxAttempts: 1 } }`.
  - `run({ jobId })`: `getJob`, then `startJob`, then `runEditorExport`, then `succeedJob`.
  - On error: `failJob(jobId, err instanceof ExportFailure ? err.message : "The export failed. Try again.")`, then throw `AbortTaskRunError`.
  - `onFailure`: fail the job with `"The export stopped before it finished. Try again."` only if it is still live (a timeout or out-of-memory).
- **POST `/editor/exports`**, body `{ nodeId }`:
  1. `loadEditorState` (fresh; rule 10). The node must be the Editor, else 404.
  2. `planSequence`. A refusal returns 422 with its reason.
  3. `failStaleJobs(clientId, "editor-export", 15 min)`.
  4. `insertJob({ kind: "editor-export", input: ExportJobInput, lockKey: \`editor-export:${nodeId}\`, phaseMessage: "Queued…" })`. `JobLockedError` → 409 `"An export of this reel is already running."`.
  5. `tasks.trigger("editor-export", { jobId })` (**the job id only**; rule 8), then `setJobRunId`, then `apiOk({ jobId }, 202)`.
  6. If the trigger throws: `failJob` with `"Couldn't start the export. Try again."`, then 502.
- **GET `/editor/exports/[jobId]`:** 404 unless the job's kind is `editor-export` and `input.canvasId === cid`; otherwise returns `ExportStatus`.
- **Client:**
  - `editorService.startExport(canvasId, nodeId)`, `exportStatus(canvasId, jobId)`.
  - `useStartExport(canvasId)`.
  - `useExportStatus(canvasId, jobId: string | null)`, with `refetchInterval: (q) => !q.state.data || JOB_LIVE_STATUSES.has(q.state.data.status) ? 1500 : false`.

- [ ] **Step 1: Write the failing tests.**
  - `export-run`:
    - "zips exactly the layout";
    - "sets the three phases in order";
    - "names the file that failed to download, and never uploads";
    - "refuses a package over 700 MB";
    - "summarises clips, lip-synced videos, dubs, captions and fonts".
  - Routes:
    - POST 422 carries the plan reason;
    - POST 409 on `JobLockedError`;
    - POST 202 triggers with exactly `{ jobId }`;
    - GET 404 for a job on another canvas.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/export-run.test.ts "src/app/api/canvases/[cid]/editor/exports"`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified. `fetchBytes` reads the public URL (as the dub tasks do).
- [ ] **Step 4: Run** the same tests, then `npx tsc --noEmit`. Expected: PASS, and no type errors (the latter covers `trigger/`).
- [ ] **Step 5: Check in dev.** Start `npm run dev`, POST an export for a small edit, and confirm the zip downloads and the fonts are present. This proves `additionalFiles` and `process.cwd()` in the dev runner. Also confirm `npx trigger.dev deploy --dry-run` lists `src/fonts/captions` if the CLI supports it.
- [ ] **Step 6: Commit**: `feat(editor): export package as a Trigger.dev task with polled progress (D391)`

# Phase C — Canvas integration

### Task 13: Hand the canvas lock to the editor and back

**Files:**
- Modify: `src/lib/canvas/lock-session.ts`, `src/lib/canvas/lock-session.test.ts`, `src/hooks/use-canvas-lock.ts`
- Create: `src/hooks/use-lock-handoff-navigation.ts`

**Interfaces:**
- Produces:
```ts
export const LOCK_HANDOFF_MS = 10_000;
export function markLockHandoff(canvasId: string, storage?: ReadWriteStorage | null, nowMs?: number): void; // key "canvas-lock-handoff:<canvasId>"
export function takeLockHandoff(canvasId: string, storage?: (ReadWriteStorage & Pick<Storage, "removeItem">) | null, nowMs?: number): boolean; // true iff a mark < 10 s old existed; always clears it
export function useLockHandoffNavigation(canvasId: string): (href: string, flush: () => Promise<unknown>) => Promise<void>; // await flush → markLockHandoff → router.push(href)
```
- The cleanup of `useCanvasLock`'s heartbeat effect becomes `if (!takeLockHandoff(canvasId)) release();`. The `beforeunload` path is unchanged.

Why (D390): today the canvas sends its release beacon on unmount. Both pages share the tab's session id, so if that beacon lands after the editor page's acquire, it wipes the editor's lock and the editor drops to read-only.

- [ ] **Step 1: Write the failing tests** in `lock-session.test.ts`:
  - "a fresh mark is taken once": mark, take → true; take again → false.
  - **"a stale mark doesn't skip a real release"**: mark at t, take at t + 11 000 → false.
  - "storage that throws": mark doesn't throw; take → false.
- [ ] **Step 2: Run** `npx vitest run src/lib/canvas/lock-session.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both functions (storage injected, as `readOrCreateLockSessionId` is), the cleanup change, and the hook.
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(canvas): hand the editing lock between canvas and editor in one tab (D390)`

### Task 14: The Editor node on the canvas

**Files:**
- Modify:
  - `src/lib/canvas-nodes.ts`: `EditorNodeData = { title?: string }`; `AppNode` gains `Node<EditorNodeData, "editor">`; `VALID_CONNECTIONS` `"video-gen": ["dubbing", "editor"]`, `"dubbing": ["editor"]`, `"editor": []`.
  - `src/lib/canvas-node-options.ts`: `{ type: "editor", label: "Editor", mnemonic: "E" }`.
  - `src/lib/canvas-node-options.test.ts` (14 types; `e` maps to `editor`) and `src/lib/canvas-nodes.test.ts`.
  - `src/components/canvas/quick-add-menu.tsx`: icon `Clapperboard`; check `MENU_H`.
  - `src/lib/canvas-store.ts` (`defaultData` case `"editor"` → `{}`), `src/components/canvas/canvas.tsx` (`nodeTypes`).
  - `src/lib/nodes/describe-node.ts`: `NODE_ABBREV.editor = "EDT"`; `describeNode` falls back to `"Editor"`.
  - `src/components/nodes/connected-inputs-card.tsx` (icon), `src/components/nodes/dubbing-node.tsx` (adds `<Handle type="source" position={Position.Right} />`).
- Create: `src/lib/editor/summary.ts`, `src/components/nodes/editor-node.tsx`, `src/components/nodes/editor-node-strip.tsx`
- Test: `src/lib/editor/__tests__/summary.test.ts`

**Interfaces:**
- Consumes: `useEditorState` (Task 11), `useLockHandoffNavigation` (Task 13), `useFlushAutosave`, `NodeCardHeader`, `useCanvasId`.
- Produces: `editSummary(state: EditorState): { sources: number; pieces: number; seconds: number; shape: ReelShape; strip: Array<{ id: string; fraction: number }> }`.
- **Card:** 320 px wide, like `dubbing-node.tsx`.
  - The summary line reads `` `${sources} sources · ${pieces} pieces · ${formatTime(seconds)} · ${shape}` `` (the mockup shows `3 sources · 4 pieces · 0:13.20 · 9:16`).
  - Before any source: `"Connect Video Gen or Dubbing nodes."`.
  - The strip of the cut sits below.
  - **Open editor** (Button) navigates to `` `${pathname}/edit` `` through the handoff, flushing canvas autosave first.
  - It opens the same way when `focusedNodeId === id` (the `client-review-node.tsx` pattern, so `open_node` works).
  - It has only a target handle.
- **Call budget:** the card calls `useEditorState(canvasId)` once per canvas (there is one Editor), and nothing else on mount.

- [ ] **Step 1: Write the failing tests.**
  - `canConnect("video-gen","editor")`, `canConnect("dubbing","editor")` → true; `canConnect("prompt","editor")` → false; `canConnect("editor", x)` → false for every type.
  - The options test lists 14 types, and `mnemonicToType("e") === "editor"`.
  - `editSummary`: counts, total seconds, and strip fractions that sum to 1.
- [ ] **Step 2: Run** `npx vitest run src/lib/canvas-nodes.test.ts src/lib/canvas-node-options.test.ts src/lib/editor/__tests__/summary.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the registration checklist above, and the card.
- [ ] **Step 4: Run** the same tests and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Check by hand** (`npm run dev:next`): `E` adds an Editor; a Video Gen and a Dubbing node connect to it; **Open editor** goes to `/edit` (a 404 until Task 17 is fine).
- [ ] **Step 6: Commit**: `feat(editor): Editor node type and card; Dubbing gets an output (D387)`

### Task 15: One Editor per canvas; connecting refuses busy or take-less clips

**Files:**
- Create: `src/lib/editor/rules.ts`; test `src/lib/editor/__tests__/rules.test.ts`
- Modify:
  - `src/lib/canvas-nodes.ts`: `canDuplicateNode(type: string | undefined): boolean`, false for `kb` and `editor`.
  - `src/components/canvas/canvas.tsx`: `handleAddNode` refusal toast; the duplicate filter at L343 uses `canDuplicateNode`.
  - `src/components/nodes/node-context-menu.tsx` (L48 uses `canDuplicateNode`).
  - `src/app/api/nodes/[id]/duplicate/route.ts`: an Editor → 409 `EDITOR_DUPLICATE_REFUSED`.
  - `src/app/api/nodes/duplicate-batch/route.ts`: filter with `canDuplicateNode`.
  - `src/lib/canvas-store.ts` (`onConnect`).
  - `src/lib/copilot/actions.ts` and its test, `src/components/canvas/use-copilot-chat.ts`, `src/components/canvas/use-playbook-runner.ts`.

**Interfaces:**
- Produces:
```ts
export const ONE_EDITOR_PER_CANVAS = "This canvas already has an Editor. Open it from the canvas to keep cutting.";
export const EDITOR_DUPLICATE_REFUSED = "An Editor can't be duplicated: each canvas has one.";
export const CONNECT_WHILE_GENERATING = "This clip is still generating. Connect it to the Editor once it finishes.";
export const CONNECT_WITHOUT_TAKE = "This clip has no finished take yet. Connect it to the Editor once it has one.";
export function addNodeRefusal(type: string, nodes: readonly { type?: string }[]): string | null;
export function editorConnectRefusal(source: { type?: string; data: unknown }, targetType: string | undefined, isGenerating: boolean): string | null;
```
- `planConnections(fromHandles, toHandle, nodes, edges = [], isGenerating: (nodeId: string) => boolean = () => false): ConnectPlan`, with `rejected: { handle: string; reason?: string }[]`. `connectHandles` posts `` `Can't connect ${handle}: ${reason}` `` when a reason exists, else the current text.
- **Store `onConnect`:** right after the cycle check, `editorConnectRefusal(sourceNode, targetNode?.type, nodeGenerationStatus(latestJobByNode[src], generationStarts[src], null).isGenerating)` → `toast.error(reason)` and return.

- [ ] **Step 1: Write the failing tests.**
  - `addNodeRefusal("editor", [{ type: "editor" }]) === ONE_EDITOR_PER_CANVAS`; `addNodeRefusal("prompt", …) === null`.
  - `editorConnectRefusal`:
    - generating → `CONNECT_WHILE_GENERATING`;
    - a video-gen without a string `parsed` → `CONNECT_WITHOUT_TAKE`;
    - a dubbing node whose `parsed` won't read → `CONNECT_WITHOUT_TAKE`;
    - a finished take → null;
    - a non-editor target → null.
  - `planConnections` with `isGenerating` true for a source → `rejected[0].reason === CONNECT_WHILE_GENERATING`.
  - The duplicate route test: an Editor → 409.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/rules.test.ts src/lib/copilot "src/app/api/nodes/[id]/duplicate"`. Expected: FAIL.
- [ ] **Step 3: Implement** at every call site listed.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(editor): one Editor per canvas; refuse connecting a generating or take-less clip (D387, D389)`

### Task 16: Generation is locked while connected (client and server)

**Files:**
- Create:
  - `src/lib/editor/generation-lock.ts` and test;
  - `src/hooks/use-generation-lock.ts`;
  - `src/lib/editor/lock-guard.ts` (`server-only`).
- Modify:
  - `src/lib/canvas-store.ts`: `generationLocks: Record<string, GenerationLock>`, recomputed when `edges` changes; and `src/lib/canvas-store.test.ts`.
  - The Video Gen surfaces: `src/components/nodes/video-gen-focus-view.tsx` (the `disableGenerateReason` chain; the Change voice toggle), `src/lib/voice-change/workspace.ts` (`canApplyVoiceChange` gains `locked: string | null`) and its test.
  - The Dubbing surfaces: `src/lib/dubbing/blocked-reasons.ts` (both functions gain `locked: string | null`, checked after `editable`) and its test, `src/components/nodes/dubbing-dub-panel.tsx` and `dubbing-lip-sync-panel.tsx` callers.
  - The cards: `src/components/nodes/video-gen-node.tsx` and `dubbing-node.tsx` show the short label.
  - The routes: `src/app/api/nodes/[id]/video-generate/route.ts`, `voice-change/route.ts`, `dub/route.ts`, `lip-sync/route.ts`, plus their route tests (create the video-generate and voice-change tests if absent, mocking as `dub/route.test.ts` does).

**Interfaces:**
- Produces:
```ts
export const GENERATION_LOCK_COPY: Record<GenerationLock, { short: string; long: string }> = {
  editor: { short: "In use by the Editor · Disconnect to generate", long: "This clip is in the Editor's reel. Disconnect it from the Editor to generate." },
  dub: { short: "Locked by its dub · feeds the Editor", long: "This video's dub is in the Editor's reel. Disconnect the dub from the Editor to generate." },
};
export function computeGenerationLocks(nodes: readonly { id: string; type?: string }[], edges: readonly { source: string; target: string }[]): Record<string, GenerationLock>;
export function useGenerationLock(nodeId: string): GenerationLock | null; // useCanvasStore((s) => s.generationLocks[nodeId] ?? null): O(1)
export async function editorLockResponse(nodeId: string): Promise<Response | null>; // getEditorGenerationLock → apiError(GENERATION_LOCK_COPY[lock].long, 409)
```
- **Store:** compute once in `createCanvasStore`, then `store.subscribe((s, prev) => { if (s.edges !== prev.edges) … })`. Call `setState` only when the record's contents differ (rule 4). Node drags change `nodes`, not `edges`, so they never recompute.
- **Routes:** `dub` and `lip-sync` run `editorLockResponse` in `Promise.all` with `hasRunningGeneration`. `video-generate` checks before `getUpstreamOutputs`; `voice-change` checks before `resolveVoiceChangeSource`. Every check comes before `insertGeneration` / `reserveCredits`.

- [ ] **Step 1: Write the failing tests.**
  - `computeGenerationLocks`:
    - video-gen → editor gives `{ vg: "editor" }`;
    - video-gen → dubbing → editor gives `{ vg: "dub", dub: "editor" }`;
    - a dubbing node with no Editor gives `{}`;
    - a prompt upstream is never locked;
    - a video-gen wired both directly and through a dub gives `"editor"`.
  - Store:
    - "connecting to an Editor locks";
    - "dragging a node keeps the same `generationLocks` reference".
  - Reasons: `dubBlockedReason({ …, editable: true, locked: "x" }) === "x"`; the same for lip sync and `canApplyVoiceChange`.
  - Each of the four routes, with `getEditorGenerationLock` mocked to `"editor"`: 409 with the long copy, and `insertGeneration` / `tasks.trigger` never called.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/generation-lock.test.ts src/lib/canvas-store.test.ts src/lib/dubbing src/lib/voice-change "src/app/api/nodes/[id]"`. Expected: FAIL.
- [ ] **Step 3: Implement** everything listed. In the UI, the lock reason is the disabled control's tooltip (`DisabledReason`), and the card shows `short` as a muted line.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Check by hand:** with a Video Gen connected, Generate and Change voice are off with the reason; after disconnecting they work. Version History restore still works.
- [ ] **Step 6: Commit**: `feat(editor): lock generation on clips in the reel, enforced in every start route (D389)`

# Phase D — The editor page (layout from the mockups: 1440 wide; header 60 px; row of 248 px / stage / 340 px with a 16 px gap and 16/24 px padding; timeline full width below)

### Task 17: Editor page shell: route, store, autosave, lock, header

**Files:**
- Create:
  - `src/app/clients/[id]/canvases/[cid]/edit/page.tsx` and `edit/loading.tsx`
  - `src/lib/editor/editor-store.ts` and test
  - `src/components/editor/editor-store-provider.tsx`, `editor-shell.tsx`, `editor-header.tsx`, `editor-skeleton.tsx`, `editor-empty.tsx`
  - `src/hooks/use-editor-autosave.ts`
- Add: `npx shadcn@latest add toggle-group` → `src/components/ui/toggle-group.tsx` (Base UI)

**Interfaces:**
- Consumes: `loadEditorState` (Task 11), `useCanvasLock`, `LockBanner`, `useLockHandoffNavigation` (Task 13), `useEditorState`, `useSaveEdit`.
- Produces:
```ts
export type Selection = { kind: "piece"; id: string } | { kind: "caption"; id: string } | null;
export type EditorStoreState = { doc: EditDoc; sources: SourceView[]; editable: boolean; selection: Selection;
  apply(fn: (doc: EditDoc) => EditDoc): void; // ignored when !editable; no state change when fn returns the same doc
  select(s: Selection): void; setEditable(v: boolean): void };
export function createEditorStore(init: { doc: EditDoc; sources: SourceView[] }): StoreApi<EditorStoreState>;
export function useEditorStore<T>(selector: (s: EditorStoreState) => T): T;
export type SaveStatus = "saved" | "saving" | "unsaved" | "error";
export function useEditorAutosave(a: { canvasId: string; nodeId: string; sessionId: string; initiallyDirty: boolean; onLockLost(): void }): { status: SaveStatus; flush(): Promise<void> };
```
- **Autosave:**
  - debounce 800 ms;
  - skip when `JSON.stringify(doc)` equals the last saved;
  - retry an error after 5 s;
  - 409 → `onLockLost`;
  - `initiallyDirty` (that is, `state.changed`) saves once on mount when editable.
- **Page** (server):
  - client and canvas by slug, plus the org check, both copied from `canvases/[cid]/page.tsx`;
  - then `loadEditorState(canvas.id)`;
  - null → `EditorEmpty`: `"This canvas has no Editor yet. Add one on the canvas, connect clips to it, then open it."` with **Back to canvas**;
  - otherwise `<EditorShell canvasId canvasPath={`/clients/${id}/canvases/${cid}`} clientName canvasName initialState />`.
  - `export const dynamic = "force-dynamic"`.
- **Shell:**
  - `useCanvasLock(canvasId)`; `setEditable(canEdit)`; `LockBanner` when read-only;
  - seeds `useEditorState(canvasId, { initialData })`;
  - toasts each `initialState.notices` entry once.
- **Header** (mockup):
  - **Back to canvas**: flushes, then hands off;
  - the breadcrumb `client / canvas` and the title `` `${editorTitle} · rough cut` ``;
  - the reel shape `ToggleGroup` (`9:16` | `16:9`);
  - the save status: `"Saved"` with a check, `"Saving…"`, `"Unsaved changes"`, `"Couldn't save · retrying"`;
  - **Export to Premiere** is added in Task 22.

- [ ] **Step 1: Write the failing tests** (editor-store):
  - "apply with a no-op keeps the same doc";
  - "read-only ignores apply";
  - "select replaces the selection".
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/editor-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the store, the autosave hook, the page, the loading skeleton and the shell with an empty three-column grid and timeline area. Later tasks fill the panels.
- [ ] **Step 4: Run** the test, then check by hand: open `/edit` from the canvas card. The header shows and the shape toggle saves (`Saved`). A second tab shows the lock banner and read-only. **Back to canvas** returns with the canvas still editable (the handoff works).
- [ ] **Step 5: Commit**: `feat(editor): editor page shell with autosave under the canvas lock (D387, D390)`

### Task 18: Playback and the stage (plays the chosen picture and sound)

**Files:**
- Port and rewrite: spike `src/components/rough-cut-spike/use-sequence-playback.ts` → `src/hooks/use-reel-playback.ts`
- Create: `src/lib/editor/playback.ts` and test; `src/components/editor/editor-stage.tsx`, `editor-stage-captions.tsx`, `editor-transport.tsx`

**Interfaces:**
- Produces:
```ts
export type PieceMedia = { pictureUrl: string; pictureFps: number; soundUrl: string | null; muteVideo: boolean };
export function resolvePieceMedia(piece: Piece, source: SourceView): PieceMedia;
// picture = lipSynced ? files.lipSynced.url : files.original.url
// sound file = sound === "dubbed" ? files.dubAudio.url : files.original.url
// soundUrl = sound file === pictureUrl ? null : sound file; muteVideo = soundUrl !== null
export function useReelPlayback(pieces: Piece[], media: (p: Piece) => PieceMedia): { videoRef: RefObject<HTMLVideoElement | null>; audioRef: RefObject<HTMLAudioElement | null>; time: number; playing: boolean; total: number; play(): void; pause(): void; seek(t: number, nextPieces?: Piece[]): void };
```
- **Hook:** keeps the spike's clock (it follows the video's `currentTime`, never runs backwards, swaps source at cuts, `SEEK_TOLERANCE_SECONDS = 0.12`), with two additions:
  - the video element's `muted` follows `muteVideo`;
  - when `soundUrl` is set, an `<audio>` element loads it at each piece change, is seeked whenever it drifts more than 0.12 s from `in + local`, and plays and pauses with the clock.
- **Stage:**
  - a frame at `aspect-[9/16]` or `aspect-video`, from `doc.shape`;
  - the video with `object-contain`, so the other shape fits inside rather than being cropped;
  - `container-type: size`;
  - active captions drawn with `CAPTION_FONT_CSS[font]`, `fontSize: calc(${size} / 1080 * 100cqmin)`, `textShadow: "0 0.06em 0.3em rgba(0,0,0,.6)"`, and no box.
- **Transport:** a play/pause Button and `MM:SS.ss / MM:SS.ss` in tabular numerals.

- [ ] **Step 1: Write the failing tests:** `resolvePieceMedia` for the four picture × sound combinations.
  - (original, original) → `soundUrl: null`.
  - (lipSynced, original) → video muted, sound = original.
  - (original, dubbed) → video muted, sound = dubAudio.
  - (lipSynced, dubbed) → sound = dubAudio.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/playback.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the hook, the stage and the transport, and mount them in the shell's centre column.
- [ ] **Step 4: Run** the test, then check by hand: a dubbed piece plays the dub, and an original piece plays its own sound. A lip-synced picture shows the lip-synced video. A cut between files hitches at most briefly.
- [ ] **Step 5: Commit**: `feat(editor): preview plays the chosen picture and sound (spec §6)`

### Task 19: The timeline (ruler, pieces, trims, reorder, split, delete, keys)

**Files:**
- Create:
  - `src/lib/editor/timeline-scale.ts` and test
  - `src/components/editor/editor-timeline.tsx`, `editor-timeline-ruler.tsx`, `editor-timeline-piece.tsx`, `editor-timeline-lanes.tsx`, `editor-playhead.tsx`
  - `src/hooks/use-editor-shortcuts.ts`

**Interfaces:**
- Produces:
  - `TIMELINE_WINDOW_SECONDS = 20`, the mockups' window. The scale doesn't depend on the clips; long reels scroll; there is no zoom in this phase.
  - `pxPerSecond(width: number): number`, which is `width / 20` (fallback 16 before the width is measured).
  - `laneBox(offsetSeconds: number, seconds: number, scale: number): { left: number; width: number }`, with `width = max(6, seconds × scale)` and `left = offset × scale`. Every lane and the playhead use these exact offsets, which fixes the spike's lane drift.
- **Lanes** (labels 64 px wide): Video 60 px, Audio 26, Dub 26, Captions 26 (blocks arrive in Task 21).
  - Audio blocks read `"Original"`; with a dub, `"Original (off)"`, dashed and struck through; with no audio, `"No sound"`.
  - Dub blocks read `` `Dub · ${dubLanguageLabel(language)}` ``.
- **Pointer behaviour** (ported from the spike's `timeline-clip.tsx` / `timeline-ruler.tsx`):
  - **Trims:** edge handles with `role="slider"` and pointer capture. They call `setTrim` with the `pieceLimit` fps; arrow keys move ±1 frame, Shift ±10. While trimming, the stage seeks with `nextPieces`: the in edge shows the first frame, the out edge the last.
  - **Reorder:** HTML5 drag and drop calls `movePiece`.
  - **Ruler:** scrubbing seeks in continuous time.
- **Toolbar:** **Split** (scissors) and **Delete**, plus the hint `"Drag edges to trim · drag to reorder · S split · ⌫ delete · Space play"`.
- **Keys:** Space plays or pauses; S splits at the playhead (`locate`, then `splitPieceInDoc`); Backspace or Delete removes the selection (`deletePiece` or `removeCaption`). All of them are ignored when `isEditableTarget(e.target)` (`src/lib/canvas-node-options.ts`).

- [ ] **Step 1: Write the failing tests:** `pxPerSecond(1280) === 64`; `laneBox(2, 0.05, 64)` gives `{ left: 128, width: 6 }`; `laneBox(2, 1, 64).width === 64`.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/timeline-scale.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components and the shortcuts hook, and mount the timeline.
- [ ] **Step 4: Run** the test, then check by hand:
  - a trim snaps to frames and shows the cut frame;
  - reordering moves the Audio and Dub blocks with their piece;
  - S splits and Backspace deletes, but not while typing in a field;
  - adding a piece never rescales the ruler.
- [ ] **Step 5: Commit**: `feat(editor): timeline with frame-snapped trims, reorder, split and delete (spec §6)`

### Task 20: Clip props, sources panel, quiet sections

**Files:**
- Create:
  - `src/lib/editor/pieces.ts` and test; port spike `silence.ts` → `src/lib/editor/silence.ts`, with a test of its pure part
  - `src/components/editor/editor-sources-panel.tsx`, `editor-source-row.tsx`, `editor-props-panel.tsx`, `editor-piece-props.tsx`, `editor-quiet-sections.tsx`
- Modify: `src/services/editor.service.ts` (`fetchMedia(url): Promise<ArrayBuffer>`, through `proxyImageSrc(url)` per D245), `src/hooks/queries/editor.ts` (`useQuietWindows(url: string | null)`, `staleTime: Infinity`, key `editorKeys.quiet(url)`)

**Interfaces:**
- Produces:
```ts
export function setPicture(doc: EditDoc, pieceId: string, choice: PictureChoice, sources: SourceView[]): EditDoc; // lipSynced only if the file exists; clamps out to its duration
export function setSound(doc: EditDoc, pieceId: string, choice: SoundChoice, sources: SourceView[]): EditDoc;     // dubbed only if dubAudio exists
export function addSourceAgain(doc: EditDoc, sourceNodeId: string, sources: SourceView[], newId: string): EditDoc; // appends a fresh full-length piece at the end
export const WINDOW_SECONDS = 0.05, QUIET_RMS = 0.015, MIN_QUIET_SECONDS = 0.35;
export async function rmsWindows(bytes: ArrayBuffer): Promise<Float32Array>;              // browser: decodeAudioData, channel 0
export function quietSections(windows: Float32Array, from: number, to: number): Array<[number, number]>; // source seconds
```
- **Clip props** (copy from the mockups):
  - The header is `"Clip"` with `` `${index + 1} · ${handle}` ``, plus `", second piece"` and so on when a source has several pieces.
  - The meta line is `` `Current version · ${fps} fps · ${w}×${h}` ``; for Dubbing, `` `Dubbing node · ${languageLabel}` ``.
  - **Trim:** three boxes (In / Out / Length) and the hint `"Drag the clip's edges on the timeline to trim."`.
  - **Picture** `ToggleGroup` (Original / Lip-synced). Its hint is `"No lip-sync for this clip. Lip-sync comes from a Dubbing node."`, or `` `Mouth matched to the ${languageLabel} dub.` `` when lip-sync exists.
  - **Sound** `ToggleGroup`, Dubbing only (Original / `` `Dubbed · ${languageLabel}` ``). Its hint is `"In Premiere the dub sits on its own tracks. The original sound goes too, switched off, so it can be brought back."`.
  - The Dubbing footnote: `"Switch this clip's version on the canvas and the reel follows. Your trims stay if they fit the new version."`
  - **Quiet sections:** rows of `start – end` with a **Seek** Button, and `"Shown for review. Nothing is cut automatically."`. If the decode fails: `"Couldn't read this clip's sound."`
- **Sources panel:**
  - the eyebrow `"Sources"` and `` `${n} connected` ``;
  - rows show a neutral swatch (no per-row media load; rule 1), the handle, and `` `${shotLabel} · ${formatTime(duration)}` `` (Dubbing: `` `${shotLabel} · dubbed · lip-synced` `` as available);
  - unreadable rows show `"Couldn't read this clip."`;
  - the add-again control is a dashed primary chip `+` with aria-label `` `Add ${handle} to the timeline again` ``;
  - the footer reads `"Sources are the clips connected to this Editor on the canvas."`.

- [ ] **Step 1: Write the failing tests.**
  - `setPicture` to lipSynced clamps `out` to the lip-synced duration.
  - `setPicture` without a lip-synced file `toBe(doc)`.
  - `setSound("dubbed")` without dubAudio `toBe(doc)`.
  - `addSourceAgain` appends a `0..duration` piece.
  - `quietSections` on a synthetic window array: one quiet run of 0.4 s is found; a run of 0.2 s is ignored; ranges are clipped to `[from, to]`.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/pieces.test.ts src/lib/editor/__tests__/silence.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the modules and panels, and mount them in the left and right columns.
- [ ] **Step 4: Run** the tests, then check by hand. Selecting a piece fetches its file once through the proxy and lists quiet sections; selecting another piece of the same source makes no new request.
- [ ] **Step 5: Commit**: `feat(editor): clip props with picture/sound choice, sources panel, quiet sections (spec §4, §6)`

### Task 21: Captions UI

**Files:**
- Port and adapt: spike `caption-block.tsx` → `src/components/editor/editor-caption-block.tsx`; `caption-overlay.tsx` → `editor-caption-overlay.tsx`
- Create: `src/components/editor/editor-caption-lane.tsx`, `editor-caption-props.tsx`, `editor-captions-toolbar.tsx`

**Interfaces:**
- Consumes: everything in `captions.ts` and `srt.ts` (Task 4), `CAPTION_FONTS`, `CAPTION_FONT_CSS`, `fontCoversText`.
- **Lane blocks:**
  - move or edge-trim with pointer capture, snapping to the sequence fps (the first piece's picture fps), `MIN_SECONDS = 0.2`, `DRAG_THRESHOLD_PX = 3`;
  - a release without movement selects;
  - a change calls `retimeCaption`.
- **Stage overlay:** drags keep the grab offset, call `placeCaption`, and render in the real font (the spike didn't).
- **Toolbar:**
  - **Add caption** is a dashed primary chip `+ Caption`; it calls `addCaption` at the playhead and selects the new caption.
  - **Import SRT** uses `Input type="file" accept=".srt" className="hidden"` behind a Button, then `parseSrt` and `attachCues`. It toasts `` `${n} captions added` ``, plus `` ` · ${dropped} started after the reel ends` `` when any were dropped, and `"No captions found in that file."` when there are none.
  - **Export SRT** downloads `captions.srt` from `docToCues`.
- **Caption props** (mockup):
  - **Text** (`Textarea`) and the timing line `` `${formatTime(start)} → ${formatTime(end)} · moves with piece ${n} (${handle})` ``.
  - **Font:** a `Select` of the 5 fonts, each label in its own face.
  - **Size:** an `Input` of type number, 8–400.
  - **Colour:** swatches `#ffffff`, `#111111`, `#ffd60a`, `#ff4d4d`, `#5ce1e6`, plus a hex field in an `InputGroup` with a `#` addon.
  - The note `"Arrives in Premiere as editable text on V2. The font files ship in the package."`
  - **Review Focus 3:** when `!fontCoversText(font, text)`, warn `` `${label} has no letters for this script. Poppins does.` ``.

- [ ] **Step 1: Check the pure behaviour is already pinned:** `npx vitest run src/lib/editor/__tests__/captions.test.ts src/lib/editor/__tests__/srt.test.ts`. Expected: PASS (Task 4).
- [ ] **Step 2: Implement** the components and mount them (lane in the timeline, overlay in the stage, props in the right column, toolbar above the lanes).
- [ ] **Step 3: Check by hand:**
  - add a caption at the playhead and drag it on the stage;
  - retime it on the lane;
  - trim the piece before it and confirm it stays with the speech;
  - delete its piece and confirm it goes;
  - import a Windows SRT;
  - type Hindi in Montserrat and see the warning;
  - reload and confirm it reopens exactly.
- [ ] **Step 4: Run** `npx tsc --noEmit` and `npm run lint`. Expected: clean.
- [ ] **Step 5: Commit**: `feat(editor): captions on the timeline and stage, styled from the font list (spec §7)`

### Task 22: Export dialog

**Files:**
- Create: `src/lib/editor/export-copy.ts` and test; `src/components/editor/editor-export-button.tsx`, `editor-export-dialog.tsx`, `editor-export-howto.tsx`, `editor-export-tracks.tsx`
- Modify: `src/components/editor/editor-header.tsx` (mount the button)

**Interfaces:**
- Consumes: `useStartExport`, `useExportStatus` (Task 12), `formatBytes` (`src/lib/kb/utils.ts`; import it, don't redefine), the autosave `flush`.
- Produces:
  - `exportChecklist(summary: ExportSummary, bytes: number): string[]` → for example:
    - `"Collected 3 clips, 1 lip-synced video and 1 dub"`
    - `"Wrote the sequence, 2 captions and the font file"`
    - `` `Packaged creativeos-reel.zip · ${formatBytes(bytes)}` ``
  - `exportSubtitle(title: string, summary: ExportSummary, pieces: number): string` → `` `${title} · ${pieces} pieces · ${formatTime(durationSeconds)} · ${shape} · ${fps} fps` ``.
- **Flow:**
  - Clicking (primary Button with the Download icon, `"Export to Premiere"`) runs `await flush()`, then `startExport`.
  - A 422 toasts its reason and opens no dialog.
  - Otherwise a Dialog opens and polls `useExportStatus`.
- **Dialog titles:** while running, `"Preparing your Premiere package"` with the live `phase`; on success, `"Your Premiere package is ready"`; on failure, `"The export didn't finish"` with `error` and **Try again**.
- **On success the dialog shows:**
  - the checklist;
  - **Open it in Premiere**, verbatim:
    1. `Unzip it somewhere permanent, not a temp folder.`
    2. `Drag **creativeos-premiere.xml** into Premiere's **Project panel**. Premiere's Import screen doesn't read it.`
    3. `Open the **CreativeOS Rough Cut** sequence. If clips show offline, link one to the **media** folder and Premiere finds the rest.`
  - **What you'll see:** V2 / V1 / A1·2 / A3·4 rows, each shown only when it applies;
  - the font note `` `Uses ${fontNames}. Install it from the package's fonts folder if Premiere doesn't have it.` ``;
  - **Download creativeos-reel.zip**: `Button render={<a href={result.url} download />}`;
  - **Close**.

- [ ] **Step 1: Write the failing tests:** the checklist reads "1 clip" vs "3 clips"; with no lip-sync or dub it is `"Collected 3 clips"` with no "and"; with 0 captions, `"Wrote the sequence"`; with 2 fonts, `"the font files"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor/__tests__/export-copy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the copy helpers and the dialog.
- [ ] **Step 4: Run** the test, then check by hand: an export runs and its progress updates. The download is named `creativeos-reel.zip`. A second click while running gets the 409 message. An empty reel gets `"Add a clip to the timeline first."`.
- [ ] **Step 5: Commit**: `feat(editor): export dialog with progress, how-to-open steps and download (spec §9)`

### Task 23: Verify, count the calls, and run the Premiere acceptance check

**Files:**
- Modify: `docs/superpowers/plans/2026-10-20-rough-cut-editor-HANDOFF.md` §1 (status) and §7 (next steps)

- [ ] **Step 1: Full checks.** Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`. Expected: all pass. Report any failure with its output; don't work around it.
- [ ] **Step 2: Count the calls** (performance checklist), on a canvas with 300 nodes and an Editor with 20 sources:
  - **Canvas load:** one extra request, the Editor state GET. Media probing happens on the first load only.
  - **Editor open:** server-side load only, plus the lock acquire. No per-piece requests.
  - **A node drag:** no `generationLocks` recompute.
  - **Export:** one POST, then one GET every 1.5 s until done.

  Record the numbers in the handoff.
- [ ] **Step 3: Walk the spec's §13 "Done when" list** by hand in `npm run dev`, ticking each item in the handoff.
- [ ] **Step 4: Premiere acceptance, with the user** on Windows Premiere 2025+. Export a reel with:
  - at least 3 pieces, including one split;
  - one Dubbing piece set to Lip-synced + Dubbed;
  - one 16:9 clip in a 9:16 reel;
  - two captions in different fonts.

  Unzip, install the fonts from `fonts/`, and **drag `creativeos-premiere.xml` into the Project panel**. Check:
  - **Order and trims:** order matches; each piece's first and last frame match the editor's In/Out.
  - **Sound:** A1/A2 are linked to their picture. A3/A4 hold the dub, with the original present but disabled.
  - **Picture:** the lip-synced picture is on V1 for that piece. The 16:9 clip is scaled to fit.
  - **Captions:** on V2 as editable text with the right font, size, colour and position.
  - **Fallback:** `captions.srt` imports as a caption track.

  Record the results in the handoff. If Premiere reads titles differently, re-run the caption probe: `$env:EDITOR_PROBE_OUT=…; $env:EDITOR_PREMIERE_SAMPLE=…; npx vitest run src/lib/editor/__tests__/caption-probe.test.ts`.
- [ ] **Step 5: Wrap up.** Update the handoff. Ask the user before pushing `feat/rough-cut-editor` or applying migration 0059 anywhere shared. Commit: `docs(editor): verification, call counts and Premiere acceptance results`.
