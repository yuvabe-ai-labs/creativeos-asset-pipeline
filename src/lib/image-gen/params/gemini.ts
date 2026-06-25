import type { ParamSpec } from "../types";

export const geminiFlashParams: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"] } },
  { name: "image_size",   label: "Resolution",   component: "select", group: "primary", order: 1, visible: true,
    defaultValue: "1K",
    constraints: { type: "select", options: ["512", "1K", "2K", "4K"] } },
];

export const geminiProParams: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4"] } },
  { name: "image_size",   label: "Resolution",   component: "select", group: "primary", order: 1, visible: true,
    defaultValue: "1K",
    constraints: { type: "select", options: ["1K", "2K", "4K"] } },
];
