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

export type VideoControls = Record<VideoControlKey, string>;

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
      { value: "static", label: "Static", prose: "a locked-off static frame" },
      { value: "push-in", label: "Push in", prose: "a slow push-in toward the subject" },
      { value: "pull-back", label: "Pull back", prose: "a smooth pull-back revealing the scene" },
      { value: "orbit", label: "Orbit", prose: "a gentle orbit around the subject" },
      { value: "tracking", label: "Tracking", prose: "a smooth tracking shot alongside the subject" },
      { value: "pan", label: "Pan", prose: "a steady pan across the frame" },
      { value: "tilt", label: "Tilt", prose: "a deliberate vertical tilt" },
      { value: "handheld", label: "Handheld", prose: "subtle handheld movement" },
      { value: "crane", label: "Crane", prose: "a rising crane move" },
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
