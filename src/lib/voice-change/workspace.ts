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
  // `unknown`, not a `{ voiceName?: string }` shape: `voiceChange` is typed `unknown` on
  // VideoGenVersionInputs (Task 6 — it's read through `readVoiceChange`/`describeVoiceChange`
  // elsewhere, never dereferenced directly), and a narrower field type here would make this
  // type incompatible with the callers that pass a `VideoGenVersionSummary[]`.
  inputsUsed?: { voiceChange?: unknown } & Record<string, unknown>;
};

const succeeded = (v: VersionLike) => Boolean(v.output) && !v.error;

/**
 * Just the voice name for a version's label — deliberately lenient (only checks `voiceName`,
 * not the full `VoiceChangeRecord` shape `readVoiceChange` validates) since a label is display
 * only, never a value this module trusts for anything else.
 */
function voiceChangeName(voiceChange: unknown): string | undefined {
  return typeof voiceChange === "object" &&
    voiceChange !== null &&
    typeof (voiceChange as Record<string, unknown>).voiceName === "string"
    ? ((voiceChange as Record<string, unknown>).voiceName as string)
    : undefined;
}

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
      const voiceName = voiceChangeName(v.inputsUsed?.voiceChange);
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
