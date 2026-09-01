// Master video controls for the Video Prompt node (D24). Mirrors shot-controls.ts.
// Veo image-to-video lever is *camera movement* + *motion energy* — lens/lighting drop
// out (the start frame already fixed them). Pre-rendered, curated catalog; option lists
// are a data constant refined later from eval results (data change, not architecture).

export type VideoControlKey = "camera" | "speed";

export type VideoControlOption = {
  value: string;
  label: string;
  prose: string; // injected into the prompt; "" for the Auto (no-constraint) option
};

/**
 * Per-beat camera, for a multishot shot (D201).
 *
 * `camera` takes a value from the same VIDEO_CONTROLS catalog the single-shot select uses, so the
 * prose injected per beat is the same vocabulary rather than a second one that could drift.
 */
export type BeatControl = { camera: string };

export const DEFAULT_BEAT_CONTROL: BeatControl = { camera: "auto" };

export type VideoControls = Record<VideoControlKey, string> & {
  /**
   * The LOOK contract — light direction, time of day, lens feel, palette, ground, grade. Written
   * once and reproduced VERBATIM at the top of every beat, because paraphrase is drift and this is
   * the only thing making separate cuts read as one film. Multishot only; absent until authored.
   */
  look?: string;
  /**
   * Per-beat camera, index-aligned with the shot's beats. Multishot only.
   *
   * One camera move describes a single continuous take; a clip holding five cuts needs one per
   * beat. Read through `beatControlsFor`, never directly — the saved array can be stale.
   */
  beats?: BeatControl[];
};

export const VIDEO_CONTROLS: {
  key: VideoControlKey;
  label: string;
  options: VideoControlOption[];
}[] = [
  {
    key: "camera",
    label: "Camera",
    options: [
      { value: "auto", label: "Auto", prose: "" },
      { value: "static", label: "Static", prose: "a locked-off static frame with no camera movement" },
      { value: "push-in", label: "Push in", prose: "a slow, steady push-in toward the subject at a constant focal length" },
      { value: "pull-back", label: "Pull back", prose: "a smooth pull-back revealing the surrounding scene at a constant focal length" },
      { value: "orbit", label: "Orbit", prose: "a slow, small-angle orbit around the subject, holding constant distance, height, and focal length" },
      { value: "tracking", label: "Tracking", prose: "a smooth lateral tracking move alongside the subject at constant distance and focal length" },
      { value: "pan", label: "Pan", prose: "a steady horizontal pan across the frame from a fixed camera position" },
      { value: "tilt", label: "Tilt", prose: "a deliberate vertical tilt from a fixed camera position" },
      { value: "handheld", label: "Handheld", prose: "subtle handheld texture while otherwise holding the framing" },
      { value: "crane", label: "Crane", prose: "a slow rising crane move, keeping the subject centered" },
    ],
  },
  {
    key: "speed",
    label: "Speed",
    options: [
      { value: "auto", label: "Auto", prose: "" },
      { value: "subtle", label: "Subtle", prose: "subtle, slow motion energy" },
      { value: "moderate", label: "Moderate", prose: "a moderate, natural pace" },
      { value: "dynamic", label: "Dynamic", prose: "dynamic, energetic motion" },
    ],
  },
];

export const DEFAULT_VIDEO_CONTROLS: VideoControls = {
  camera: "auto",
  speed: "auto",
};

// The motion-control block injected into the compiled prompt. "" when nothing to inject. Camera is
// always emitted (text-camera for every provider — Veo has no camera param, Kling 3.0 has no
// camera_control). Camera leads as its own clause; text models parse it best separated from action.
export function renderVideoControls(controls: VideoControls): string {
  const lines: string[] = [];
  for (const group of VIDEO_CONTROLS) {
    const opt = group.options.find((o) => o.value === controls[group.key]);
    if (opt && opt.value !== "auto" && opt.prose) lines.push(`- ${group.label}: ${opt.prose}`);
  }
  if (lines.length === 0) return "";
  return `Motion controls (use these exactly; do not substitute):\n${lines.join("\n")}`;
}

/**
 * The saved per-beat controls, reconciled to the shot's CURRENT beat count.
 *
 * Beats can be added or removed on the Shot node long after these were saved, and a stale array
 * would silently pair beat 3's camera with beat 2's action — wrong, and invisible. Padding and
 * truncating on read keeps the rows in step with the beats without having to persist on every
 * edit to the shot.
 */
export function beatControlsFor(controls: VideoControls, beatCount: number): BeatControl[] {
  const saved = controls.beats ?? [];
  return Array.from(
    { length: Math.max(0, beatCount) },
    (_, i) => saved[i] ?? DEFAULT_BEAT_CONTROL,
  );
}

export type LookPreset = { value: string; label: string; prose: string };

/**
 * Starting points for the LOOK contract — a paragraph to edit, not a fixed menu.
 *
 * Each one names the repeatable physical facts the guidance asks for: light direction, time of
 * day, lens feel, palette, ground surface, grade. Deliberately not mood words — "warm cinematic
 * vibe" cannot be reproduced across generations, while "low sun from camera-left, long shadows
 * toward the lens, warm grey concrete, 35mm at knee height" can.
 */
export const LOOK_PRESETS: LookPreset[] = [
  {
    value: "documentary-day",
    label: "Documentary daylight",
    prose:
      "Contemporary city, late afternoon, warm low sun with clean open shade. Handheld " +
      "documentary energy, shallow depth of field, 35mm and 85mm feel. Natural skin tones; " +
      "wardrobe palette of off-white, olive, sand and denim. Grounded and unglamorous — no " +
      "studio lighting, no colour gels, no slow motion. Subjects keep real physical contact " +
      "with the ground; nothing floats, stretches or deforms.",
  },
  {
    value: "tabletop-soft",
    label: "Soft tabletop",
    prose:
      "Interior tabletop, diffused north light from camera-left, soft falloff into open shade. " +
      "Locked, deliberate framing at 50mm and 100mm macro. Palette of warm grey concrete, pale " +
      "linen and clear glass. Matte surfaces, no specular hotspots, no colour gels. Products " +
      "keep full contact with the surface and never tilt, float or deform.",
  },
  {
    value: "evening-street",
    label: "Evening street",
    prose:
      "City street after sunset, cool ambient sky against warm shopfront light. Handheld at " +
      "35mm, shallow focus, practical light sources only. Palette of deep blue shadow, amber " +
      "highlight and wet asphalt. No colour gels, no added lens flares, no slow motion. Feet " +
      "and props keep real contact with the ground.",
  },
];
