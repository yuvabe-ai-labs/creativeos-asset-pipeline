# Multishot video generation — test observations (Jackfruit365)

**Date:** 2026-09-22
**Lane tested:** Multishot video generation — Gemini Omni, with comparison generations on Kling and
Seedance
**Material:** Jackfruit365 UGC reel — *"A Day in Her Kitchen"*, 45 seconds, six clips

## Scope

The multi-shot video generation flow was tested end to end using a generated script for
Jackfruit365: a 45-second UGC-style Instagram Reel in which a mother moves through a normal day of
cooking in her own kitchen, working the product into meals she is already making.

The script runs to six clips, five of them set in the same kitchen, with one spoken creator line per
clip. It exercises three requirements of the lane simultaneously: a **single continuous setting**
across five clips, a **specific product pack** present on camera throughout, and a **voiceover that
tracks the action** clip by clip.

The script as tested is reproduced in the appendix.

Three observations follow.

---

## 1. The setting is not consistent across clips (Omni)

The script holds the creator in one kitchen for clips 1 through 5. The video generated on Omni does
not maintain it. The kitchen's look and atmosphere change from clip to clip, so the sequence reads as
several different kitchens cut together rather than one room filmed across a single morning.

The inconsistency is most pronounced on clips generated from the prompt text alone, with no anchoring
frame or reference image fixing the scene, and on the faster speed clips.

For a reel premised on one person in one home, this undermines the format.

---

## 2. The exact product does not appear in the generated video (Omni)

The Jackfruit365 pack appears in five of the six clips — taken from the shelf, opened, measured from,
and left visible on the counter. An exact product reference was supplied.

The video generated on Omni does not contain that product. The pack that appears is plausible but is
not the reference, and it is rendered convincingly enough that the substitution is easy to miss
without knowledge of the actual packaging.

The same reference was retried directly in Google AI Studio (Gemini), outside CreativeOS, with the
same result.

**This is specific to Omni.** The same product reference was run on Kling and on Seedance, and both
rendered the exact product in the output.

---

## 3. The voiceover is not held at shot level

Each clip in the script carries its own creator line, written against the action in that clip. In the
generated output the lines are not bound to their clips: they are swapped between shots and land on
clips they were not written for.

The clearest instance is the closing call to action from clip 6 — *"And there are so many similar
stories on Amazon. Read the reviews for yourself — link in bio."* — which appeared on the clip 1
kitchen beat, the opening morning-routine shot.

The voiceover appears to be parsed and stored separately from the shots rather than remaining
attached to them, so a shot's own line is no longer travelling with it at the point its prompt is
generated. Lines are consequently placed arbitrarily rather than where the script assigned them.

---

## Limits of this pass

- The full reel was generated on Gemini Omni. Kling and Seedance were exercised as comparison
  generations against the same product reference — one generation on Seedance — rather than as full
  runs of the reel.
- A single script was used — one setting, one character, six clips.
- Observations are drawn from the generated video compared against the script. The intermediate
  generated prompts were not captured alongside the output.

---

## Appendix — the script as tested

**Title:** A Day in Her Kitchen
**Product:** Jackfruit365
**Objective:** Relatability + Product Understanding + Social Proof
**Duration:** 45 seconds
**Platform:** Instagram Reels / YouTube Shorts
**Language:** English

### CLIP 1 (0–6 sec) — Morning routine

**Visual:** Morning in a normal Indian home kitchen. Medium handheld phone-camera shot. She is
already preparing breakfast. She casually reaches to the kitchen shelf, takes the Jackfruit365 pack,
and places it beside the batter. No deliberate product pose. She continues cooking naturally.

**Creator:** "This has actually just become part of my regular cooking now."

### CLIP 2 (6–14 sec) — Breakfast

**Visual:** Closer kitchen-counter shot. She opens the Jackfruit365 pack, measures the flour, adds it
to the dosa/idli batter, and slowly mixes it in. Keep the camera focused on her hands, the batter,
and the pack beside her.

**Creator:** "In the morning, I just mix a little into our regular dosa or idli batter."

### CLIP 3 (14–20 sec) — Same breakfast

**Visual:** Single natural shot at the stove. She pours the prepared batter onto the hot tawa and
gently spreads it into a dosa. Nothing else changes in the scene.

**Creator:** "I don't make anything separately. Breakfast stays exactly the way we normally make it."

### CLIP 4 (20–28 sec) — Rotis for lunch

**Visual:** Later in the same kitchen. She adds Jackfruit365 to a bowl of atta, mixes the flour, and
begins preparing the dough. The Jackfruit365 pack remains naturally visible on the counter.

**Creator:** "For lunch, I add it to the atta and make the same rotis I pack for my husband."

### CLIP 5 (28–37 sec) — Her experience

**Visual:** She places freshly prepared rotis into her husband's lunchbox and closes it. Camera stays
slightly to the side, as though someone in the house casually filmed the moment. She does not turn
and perform directly to camera.

**Creator:** "I've been using it regularly for two or three months, and I've seen my blood sugar come
down."

### CLIP 6 (37–45 sec) — Reviews + close

**Visual:** Cut away from the kitchen footage to a real screen recording of the Jackfruit365 Amazon
product page. Slowly scroll through genuine customer reviews, pausing briefly on reviews describing
similar experiences.

**Creator:** "And there are so many similar stories on Amazon. Read the reviews for yourself — link
in bio."

*On-screen text: none, in every clip.*
