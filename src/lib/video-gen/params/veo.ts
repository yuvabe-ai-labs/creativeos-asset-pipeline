import type { ParamSpec } from "@/lib/image-gen/types";

// Product-tuned visual-defect suppression for Veo's native negativePrompt (D78). Deliberately
// WITHOUT bare "text"/"logo" — unlike Kling's list — because a product shot must PRESERVE its
// own real label text and logo; only their *distortion* is suppressed.
export const VEO_NEGATIVE_DEFAULT =
  "blurry, low quality, distorted, deformed, morphing, warped label, label deformation, text distortion, changing text, flickering, jitter, floating objects, extra objects, duplicated product, watermark";

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
  {
    // D78: prefilled visual-defect list, editable; drives Veo's GenerateVideosConfig.negativePrompt.
    name: "negative_prompt",
    label: "Negative Prompt",
    component: "textarea",
    group: "advanced",
    order: 0,
    visible: true,
    defaultValue: VEO_NEGATIVE_DEFAULT,
    constraints: { type: "textarea", maxLength: 2500 },
  },
];

// Lite: same duration options as Quality (4/6/8 all supported)
export const veoLiteParams: ParamSpec[] = veoParams;
