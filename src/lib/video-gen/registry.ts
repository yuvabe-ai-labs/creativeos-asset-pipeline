import "server-only";
import type { VideoGenModelSpec } from "./types";
import { veoLite, veoFast, veoQuality } from "./providers/veo";
import { kling30, klingO1, kling30Omni } from "./providers/kling";
import { seedance25 } from "./providers/seedance";
import { geminiOmni } from "./providers/gemini-omni";

export const videoGenRegistry: Record<string, VideoGenModelSpec> = {
  [veoLite.id]: veoLite,
  [veoFast.id]: veoFast,
  [veoQuality.id]: veoQuality,
  [kling30.id]: kling30,
  [klingO1.id]: klingO1,
  [kling30Omni.id]: kling30Omni,
  [seedance25.id]: seedance25,
  [geminiOmni.id]: geminiOmni,
};

export const DEFAULT_VIDEO_MODEL_ID = "veo:veo-3.1-fast";
