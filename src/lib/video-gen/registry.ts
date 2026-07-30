import "server-only";
import type { VideoGenModelSpec } from "./types";
import { veoLite, veoFast, veoQuality } from "./providers/veo";
import { kling30, klingO1 } from "./providers/kling";

export const videoGenRegistry: Record<string, VideoGenModelSpec> = {
  [veoLite.id]: veoLite,
  [veoFast.id]: veoFast,
  [veoQuality.id]: veoQuality,
  [kling30.id]: kling30,
  [klingO1.id]: klingO1,
};

export const DEFAULT_VIDEO_MODEL_ID = "veo:veo-3.1-fast";
