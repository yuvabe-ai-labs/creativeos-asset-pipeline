import type { ParamSpec } from "@/lib/image-gen/types";

const KLING_MOTION_PARAMS: ParamSpec[] = [
  {
    name: "pan",
    label: "Pan",
    component: "slider",
    group: "advanced",
    order: 2,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
  {
    name: "tilt",
    label: "Tilt",
    component: "slider",
    group: "advanced",
    order: 3,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
  {
    name: "zoom",
    label: "Zoom",
    component: "slider",
    group: "advanced",
    order: 4,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
  {
    name: "roll",
    label: "Roll",
    component: "slider",
    group: "advanced",
    order: 5,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
  {
    name: "horizontal_movement",
    label: "Horizontal",
    component: "slider",
    group: "advanced",
    order: 6,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
  {
    name: "vertical_movement",
    label: "Vertical",
    component: "slider",
    group: "advanced",
    order: 7,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
];

const KLING_PRIMARY_BASE: ParamSpec[] = [
  {
    name: "mode",
    label: "Mode",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "pro",
    constraints: { type: "select", options: ["std", "pro"] },
  },
  {
    name: "aspect_ratio",
    label: "Aspect Ratio",
    component: "select",
    group: "primary",
    order: 2,
    visible: true,
    defaultValue: "16:9",
    constraints: { type: "select", options: ["16:9", "9:16", "1:1"] },
  },
  {
    // D77: the visual camera grid drives this; buildKlingRequestBody maps it to camera_control.
    // Rendered as a tile grid (not a chip group) in video-gen-params-panel. "custom" → axis sliders.
    name: "camera_move",
    label: "Camera",
    component: "select",
    group: "primary",
    order: 3,
    visible: true,
    defaultValue: "static",
    constraints: {
      type: "select",
      options: ["static", "push-in", "pull-back", "pan", "tilt", "tracking", "crane", "orbit", "custom"],
    },
  },
];

const KLING_ADVANCED_BASE: ParamSpec[] = [
  {
    name: "cfg_scale",
    label: "CFG Scale",
    component: "slider",
    group: "advanced",
    order: 0,
    visible: true,
    defaultValue: 0.5,
    constraints: { type: "slider", min: 0, max: 1, step: 0.1 },
  },
  {
    name: "negative_prompt",
    label: "Negative Prompt",
    component: "textarea",
    group: "advanced",
    order: 1,
    visible: true,
    // D77: prefilled visual-defect list (editable); distinct from positive-prompt hype hygiene.
    defaultValue:
      "blurry, low quality, distorted, deformed, warped hands, extra fingers, morphing, flickering, jitter, text, watermark, logo",
    constraints: { type: "textarea", maxLength: 2500 },
  },
  ...KLING_MOTION_PARAMS,
];

const KLING_DURATION_LEGACY: ParamSpec = {
  name: "duration",
  label: "Duration",
  component: "select",
  group: "primary",
  order: 1,
  visible: true,
  defaultValue: "5",
  constraints: { type: "select", options: ["5", "10"] },
};

// v3 supports 3–15s — a slider is far more compact than 13 chips (D77 space reduction).
const KLING_DURATION_V3: ParamSpec = {
  name: "duration",
  label: "Duration (s)",
  component: "slider",
  group: "primary",
  order: 1,
  visible: true,
  defaultValue: 5,
  constraints: { type: "slider", min: 3, max: 15, step: 1 },
};

export const klingLegacyParams: ParamSpec[] = [
  ...KLING_PRIMARY_BASE.filter((p) => p.name !== "duration"),
  KLING_DURATION_LEGACY,
  ...KLING_ADVANCED_BASE,
].sort((a, b) => {
  if (a.group !== b.group) return a.group === "primary" ? -1 : 1;
  return a.order - b.order;
});

export const klingV3Params: ParamSpec[] = klingLegacyParams.map((p) =>
  p.name === "duration" ? KLING_DURATION_V3 : p,
);
