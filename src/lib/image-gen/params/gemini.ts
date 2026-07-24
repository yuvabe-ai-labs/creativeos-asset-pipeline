import type { ParamSpec } from "../types";

export const geminiFlashParams: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"] } },
  { name: "image_size",   label: "Resolution",   component: "select", group: "primary", order: 1, visible: true,
    defaultValue: "1K",
    constraints: { type: "select", options: ["512", "1K", "2K", "4K"] } },
];

// gemini-2.5-flash-image ("Nano Banana", the legacy pioneer of the series, per Google's own
// docs) predates the "Gemini 3 image models" generation that introduced 512/2K/4K output —
// Google's pricing page only ever publishes one number for it ("up to 1024x1024px"), and its
// model docs don't list it among the multi-resolution models. Resolution is fixed at 1K —
// not user-selectable, so it doesn't share geminiFlashParams with gemini-3.1-flash-image.
export const gemini25FlashParams: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"] } },
  { name: "image_size",   label: "Resolution",   component: "select", group: "primary", order: 1, visible: false,
    defaultValue: "1K",
    constraints: { type: "select", options: ["1K"] } },
];

export const geminiProParams: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4"] } },
  { name: "image_size",   label: "Resolution",   component: "select", group: "primary", order: 1, visible: true,
    defaultValue: "1K",
    constraints: { type: "select", options: ["1K", "2K", "4K"] } },
];
