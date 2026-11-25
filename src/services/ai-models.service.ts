import { authFetch } from "@/lib/supabase/session-ready";
import type { AiCatalog } from "@/lib/ai-models/types";
import { readJson } from "./read-json";

class AiModelsService {
  /** D552 — the model catalog with prices; draft models are left out by the route. */
  async catalog(): Promise<AiCatalog> {
    const res = await authFetch("/api/ai-models");
    const { catalog } = await readJson<{ catalog: AiCatalog }>(res, "Could not load the models.");
    return catalog;
  }
}

export const aiModelsService = new AiModelsService();
