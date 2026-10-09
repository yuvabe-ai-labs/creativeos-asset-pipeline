import { describe, it, expect, vi, afterEach } from "vitest";
import { nodeUpstreamService } from "./node-upstream.service";
import { ApiError } from "./read-json";

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("nodeUpstreamService.get", () => {
  it("reads the node's upstream-images route", async () => {
    const image = { id: "img-1", type: "file", imageUrl: "https://cdn/1.png" };
    const promptNode = { id: "p-1", type: "video-prompt", text: "A slow push in" };
    respond(200, { images: [image], promptNode });
    await expect(nodeUpstreamService.get("vg-1")).resolves.toEqual({
      images: [image],
      promptNode,
    });
    expect(fetch).toHaveBeenCalledWith("/api/nodes/vg-1/upstream-images");
  });

  it("reads a node with nothing connected as no images and no prompt", async () => {
    respond(200, {});
    await expect(nodeUpstreamService.get("vg-1")).resolves.toEqual({ images: [], promptNode: null });
  });

  it("throws on a failed read rather than answering 'nothing connected'", async () => {
    respond(500, { error: "Failed to resolve upstream images" });
    await expect(nodeUpstreamService.get("vg-1")).rejects.toBeInstanceOf(ApiError);
  });
});
