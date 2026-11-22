// D534 — video prices live in ai_model_prices; this file keeps the two param readers.

/**
 * Determines whether audio is enabled for a video generation.
 * Returns true only when audioValue is explicitly "native" or "original".
 */
export function isVideoAudioEnabled(audioValue: unknown): boolean {
  return audioValue === "native" || audioValue === "original";
}

/**
 * Coerces a value to a resolution string if it's already a string, otherwise undefined.
 */
export function asResolutionString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
