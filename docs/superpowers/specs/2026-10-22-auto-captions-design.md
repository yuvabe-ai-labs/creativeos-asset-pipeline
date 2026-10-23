# Auto captions in the Rough Cut Editor — design

*Decisions D411, D396–D401 in the roadmap's ADR log (§7). Builds on the Rough Cut Editor
(`2026-10-20-rough-cut-editor-design.md`, D388–D394) and refines its captions (D393).*

**UX reference:** the clickable mock at https://claude.ai/artifact/Mn98oVEBbzA6UCqMww3YS3
(version 4, "Simplified"). It runs the five real clips of Jackfruit 365 / Reel 2 with their real
transcripts. Where this spec and the mock disagree, this spec wins.

**Proof of timing:** https://claude.ai/artifact/2TfjRVKoNYk4sP4ZN8ad56 — the same five clips
transcribed with ElevenLabs Scribe v2 and drawn frame by frame.

## 1. What this adds

Today a caption is typed by hand, timed by dragging and styled one at a time. This adds:

1. **Auto captions:** one button writes captions for every clip from what's said, with a start and
   end time for every word.
2. **Word-perfect sync:** each word lights up on the frame it is said, in the preview and in Premiere.
3. **One caption style for the reel:** presets, font, size, colour and "word by word", applied to
   every caption at once. Position by dragging on the preview.
4. **A Captions panel** (Text | Style) in place of the per-caption properties, as in ElevenLabs
   Studio, Descript and VEED.
5. **Undo and redo** for every edit in the editor.

Out of scope: MP4 rendering (the editor outputs a Premiere package only, D388); per-line styles;
Indic caption fonts (see §11); translation; speaker labels.

## 2. What the user does

The default path is one click.

1. The Captions lane is empty. It shows **✦ Auto captions · 5 credits** and "or add one by hand".
2. Click it. No dialog: the language is detected, the reel style applies (Bold pop by default).
   Each clip's part of the Captions lane shows **Listening…** and fills in as its transcript lands.
   The rest of the editor stays usable.
3. A toast: **"18 captions from 5 clips"** with **Undo**.
4. The Captions panel opens on **Text**: every line with its start time, grouped by clip.
   Click a line to fix its words. Enter saves, Esc cancels. Hover shows Delete.
5. **Style** tab: four presets, then Font, Size, Colour and Word by word (with the colour of the
   word being said). Every change reaches every caption.
6. On the preview, drag a caption to move every caption; drag a corner to resize. It snaps to both
   centre lines, and a label says "Moving · all 18 captions".
7. On the timeline, drag a caption to move it or its edges to retime it. Split (S) and Delete as for
   clips. Ctrl+Z / Ctrl+Shift+Z undo and redo.
8. **Export to Premiere** carries the captions as editable text on V2, word by word if chosen.

### States the user can meet

| State | What they see |
|---|---|
| Nothing captioned | Lane: **✦ Auto captions · N credits** + "or add one by hand". Text tab: the same, as its empty state. |
| Running | That clip's lane segment shimmers with **Listening…**; its Text tab group says Listening…. The button is disabled. |
| Already transcribed | The button says **· free**. Re-running rewrites only auto lines nobody edited. |
| One clip failed | Its lane segment: **No speech found · Try again** (or "This clip has no sound"). The others are captioned. Credits for it come back. |
| A clip has a new take, or its sound changed to the dub | Its captions stay. A chip on its lane segment: **Caption this clip · N credits**. Never re-transcribed silently. |
| Read-only (someone else holds the lock) | Every caption control is disabled with the reason on hover, as for clips today. |
| Credit limit reached | Toast: the existing `CREDIT_LIMIT_TOAST_MESSAGE`. Nothing changes. |

Copy rules (D-plain-copy): no vendor names, no raw errors, no em-dash phrasing.

## 3. Transcription (D411)

