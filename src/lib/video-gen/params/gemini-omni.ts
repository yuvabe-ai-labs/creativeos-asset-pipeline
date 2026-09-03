import type { ParamSpec } from "@/lib/image-gen/types";

// Product-tuned defect list, mirroring KLING_NEGATIVE_DEFAULT's reasoning: no bare `text` or
// `logo` negatives, because on a product shot the label's real text and logo must be PRESERVED.
// Kept as its own constant rather than shared with Kling's — per-provider defaults are tuned
// independently from eval results.
// Two families of artifact, because two things go wrong. The product terms guard the thing being
// sold — a drifting label or a duplicated shoe kills the shot. The GAIT terms were missing
// entirely, which was a real gap for a footwear brand whose reels are almost entirely people
// walking: sliding feet and moonwalking are the most common failure in generated human motion,
// and nothing here named them.
export const GEMINI_OMNI_NEGATIVE_DEFAULT =
  "blurry, low quality, distorted, deformed, morphing, warped label, label deformation, " +
  "text distortion, changing text, flickering, jitter, floating objects, extra objects, " +
  "duplicated product, watermark, sliding feet, moonwalking, gliding, hovering, foot slip, " +
  "distorted gait, stiff robotic motion, morphing limbs, merged fingers, extra fingers";

// EVERY param is `primary`. The Advanced accordion was deleted from the focus view in 7e1c643,
// so an `advanced` control renders nowhere at all — the trap `aspect_ratio` fell into on Kling O1.
//
// There is deliberately NO `continuous_take` param: the Shot node's multishot toggle already
// carries that decision, and two controls for one thing is the pair that drifts apart.
export const geminiOmniParams: ParamSpec[] = [
  {
    name: "resolution",
    label: "Resolution",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "720p",
    constraints: { type: "select", options: ["360p", "720p", "1080p", "4k"] },
    description:
      "720p is the only natively rendered tier — 1080p and 4k are upscaled from it, at 1.5x and " +
      "3x the price. 360p costs a third of 720p and is the draft tier for iterating.",
  },
  {
    // ALWAYS sent. Omitting duration yields the API default of 8s, so a 10s timecode ladder
    // would come back truncated at 8s with no error and at full price.
    name: "duration",
    label: "Duration",
    component: "slider",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: 8,
    constraints: { type: "slider", min: 3, max: 10, step: 1 },
  },
  {
    // 16:9 and 9:16 only — no 1:1, unlike Kling O1.
    name: "aspect_ratio",
    label: "Aspect Ratio",
    component: "select",
    group: "primary",
    order: 2,
    visible: true,
    defaultValue: "16:9",
    constraints: { type: "select", options: ["16:9", "9:16"] },
  },
  {
    // NOT an API field. Omni always generates audio; this steers it (D187).
    name: "audio",
    label: "Audio",
    component: "select",
    group: "primary",
    order: 3,
    visible: true,
    // `dialogue` is the default because most reels here carry a voiceover, and the standing
    // suppressions are background music and on-screen text — not speech.
    defaultValue: "dialogue",
    constraints: { type: "select", options: ["dialogue", "ambient", "music"] },
    description:
      "Audio is always generated and cannot be switched off. Background music is suppressed on " +
      "every setting except Music, since a per-generation score changes character at each cut. " +
      "The model has no voice control, so a narrator differs between generations — write the " +
      "line anyway for the synced foley and timing, and lay one continuous VO in the edit.",
  },
  {
    // NOT an API field. Omni renders screen-space type correctly and the docs recommend stating
    // it explicitly, so the copy is quoted verbatim into the prompt.
    name: "on_screen_text",
    label: "On-screen Text",
    component: "textarea",
    group: "primary",
    order: 4,
    visible: true,
    defaultValue: "",
    constraints: { type: "textarea", maxLength: 500 },
    description:
      "Rendered as screen-space type. A brand lock-up should still be composited in post — " +
      "rendered-correctly is not typographically exact.",
  },
  {
    // NOT an API field — Omni has no negative-prompt parameter at all. Folded into the prompt as
    // an `Avoid:` paragraph by composeOmniPrompt, the shape composeVeoPrompt uses on Lite (D183).
    name: "negative_prompt",
    label: "Negative Prompt",
    component: "textarea",
    group: "primary",
    order: 5,
    visible: true,
    defaultValue: GEMINI_OMNI_NEGATIVE_DEFAULT,
    constraints: { type: "textarea", maxLength: 2500 },
  },
];
