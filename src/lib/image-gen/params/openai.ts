import type { ParamSpec } from "../types";

export const gptImage2Params: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect Ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"] } },
  { name: "quality",  label: "Quality", component: "select", group: "primary",  order: 1, visible: true,
    defaultValue: "medium",
    constraints: { type: "select", options: ["low", "medium", "high", "auto"] } },
  { name: "background",         label: "Background",    component: "select", group: "advanced", order: 0, visible: true,
    defaultValue: "auto",
    constraints: { type: "select", options: ["auto", "opaque", "transparent"] } },
  { name: "output_format",      label: "Output format", component: "select", group: "advanced", order: 1, visible: true,
    defaultValue: "png",
    constraints: { type: "select", options: ["png", "jpeg", "webp"] } },
  { name: "output_compression", label: "Compression",   component: "slider", group: "advanced", order: 2, visible: false,
    defaultValue: 80,
    constraints: { type: "slider", min: 0, max: 100, step: 1 } },
];

// gpt-image-1 has identical params to gpt-image-2
export const gptImage1Params: ParamSpec[] = gptImage2Params;

export const gptImage1MiniParams: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect Ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"] } },
  { name: "quality", label: "Quality", component: "select", group: "primary",  order: 1, visible: true,
    defaultValue: "medium",
    constraints: { type: "select", options: ["low", "medium", "high"] } },
  { name: "output_format", label: "Output format", component: "select", group: "advanced", order: 0, visible: true,
    defaultValue: "png",
    constraints: { type: "select", options: ["png", "jpeg", "webp"] } },
];
