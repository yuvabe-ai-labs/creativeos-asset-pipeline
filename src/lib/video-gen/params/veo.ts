import type { ParamSpec } from "@/lib/image-gen/types";

// Full params: aspect_ratio + duration (5s or 8s) + audio
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
    label: "Duration",
    component: "select",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: "5",
    constraints: { type: "select", options: ["5", "8"] },
  },
  {
    name: "audio",
    label: "Generate Audio",
    component: "toggle",
    group: "primary",
    order: 2,
    visible: true,
    defaultValue: false,
    constraints: { type: "toggle" },
  },
];

// Lite and Fast cap at 5s — only the 5s option
export const veoLiteParams: ParamSpec[] = veoParams.map((p) =>
  p.name === "duration"
    ? { ...p, constraints: { type: "select", options: ["5"] } as const }
    : p,
);