- **Engine:** ElevenLabs Speech-to-Text, model `scribe_v2`, `POST /v1/speech-to-text` with
  `source_url` (the stored file's URL; no upload through us), `timestamps_granularity=word`,
  `tag_audio_events=false`, no `language_code` (detected). Uses the existing `ELEVEN_LABS_API_KEY`.
  Behind a small engine interface in `src/lib/transcribe/` (like `src/lib/dubbing/providers.ts`),
  so a second engine never touches the editor.
- **What is transcribed:** the sound that plays for each piece: the dub audio when the piece's
  sound is *Dubbed*, otherwise the original take's file. Lip-synced picture doesn't matter.
- **Once per file:** results are stored in `media_transcripts`, keyed by the file URL (the same
  pattern as `media_facts`, D392). Re-running, trimming, or using a take in two pieces never pays
  again. Stored: `url`, `language`, `words` (jsonb `[{ t, s, e, p }]`, seconds of that file;
  `p` = word confidence 0–1 from `exp(logprob)`), `engine`, `model`, `duration_seconds`,
  `created_at`. Only `type: "word"` entries are kept.
- **Word clean-up** (pure, `normalizeWords`): every word lasts at least one frame (Scribe returns
  some with `start == end`), and never runs into the next word's start.
- **Measured once in the proof:** 5 clips (4–9 s), English at 94–99% confidence, about 4 s per
  call, 8–28 words each.

## 4. Running it: route, job, credits

- `POST /api/canvases/[cid]/editor/transcribe` `{ nodeId, pieceIds?: string[] }` (all pieces when
  absent). `withCanvas` + `withTryCatch`.
  1. Read the editor state fresh (rule 10) and the caller's org, in parallel (rule 5).
  2. Resolve each requested piece's sound URL **from the saved sources**, never from the body
     (rule 14). De-duplicate.
  3. Look the URLs up in `media_transcripts` (one query). If all are stored, return
     `{ jobId: null }`: the client applies them at once, free.
  4. Otherwise insert one `generations` row (`type: "transcribe"`, owner = the Editor node,
     `paramsSnapshot: { seconds }`), reserve `transcribeCredits(totalSeconds)` (402 on the limit),
     insert a `background_jobs` row (`kind: "editor-transcribe"`, lock `editor-transcribe:<nodeId>`,
     input `{ canvasId, nodeId, generationId, orgId, files: [{ url, seconds }] }`), trigger the task
     with `{ jobId }` only (rule 8). 409 when one is already running.
- **Task `editor-transcribe`** (`trigger/editor-transcribe.ts`): `maxAttempts: 1` (a retry would
  pay twice, rule 12); files in parallel, at most 3 at a time; each file's call retries only on a
  network error **before** a response arrives. Each finished file is written to
  `media_transcripts` immediately, so the editor can fill that clip while others run. The job's
  `result` is `{ failed: [{ url, reason: "no-speech" | "no-sound" | "failed" }] }`.
  - At the end: settle the generation for the seconds that succeeded
    (`settleGeneration` + `succeedGeneration`), or refund it all and fail it when none did.
    `onFailure` settles a run that timed out (refund, job failed).
  - Empty transcript → `no-speech`. A file with no audio stream (`media_facts.audio == null`) is
    refused in the route as `no-sound` and never sent.
- **Cost:** `transcribeCredits(seconds) = usdToFinalCredits(seconds / 3600 * STT_USD_PER_HOUR)`,
  one pure function used by the button and the reservation (D377 pattern). `STT_USD_PER_HOUR`
  is a constant in `src/lib/transcribe/cost.ts` set from our ElevenLabs plan before launch.
- **Reads:** `GET /api/canvases/[cid]/editor/transcripts` returns the stored transcripts for the
  editor's current sound URLs (one query, URLs derived on the server). `GET
  /api/canvases/[cid]/editor/transcribe/[jobId]` returns the job (status, phase, result).
- **Client (three layers):** `src/services/editor.service.ts` gains `startTranscribe`,
  `getTranscribeJob`, `getTranscripts`. `src/hooks/queries/editor.ts` gains
  `editorKeys.transcripts(canvasId)`, `editorKeys.transcribeJob(canvasId, jobId)`,
  `useTranscripts`, `useStartTranscribe`, `useTranscribeJob` (polls with `refetchInterval` while
  live, and invalidates `transcripts` on each poll so clips fill as they land).
  A feature hook `useAutoCaptions` turns newly arrived transcripts into captions (§5) through the
  store's `apply`, once per requested piece.
- **Call budget:** opening the editor adds one transcripts read. A run is one start, then one job
  poll plus one transcripts read every 1.5 s while it runs. Nothing per caption or per word.

## 5. The edit document (D396, D397)

`EditDoc` goes to `v: 2`:

```ts
type CaptionLook = {
  font: CaptionFontKey; size: number; color: string;      // size: px on a 1080 short edge
  wordByWord: boolean; activeColor: string;               // colour of the word being said
  upcoming: "show" | "dim" | "hide";                      // set by presets only
  outline: boolean; box: boolean; boxColor: string; upper: boolean; // set by presets only
};
type CaptionStyle = CaptionLook & { x: number; y: number }; // centre, 0–1
type CaptionWord = { text: string; at: number; duration: number }; // source seconds, like Caption.at
type Caption = {
  id: string; pieceId: string; at: number; duration: number; text: string;
  words?: CaptionWord[];   // present for auto captions and once a line is retimed or split
  auto?: true;             // written by Auto captions
  edited?: true;           // changed by the user since; Auto captions never rewrites it
  from?: string;           // the sound URL its words came from (new-take detection)
};
type EditDoc = { v: 2; shape; sources; pieces; captions: Caption[]; captionStyle: CaptionStyle };
```

- **Reading a v1 edit:** `captionStyle` takes the first caption's font, size, colour and position
  (the Bold pop defaults when there are none); per-caption looks are dropped. The editor is not on
  production yet, so no real edit loses anything. `EditDocSchema` accepts v1 and returns v2.
- **Grouping words into lines** (pure, `groupWords`): up to 3 words and 22 characters, a new line
  after `. , ? ! ; :` or a pause over 0.35 s, never across pieces. A line's `at`/`duration` span
  its words plus a 0.3 s hold, cut short by the next line or the piece's end.
- **Retyping** (`retextCaption`): the same number of words keeps every word's time (a spelling
  fix). A different number spreads the new words over the line's span by length, and the user
  gets a one-time toast saying so. Empty text deletes the line.
- **Retiming on the timeline** moves the words with the line; dragging an edge scales them inside
  the new span. **Split** cuts at the first word at or after the playhead (the middle word when
  the playhead is outside the line). Splitting a piece still moves captions at or after the cut.
- **Auto captions again:** for each requested piece, removes its `auto` lines that are not
  `edited`, then groups the transcript words that don't fall inside a kept line.
- **Manual captions** have no `words`. Word by word spreads their text evenly at render time, so
  they animate too.

## 6. Sync (D397)

- **One frame rule, shared:** `wordFrames(caption, piece, fps)` returns each word's first and last
  sequence frame (start = `round(at × fps)`; a word stays active until the next word's start). The
  preview and the Premiere export both call it, so they cannot drift by a frame.
- **Preview clock:** while playing, `useReelPlayback` takes time from
  `video.requestVideoFrameCallback` (`mediaTime` of the frame on screen), with the current
  `currentTime` loop as the fallback where the callback is missing. A watchdog re-arms the
  callback after a source swap at a cut. Paused and scrubbing behave as today.
- **Arrow keys** step one frame (Shift: one second), for checking sync without new buttons.
- Accuracy: Scribe's word times landed within a frame at 24 fps on all five test clips. A late
  line is fixed by dragging it on the timeline.

## 7. Style (D396)

- **One style for the reel**, on `captionStyle`. No per-line styles and no "apply to all" switch.
- **Presets** (a look; they never move or retime captions):

| Preset | Font | Size | Word by word | Upcoming | Finish |
|---|---|---|---|---|---|
| Clean | Poppins | 62 | off | – | shadow |
| Bold pop (default) | Montserrat | 84 | on, `#ffca2d` | show | outline, caps |
| Karaoke | Anton | 104 | on, `#ffca2d` | hide | outline, caps |
| Boxed | Poppins | 58 | on, `#c4b5fd` | dim | box `#111111` |

- **Controls:** Font (the five caption fonts, D393), Size (30–200), Colour, Word by word, and the
  colour of the word being said when it is on. Outline, box, caps and upcoming come from presets.
- **Position:** dragging on the preview sets `x`/`y` for every caption, inside a 4% margin,
  snapping to both centre lines with guides; a corner handle sets `size`. A label on the preview
  names what changes.
- **Dim** is a solid colour (the text colour mixed 45% towards the box or black), computed once and
  used by the preview and Premiere alike, because Premiere titles have no per-character opacity.
- **Shadow** shows only with no outline and no box, as the Premiere title is written.

## 8. Premiere (D398)

- Word by word **off**: one Graphic clip per line, as today, plus outline, box and caps.
- Word by word **on**: one Graphic clip per word, timed by `wordFrames`, each holding the whole
  line. Per-character runs give the word being said `activeColor`, upcoming words the dim colour,
  or, for *hide*, no fill and no stroke (`mFillVisible`/`mStrokeVisible` runs) so the line keeps
  its layout, as in the preview.
- Outline → `mStrokeVisible`/`mStrokeColor`/`mStrokeWidth`; box → `mBackFillVisible`,
  `mBackFillColor`, `mBackFillOpacity` 72, `mBackFillSize`; caps → the text upper-cased before
  writing (the preview upper-cases the same way, not with CSS).
- **Step 0 (before any build):** the caption probe writes `caption-probe-v2.xml` with one sequence
  per feature (per-word colour, hidden words, outline, box, caps). The user opens it in their
  Premiere. Anything Premiere doesn't read is dropped or replaced before the build relies on it
  (fallback for *hide*: each clip holds only the words said so far).
- The SRT in the package stays one cue per line.

## 9. The editor UI

- **Properties panel:** when a piece is selected, the piece's properties as today. Otherwise the
  **Captions panel**: title, line count, tabs **Text | Style**. Selecting a caption anywhere opens
  Text with its line marked and scrolled into view; the playing line carries a marker.
- **Text tab:** "Click a line to fix its words." Lines grouped under "Clip N" headers with each
  clip's state. Words below 90% confidence get a wavy underline with the tooltip "Might be
  misheard". `⋯` holds Add a caption at the playhead, Import SRT, Export SRT.
- **Style tab:** "Changes apply to all N captions. Drag a caption on the preview to move it; drag a
  corner to resize." Presets (2 × 2), Font + Size, Colour (+ word-being-said colour), Word by word.
  A closing line says what Premiere receives (one clip per line, or per word).
- **Timeline header:** the Auto captions button (with its cost) once anything is captioned; Split
  and Delete as today. The Caption / Import SRT / Export SRT buttons leave the header.
- **Captions lane:** empty state, Listening…, failed and new-take segments (§2), caption blocks.
- **Header:** Undo and Redo buttons.
- **Components** (one per file, ~200 lines max): `editor-captions-panel.tsx` (tabs),
  `editor-captions-text.tsx`, `editor-caption-line.tsx`, `editor-captions-style.tsx`,
  `editor-caption-presets.tsx`, `editor-auto-captions-button.tsx`, `editor-caption-lane-state.tsx`;
  `editor-stage-captions.tsx` and `editor-caption-overlay.tsx` render words and the resize handles.
  `editor-caption-props.tsx` and `editor-captions-toolbar.tsx` are removed. shadcn primitives only
  (Tabs, Switch, Select, Slider, Input, Button, Tooltip).

## 10. Undo and redo (D400)

- The editor store keeps up to 100 earlier docs. `apply` records one step; a drag records one step
  for the whole drag (`begin` at pointer-down, `commit` at pointer-up). Undo/redo go through the
  same autosave. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y, never while typing in a field.
- The Auto captions toast's **Undo** is the same history step.
- History is per page visit; it is not saved.

## 11. Decided, my calls, left to the builder

**Decided by the user (2026-10-22):** auto captions with word timing; perfect sync is the bar;
font choice; build it inside the Rough Cut Editor; Premiere export only (no MP4); styled,
retypable captions in Premiere; follow the conventions of other editors; keep it simple: language
detected, default look, no confirmation dialog, only the controls listed in §7 and §9.

**My calls:** ElevenLabs Scribe v2 (word timing, Indian languages, key already held); one style per
reel with no per-line styles; presets never move or retime; the cost on the button replaces the
dialog; edited lines are never rewritten; a new take keeps its captions and offers to caption
again; v1 edits keep only the first caption's look.

**Left to the builder:** exact Premiere stroke width and box padding (calibrated in step 0);
`STT_USD_PER_HOUR`; the poll interval.

**Next, not in this version:** Noto Sans Devanagari and Tamil in the caption fonts, picked
automatically when a dub's language needs them; a per-client list of brand spellings
("jackfruit365" → "Jackfruit365") applied after transcription; find and replace.

## 12. Tests

- **Unit (vitest):** `normalizeWords`, `groupWords`, `retextCaption`, retime/split with words,
  `wordFrames`, v1 → v2 reading, the dim colour, `transcribeCredits`, the Scribe response parser,
  Premiere runs for each look (snapshot of the decoded Source Text JSON), history (undo, redo,
  drag coalescing, no-op not recorded).
- **Routes:** transcribe start (all cached → no job; reserves; 402; 409; URLs from the server only;
  no-sound refused), transcripts read, job read.
- **Task:** partial failure settles only the successful seconds; total failure refunds; files land
  one by one.
- **Manual:** step 0 in Premiere; then the five Reel 2 clips: run, edit a word, retime, split,
  change preset, drag, undo, export, open in Premiere, compare a word's frame in both.

## 13. Done when

- [ ] One click captions every clip; each clip fills as its transcript lands; Undo puts it back.
- [ ] A word lights up on the same frame in the preview and in Premiere.
- [ ] Re-running is free for transcribed files and never rewrites a line the user edited.
- [ ] A clip with no speech fails alone, says so plainly and refunds; the rest are captioned.
- [ ] A new take or a switch to the dub offers "Caption this clip" and keeps the old captions.
- [ ] Style changes reach every caption; presets never move them; drag and resize work on the
      preview with centre snapping.
- [ ] Every edit can be undone and redone.
- [ ] Premiere receives editable, styled text on V2, per word when word by word is on.
