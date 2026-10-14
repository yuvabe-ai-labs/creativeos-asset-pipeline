import { apiError } from "@/lib/api/route-helpers";
import { ElevenLabsHttpError, ElevenLabsKeyMissingError } from "./client";
import { VOICE_NOT_SET_UP_MESSAGE, VOICE_SLOTS_FULL_MESSAGE } from "./constants";

/** D283 — one mapping for every ElevenLabs-backed route: 503 unset key, ElevenLabs 4xx through, else 502. */
export function elevenLabsRouteError(e: unknown) {
  if (e instanceof ElevenLabsKeyMissingError) return apiError(VOICE_NOT_SET_UP_MESSAGE, 503);
  // D292 — every client shares one account's voice slots; say what to do about a full one.
  if (e instanceof ElevenLabsHttpError && e.message.includes("voice_limit_reached")) {
    return apiError(VOICE_SLOTS_FULL_MESSAGE, 409);
  }
  if (e instanceof ElevenLabsHttpError && e.status >= 400 && e.status < 500) return apiError(e.message, e.status);
  return apiError(e instanceof Error ? e.message : "Could not reach ElevenLabs.", 502);
}
