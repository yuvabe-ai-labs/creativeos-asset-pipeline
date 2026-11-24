import "server-only";
import { failGeneration, getLatestAvatarVoicePreview, listAvatarGenerations, sumAvatarCredits } from "@/lib/db/generations";
import { refundReservation } from "@/lib/db/credit-transactions";
import { priceForNewRun, pricingForNewRun } from "@/lib/ai-models/run-price";
import { creditSettingsAt } from "@/lib/credits/units";
import { VOICE_CHANGE_PRICE_MODEL_ID } from "@/lib/ai-models/service-models";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { generationToCandidate } from "./rows";
import {
  estimateVoicePreviewCredits, generationToVoicePreview, isVoicePreviewAbandoned, voicePreviewEngine, voicePreviewMode, VOICE_PREVIEW_ENGINE,
  VOICE_PREVIEW_TIMED_OUT_MESSAGE,
} from "./voice-preview";
import type { Avatar, AvatarCandidate, VoicePreview } from "./schema";
import type { GenerationRow } from "@/lib/db/types";

// What the Studio reads about an avatar besides the row itself: its generated images and its
// latest voice preview. Shared by the GET routes the browser polls and by the Studio page, which
// reads them on the server so a revisit opens with both already known — no empty grid, and no
// "not done" Preview step, while they load.

export type AvatarGenerations = { candidates: AvatarCandidate[]; spentCredits: number };
export type VoicePreviewState = { preview: VoicePreview | null; estimateCredits: number | null };

/** The front candidates generated so far, newest first, and what this avatar's images have cost
 *  (the ledger's settled amounts, not an estimate). */
export async function loadAvatarGenerations(avatarId: string): Promise<AvatarGenerations> {
  const [rows, spentCredits] = await Promise.all([
    listAvatarGenerations(avatarId),
    sumAvatarCredits(avatarId),
  ]);
  const candidates = rows.map(generationToCandidate).filter((c): c is AvatarCandidate => c !== null);
  return { candidates, spentCredits };
}

/** The avatar's latest preview. One left "running" by a lost task or webhook is failed and
 *  refunded here, on read, so it stops blocking the next preview as soon as the Studio looks.
 *  The reconcile-stuck-generations sweep does the same on its own schedule; both are idempotent
 *  (refundReservation refunds a generation once). */
export async function readLatestPreview(avatarId: string): Promise<GenerationRow | null> {
  const row = await getLatestAvatarVoicePreview(avatarId);
  if (!row || !isVoicePreviewAbandoned(row)) return row;
  await failGeneration({ generationId: row.id, error: VOICE_PREVIEW_TIMED_OUT_MESSAGE });
  await refundReservation({ orgId: row.org_id, generationId: row.id });
  return { ...row, status: "failed", error: VOICE_PREVIEW_TIMED_OUT_MESSAGE };
}

/** What the next preview would cost. A legacy custom-rate ElevenLabs voice costs a multiple of
 *  the standard rate (D283); an engine's own voice has no such rate, so a native preview asks
 *  ElevenLabs nothing. Display-only, so an unreachable ElevenLabs falls back to the standard
 *  rate rather than failing the read. */
async function estimateFor(avatar: Avatar): Promise<number | null> {
  const mode = voicePreviewMode(avatar);
  const engine = voicePreviewEngine(avatar);
  if (!mode || !engine) return null;
  const modelId = VOICE_PREVIEW_ENGINE[engine].modelId;
  // D548 — the estimate uses the credit settings live now, from the catalog the price came from.
  if (mode === "native") {
    const { price, catalog } = await pricingForNewRun(modelId);
    return estimateVoicePreviewCredits(price, null, "native", engine, 1, creditSettingsAt(catalog, new Date()));
  }
  // The prices and the voice do not depend on each other: one round trip, not three.
  const [{ price, catalog }, voiceChangePrice, voice] = await Promise.all([
    pricingForNewRun(modelId),
    priceForNewRun(VOICE_CHANGE_PRICE_MODEL_ID),
    avatar.voice?.mode === "named" ? getVoiceCached(avatar.voice.voiceId).catch(() => null) : Promise.resolve(null),
  ]);
  return estimateVoicePreviewCredits(price, voiceChangePrice, "named", engine, voice?.priceMultiplier ?? 1, creditSettingsAt(catalog, new Date()));
}

/** The latest preview in whatever state it is in, and what the next one would cost. */
export async function loadVoicePreviewState(avatar: Avatar): Promise<VoicePreviewState> {
  const [row, estimateCredits] = await Promise.all([readLatestPreview(avatar.id), estimateFor(avatar)]);
  return { preview: row ? generationToVoicePreview(row) : null, estimateCredits };
}
