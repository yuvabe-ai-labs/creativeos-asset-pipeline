import "server-only";
import { getAiCatalog } from "@/lib/ai-models/catalog";
import { runnableModel, ModelUnavailableError, type ModelRefusal, type RunOptions } from "@/lib/ai-models/runnable";
import { toImageClientSpec } from "@/lib/ai-models/to-spec";
import type { AiCatalog } from "@/lib/ai-models/types";
import { imageAdapters } from "./adapters";
import type { ClientModelSpec, ImageGenInput, ImageGenResult } from "./types";

// D538, D540 — an image model as the server runs it: its data from the catalog row, its generate
// from the adapter map.
export type ImageRun = {
  ok: true;
  spec: ClientModelSpec;
  generate: (input: ImageGenInput) => Promise<ImageGenResult>;
};

export function imageRun(catalog: AiCatalog, modelId: string, opts: RunOptions = {}): ImageRun | ModelRefusal {
  const found = runnableModel(catalog, modelId, { ...opts, kind: "image", adapters: imageAdapters });
  if (!found.ok) return found;
  const spec = toImageClientSpec(found.model);
  const ctx = { spec, providerModelId: found.model.providerModelId };
  return { ok: true, spec, generate: (input) => found.adapter(input, ctx) };
}

/** D541 — the image task's generate, from the catalog at run time. The status is not checked
 *  again (the route did, when it reserved the run); a missing row or adapter is final. */
export async function imageGenerateForTask(modelId: string): Promise<ImageRun["generate"]> {
  const run = imageRun(await getAiCatalog(), modelId, { checkStatus: false });
  if (!run.ok) throw new ModelUnavailableError(run.message);
  return run.generate;
}
