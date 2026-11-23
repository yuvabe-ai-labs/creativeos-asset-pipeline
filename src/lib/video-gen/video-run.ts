import "server-only";
import { getAiCatalog } from "@/lib/ai-models/catalog";
import { runnableModel, ModelUnavailableError, type ModelRefusal, type RunOptions } from "@/lib/ai-models/runnable";
import { toVideoClientSpec } from "@/lib/ai-models/to-spec";
import type { AiCatalog } from "@/lib/ai-models/types";
import { videoAdapters } from "./adapters";
import type { VideoGenClientModelSpec, VideoGenInput, VideoGenResult } from "./types";

// D538, D540 — a video model as the server runs it: its data (params, rules, image inputs) from
// the catalog row, its generate from the adapter map.
export type VideoRun = {
  ok: true;
  spec: VideoGenClientModelSpec;
  generate: (input: VideoGenInput) => Promise<VideoGenResult>;
};

export function videoRun(catalog: AiCatalog, modelId: string, opts: RunOptions = {}): VideoRun | ModelRefusal {
  const found = runnableModel(catalog, modelId, { ...opts, kind: "video", adapters: videoAdapters });
  if (!found.ok) return found;
  const spec = toVideoClientSpec(found.model);
  const ctx = { spec, providerModelId: found.model.providerModelId };
  return { ok: true, spec, generate: (input) => found.adapter(input, ctx) };
}

/** D541 — a video task's generate, from the catalog at run time. The status is not checked again
 *  (the route did, when it reserved the run); a missing row or adapter is final. */
export async function videoGenerateForTask(modelId: string): Promise<VideoRun["generate"]> {
  const run = videoRun(await getAiCatalog(), modelId, { checkStatus: false });
  if (!run.ok) throw new ModelUnavailableError(run.message);
  return run.generate;
}
