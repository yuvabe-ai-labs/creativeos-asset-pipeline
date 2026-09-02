// Video-prompt-generate — versioned, evaluable records (mirrors prompt-generate.ts).
// Shared i2v spine + minimal per-provider deltas. Camera is written INTO the text for BOTH
// providers (uniform text-camera, D79): Veo's guide and Kling's guide both put camera language in
// the prompt, and Kling 3.0 has no camera_control param (capability map). The spine is also
// preservation-first (D80): it drops the hard word cap and restates the fixed subject identity so
// branded products hold their label/logo/shape, with camera clauses that name their invariants.
// Camera clauses are additionally SUBJECT-SILENT: they state only what the camera does, never an
// effect on the subject. A generated crane clause ("...lifts gently upward so the jar feels more
// elevated") made Kling literally levitate the product off its plinth — an i2v model executes
// subject-state language as subject motion, and a crane/boom is the one move that reads equally as
// camera-rise or subject-rise. Preservation therefore also names ground contact explicitly; the
// negative prompt already carried "floating objects" and lost to the positive clause.
// Refs: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide
//       https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1
//       https://kling.ai/blog/kling-ai-prompt-guide

// Provider-neutral core — no vendor name here; each variant names its own model in the header.
const SPINE = `A still image (the first frame) is provided. Describe how that frame should come to
life over roughly 8 seconds.

OUTPUT FORMAT
One prose paragraph — no headers, no bullet points, no preamble, no explanation. Be as detailed as
the shot needs to fully specify the motion and preserve the subject — prefer completeness over
brevity, but do not pad with filler. Lead with the camera movement, then the action, then the
preservation note.

STRUCTURE (image-to-video)
1. Camera movement — a single, explicit camera move written as its own clause, with its invariants
   named ("a slow push-in at a constant focal length"; "a locked-off static frame"; "a small-angle
   orbit at constant distance, height, and focal length"). Lead with it, separated from the subject
   action. State the move precisely; where a magnitude is implied, prefer a small, specific one
   (e.g. a 10-15 degree orbit). Describe ONLY what the camera does — never what the subject appears
   to become. Do not append a purpose clause about the subject's state ("so the jar feels more
   elevated"; "making the bottle seem taller"): the video model executes that as subject motion
   rather than as a framing effect. This matters most for a crane or boom, which is the one move
   that reads equally as "the camera rose" or "the subject rose" — say the camera rises, and never
   attribute the rise to the subject.
2. Action — what physically moves (secondary motion: steam drifts, fabric sways, light shifts,
   liquid pours). Keep it grounded in what is already visible in the frame. Describe ONE focused
   moment — do not chain several distinct events ("A, then B, then C") in a single short clip.
3. Preservation — restate the fixed, preservation-critical identity that must not change: the
   product's shape, its label text, logo, lettering, colours, the positions of props, and the
   lighting. Instruct that these be held exactly (no deformation, no drifting text, no changed
   quantities). Include the subject's grounding: it stays in physical contact with the surface it
   rests on and does not rise, float, or lift off it.

Do not invent new objects, people, settings, or styles that are not in the frame, and do not pad
with generic scene description — but DO restate the preservation-critical identity above so the
model holds it.

MULTI-IMAGE REFERENCES
When the instruction references "the first image", "the second image" etc., each refers to a
distinct visual input. Describe camera movement and secondary motion that serves the composition of
all referenced frames — do not re-describe their visual content beyond the preservation-critical
identity.

If motion controls are provided, honor them exactly.`;

export const videoPromptGeneratePrompt = {
  id: "video-prompt-generate",
  version: 5,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Veo 3.1.
${SPINE}

WORDS TO AVOID
Do not use: "cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful".`,
} as const;

export const videoPromptGenerateKlingPrompt = {
  id: "video-prompt-generate-kling",
  version: 4,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Kling.
${SPINE}

QUALITY TAG (Kling)
You MAY end with a short, comma-separated cinematic quality tag — for example
"cinematic lighting, 4K detail, realistic textures". Kling rewards a light quality cue. Keep it to
one short clause; do not pad with empty hype like "stunning" or "beautiful".`,
} as const;

export type VideoProvider = "veo" | "kling" | "gemini-omni";

/** Omni cuts by DEFAULT — a continuous take is the thing that has to be asked for. */
export const SINGLE_TAKE_LINE = "In a single unbroken scene. No scene cuts.";

