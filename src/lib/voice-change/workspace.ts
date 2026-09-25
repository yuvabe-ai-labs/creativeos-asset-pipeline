// D284 — pure helpers for the Change voice workspace: which versions can be re-voiced, the
// default pick, the cost estimate, and why Apply is (or isn't) enabled. Unit-tested in
// __tests__/workspace.test.ts.
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";

type VersionLike = {
  id: string;
  createdAt: string;
  output: string | null;
  error: string | null;
  inputsUsed?: { voiceChange?: { voiceName?: string } } & Record<string, unknown>;
};

const succeeded = (v: VersionLike) => Boolean(v.output) && !v.error;

/**
 * Succeeded video versions only, newest first — labelled `v{n}` by CHRONOLOGICAL position
 * counting every version including failed ones, matching VersionHistoryList's numbering
 * (src/components/nodes/version-history-list.tsx: `v${total - i}` over the full, newest-first
 * `versions` array). A voice-changed version's label also names the voice it used.
 */
export function sourceVersionOptions(versions: VersionLike[]): Array<{ id: string; label: string }> {
  const chrono = [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const number = new Map(chrono.map((v, i) => [v.id, i + 1]));
  return [...versions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter(succeeded)
    .map((v) => {
      const voiceName = v.inputsUsed?.voiceChange?.voiceName;
      return { id: v.id, label: `v${number.get(v.id)}${voiceName ? ` · voice: ${voiceName}` : ""}` };
    });
}

/** The active version if it succeeded, else the newest succeeded one, else null. */
export function defaultSourceVersionId(versions: VersionLike[], activeVersionId: string | null): string | null {
  const ok = versions.filter(succeeded);
  if (activeVersionId && ok.some((v) => v.id === activeVersionId)) return activeVersionId;
  return sourceVersionOptions(versions)[0]?.id ?? null;
}

/** The pre-generation estimate for a voice-only change: duration × the voice's rate multiplier. */
export function voiceChangeEstimateCredits(durationSeconds: number, priceMultiplier: number): number {
  return usdToFinalCredits(computeVoiceChangeCost(durationSeconds, priceMultiplier).usd);
}

/** Why the Apply button is disabled, in priority order — or `{ ok: true }` when it isn't. */
export function canApplyVoiceChange(a: {
  sourceId: string | null;
  voice: boolean;
  saving: boolean;
  running: boolean;
}): { ok: boolean; reason?: string } {
  if (!a.sourceId) return { ok: false, reason: "Pick a version to change." };
  if (!a.voice) return { ok: false, reason: "Pick a voice." };
  if (a.saving) return { ok: false, reason: "Adding the voice to your ElevenLabs account…" };
  if (a.running) return { ok: false, reason: "A generation is already running on this node." };
  return { ok: true };
}
