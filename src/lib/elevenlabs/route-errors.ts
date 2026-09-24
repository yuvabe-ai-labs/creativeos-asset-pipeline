import { apiError } from "@/lib/api/route-helpers";
import { ElevenLabsHttpError, ElevenLabsKeyMissingError } from "./client";
import { VOICE_NOT_SET_UP_MESSAGE } from "./constants";

/** D283 — one mapping for every ElevenLabs-backed route: 503 unset key, ElevenLabs 4xx through, else 502. */
export function elevenLabsRouteError(e: unknown) {
  if (e instanceof ElevenLabsKeyMissingError) return apiError(VOICE_NOT_SET_UP_MESSAGE, 503);
  if (e instanceof ElevenLabsHttpError && e.status >= 400 && e.status < 500) return apiError(e.message, e.status);
  return apiError(e instanceof Error ? e.message : "Could not reach ElevenLabs.", 502);
}
