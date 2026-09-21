import type { ParamSpec } from "@/lib/image-gen/types";

// Seedance 2.5 — /api/v3/contents/generations/tasks on BytePlus ModelArk.
//
// duration is a SLIDER over a continuous 4-30s range. 30s is triple Gemini Omni's ceiling and
// double Kling 3.0 Omni's, which is the reason this model is worth having in the multishot lane
// at all. The vendor's own default is -1 ("model picks"), but this app always sends an explicit
// duration — on the multishot lane it is the sum of the operator's cut ladder, and a model-chosen
// length would silently disagree with the shot timestamps in the prompt.
export const seedanceParams: ParamSpec[] = [
  {
    name: "resolution",
    label: "Resolution",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "720p",
    constraints: { type: "select", options: ["480p", "720p", "1080p"] },
  },
  {
    name: "duration",
    label: "Duration",
    component: "slider",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: 5,
    constraints: { type: "slider", min: 4, max: 30, step: 1 },
  },
  {
    // The vendor default is `adaptive`, which derives the ratio from a first frame. On a
    // references-only or text-only request there is no frame to derive from, so an explicit
    // ratio is what makes a vertical reel come back vertical.
    name: "ratio",
    label: "Aspect Ratio",
    component: "select",
    group: "primary",
    order: 2,
    visible: true,
    defaultValue: "9:16",
    constraints: { type: "select", options: ["16:9", "9:16", "1:1", "adaptive"] },
  },
];