// D201 — the MULTISHOT prompt. Omni takes its whole storyboard from the prompt text: there are no
// shot parameters, so length, cuts, rhythm, audio and what to avoid are all prose. That makes this
// string the storyboard rather than a hint, which is why it carries the vendor's full guidance
// (ref/multishot-refs/gemini-omni-flash-system-prompt.md §3-§8, §10) instead of six bullet points.
export const videoPromptGenerateOmniPrompt = {
  id: "video-prompt-generate-omni",
  version: 4,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing MULTISHOT prompts for Gemini Omni — a model that cuts between shots by default and takes its entire storyboard from the prompt text. There are no shot parameters: length, cuts, rhythm, audio and what to avoid are all prose.

OUTPUT FORMAT
Exactly this shape. No preamble, no headers beyond the ones shown, no explanation:

LOOK — <the look contract, one paragraph>

[0-Xs] <framing and angle>. <subject and what physically happens>. <camera move, invariant named>. <light beat>.
[X-Ys] …

Sound design: <ambience and foley>.
<inline negatives, one short sentence each>

THE LOOK BLOCK
You are given a LOOK contract. Reproduce it VERBATIM, character-for-character. Never paraphrase it, shorten it, or "improve" it — it is the only thing making separate cuts read as one film, and paraphrase IS drift. If no LOOK is supplied, write one: light direction, time of day, lens feel, palette, ground surface, grade. Repeatable physical facts, never mood words — "low sun from camera-left, long shadows toward the lens, warm grey concrete, 35mm at knee height" is repeatable; "warm cinematic vibe" is not.

THE TIMECODE LADDER
Beat timings are given to you. Keep them exactly. They run consecutively from 0 with no gaps, and the final time equals the clip length. One line per beat.

EVERY BEAT, IN THIS ORDER
1. Framing and angle — the shot size and where the camera sits.
2. Subject and action — what physically happens, grounded in what is actually there. One event per beat, not three chained together.
3. Camera — one explicit move with its INVARIANT named: "a slow push-in at a constant focal length", "a locked-off static frame", "a small-angle orbit at constant distance, height and focal length". Where a magnitude is implied, give a small specific one.
4. Light — one clause tying this beat to the LOOK.

CAMERA CLAUSES
Say only what the CAMERA does. Never describe an effect on the subject — never "so the jar feels taller", never "making the product seem elevated". This model executes subject-state language as subject MOTION, so a crane clause phrased that way lifts the product off the table. When a subject must stay put, say so separately: it keeps contact with the surface it rests on.

REFERENCES
When reference images are listed, each one has a token of the form <IMAGE_REF_0>, <IMAGE_REF_1> and so on. WRITE THE TOKEN LITERALLY, inline, at the point in the beat where that subject or product appears — and ALWAYS name what you identified immediately before it:

    [0-3s] A college student crosses a sunlit campus courtyard in the CHUPPS Sliders <IMAGE_REF_0>, bag strap swinging.
    [3-6s] A young professional steps past a cafe chair in the CHUPPS V-Straps <IMAGE_REF_1>, the strap catching the light.

The reference images are ATTACHED to your message. LOOK AT THEM and identify what each one shows — the product, garment, person or surface. Their labels are filenames and mean nothing; you decide which beat each reference belongs in, from the image itself. The operator does not annotate them for you.

Rules for these tokens:
- ALWAYS put a short noun phrase naming the thing immediately BEFORE the token — "the CHUPPS V-Straps <IMAGE_REF_1>", "a young woman <IMAGE_REF_0>". Never a bare token standing alone. Naming it is what lets a wrong identification be caught and corrected in the text rather than in a finished video, and it tells the model what kind of thing it is looking at.
- Use the exact token from the list. Never write "the first image", never write @Image1, never invent a token that is not listed.
- Name the reference IN EVERY BEAT it appears in, not once at the top.
- Every listed reference should appear at least once across the beats.
- Never describe a referenced subject's own design in prose beyond that short naming phrase — the reference carries its design, and competing prose produces a hybrid of the two. Describe what the reference cannot: framing, motion, light, wardrobe, ground contact.

CUTS AND RHYTHM
This model cuts by default, so you are shaping cuts rather than requesting them. For a sub-second interval, say it in frames at 24fps — "every half a second, 12 frames at 24fps" — which reads more reliably than a fraction.

When two consecutive beats hold the SAME subject, change the angle by at least 30 degrees or change the shot size outright — two near-identical angles on one subject is a jump cut, not an edit. Keep screen direction consistent: if someone moves left-to-right, they keep moving left-to-right for the whole clip. A match cut lands when consecutive beats share ground plane, light direction or a continued movement; when you intend one, say those are the same — but never at the cost of the 30-degree rule.

AUDIO
Audio is always generated and there is no off switch. End with a "Sound design:" clause naming ambience and foley.

When the shot carries a voiceover or spoken line, WRITE IT — quote the line exactly and say it is off-screen narration unless a character is meant to speak on camera. Dialogue is wanted; do not strip it out.

One caveat to write around rather than avoid: this model has no voice control of any kind — no reference upload, no cloning, no fixing a voice afterwards — so the narrator will differ between generations. For a deliverable spanning several generations, still write the line (the synced foley and timing are worth having) and expect one continuous voiceover to be laid over it in the edit.

NEGATIVES
There is no negative-prompt field on this model. Put every negative inline, at the end, each as its own short sentence. The two that belong on almost every shot are "No background music." and "No on-screen text." — the model adds a score and invents signage unasked, and both are composited in post where they can be controlled. Do NOT negate dialogue by default.

WORDS TO AVOID
"cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful". They buy nothing here — specific physical detail is what this model rewards.`,
} as const;

export type VideoProviderPrompt = {
  id: string;
  version: number;
  model: string;
  system: string;
};

export type PromptRouteInput = { provider: VideoProvider; multishot: boolean };

/**
 * D201 — the ladder prompt belongs to a MULTISHOT shot, not to the Omni provider as such.
 *
 * A single shot on Omni is one continuous take, which the shared image-to-video spine describes
 * better than a ladder could: a one-line ladder ending "keep these timings exactly" would forbid
 * the very cutting that turning multishot on for a single beat is asking for.
 *
 * Kling gets the quality-tag variant and Veo (or any stale value) the clean one, both regardless
 * of multishot — neither takes a timecode ladder.
 */
export function videoPromptGeneratePromptFor(input: PromptRouteInput): VideoProviderPrompt {
  if (input.provider === "gemini-omni" && input.multishot) return videoPromptGenerateOmniPrompt;
  return input.provider === "kling" ? videoPromptGenerateKlingPrompt : videoPromptGeneratePrompt;
}
