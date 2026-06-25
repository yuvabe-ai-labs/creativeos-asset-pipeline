import type { ParamSpec } from "../types";

export const gptImage2Params: ParamSpec[] = [
  { name: "size",     label: "Size",    component: "select", group: "primary",  order: 0, visible: true,
    defaultValue: "1024x1024",
    constraints: { type: "select", options: ["auto", "1024x1024", "1536x1024", "1024x1536"] } },
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
  { name: "size",    label: "Size",    component: "select", group: "primary",  order: 0, visible: true,
    defaultValue: "1024x1024",
    constraints: { type: "select", options: ["1024x1024", "1536x1024", "1024x1536"] } },
  { name: "quality", label: "Quality", component: "select", group: "primary",  order: 1, visible: true,
    defaultValue: "medium",
    constraints: { type: "select", options: ["low", "medium", "high"] } },
  { name: "output_format", label: "Output format", component: "select", group: "advanced", order: 0, visible: true,
    defaultValue: "png",
    constraints: { type: "select", options: ["png", "jpeg", "webp"] } },
];
