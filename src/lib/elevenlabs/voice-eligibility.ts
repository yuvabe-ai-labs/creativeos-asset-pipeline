import { isVideoAudioEnabled } from "@/lib/video-gen/cost";

/**
 * D282 — why a voice can't be applied to this generation, or null when it can. Shared by the
 * focus view (disables the picker) and the video-generate route (rejects the request), so both
 * say the same thing. A model with no `audio` param always generates sound.
 */
export function voiceChangeBlockedReason(
  paramNames: string[],
  params: Record<string, unknown>,
  opts: { mock?: boolean } = {},
): string | null {
  if (opts.mock) return "Voice change is off in mock mode.";
  if (paramNames.includes("audio") && !isVideoAudioEnabled(params.audio)) {
    return "Turn Audio on to change the voice — this video will be silent.";
  }
  return null;
}
