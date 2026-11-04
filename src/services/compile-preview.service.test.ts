import { describe, it, expect, vi, afterEach } from "vitest";
import { compilePreviewService } from "./compile-preview.service";
import { ApiError } from "./read-json";

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("compilePreviewService.get", () => {
  it("posts to the node's compile-preview route and returns its connected inputs", async () => {
    const avatar = { nodeId: "av-1", label: "Avatar", type: "file", text: "", fileUrl: "https://x/f.png", fileKind: "image" };
    respond(200, { ambient: "", connected: [avatar] });
    await expect(compilePreviewService.get("ig-1")).resolves.toEqual({ ambient: "", connected: [avatar] });
    expect(fetch).toHaveBeenCalledWith("/api/nodes/ig-1/compile-preview", expect.objectContaining({ method: "POST" }));
  });

  it("reads a node with nothing connected as an empty list", async () => {
    respond(200, {});
    await expect(compilePreviewService.get("ig-1")).resolves.toEqual({ ambient: "", connected: [] });
  });

  it("throws on a failed read rather than answering 'nothing connected'", async () => {
    respond(500, { error: "boom" });
    await expect(compilePreviewService.get("ig-1")).rejects.toBeInstanceOf(ApiError);
  });
});
