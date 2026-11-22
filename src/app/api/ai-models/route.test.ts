import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const caller = vi.fn();
vi.mock("@/lib/dal", () => ({ resolveCallerContextOrNull: () => caller() }));
const load = vi.fn();
vi.mock("@/lib/ai-models/catalog", () => ({ getAiCatalog: () => load() }));

import { GET } from "./route";

const model = (id: string, status: string) => ({ id, status });
const price = (id: string, modelId: string) => ({ id, modelId });

beforeEach(() => {
  caller.mockResolvedValue({ userId: "u1" });
  load.mockResolvedValue({
    models: [model("live-1", "live"), model("draft-1", "draft"), model("retired-1", "retired")],
    prices: [price("p1", "live-1"), price("p2", "draft-1")],
  });
});

describe("GET /api/ai-models", () => {
  it("returns the catalog without draft models or their prices", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.catalog.models.map((m: { id: string }) => m.id)).toEqual(["live-1", "retired-1"]);
    expect(body.catalog.prices.map((p: { id: string }) => p.id)).toEqual(["p1"]);
  });

  it("refuses a caller with no session", async () => {
    caller.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("says plainly when the catalog cannot be read", async () => {
    load.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not load the models." });
  });
});
