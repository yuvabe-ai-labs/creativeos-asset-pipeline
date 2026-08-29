# Multishot shots — per-shot toggle, hybrid fan-out, Gemini Omni

*Design spec — 2026-08-28. Decisions D193–D197. Replaces an earlier draft of this file that
put planning and a reference cast at the script level; that approach is superseded (see §10).*

Verified API facts live in a separate, design-independent file:
**[2026-08-28-gemini-omni-api-findings.md](2026-08-28-gemini-omni-api-findings.md)**.
Where it and the published Google docs disagree, it is right.

---

## 1. What this builds

Multishot is a property of **one shot**, not of a script and not of a model setting.

1. The parse emits a numeric duration per shot.
2. Fan-out groups consecutive shots into Shot nodes capped at **10s**, producing a hybrid canvas —
   some multishot, some single.
3. A Shot node carries a `multishot` toggle. Turning it off **splits** the node back into its
   constituent shots.
4. The motion-prompt node and the video-gen node each read that flag from upstream and change
   behaviour.
5. Gemini Omni 1.1 Flash is the only multi-shot model. Kling's `multi_shot` is hidden.

**Not built:** a script-level planner, a script-level cast, script-level reference inputs, a
`continuous_take` param, a merge action, the Omni extend chain, stateful edit turns, video
references.

---

## 2. Data model — two additions

```ts
// src/lib/nodes/reel-script.ts
export type ReelShot = {
  description?: string;
  duration?: string;          // unchanged — free text, for display
  duration_seconds?: number;  // NEW — the number grouping and the 10s cap need
};

// src/lib/canvas-nodes.ts — ShotNodeData
multishot?: boolean;
```

That is the entire schema change. **`visual_script.shots` is already an array**, so a multishot
Shot node is simply one whose array holds more than one entry — no block type, no plan type, no
new storage. This is why the redesign is a fraction of the size of the draft it replaces.

### Why `duration_seconds` rather than parsing the string

The existing `duration` is free text the model copies out of the script: `"22-26 seconds"`,
`"3 sec"`, `"0-3s"`. Grouping to a 10s cap needs arithmetic, and deriving it from that prose at
fan-out time is guesswork that fails silently — a shot whose duration doesn't parse would either
break a group or be dropped from one. The model already reads the duration to fill the string
field; it simply also returns an integer. `script-parse` bumps to **version 2**.

Absent or unparseable `duration_seconds` defaults to **4s** for grouping purposes, and the Shot
node shows that the value was assumed rather than parsed.

#### `duration_seconds` is a LENGTH, never a timecode

Real scripts write shot timings as **cumulative ranges**, not lengths. A live parse of the CHUPPS
"Where are you headed?" script returned:

| Shot | `duration` (as parsed today) | Length |
|---|---|---|
| 1 | `0–3 sec` | 3 |
| 2 | `3–8 sec` | 5 |
| 3 | `8–14 sec` | 6 |
| 4 | `14–18 sec` | 4 |
| 5 | `18–20 sec` | 2 |

A parse that returned `3, 8, 14, 18, 20` for `duration_seconds` would look entirely plausible and
make every group wrong — a 20s reel would blow the 10s cap on its third shot. The prompt must say
**"the shot's own length in seconds, not the end of its timecode range; for `8–14 sec` return
`6`"**, and the schema field is named for length. This is the single highest-risk instruction in
the parse change.

---

## 3. Fan-out — hybrid, capped at 10s

`fanOutShots` in `src/lib/canvas-store.ts` currently creates one Shot node per parsed shot. It
gains a grouping pass in front:

```
walk shots in order
  open a block
  add shots while (block total + next shot) <= 10
  close the block, open the next
```

- A block with **more than one** shot → `multishot: true`.
- A block with **one** shot → `multishot: false`.
- A single shot **longer than 10s** gets its own node, `multishot: true`, and is flagged in the UI
  as over-cap — its duration is clamped at request time. It is never split silently, because where
  to cut a 14s shot is a creative decision, not an arithmetic one.

