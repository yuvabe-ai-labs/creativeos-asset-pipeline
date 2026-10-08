import { VOICE_CHANGE_MODELS } from "@/lib/elevenlabs/voice-settings";
import { readVoiceChange } from "./record";

// D284 — client-safe (imports record.ts, not source.ts): a version's provenance line for
// History, the usage popover and "Sent to model" all read this instead of re-deriving the
// summary each place `inputs_used.voiceChange` shows up.

export type VoiceChangeDescription = { title: string; detail: string };

/**
 * The same provenance as label/value rows, for the "Sent to model" pane's `dt`/`dd` list —
 * built from the record, not by splitting describeVoiceChange's joined string.
 */
export function voiceChangeRows(
  inputsUsed: Record<string, unknown> | undefined,
  labelById: Map<string, string>,
): Array<{ label: string; value: string }> | null {
  const vc = readVoiceChange(inputsUsed?.voiceChange);
  if (!vc) return null;
  const s = vc.settings;
  return [
    { label: "Voice", value: vc.priceMultiplier > 1 ? `${vc.voiceName} (${vc.priceMultiplier}×)` : vc.voiceName },
    { label: "Changed from", value: labelById.get(vc.baseVersionId) ?? "An earlier version" },
    { label: "Stability", value: String(s.stability) },
    { label: "Similarity", value: String(s.similarity) },
    { label: "Style exaggeration", value: String(s.style) },
    { label: "Speaker boost", value: s.speakerBoost ? "On" : "Off" },
    { label: "Remove background noise", value: s.removeBackgroundNoise ? "On" : "Off" },
    { label: "Model", value: VOICE_CHANGE_MODELS.find((m) => m.value === s.modelId)?.label ?? s.modelId },
    ...(s.seed !== undefined ? [{ label: "Seed", value: String(s.seed) }] : []),
    ...(vc.driftMs !== undefined ? [{ label: "Sync drift", value: `${vc.driftMs} ms` }] : []),
  ];
}

/**
 * A voice-changed version's provenance, as a title ("Voice: Anjali · 2×") and a one-line
 * settings summary ("changed from v3 · stability 50 · …") — or null when the version isn't a
 * voice change (a normal generation, or a legacy D282 version, which callers read via
 * `readVoiceMeta` instead).
 */
export function describeVoiceChange(
  inputsUsed: Record<string, unknown> | undefined,
  labelById: Map<string, string>,
): VoiceChangeDescription | null {
  const vc = readVoiceChange(inputsUsed?.voiceChange);
  if (!vc) return null;
  const s = vc.settings;
  const model = VOICE_CHANGE_MODELS.find((m) => m.value === s.modelId)?.label ?? s.modelId;
  const parts = [
    `changed from ${labelById.get(vc.baseVersionId) ?? "an earlier version"}`,
    `stability ${s.stability}`,
    `similarity ${s.similarity}`,
    `style ${s.style}`,
    `speaker boost ${s.speakerBoost ? "on" : "off"}`,
    `noise removal ${s.removeBackgroundNoise ? "on" : "off"}`,
    model,
    ...(s.seed !== undefined ? [`seed ${s.seed}`] : []),
    ...(vc.driftMs !== undefined ? [`drift ${vc.driftMs} ms`] : []),
  ];
  return {
    title: `Voice: ${vc.voiceName}${vc.priceMultiplier > 1 ? ` · ${vc.priceMultiplier}×` : ""}`,
    detail: parts.join(" · "),
  };
}
