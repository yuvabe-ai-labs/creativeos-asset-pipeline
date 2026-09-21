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
size) · Seedance settings (model 2.5 / 2.0 / 2.0-fast, resolution, duration, ratio) · **Run all**.

**Rows = faces.** Each row, left to right:

1. **Seedream column** — prompt textarea, face image, *Generate face* / *Regenerate*, *Download*.
   States: empty → generating → generated (or rejected, with the raw reason).
2. **Seedance tiles** — one tile per script, owned by that row, plus a dashed **+ Script**.
   A tile *is* the script until it becomes the video:
   draft (editable text, *Run*) → generating (text dimmed, elapsed time) → video (player,
   *Download*, 📝 shows the script it used, ↻ re-run) — or rejected (reason shown, edit & retry).
   Run is disabled until the row has a face.

Dashed **+ Face** adds a row. Rows are independent — to try a script on another face, paste it.

**Regenerate never overwrites.** It duplicates the row (same prompt + scripts, not yet run) and
generates a new face there. Old face and its videos stay for comparison.

**Run all** runs every draft tile whose row has a face, at most 3 Seedance tasks at a time.

## How it works

- Browser orchestrates and polls (every 5s). No DB, no Trigger.dev — so it works on localhost
  and on a Vercel preview with only `BYTE_PLUS_API_KEY`.
- Three thin routes under `src/app/api/ugc/`: `POST face`, `POST video`, `GET video/[taskId]`.
- `src/lib/ugc/` — the spike's ModelArk client and model ids, carried over; a
  `buildSeedancePrompt(script, settings)` that appends the `--flags`.
- The Seedream URL is passed to Seedance verbatim (trusted-output rule — any copy/re-encode
  loses trust).
- UI in `src/components/ugc/`: `ugc-bench`, `settings-bar`, `face-row`, `face-column`,
  `script-tile`. shadcn primitives only, Yuvabe tokens.
- The old `/lab/seedance` page, its routes and `src/lib/lab/` are deleted; FINDINGS.md moves
  to `docs/superpowers/specs/2026-09-18-seedance-human-reference-findings.md`.

## Testing

Unit test for `buildSeedancePrompt`. Then a manual run on localhost: 2 faces × 2 scripts,
one Run all, one Regenerate.

## Out of scope

OmniHuman, saved boards, uploaded photos, voice recordings, copying scripts between rows.
