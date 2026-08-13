import { describe, expect, it, vi, beforeEach } from "vitest";

// authFetch (used by doFetch) routes through ensureFreshSession(), which calls
// createBrowserSupabase() — stub it so that doesn't throw for missing env vars in tests.
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
  }),
}));

import {
  __canvasGenerationsInternals,
  __resetCanvasGenerationsCache,
  revalidateCanvasGenerations,
} from "./use-canvas-generations";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function mockGens(ids: string[]) {
  return {
    ok: true,
    json: async () => ({
      items: ids.map((id) => ({
        id,
        nodeId: `n-${id}`,
        nodeName: `Node ${id}`,
        imageUrl: `https://gcs/${id}.png`,
        modelUsed: "openai:gpt-image-1",
        createdAt: "2026-07-14T00:00:00Z",
      })),
    }),
  };
}

describe("useCanvasGenerations internals", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    __resetCanvasGenerationsCache();
  });

  it("populates cache on doFetch", async () => {
    fetchMock.mockResolvedValueOnce(mockGens(["a", "b"]));
    await __canvasGenerationsInternals.doFetch("canvas-1");
    const entry = __canvasGenerationsInternals.getEntry("canvas-1");
    expect(entry?.items).toHaveLength(2);
    expect(entry?.loadError).toBeNull();
  });

  it("keeps caches separate per canvas id", async () => {
    fetchMock.mockResolvedValueOnce(mockGens(["a"]));
    await __canvasGenerationsInternals.doFetch("canvas-1");

    fetchMock.mockResolvedValueOnce(mockGens(["z"]));
    await __canvasGenerationsInternals.doFetch("canvas-2");

    expect(__canvasGenerationsInternals.getEntry("canvas-1")?.items[0].id).toBe("a");
    expect(__canvasGenerationsInternals.getEntry("canvas-2")?.items[0].id).toBe("z");
  });

  it("re-fetching a canvas overwrites its cache entry", async () => {
    fetchMock.mockResolvedValueOnce(mockGens(["a"]));
    await __canvasGenerationsInternals.doFetch("canvas-1");
    expect(__canvasGenerationsInternals.getEntry("canvas-1")?.items[0].id).toBe("a");

    fetchMock.mockResolvedValueOnce(mockGens(["b"]));
    await __canvasGenerationsInternals.doFetch("canvas-1");
    expect(__canvasGenerationsInternals.getEntry("canvas-1")?.items[0].id).toBe("b");
  });

  it("revalidates every cached canvas, keeping the old items visible until the new ones land", async () => {
    fetchMock.mockResolvedValueOnce(mockGens(["a"]));
    await __canvasGenerationsInternals.doFetch("canvas-1");

    fetchMock.mockResolvedValueOnce(mockGens(["a", "b"]));
    const pending = revalidateCanvasGenerations();
    // Stale-while-revalidate: the cache entry is NOT torn down mid-flight, so the drawer
    // keeps rendering the images it already had instead of flashing an empty state.
    expect(__canvasGenerationsInternals.getEntry("canvas-1")?.items).toHaveLength(1);
    await pending;
    expect(__canvasGenerationsInternals.getEntry("canvas-1")?.items).toHaveLength(2);
  });

  it("revalidating with nothing cached fetches nothing", async () => {
    await revalidateCanvasGenerations();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sets loadError on failure and empties items", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "x",
    });
    await __canvasGenerationsInternals.doFetch("canvas-1");
    const entry = __canvasGenerationsInternals.getEntry("canvas-1");
    expect(entry?.loadError).toBeTruthy();
    expect(entry?.items).toHaveLength(0);
  });
});
