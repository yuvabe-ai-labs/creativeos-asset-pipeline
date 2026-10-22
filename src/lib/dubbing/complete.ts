import "server-only";
import { insertVersion, setActiveVersion, getVersionById, updateVersionOutputAndInputs } from "@/lib/db/versions";
import { succeedGeneration } from "@/lib/db/generations";
import { settleGeneration } from "@/lib/db/credit-transactions";
import { isOwnStoredUrl } from "@/lib/storage";
import { usdToFinalCredits } from "@/lib/credits/units";
import type { GenerationRow } from "@/lib/db/types";
import { readDubRecord, readDubbingOutput, readLipSyncRecord, type DubbingOutput } from "./types";
import { computeDubCost, computeLipSyncCost } from "./cost";

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
  now: () => string;
};

export const dubbingCompleteDeps = (failAndRefund: CompleteDeps["failAndRefund"]): CompleteDeps => ({
  insertVersion, setActiveVersion, getVersionById, updateVersionOutputAndInputs,
  settleGeneration, succeedGeneration, failAndRefund, isOwnStoredUrl,
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
  const cost = computeDubCost(input.durationSeconds);
  const credits = usdToFinalCredits(cost.usd);
  await deps.settleGeneration({ orgId: generation.org_id, generationId: input.generationId, actualAmount: credits });
  await deps.setActiveVersion(nodeId, version.id);
  await deps.succeedGeneration({
    generationId: input.generationId, versionId: version.id, costUsd: cost.usd,
    creditsCharged: credits, outputSnapshot: input.dubbedUrl,
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
  const cost = computeLipSyncCost(input.durationSeconds);
  const credits = usdToFinalCredits(cost.usd);
  await deps.settleGeneration({ orgId: generation.org_id, generationId: input.generationId, actualAmount: credits });
  await deps.succeedGeneration({
    generationId: input.generationId, versionId: version.id, costUsd: cost.usd,
    creditsCharged: credits, outputSnapshot: input.videoUrl,
  });
}
