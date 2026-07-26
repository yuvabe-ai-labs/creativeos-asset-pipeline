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

// Kling's duration is a continuous 1s-step range, so it reads as a slider rather than the
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
  defaultValue: true,
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

export const klingO1Params: ParamSpec[] = [
  resolutionParam(["720p", "1080p"], "720p"),
  durationParam(3, 10, 5),
  audioParam(["original", "off"], "off"),
  negativePromptParam,
];
