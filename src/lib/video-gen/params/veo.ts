import type { ParamSpec } from "@/lib/image-gen/types";

// Product-tuned visual-defect suppression for Veo's native negativePrompt (D78). Deliberately
// WITHOUT bare "text"/"logo" — unlike Kling's list — because a product shot must PRESERVE its
// own real label text and logo; only their *distortion* is suppressed.
export const VEO_NEGATIVE_DEFAULT =
  "blurry, low quality, distorted, deformed, morphing, warped label, label deformation, text distortion, changing text, flickering, jitter, floating objects, extra objects, duplicated product, watermark";

// Valid Veo durationSeconds values: 4, 6, 8 (API only accepts these three)
export const veoParams: ParamSpec[] = [
  {
    // Google's GenerateVideosConfig.resolution accepts "720p" | "1080p" for all three Veo 3.1
    // variants (node_modules/@google/genai/dist/genai.d.ts) — previously left unset here, which
    // silently pinned every generation to the API's 720p default. See cost.ts for the
    // per-resolution rate this now unlocks. Ordered first, paired with Duration in the top row —
    // same placement as Kling's resolutionParam/durationParam (params/kling.ts) — so the two
    // models' param panels read consistently instead of Veo being the odd one out.
    name: "resolution",
    label: "Resolution",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "720p",
    constraints: { type: "select", options: ["720p", "1080p"] },
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
    name: "aspect_ratio",
    label: "Aspect Ratio",
    component: "select",
    group: "primary",
    order: 2,
    visible: true,
    defaultValue: "9:16",
    constraints: { type: "select", options: ["16:9", "9:16"] },
  },
  {
    // D78: prefilled visual-defect list, editable; drives Veo's GenerateVideosConfig.negativePrompt.
    // Stays PRIMARY (not advanced) — it is tuned per shot often enough to belong on the
    // always-visible surface, not behind the Advanced accordion. Orders last so the textarea
    // renders full-width below the paired Resolution + Duration row.
    name: "negative_prompt",
    label: "Negative Prompt",
    component: "textarea",
    group: "primary",
    order: 3,
    visible: true,
    defaultValue: VEO_NEGATIVE_DEFAULT,
    constraints: { type: "textarea", maxLength: 2500 },
  },
];

// Lite: same param set as Quality — same duration options (4/6/8), and it keeps negative_prompt
// even though veo-3.1-lite-generate-preview rejects the API field itself:
//   400 INVALID_ARGUMENT — "`negativePrompt` isn't supported by this model."
// The suppression list is still worth authoring on Lite, so the provider folds it into the prompt
// text instead of the config (composeVeoPrompt in providers/veo.ts). The param panel therefore
// stays identical across the three Veo variants, and only the wire format differs.
export const veoLiteParams: ParamSpec[] = veoParams;
