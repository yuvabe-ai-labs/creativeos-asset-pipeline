import type { ParamSpec } from "@/lib/image-gen/types";

function resolutionParam(options: string[], defaultValue: string): ParamSpec {
  return {
    name: "resolution",
    label: "Resolution",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue,
    constraints: { type: "select", options },
  };
}

// Kling 3.0's duration is a continuous 1s-step range, so it reads as a slider rather than the
// 13 chips a select produced at 3–15s. Value is a NUMBER (the select stored strings) —
// SliderControl coerces legacy string values so saved nodes keep their duration.
function durationParam(min: number, max: number, defaultValue: number): ParamSpec {
  return {
    name: "duration",
    label: "Duration",
    component: "slider",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue,
    constraints: { type: "slider", min, max, step: 1 },
  };
}

// O1 (the /omni-video endpoint) is NOT a continuous range like 3.0. Kling only accepts an
// arbitrary duration when the request carries a `refer_image`; on a frames-only request it
// rejects anything but 5 or 10:
//   400 {"code":1201,"message":"Duration only supports 5 or 10 seconds when no refer_image is provided"}
// Two non-contiguous stops can't be expressed as a slider, so O1 gets a chip select instead.
// D100 added `refer_image`, so 3–15 IS reachable once a reference is attached — the list stays at
// 5/10 because the param spec is static and cannot narrow itself back when the last reference is
// removed. Widening it needs a rule that pins 5/10 at referenceCount 0, not just a longer list.
// Stores a STRING where 3.0's slider stores a number; both settings builders coerce with
// Number(), so either survives the round trip.
function durationSelectParam(options: string[], defaultValue: string): ParamSpec {
  return {
    name: "duration",
    label: "Duration",
    component: "select",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue,
    constraints: { type: "select", options },
  };
}

function audioParam(options: string[], defaultValue: string): ParamSpec {
  return {
    name: "audio",
    label: "Audio",
    component: "select",
    group: "advanced",
    order: 0,
    visible: true,
    defaultValue,
    constraints: { type: "select", options },
  };
}

// OM8 — the omni endpoint REQUIRES `aspect_ratio` when a request carries no first frame and no
// reference video, which is exactly the references-only shape D101 unlocked. With a start frame
// present Kling derives the ratio from that image and buildO1Settings omits the field entirely,
// so this control governs one specific path rather than every generation.
//
// PRIMARY, not advanced. It was filed under Advanced as "reachable, not prominent" — but the
// Advanced accordion was deleted from the focus view in 7e1c643, so nothing renders that group
// and the control was reachable from nowhere. Framing is also a shot decision the eye makes
// alongside resolution and duration, not a fine-tune. Orders after Duration and before the
// full-width Negative Prompt.
const aspectRatioParam: ParamSpec = {
  name: "aspect_ratio",
  label: "Aspect Ratio",
  component: "select",
  group: "primary",
  order: 2,
  visible: true,
  defaultValue: "9:16",
  constraints: { type: "select", options: ["16:9", "9:16", "1:1"] },
  description: "Used only when generating from references with no start frame.",
};

const multiShotParam: ParamSpec = {
  name: "multi_shot",
  label: "Multi-Shot",
  component: "toggle",
  group: "advanced",
  order: 1,
  // D218 — hidden, not deleted. Gemini Omni is the only multi-shot model surfaced in the UI, so
  // multishot means one thing in one place. Hiding rather than deleting keeps the request shape
  // byte-identical, keeps every persisted node resolving, and leaves Kling 3.0's end-frame rule
  // that pins multi_shot valid and untouched; deleting would make the route stop resolving a name
  // saved nodes still carry.
  //
  // NOTE: hidden is not the same as off. The route reads the node's saved value and only falls
  // back to this default, so a node an operator toggled ON before this change keeps sending
  // multi_shot: true with no control left to clear it. Locking it off would need a rule, which is
  // deliberately not done here — that would silently change what an existing node generates.
  visible: false,
  // Off by default: multi-shot lets Kling cut between shots, which fights the single continuous
  // moment a product clip wants. Opt in, don't opt out.
  defaultValue: false,
  constraints: { type: "toggle" },
};

// Product-tuned visual-defect list. Deliberately omits the bare `text` / `logo` negatives the
// pre-consolidation default carried: on a product shot the label's real text and logo must be
// PRESERVED, so blanket negatives fight the goal. Kept as its own constant (not shared with
// Veo's) because per-provider defaults are tuned independently from eval results.
export const KLING_NEGATIVE_DEFAULT =
  "blurry, low quality, distorted, deformed, morphing, warped label, label deformation, text distortion, changing text, flickering, jitter, floating objects, extra objects, duplicated product, watermark";

// PRIMARY, not advanced: it is tuned per shot often enough to belong on the always-visible
// surface. Orders last within the group so the textarea renders full-width below the paired
// Resolution + Duration row (and, on O1, below Aspect Ratio).
const negativePromptParam: ParamSpec = {
  name: "negative_prompt",
  label: "Negative Prompt",
  component: "textarea",
  group: "primary",
  order: 3,
  visible: true,
  defaultValue: KLING_NEGATIVE_DEFAULT,
  constraints: { type: "textarea", maxLength: 2500 },
};

export const kling30Params: ParamSpec[] = [
  resolutionParam(["720p", "1080p", "4k"], "720p"),
  durationParam(3, 15, 5),
  audioParam(["native", "off"], "off"),
  multiShotParam,
  negativePromptParam,
];

// audio is native/off, NOT original/off. The omni endpoint's enum is native | original | off,
// but `original` means "retain the original sound of the reference video" — it only applies to a
// base_video / feature_video request, and buildKlingContents never sends one. Offering it gave
// O1 users a choice between silence and silence; `native` (audio matching the visuals) is the
// only way to actually get sound out of this model in our flow.
export const klingO1Params: ParamSpec[] = [
  resolutionParam(["720p", "1080p"], "720p"),
  durationSelectParam(["5", "10"], "5"),
  audioParam(["native", "off"], "off"),
  multiShotParam,
  aspectRatioParam,
  negativePromptParam,
];