Grouping is deliberately **consecutive-only and greedy**. It is not trying to find good seams —
that was the planner, and the planner is gone. The operator sees the result as nodes and adjusts
with the toggle.

### The floor matters as much as the ceiling

Omni's duration range is **3–10s**. Greedy packing respects the ceiling but can strand a trailing
remainder below the floor. The CHUPPS script above (lengths 3, 5, 6, 4, 2) does exactly that:

| Block | Shots | Seconds | |
|---|---|---|---|
| 1 | 1–2 | 3+5 = 8 | ok |
| 2 | 3–4 | 6+4 = 10 | ok, exactly at the cap |
| 3 | 5 | 2 | **below the 3s floor** |

A 2s block cannot be requested at 2s, and it cannot merge backward either — block 2 is already at
10. So grouping runs a **trailing rebalance** after the greedy pass:

> While the final block is below the floor, move the previous block's **last** shot into it —
> but only while all three hold: the previous block keeps at least one shot, the final block stays
> under the ceiling, **and the previous block itself stays above the floor**.

That third condition was missing from the first draft of this rule and is not optional. Lengths
`1, 8, 2` greedily pack to `9s` + `2s`; moving the 8s shot forward to lift the tail orphans a `1s`
block that then has to be clamped — **two** invented seconds and a wrecked 9s block, where simply
clamping the tail costs **one** and leaves the healthy block alone. When a move would strand the
block it steals from, decline it and let the clamp do the cheaper repair.

On this script that yields block 2 = `[6]` and block 3 = `[4, 2]` = 6s — both legal, nothing
dropped, nothing padded. If no rebalance is possible (a single block, or a lone sub-3s shot in the
whole script), the block's requested duration is **clamped up to 3s** and the node is flagged as
generating longer than scripted. Clamping is the last resort, never the first move: it invents
video the script did not ask for.

`seededFrom.shotIndex: number` becomes `seededFrom.shotIndexes: number[]`; a single-shot node
carries a one-element array, so provenance needs no special case.

---

## 4. The toggle, and what "split" means

| Node holds | Toggle | Result |
|---|---|---|
| N shots, on | → **off** | **Splits into N Shot nodes**, order and lineage preserved, each `multishot: false` |
| 1 shot, off | → **on** | One generation; the model may cut inside this single shot |
| 1 shot, on | → **off** | One generation, one continuous take |

Turning multishot off on a grouped node is a **structural change to the canvas**, not a display
flag — it creates nodes. It is therefore confirmed before it runs, and it is undoable through the
normal canvas undo.

