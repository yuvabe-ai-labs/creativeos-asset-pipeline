// Descriptive per-shot controls for the Prompt node (PRD §11.5/§12). The image API has no
// "lens"/"lighting" parameter, so these only affect the image as words in the prompt — they
// live here and are injected as constraints the model must honor (fixes Run-01 homogeneity).
//
// A pre-rendered, curated catalog. "Learned later" = refine these option lists from eval
// results (which values pass) — a data change to this constant, no architecture change.

export type ShotControlKey = "lens" | "composition" | "lighting";

export type ShotControlOption = {
  value: string;
  label: string;
  prose: string; // injected into the prompt; "" for the Auto (no-constraint) option
};

export type ShotControls = Record<ShotControlKey, string>;

export const SHOT_CONTROLS: {
  key: ShotControlKey;
  label: string;
  options: ShotControlOption[];
}[] = [
  {
    key: "lens",
    label: "Lens",
    options: [
      { value: "auto", label: "Auto", prose: "" },
      { value: "wide-24", label: "Wide 24mm", prose: "a 24mm wide-angle lens, deep focus" },
      { value: "wide-35", label: "Wide 35mm", prose: "a 35mm wide lens" },
      { value: "standard-50", label: "Standard 50mm", prose: "a 50mm standard lens" },
      { value: "portrait-85", label: "Portrait 85mm", prose: "an 85mm f/1.8 portrait lens with shallow depth of field" },
      { value: "macro-100", label: "Macro 100mm", prose: "a 100mm macro lens with extreme close detail" },
    ],
  },
  {
    key: "composition",
    label: "Composition",
    options: [
      { value: "auto", label: "Auto", prose: "" },
      { value: "center", label: "Center-framed", prose: "a center-framed composition" },
      { value: "negative-space", label: "Negative space", prose: "generous negative space, minimal and restrained" },
      { value: "flat-lay", label: "Flat-lay / overhead", prose: "an overhead flat-lay composition" },
      { value: "close-crop", label: "Tight close-crop", prose: "a tight close crop" },
      { value: "thirds", label: "Rule of thirds", prose: "a rule-of-thirds composition" },
    ],
  },
  {
    key: "lighting",
    label: "Lighting",
    options: [
      { value: "auto", label: "Auto", prose: "" },
      { value: "soft-daylight", label: "Soft window daylight", prose: "soft diffused window daylight" },
      { value: "golden-hour", label: "Golden hour", prose: "warm golden-hour backlighting" },
      { value: "chiaroscuro", label: "Dramatic chiaroscuro", prose: "dramatic chiaroscuro with deep shadow contrast" },
      { value: "studio-softbox", label: "Studio softbox", prose: "three-point studio softbox lighting" },
      { value: "candlelit", label: "Candlelit warm", prose: "warm candlelit ambience" },
    ],
  },
];

export const DEFAULT_SHOT_CONTROLS: ShotControls = {
  lens: "auto",
  composition: "auto",
  lighting: "auto",
};

// Heuristic defaults from the shot text. The Prakriti shot descriptions literally contain
// "wide shot", "ultra macro close-up", "golden hour", "overhead", etc. No LLM call.
export function deriveShotControlDefaults(shotText: string): ShotControls {
  const t = (shotText ?? "").toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  let lens = "auto";
  let composition = "auto";

  if (has("macro", "extreme close")) {
    lens = "macro-100";
    composition = "close-crop";
  } else if (has("close-up", "close up", "close crop", "tight crop")) {
    lens = "portrait-85";
  } else if (has("wide shot", "wide-angle", "wide angle", "aerial", "establishing")) {
    lens = "wide-24";
  } else if (has("medium shot", "medium close")) {
    lens = "standard-50";
  }

  if (composition === "auto") {
    if (has("overhead", "flat lay", "flat-lay", "top-down", "top down")) composition = "flat-lay";
    else if (has("negative space", "minimal")) composition = "negative-space";
    else if (has("center", "centre", "centered", "centred")) composition = "center";
  }

  let lighting = "auto";
  if (has("golden hour")) lighting = "golden-hour";
  else if (has("candle")) lighting = "candlelit";
  else if (has("chiaroscuro", "dramatic shadow", "deep shadow")) lighting = "chiaroscuro";
  else if (has("softbox", "three-point", "studio light")) lighting = "studio-softbox";
  else if (has("window light", "daylight", "diffused")) lighting = "soft-daylight";

  return { lens, composition, lighting };
}

// The constraint block injected into the compiled prompt. "" when every control is Auto.
export function renderShotControls(controls: ShotControls): string {
  const lines: string[] = [];
  for (const group of SHOT_CONTROLS) {
    const opt = group.options.find((o) => o.value === controls[group.key]);
    if (opt && opt.value !== "auto" && opt.prose) lines.push(`- ${group.label}: ${opt.prose}`);
  }
  if (lines.length === 0) return "";
  return `Shot controls (use these exactly; do not substitute):\n${lines.join("\n")}`;
}
