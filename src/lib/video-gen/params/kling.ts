import type { ParamSpec } from "@/lib/image-gen/types";

// Kling 3.0 image-to-video generation params. Camera is authored on the Video Prompt node as text
// (Kling 3.0 exposes no camera_control — see the capability map), so there are no camera_move / axis
// params here. aspect_ratio is omitted too: Kling 3.0 derives it from the input image.
// One flat "primary" group (no Advanced accordion) — order places CFG next to Mode.
export const klingV3Params: ParamSpec[] = [
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
    name: "cfg_scale",
    label: "CFG Scale",
    component: "slider",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: 0.5,
    constraints: { type: "slider", min: 0, max: 1, step: 0.1 },
  },
  {
    name: "duration",
    label: "Duration (s)",
    component: "slider",
    group: "primary",
    order: 2,
    visible: true,
    defaultValue: 5,
    constraints: { type: "slider", min: 3, max: 15, step: 1 },
  },
  {
    name: "negative_prompt",
    label: "Negative Prompt",
    component: "textarea",
    group: "primary",
    order: 3,
    visible: true,
    defaultValue:
      "blurry, low quality, distorted, deformed, warped hands, extra fingers, morphing, flickering, jitter, text, watermark, logo",
    constraints: { type: "textarea", maxLength: 2500 },
  },
];
