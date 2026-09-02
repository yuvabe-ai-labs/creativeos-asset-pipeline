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

/**
 * The hype words banned from every motion prompt. Shared verbatim by the Veo record below and the
 * multishot writer (src/prompts/multishot-prompt-generate.ts) — extracted so raising the list is
 * one edit rather than two prompts quietly drifting apart.
 */
export const MOTION_AVOID_LIST =
  '"cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful".';

/**
 * How to identify an attached reference image and cite it inline via its `<IMAGE_REF_N>` token.
 * The multishot writer's beats are matched against this exact token shape by `refsCitedIn`
 * (src/lib/nodes/multishot-plan.ts), so the instruction lives here once and is imported by
 * src/prompts/multishot-prompt-generate.ts rather than copied.
 */
export const REFERENCE_IDENTIFICATION_BLOCK = `REFERENCES
When reference images are listed, each one has a token of the form <IMAGE_REF_0>, <IMAGE_REF_1> and so on. WRITE THE TOKEN LITERALLY, inline, at the point in the beat where that subject or product appears — and ALWAYS name what you identified immediately before it:

    [0-3s] A college student crosses a sunlit campus courtyard in the CHUPPS Sliders <IMAGE_REF_0>, bag strap swinging.
    [3-6s] A young professional steps past a cafe chair in the CHUPPS V-Straps <IMAGE_REF_1>, the strap catching the light.

The reference images are ATTACHED to your message. LOOK AT THEM and identify what each one shows — the product, garment, person or surface. Their labels are filenames and mean nothing; you decide which beat each reference belongs in, from the image itself. The operator does not annotate them for you.

Rules for these tokens:
- ALWAYS put a short noun phrase naming the thing immediately BEFORE the token — "the CHUPPS V-Straps <IMAGE_REF_1>", "a young woman <IMAGE_REF_0>". Never a bare token standing alone. Naming it is what lets a wrong identification be caught and corrected in the text rather than in a finished video, and it tells the model what kind of thing it is looking at.
- Use the exact token from the list. Never write "the first image", never write @Image1, never invent a token that is not listed.
- Name the reference IN EVERY BEAT it appears in, not once at the top.
- USE ONLY THE REFERENCES THIS SHOT CALLS FOR. The list is a library, not a checklist. Cite a reference where the shot's own content asks for it and leave the rest out — forcing an unrelated product into a beat in order to "use" it is worse than omitting it. The operator adds any others by hand.
- Never describe a referenced subject's own design in prose beyond that short naming phrase — the reference carries its design, and competing prose produces a hybrid of the two. Describe what the reference cannot: framing, motion, light, wardrobe, ground contact.`;

export const videoPromptGeneratePrompt = {
  id: "video-prompt-generate",
  version: 5,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Veo 3.1.
${SPINE}

WORDS TO AVOID
Do not use: ${MOTION_AVOID_LIST}`,
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

/**
 * The model behind MULTISHOT authoring — the Omni motion prompt and the sequence composer.
 *
 * Deliberately larger than the mini the single-shot prompts use, and the two jobs are not
 * comparable. A single-shot prompt describes one continuous take from a still that already fixes
 * subject, setting and style. A multishot prompt is a whole storyboard: it must hold a look and a
 * voice contract verbatim across every beat, keep a cut ladder summing to the exact duration,
 * apply screen direction and the 30-degree rule between beats, identify attached reference images
 * by sight and decide which beats they belong in — while writing prose specific enough to be
 * worth generating. The mini produced fluent output that quietly failed several of those at once.
 *
 * One constant so the two multishot prompts cannot drift apart, and so raising it is one edit.
 */
export const MULTISHOT_AUTHORING_MODEL = "gpt-5";

export type VideoProviderPrompt = {
  id: string;
  version: number;
  model: string;
  system: string;
};

export type PromptRouteInput = { provider: VideoProvider };

/**
 * D210 — multishot routing has moved entirely to `multishotPromptGenerate`
 * (src/prompts/multishot-prompt-generate.ts). Omni is the only multishot model, so there is
 * nothing left to branch on here: every provider, Omni included, gets one of these two
 * continuous-take records. A single shot on Omni is one continuous take, which this shared
 * image-to-video spine describes correctly — a timecode ladder would forbid the very cutting a
 * multishot node exists to ask for, which is why that prompt lives on its own now instead of as a
 * branch of this function.
 */
export function videoPromptGeneratePromptFor(input: PromptRouteInput): VideoProviderPrompt {
  return input.provider === "kling" ? videoPromptGenerateKlingPrompt : videoPromptGeneratePrompt;
}
