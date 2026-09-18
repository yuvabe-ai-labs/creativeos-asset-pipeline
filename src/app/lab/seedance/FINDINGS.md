# Spike: Seedream → Seedance for human-reference UGC video

**Date:** 2026-09-18 · **Status:** answered, throwaway code · **Branch:** `worktree-video-gen-experiments`

## Question

Can we generate UGC-style video with a human presenter through BytePlus ModelArk,
given that Seedance rejects uploaded photos of real people?

## Answer: yes, via the sanctioned trusted-output path

Verified end-to-end with real API calls. Seedream 5.0 text-to-image → Seedance 2.5
`reference_image` → 720×1280, 5.06s, h264 + AAC, identity preserved, speech audio
generated. Total ~100s wall clock.

## Why the block exists and how it is meant to be solved

Seedance 2.5 and the 2.0 series *"do not support directly uploading reference
images/videos that contain real human faces."* ModelArk trusts three input sources
instead ([docs](https://docs.byteplus.com/en/docs/ModelArk/2608626)):

| Trusted input | Valid | Since |
|---|---|---|
| Face-containing images from Seedream 5.0 **text-to-image** | 30 days | 2026-04-16 |
| Face-containing videos from Seedance 2.5 / 2.0 | 30 days | 2026-03-11 |
| Last-frame images of those videos | 30 days | 2026-04-16 |

Plus: preset digital characters (`asset://<id>`, free and compliant) and authorized
real-person assets (identity verification required).

Constraints: same account only, ModelArk only, **original unmodified output only**,
and output moderation can still reject the result independently.

## Gotchas worth carrying forward

1. **Model ids must come from `GET /api/v3/models`, not the docs.** The docs name
   "Seedream 5.0 lite"; no such id exists. The trusted model is `seedream-5-0-260128`.
   `dola-seedream-5-0-pro-260628` is the pro variant and is *not* trusted.
2. **Seedance settings ride inside the prompt text as `--flags`**, not JSON fields:
   `--resolution 720p --duration 5 --ratio adaptive`. Get it wrong and you silently
   get model defaults (1080p on Seedance 1.0 — more expensive).
3. **Any re-encode, crop or overlay destroys trusted status.** Pass the Seedream URL
   through verbatim. This also rules out the "grid overlay" filter-evasion trick
   circulating in blog posts — besides being moderation evasion, it would break the
   legitimate path it is supposed to replace.
4. **Both output URLs expire in 24h** (video also caps at 100 downloads). Nothing here
   is storage; a real feature must copy outputs to our own bucket — but the *copy*
   cannot be fed back to Seedance, only the original.
5. Image generation is **sync**; video is **async task + poll**. Same vendor, two
   interaction models.
6. Seedance inherits aspect ratio from the reference image under `ratio: adaptive` —
   a portrait reference gave 9:16 without asking.

## What was NOT tested

- Lip-sync fidelity against a supplied audio track (`reference_audio`, Seedance 2.5).
- OmniHuman (BytePlus's dedicated photo+audio digital-human model) — likely a better
  fit than Seedance for talking-head UGC; worth its own spike.
- Preset digital characters route (`asset://`) — needs the library activated.
- Cost per generation. The 5s 720p clip reported 108,900 completion tokens.

## Status of this code

Throwaway. `/lab/seedance`, two API routes, one client. No DB, no Trigger.dev, no
canvas coupling. Delete with the branch; do not build the product feature on it.
