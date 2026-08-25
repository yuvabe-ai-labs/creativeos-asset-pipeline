import type { ParamSpec } from "../types";

export const geminiFlash2Params: ParamSpec[] = [
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
// not user-selectable, so it doesn't share a param spec with gemini-3.1-flash-image.
//
// It doesn't share that model's aspect ratios either: 4:1 and 1:4 are exclusive to
// gemini-3.1-flash-image. Sending either here is a live 400 —
// `INVALID_ARGUMENT: Aspect ratio 4:1 is not supported for this model` — so they must not be
// offered. 21:9 is fine (the API returns 1536x672). Both ratios were carried over unexamined
// when this spec was split off for the resolution fix.
export const gemini25FlashParams: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"] } },
  { name: "image_size",   label: "Resolution",   component: "select", group: "primary", order: 1, visible: false,
    defaultValue: "1K",
    constraints: { type: "select", options: ["1K"] } },
];

// gemini-3-pro-image rejects 4:1 and 1:4 the same way gemini-2.5-flash-image does (verified
// live) — don't add them here.
export const geminiProParams: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "9:16",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4"] } },
  { name: "image_size",   label: "Resolution",   component: "select", group: "primary", order: 1, visible: true,
    defaultValue: "1K",
    constraints: { type: "select", options: ["1K", "2K", "4K"] } },
];
