import { authFetch } from "@/lib/supabase/session-ready";
import type { CanvasCost } from "@/lib/credits/canvas-cost";
import { readJson } from "./read-json";

class CanvasCostService {
  /** The canvas's settled spend: the total and the per-node breakdown, in one request. */
  async get(canvasId: string): Promise<CanvasCost> {
    // authFetch, not fetch: this runs on canvas load, alongside every other first request, and
    // shares their one session check if a backgrounded tab's token has expired (session-ready.ts).
    const res = await authFetch(`/api/canvas/${canvasId}/cost`);
    return readJson<CanvasCost>(res, "Could not load the canvas's credit usage.");
  }
}

export const canvasCostService = new CanvasCostService();
