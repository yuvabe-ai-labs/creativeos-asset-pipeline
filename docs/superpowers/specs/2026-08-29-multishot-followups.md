# Multishot — known gaps after implementation

*Recorded 2026-08-29, from the final whole-branch reviews of both plans. Everything that risked
data or money was fixed on the branch; these are what was deliberately left. Nothing here blocks
merge, and each is written so it can be picked up without re-deriving the context.*

---

## Not yet verified against the real model

**Whether Omni actually cuts by default.** The entire multishot design assumes Google's documented
behaviour — *"By default Omni Flash will try to create a video with a few different shots."* No
generation has demonstrated it. The only live runs were 3 seconds, too short to show a cut. If it
turns out not to cut, the ladder needs strengthening (an explicit "cut to" per beat) before the
feature is trustworthy.

**Whether the image role tags work.** `<FIRST_FRAME>`, `<LAST_FRAME>` and `<IMAGE_REF_N>` are
generated correctly and their *schema* is verified, but no generation has been run with real images
to confirm the model honours them.

Both are steps in the plans' final tasks and need a browser plus human eyes.

---

## Left undone, with reasons

### The `clamped` / `overCap` flags are computed but unread

`groupShotsForFanOut` returns both, and both are tested, but `fanOutShots` discards everything
except `shotIndexes`. The design spec commits to *"the node is flagged as generating longer than
scripted"*, and that flag does not reach `ShotNodeData`.

Two tests therefore assert a field no product code reads. **Either** carry both flags into
`ShotNodeData` and surface a small badge on the node, **or** delete them and their tests. Leaving
them as-is is the worst of the three, because it reads like coverage.

### The Composer and "promote ideas" still read beat 1

`canvas-store.ts`'s `promoteIdeasToShots` and `shot-compose-sheet.tsx` seed from
`visual_script.shots[0]` regardless of which beat the operator selected in the node's chip strip.
No data is lost — the siblings are additive — but the promoted siblings inherit the group's
`seededFrom.shotIndexes` while holding one shot, so their lineage claims more than they contain.
Inconsistent with the per-beat editing this work introduced.

`renderShotForImage` also reads `shots[0]`. For a grouped node that is *defensible* — the start
frame is beat 1 — but it is now an assumption rather than a tautology, and deserves a comment so
nobody "fixes" it into concatenating beats.

### Split pieces all inherit the group's `order`

`splitMultishotData` spreads `...data`, so three pieces all display "Shot 3". Display-only today
because nothing else consumes `order`. Note also that `fanOutShots` now sets `order` to the *group*
index while `ShotNodeData`'s comment still describes it as "1-based position in the script" — the
comment is now wrong either way.

### The ladder drops the strategic objective

`mapUpstreamForVideo`'s single-shot path yields `Action: …` plus `Objective: …`, and
`render-shot-for-video.ts` calls the objective "the motion driver". The multishot path emits only
the beats, so a grouped node hands the prompt writer *less* creative context than a lone one.
Appending the objective to the ladder is a one-line fix.

### `sourceHandle` is dropped on carried edges

`splitMultishotNode` preserves `targetHandle` but not `sourceHandle`. Latent rather than broken —
no shot-node input uses a source handle today.

### Two clamps, one rounding difference

`groupShotsForFanOut` and `deriveShotDuration` both clamp to 3–10 using the same shared constants,
but `deriveShotDuration` additionally `Math.round`s. The parse schema says `duration_seconds` is an
integer, so they agree — but data parsed before that schema landed could drift them by under a
second.

### `shot-node.tsx` uses a raw `<textarea>`

Pre-existing, and a violation of the project's rule that every interactive control is a shadcn
primitive. Untouched here because changing the node's editing surface mid-feature is a bigger risk
than the rule breach. Worth its own pass.

### Kling's `multi_shot` is hidden but not off

`visible: false` stops it rendering, but the route reads a node's saved value and only falls back to
the default — so a Kling node an operator toggled on before D218 keeps sending `multi_shot: true`
with no control left to clear it. Recorded on D218 as a watch-item.

---

## Two lessons worth keeping

**A widened union needs every narrowing site updated, and a cast will hide that.** `provider` gained
`"gemini"`, and `providerOf` cast it away — so the compiler stayed silent while the Target model
chips rendered empty and disabled, uncorrectable. The same omission appeared twice more
(`TargetProviderSelect.OPTIONS`, `selectorValue`). Before adding a fourth model family, grep for
`as VideoProvider`.

**Filtering a picker is not enforcing a constraint.** The Omni restriction hid every other chip but
never changed the node's `modelId`, and a new node defaults to Veo — so Generate would have billed a
Veo run fed a ladder Veo ignores, which is exactly what the restriction existed to prevent. The
enforcement had to be a coercion on connection, not a filtered list.
