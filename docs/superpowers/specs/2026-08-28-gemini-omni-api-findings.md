# Gemini Omni 1.1 Flash — verified API facts

*Established 2026-08-28 by live probing against `gemini-omni-1.1-flash` with the project's own
`GOOGLE_GENAI_API_KEY`. These are empirical, not documentary: **where this file and the published
docs disagree, this file is right.** Independent of any pipeline design — preserved across the
flow redesign of 2026-08-28.*

Total spend to establish all of it: **$0.09** (one 360p × 3s generation). Every schema fact below
was obtained at zero cost using a trailing sentinel key — see §4.

---

## 1. The request shape that actually works

```jsonc
{
  "model": "gemini-omni-1.1-flash",
  "input": "…prompt string, or an array of content parts…",
  "generation_config": { "video_config": { "task": "text_to_video" } },
  "response_format": {
    "type": "video",
    "resolution": "360p",      // 360p | 720p | 1080p | 4k
    "aspect_ratio": "16:9",    // 16:9 | 9:16
    "delivery": "uri",
    "duration": "3s"           // STRING, "<int>s" — 3s..10s
  },
  "store": true,               // REQUIRED when delivery is "uri"
  "background": false,
  "stream": false
}
```

Verified HTTP 200, `status: "completed"`, synchronously — with `background: false` the interaction
returns finished. No task-level polling loop is needed.

## 2. Where the published docs are wrong

| Doc claims | Reality |
|---|---|
| `generation_config.video_config.duration` | ❌ `Unknown parameter 'duration' at 'generation_config.video_config'` |
| `generation_config.video_config.resolution` | ❌ `Unknown parameter 'resolution' at 'generation_config.video_config'` |
| `duration` is an integer (`8`) | ❌ `Invalid input at 'response_format'` — it is the **string** `"8s"` |
| `store: false` recommended for speed | ❌ `store=true is required when response format has video delivery set to URI` |
| `interaction.output_video` | ❌ absent over REST — SDK-only, as the docs' own note says |

**`generation_config.video_config` accepts `task` and nothing else.** Not duration, not
resolution, not aspect_ratio. Everything dimensional lives in `response_format`.

**`store: true` is forced** by `delivery: "uri"`. This is good news beyond this change: storing the
interaction is what makes `previous_interaction_id` editing possible, so the stateful edit chain is
available for free whenever it is wanted — no request-shape change needed to enable it later.

## 3. Reading the response

`output_video` does not exist on the REST response. The video is in `steps[]`:

```jsonc
{
  "id": "v1_ChcxMGlSYXU3N0p1cXRqdU1QaE1HZ3FBdxIX…",
  "status": "completed",
  "object": "interaction",
  "steps": [
    { "type": "thought",      "content": [ … ] },
    { "type": "model_output", "content": [
      { "type": "video",
        "mime_type": "video/mp4",
        "uri": "https://generativelanguage.googleapis.com/v1beta/files/u1jbms4c1zkl:download?alt=media" }
    ] }
  ]
}
```

Step types observed: `thought`, `model_output`. With `delivery: "uri"` the video content entry
carries `uri` and **no inline `data`** (`dataLen: 0`).

The URI form is `…/v1beta/files/{fileId}:download?alt=media`, so a `files/([A-Za-z0-9_-]+)` match
recovers the Files API resource name for a status check. Downloading it requires the
`x-goog-api-key` header — which `completeGeneration`'s `buildVideoDownloadHeaders` already sends
for `veo:` model ids and must also send for `gemini:`.

## 4. The technique — free schema discovery

Send a key the API cannot know, **last** in the object under test:

```js
response_format: { type: "video", resolution: "360p", zzz_probe_sentinel: 1 }
```

- Error names `zzz_probe_sentinel` → every key before it was **accepted**.
- Error names one of your own keys → **that** key is the problem.

The validator rejects unknown parameters before generating anything, so this maps a schema for
free. It also distinguishes *unknown parameter* (wrong key) from *invalid input* (right key, wrong
type) — which is exactly how the `duration` string-vs-integer question was settled without paying
for a generation.

Reuse this before spending on any new provider's parameter surface.

## 4a. Content-part schema — verified 2026-08-29

`input` accepts a **string** or an **array of content parts**. Both part shapes the provider sends
are accepted, confirmed by the §4 sentinel technique at zero cost:

| Part | Shape | Result |
|---|---|---|
| Text | `{ "type": "text", "text": "…" }` | accepted |
| Image | `{ "type": "image", "data": "<base64>", "mime_type": "image/png" }` | accepted |

The array form also generated successfully end to end (360p × 3s, $0.09) — the error in each probe
named only the sentinel key, meaning every real key beside it passed validation.

This closes what was the largest unverified surface in the integration: the provider always sends
the array form, including on the zero-image path, and its part key names were previously a guess.

## 4c. `duration` is honoured across the range — verified 2026-08-31

3s, 5s, 8s and 10s were all generated at 360p / 16:9, text-to-video. **All four succeeded**, which
settles that the documented 3s floor is real and reachable, not just documented.

| Requested | Generated in | Total incl. poll | File size | KB per second |
|---|---|---|---|---|
| 3s | 23.7s | 31.0s | 311 KB | 104 |
| 5s | 23.1s | 31.0s | 570 KB | 114 |
| 8s | 32.8s | 41.0s | 854 KB | 107 |
| 10s | 24.6s | 31.9s | 1,208 KB | 121 |

**The size column is the evidence that matters.** Bitrate is near-constant, so file size tracks
duration almost linearly. Had `duration` been ignored and everything fallen back to the 8s default,
all four files would sit near 854 KB — they do not. A 3s request really produces a 3s clip.

Generation time is roughly 23–33s and scales loosely with duration, well inside the provider's 540s
timeout.

**The `PROCESSING` state is intermittent.** These four runs reached `ACTIVE` on the first poll; the
10s run in §4b needed a second. Both paths therefore occur, which is exactly why the poll must exist
rather than being an optimisation.

## 4b. The Files object is NOT immediately downloadable — verified 2026-08-30

A real 10s / 360p generation returned its URI while the file was still **`PROCESSING`**, and only
reached **`ACTIVE`** on the next poll about 5 seconds later. `delivery: "uri"` therefore hands back
a URI that is not yet downloadable, and the provider must poll `GET /v1beta/files/{id}` until
`ACTIVE` before returning it.

The first implementation checked the state once, logged it and returned — which handed
`completeGeneration` a URI it could try to download too early. Fixed to poll.

Observed timings for that run: HTTP 200 in **24.6s**, `ACTIVE` about 5s later, 1.24 MB for 10s at
360p, `content-type: video/mp4`. Total wall clock 31.9s.

## 5. Still unverified
- Behaviour of `<FIRST_FRAME>` / `<LAST_FRAME>` / `<IMAGE_REF_N>` tags with real image inputs —
  only text-to-video has been exercised.
- Whether `duration` accepts values outside 3–10s, and what it does with them.
- Whether multi-shot cutting actually occurs by default at 3s (too short to show cuts).
