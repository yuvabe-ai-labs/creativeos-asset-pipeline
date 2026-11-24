import "server-only";
import { insertVersion, setActiveVersion, getVersionById, updateVersionOutputAndInputs } from "@/lib/db/versions";
import { succeedGeneration } from "@/lib/db/generations";
import { settleGeneration } from "@/lib/db/credit-transactions";
import { isOwnStoredUrl } from "@/lib/storage";
import { creditsFromUsd, creditSettingsAt } from "@/lib/credits/units";
import { pricingForGeneration, type RunPricing } from "@/lib/ai-models/run-price";
import { dubUsd, lipSyncUsd } from "@/lib/ai-models/service-price";
import type { GenerationRow } from "@/lib/db/types";
import { readDubRecord, readDubbingOutput, readLipSyncRecord, type DubbingOutput } from "./types";

export type DubSucceeded = {
  generationId: string; status: "succeeded"; kind: "dub"; stored: true;
  dubbedUrl: string; dubbedAudioUrl: string; durationSeconds: number; vendorJobId: string;
};
export type LipSyncSucceeded = {
  generationId: string; status: "succeeded"; kind: "lipsync"; stored: true;
  videoUrl: string; durationSeconds: number; vendorRequestId: string;
};

export type CompleteDeps = {
  insertVersion: typeof insertVersion;
  setActiveVersion: typeof setActiveVersion;
  getVersionById: typeof getVersionById;
  updateVersionOutputAndInputs: typeof updateVersionOutputAndInputs;
  settleGeneration: typeof settleGeneration;
  succeedGeneration: typeof succeedGeneration;
  failAndRefund: (generationId: string, orgId: string, error: string) => Promise<void>;
  isOwnStoredUrl: (url: string) => boolean;
  pricingFor: (g: GenerationRow) => Promise<RunPricing>;
  reservedFor: (generationId: string, g: GenerationRow, kind: "dub" | "lipsync") => Promise<number>;
  now: () => string;
};

export const dubbingCompleteDeps = (
  failAndRefund: CompleteDeps["failAndRefund"],
  reservedFor: CompleteDeps["reservedFor"],
): CompleteDeps => ({
  insertVersion, setActiveVersion, getVersionById, updateVersionOutputAndInputs,
  settleGeneration, succeedGeneration, failAndRefund, isOwnStoredUrl,
  pricingFor: (g) => pricingForGeneration(g),
  reservedFor,
  now: () => new Date().toISOString(),
});

/** D375 - a dub becomes a new active version holding the original and the dubbed stages. */
export async function completeDubGeneration(
  nodeId: string,
  generation: GenerationRow,
  input: DubSucceeded,
  deps: CompleteDeps,
): Promise<void> {
  const record = readDubRecord(generation.inputs_snapshot?.dub);
  if (!record) return deps.failAndRefund(input.generationId, generation.org_id, "Dub record is missing");
  if (!deps.isOwnStoredUrl(input.dubbedUrl) || !deps.isOwnStoredUrl(input.dubbedAudioUrl)) {
    return deps.failAndRefund(input.generationId, generation.org_id, "Dubbed files are outside this app's bucket");
  }
  const output: DubbingOutput = {
    language: record.targetLang,
    original: record.sourceUrl,
    dubbed: input.dubbedUrl,
    dubbedAudio: input.dubbedAudioUrl,
    lipSynced: null,
    ...(record.style ? { style: record.style } : {}),
    ...(record.voice ? { voice: record.voice } : {}),
  };
  const version = await deps.insertVersion({
    nodeId,
    operatorUserId: generation.user_id,
    inputsUsed: { ...(generation.inputs_snapshot ?? {}), dub: { ...record, vendorJobId: input.vendorJobId } },
    paramsUsed: { durationSeconds: input.durationSeconds },
    modelUsed: generation.model_used,
    output,
  });
  // D535 - priced with the row this run was reserved with; never 0 for a delivered dub. D548 -
  // credits with the settings live when the run started.
  const { price, catalog } = await deps.pricingFor(generation);
  const usd = price ? dubUsd(price, input.durationSeconds) : null;
  const credits = usd === null ? await deps.reservedFor(input.generationId, generation, "dub") : creditsFromUsd(usd, creditSettingsAt(catalog, new Date(generation.created_at)));
  await deps.settleGeneration({ orgId: generation.org_id, generationId: input.generationId, actualAmount: credits });
  await deps.setActiveVersion(nodeId, version.id);
  await deps.succeedGeneration({
    generationId: input.generationId, versionId: version.id, costUsd: usd ?? undefined,
    creditsCharged: credits, outputSnapshot: input.dubbedUrl,
    providerBill: { source: "request", meters: { audio_second: Math.ceil(input.durationSeconds) } },
  });
}

/** D375 - lip sync overrides the target version's lipSynced stage. No new version. */
export async function completeLipSyncGeneration(
  nodeId: string,
  generation: GenerationRow,
  input: LipSyncSucceeded,
  deps: CompleteDeps,
): Promise<void> {
  const asked = readLipSyncRecord(generation.inputs_snapshot?.lipSync);
  if (!asked) return deps.failAndRefund(input.generationId, generation.org_id, "Lip sync record is missing");
  if (!deps.isOwnStoredUrl(input.videoUrl)) {
    return deps.failAndRefund(input.generationId, generation.org_id, "Lip-synced video is outside this app's bucket");
  }
  const version = await deps.getVersionById(asked.versionId);
  const current = version && version.node_id === nodeId ? readDubbingOutput(version.output) : null;
  if (!version || !current) return deps.failAndRefund(input.generationId, generation.org_id, "The dub this lip sync was for is gone");

  const previous = readLipSyncRecord(version.inputs_used?.lipSync);
  const lipSync = {
    versionId: version.id, provider: asked.provider, model: asked.model,
    runs: (previous?.runs ?? 0) + 1, lastRanAt: deps.now(), vendorRequestId: input.vendorRequestId,
  };
  await deps.updateVersionOutputAndInputs(
    version.id,
    { ...current, lipSynced: input.videoUrl },
    { ...(version.inputs_used ?? {}), lipSync },
  );
  const { price, catalog } = await deps.pricingFor(generation);
  const usd = price ? lipSyncUsd(price, input.durationSeconds) : null;
  const credits = usd === null ? await deps.reservedFor(input.generationId, generation, "lipsync") : creditsFromUsd(usd, creditSettingsAt(catalog, new Date(generation.created_at)));
  await deps.settleGeneration({ orgId: generation.org_id, generationId: input.generationId, actualAmount: credits });
  await deps.succeedGeneration({
    generationId: input.generationId, versionId: version.id, costUsd: usd ?? undefined,
    creditsCharged: credits, outputSnapshot: input.videoUrl,
    providerBill: { source: "request", meters: { video_second: input.durationSeconds } },
  });
}
