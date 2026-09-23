# UGC bench — Seedream × Seedance test page

**Date:** 2026-09-21 · **Status:** design approved in brainstorm · **Branch:** `worktree-video-gen-experiments`
**Kind:** internal test tool for a founder + designer session. Not a product feature; no ADR.

## Why

The spike (FINDINGS.md, 2026-09-18) proved Seedream 5.0 face → Seedance 2.5 `reference_image`
produces UGC video with a consistent presenter. Now we want to *try combinations* — several
presenters, several scripts each — and see what comes out. OmniHuman is out of scope (cost).

## What the page is

One route, `/ugc`, behind the existing login. Session only: state lives in the browser tab.
Nothing is saved; BytePlus URLs expire in 24h, so every image/video has a Download button and
a banner says so.

**Top bar** — Seedream settings (model fixed to `seedream-5-0-260128`, the only trusted one;
size fixed at 2K) · Seedance settings (model 2.5 / 2.0 / 2.0-fast, resolution, duration, ratio) · **Run all**.

**Rows = faces.** Each row, left to right:

1. **Seedream column** — prompt textarea, face image, *Generate face* / *Regenerate*, *Download*.
   States: empty → generating → generated (or rejected, with the raw reason).
2. **Seedance tiles** — one tile per script, owned by that row, plus a dashed **+ Script**,
   with the row's **voice strip** underneath (see *Voice anchor* below).
   A tile *is* the script until it becomes the video:
   draft (editable text, *Run*) → generating (text dimmed, elapsed time) → video (player,
   *Download*, 📝 shows the script it used, ↻ re-run) — or rejected (reason shown, edit & retry).
   Run is disabled until the row has a face.

Dashed **+ Face** adds a row. Rows are independent — to try a script on another face, paste it.

**Regenerate never overwrites.** It duplicates the row (same prompt + scripts, not yet run) and
generates a new face there. Old face and its videos stay for comparison.

**Run all** runs every draft tile whose row has a face, at most 3 Seedance tasks at a time.

**Starter board** (added after the first look): the page opens pre-filled from the CHUPPS
"Boring Sliders" brief — two creators (female / male, 18–25) × the same two 5s hook beats —
so a first session is just *Generate face* ×2 → *Run all (4)*. Rows and tiles added later
start blank. Source: `src/lib/ugc/starter.ts`.

**Voice anchor** (added 2026-09-22, for voice consistency): each finished clip has a 🎙
button in its footer, and the row's **voice strip sits under the script tiles**, in the
Seedance column — the voice is a Seedance input, not a Seedream one. The strip shows the
player, where the voice came from, a ✕ to drop it, and the voice description. The server (`POST /api/ugc/voice`, BytePlus hosts only) downloads the
clip and extracts a mono mp3, capped at 30 s, with ffmpeg (`ffmpeg-static`, shipped in the
route's bundle via `next.config.ts`). That becomes the row's voice. From then on every
generation for the face sends it as `reference_audio` (a data URL, never hosted), and the
prompt gets *"Use the person in @Image 1 … Reference only the voice timbre in @Audio 1 …
Voice: {description}"*. Tiles made with the voice show a mic marker, so with and without can
be compared. *New face* carries the voice across. Durations now go up to 30 s (4–30 in one
call). Audio references don't add Seedance tokens, so there's no extra cost.

**Second tab — Gemini Omni** (added 2026-09-23): the same board UI on Google's engine, with its
own state (`keepMounted`, so a generating clip survives a tab switch). Settings follow the engine
(3–10 s, 360p–4k, 16:9 or 9:16), it defaults to 360p (~$0.15 a clip), a run is one synchronous
call with no polling, and the voice strip is hidden because Omni has no `reference_audio`. That
tab also allows **uploading a photo** as the presenter — Google has no trusted-output rule, so its
own safety filter decides and a refusal is shown verbatim. Videos play through
`/api/ugc/omni/file`, which adds the Google key the file URI requires.

**Activity log** (added after the first look): every call is recorded on the page — time,
"Face N · Script M" position, HTTP status, duration — with errors in red, the raw
request/response one click away, and *Copy log* for bug reports. In-progress polls are not
logged, only failures and the final result. Failed ModelArk calls are also printed to the
server terminal (`[ugc] …`, never the key). An expired login is reported as such rather
than as a JSON parse failure.

## How it works

- Browser orchestrates and polls (every 5s). No DB, no Trigger.dev — so it works on localhost
  and on a Vercel preview with only `BYTEPLUS_API_KEY` (the product's name for the same key;
  the old `BYTE_PLUS_API_KEY` is still read as a fallback).
- Four thin routes under `src/app/api/ugc/`: `POST face`, `POST video`, `GET video/[taskId]`,
  `POST voice`.
- `src/lib/ugc/` — the spike's ModelArk client and model ids, carried over; a
  `buildSeedancePrompt(script, settings, voice?)` that appends the `--flags` and, with a voice,
  the @Image 1 / @Audio 1 lead; `voice.ts` for ffmpeg extraction; `board.ts` for the row/tile
  model; `request.ts` for logged fetches.
- The Seedream URL is passed to Seedance verbatim (trusted-output rule — any copy/re-encode
  loses trust). The voice mp3 travels inline as a data URL and is never hosted.
- UI in `src/components/ugc/`: `ugc-bench`, `settings-bar`, `face-row`, `face-column`,
  `script-tile`, `voice-panel`, `activity-log`. shadcn primitives only, Yuvabe tokens.
- The old `/lab/seedance` page, its routes and `src/lib/lab/` are deleted; FINDINGS.md moves
  to `docs/superpowers/specs/2026-09-18-seedance-human-reference-findings.md`.

## Testing

Unit tests for `buildSeedancePrompt` (with and without a voice), the board helpers
(`duplicateRow`, `runnableTiles`), the log's data-URL shortening, and `extractVoice` against
media generated by ffmpeg itself (length, the 30s cap, too-short, no audio track).

Then a manual run on localhost: 2 faces × 2 scripts, one Run all, one Regenerate, then 🎙 on a
clip and a re-run to compare the voice with and without.

## Out of scope

OmniHuman, saved boards, uploaded photos, **uploaded** voice files or a YouTube-URL voice
source (the voice can only come from one of the bench's own Seedance clips — a recorded
human voice raises consent questions and is untested), and copying scripts between rows.
