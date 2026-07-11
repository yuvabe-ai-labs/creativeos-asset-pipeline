import "server-only";
import type { VideoGenModelSpec } from "./types";
import { veoLite, veoFast, veoQuality } from "./providers/veo";
import { soraFast } from "./providers/sora";
import { klingV15, klingV16, klingV21, klingV21Master, klingV26, klingV3 } from "./providers/kling";

export const videoGenRegistry: Record<string, VideoGenModelSpec> = {
  [veoLite.id]: veoLite,
  [veoFast.id]: veoFast,
  [veoQuality.id]: veoQuality,
  [soraFast.id]: soraFast,
  [klingV15.id]: klingV15,
  [klingV16.id]: klingV16,
  [klingV21.id]: klingV21,
  [klingV21Master.id]: klingV21Master,
  [klingV26.id]: klingV26,
  [klingV3.id]: klingV3,
};

export const DEFAULT_VIDEO_MODEL_ID = "veo:veo-3.1-fast";
