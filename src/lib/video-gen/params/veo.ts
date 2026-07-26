import type { ParamSpec } from "@/lib/image-gen/types";

// Valid Veo durationSeconds values: 4, 6, 8 (API only accepts these three)
export const veoParams: ParamSpec[] = [
  {
    name: "aspect_ratio",
    label: "Aspect Ratio",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "16:9",
    constraints: { type: "select", options: ["16:9", "9:16"] },
  },
  {
    name: "duration",
    label: "Duration (s)",
    component: "select",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: "6",
    constraints: { type: "select", options: ["4", "6", "8"] },
  },
];

// Lite: same duration options as Quality (4/6/8 all supported)
export const veoLiteParams: ParamSpec[] = veoParams;
