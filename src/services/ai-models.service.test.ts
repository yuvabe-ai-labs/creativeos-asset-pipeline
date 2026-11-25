import { describe, it, expect, vi } from "vitest";

const authFetch = vi.fn();
vi.mock("@/lib/supabase/session-ready", () => ({ authFetch: (url: string) => authFetch(url) }));

import { aiModelsService } from "./ai-models.service";

describe("aiModelsService.catalog", () => {
  it("reads /api/ai-models and returns the catalog", async () => {
    const catalog = { models: [{ id: "m1" }], prices: [] };
    authFetch.mockResolvedValue(new Response(JSON.stringify({ catalog }), { status: 200 }));
    await expect(aiModelsService.catalog()).resolves.toEqual(catalog);
    expect(authFetch).toHaveBeenCalledWith("/api/ai-models");
  });

  it("throws the route's message on failure", async () => {
    authFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Could not load the models." }), { status: 500 }));
    await expect(aiModelsService.catalog()).rejects.toThrow("Could not load the models.");
  });
});