**There is no merge action.** To regroup, re-run fan-out. Shipping the split one-way is the honest
minimum; a merge is easy to add later if the need turns out to be real, and easy to get subtly
wrong now (which node's edits win, what happens to downstream nodes already wired to each half).

---

## 5. References are File nodes

No cast, no new storage, no new UI. A reference is a **File node**, connected with the `+` that
`AddConnection` already puts on the motion-prompt and video-gen focus views. The mention editor
already lists connected file / draw / image-gen nodes with thumbnails, and **the File node's title
is the reference's name**.

**References attach to the motion-prompt or video-gen node, not to the Shot.** The video-gen route
walks two levels up — its own upstream, plus the motion-prompt's upstream — so a File on the Shot
sits three levels away and would never be found. Since there is one motion-prompt per shot, that is
shot-level in every way that matters, and it needs no traversal change.

---

## 6. A multishot shot goes straight to the motion prompt

A multishot Shot does **not** need to pass through an image-gen node first. There is no start frame
to generate: the generation is `text_to_video`, and the shot's own description plus any connected
File references are the whole input.

```
Shot [MULTI] ──▶ Motion prompt ──▶ Video gen        ← no image-gen in the path
```

The image-gen path remains available and unchanged for shots that want a start frame to animate
(`image_to_video`). It is one option, not a required stage — which is the practical reason
multishot is worth having: a cut sequence is described, not animated from a still.

---

## 7. The two upstream checks

### Motion-prompt node

Reads the upstream Shot's `multishot` flag and picks its prompt shape:

- **Multishot** → a timecode ladder over the N shots, times taken from `duration_seconds` and
  summing to the node total. Each beat leads with framing, then subject, then camera.
- **Single** → today's motion prompt, plus the suppression line
  *"In a single unbroken scene. No scene cuts."*

That suppression line is why there is **no `continuous_take` param**: the Shot's toggle already is
that decision, and a second control for the same thing is exactly the pair that drifts apart.

### Video-gen node

Reads the same flag:

- **Multishot** → the model picker shows **only Gemini Omni**, with the reason stated inline
  ("this shot is multishot — only Omni cuts natively"). Selecting Veo would silently ignore the
  ladder and return one continuous take, which reads as a bug rather than a choice.
- **Single** → every model, Omni included.
- **Duration** defaults to the sum of the node's `duration_seconds`, clamped to 3–10, **editable**,
  and labelled with where the default came from. Derived-by-default keeps the ladder in the prompt
  and the duration on the request agreeing — the pair whose drift truncates footage at full price.

---

## 8. Params

All controls stay on the video-gen node, matching Veo and Kling. What differs is only which channel
carries each one to the model:

| Param | Control | Values | Default | Channel |
|---|---|---|---|---|
| `resolution` | select | 360p / **720p** / 1080p / 4k | `720p` | `response_format` |
| `duration` | slider 3–10 | derived from the shot | shot total | `response_format`, as `"8s"` |
| `aspect_ratio` | select | 16:9 / 9:16 | `16:9` | `response_format` |
| `audio` | select | ambient / dialogue / music | `ambient` | **prompt text** |
| `on_screen_text` | textarea | quoted copy to render | empty | **prompt text** |
| `negative_prompt` | textarea | defect list | tuned | **prompt text** |

Every param is in the `primary` group — the Advanced accordion was removed from the focus view in
`7e1c643`, so an `advanced` control renders nowhere.

`response_format.type` is always `"video"` and is a provider constant. It is never a param and is
never surfaced in the UI.

`on_screen_text` earns a control because Omni renders screen-space type correctly and the docs
recommend stating it explicitly. It becomes a quoted sentence in the prompt. A brand lock-up is
still composited in post — rendered-correctly is not typographically exact.

### Kling

`multiShotParam` gets `visible: false` in both `kling30Params` and `klingO1Params`. The param still
resolves to its `false` default and still sends, so no request shape changes and no persisted node
breaks; it simply renders nowhere. Kling 3.0's end-frame rule that pins `multi_shot` stays valid and
untouched.

---

## 9. The provider

Corrected against live probing — the draft this replaces had the request shape wrong.

```jsonc
{
  "model": "gemini-omni-1.1-flash",
  "input": [ /* image parts, then the text part */ ],
  "generation_config": { "video_config": { "task": "text_to_video" } },
  "response_format": {
    "type": "video", "resolution": "720p", "aspect_ratio": "16:9",
    "delivery": "uri", "duration": "8s"
  },
  "store": true, "background": false, "stream": false
}
```

- **`video_config` carries `task` and nothing else.** It rejects `duration`, `resolution` and
  `aspect_ratio` with `Unknown parameter`.
- **`duration` is a string** (`"8s"`) in `response_format`. The integer form fails with
  `Invalid input`.
- **`store: true` is required** by `delivery: "uri"`. A useful side effect: storing the interaction
  is what makes `previous_interaction_id` editing possible, so the stateful edit chain is available
  later with no request-shape change.
- **`output_video` does not exist over REST.** Read the video from `steps[]` → the `model_output`
  step → its `video`-typed content entry's `uri`.
- `task` is `text_to_video` with no images, `image_to_video` with a start frame,
  `reference_to_video` with references only.

Image roles keep the generated explicit declaration header from D186 — `@ImageN` is 1-based over
the whole upload array while `<IMAGE_REF_N>` is 0-based over references only, and no prompt or LLM
ever writes that line by hand.

Downstream needs no new machinery: `completeGeneration` already downloads a provider URI and
re-uploads to GCS, and `buildVideoDownloadHeaders` sends `x-goog-api-key` for `veo:` — it gains a
`gemini:` branch.

**Cost:** 360p $0.03 · 720p $0.10 · 1080p $0.15 · 4k $0.30 per second. 1080p and 4k are upscaled
from 720p, not natively rendered.

---

## 10. What this replaces, and why

| Superseded | Replaced by |
|---|---|
| **D188** one parse, two planners | Parse unchanged plus `duration_seconds`; grouping happens at fan-out (§3) |
| **D189** validated shot plan | No plan object to validate. The 10s cap is enforced at fan-out and again before the request |
| **D190** cast on Script data, copied at fork | References are File nodes connected downstream (§5) |
| **D192** cast-first reference merge order | No cast, so no merge. The frame semantics half of D192 stands |

The draft was built around a planner that grouped shots by narrative seam and a cast that lived on
the script. Both solved problems this design does not have: grouping is greedy and visible on the
canvas where it can be corrected by hand, and a reference is a node that already exists.

**D184** (target stable 1.1), **D185** (raw REST — the SDK does not type the video path),
**D186** (the generated declaration header and its two index bases) and **D187** (controls whose
channel is prompt text rather than an API field) all stand. D185 and D187 were confirmed by the
live probing that produced the API findings file.

---

## 11. Testing

Pure units, colocated in `__tests__/` per the existing convention:

- `groupShotsForFanOut` — consecutive greedy packing to the 10s cap; a single over-cap shot gets its
  own node and is flagged; missing `duration_seconds` falls back to 4s; total shot count is
  conserved across all groups. **The CHUPPS case (3, 5, 6, 4, 2) is a fixture**: it must yield
  `[1,2] [3] [4,5]` after the trailing rebalance, never a 2s final block. Also: a lone sub-3s shot
  clamps to 3s and is flagged; a rebalance never leaves the previous block empty.
- `splitMultishotNode` — N shots become N nodes in order, each `multishot: false`, lineage and
  `shotIndexes` preserved.
- `deriveShotDuration` — sum clamped to 3–10; an over-cap node clamps to 10.
- `planOmniInput` — upload order, both index bases, `task` selection.
- `composeOmniPrompt` — the ladder for multishot, the suppression line for single, the audio
  clause, on-screen text, and the negative list as its own trailing paragraph.
- `buildOmniResponseFormat` — `duration` emitted as `"Ns"`, resolution and ratio validated,
  `delivery: "uri"` always, `type` constant.
- `computeVideoCost` — all four Omni resolutions; an unpriced combination returns `null`.
- Model filtering — a multishot upstream yields an Omni-only picker; a single upstream yields all.

Run per-directory (`npx vitest run src/lib/video-gen`), not a full `vitest run` — the full suite
has ~11 unrelated timeout flakes in API-route tests.

---

## 12. Build order

1. **Provider** — corrected request shape, params, cost, registry. Shippable alone with
   hand-written prompts.
2. **Parse + fan-out** — `duration_seconds`, grouping, `multishot` flag, the split toggle.
3. **Upstream checks** — motion-prompt ladder, video-gen model filter and derived duration.
4. **Kling** — hide `multi_shot` on both models.

Each step leaves the app working.

---

## 13. Open risks

1. **Whether the Files object needs an `ACTIVE` poll before download** is unverified — probe before
   relying on either answer.
2. **Tag behaviour with real images** (`<FIRST_FRAME>`, `<IMAGE_REF_N>`) has not been exercised;
   only text-to-video has.
3. **Safety rejections consume credits without refund** at Google, even though our own reservation
   is refunded.
4. **`ref/multishot-refs/gemini-omni-flash-system-prompt.md` is preview-era** and asserts "720p
   only", "no end frame", "no extension" as hard rules. Wrong for 1.1; needs a version banner.
