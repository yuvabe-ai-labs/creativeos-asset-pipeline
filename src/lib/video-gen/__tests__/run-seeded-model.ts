// Runs a seeded video model the way the generate task does: through its catalog row's adapter,
// with the row's spec and provider model name. For provider tests that drive a whole request.
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { toVideoClientSpec } from "@/lib/ai-models/to-spec";
import { videoAdapters } from "../adapters";
import type { VideoGenInput, VideoGenResult } from "../types";

export function runSeededVideoModel(id: string, input: VideoGenInput): Promise<VideoGenResult> {
  const row = seededModelCatalog().models.find((m) => m.id === id && m.kind === "video");
  if (!row?.adapterKey || !row.providerModelId) throw new Error(`no runnable seeded video model ${id}`);
  return videoAdapters[row.adapterKey](input, { spec: toVideoClientSpec(row), providerModelId: row.providerModelId });
}
