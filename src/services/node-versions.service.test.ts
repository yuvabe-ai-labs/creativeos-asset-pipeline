import { describe, it, expect, vi, afterEach } from "vitest";
import { nodeVersionsService } from "./node-versions.service";
import { ApiError } from "./read-json";

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("nodeVersionsService.list", () => {
  it("reads the node's versions route and returns its rows and active pointer", async () => {
    respond(200, { activeVersionId: "v2", versions: [{ id: "v2" }, { id: "v1" }] });
    await expect(nodeVersionsService.list<{ id: string }>("node-1")).resolves.toEqual({
      activeVersionId: "v2",
      versions: [{ id: "v2" }, { id: "v1" }],
    });
    expect(fetch).toHaveBeenCalledWith("/api/nodes/node-1/versions");
  });

  it("reads a node with no versions as an empty list and no active version", async () => {
    respond(200, {});
    await expect(nodeVersionsService.list("node-1")).resolves.toEqual({
      activeVersionId: null,
      versions: [],
    });
  });

  it("throws the server's message, with its status, when the read fails", async () => {
    respond(404, { error: "Node not found." });
    const failure = nodeVersionsService.list("node-1");
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ message: "Node not found.", status: 404 });
  });
});
