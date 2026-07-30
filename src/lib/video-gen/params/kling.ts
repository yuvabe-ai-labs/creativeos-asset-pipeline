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
// arbitrary duration when the request carries a `refer_image`; with a plain first frame — which
// is all `buildKlingContents` ever sends — it rejects anything but 5 or 10:
//   400 {"code":1201,"message":"Duration only supports 5 or 10 seconds when no refer_image is provided"}
// Two non-contiguous stops can't be expressed as a slider, so O1 gets a chip select instead.
// Restoring the full 3–10 range means implementing refer_image, not widening this list.
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

const multiShotParam: ParamSpec = {
  name: "multi_shot",
  label: "Multi-Shot",
  component: "toggle",
  group: "advanced",
  order: 1,
  visible: true,
  // Off by default: multi-shot lets Kling cut between shots, which fights the single
  // continuous moment a product clip wants. Opt in, don't opt out.
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
// Resolution + Duration row.
const negativePromptParam: ParamSpec = {
  name: "negative_prompt",
  label: "Negative Prompt",
  component: "textarea",
  group: "primary",
  order: 2,
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
  negativePromptParam,
];
