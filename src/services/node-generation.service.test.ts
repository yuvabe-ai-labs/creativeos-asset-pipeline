import { describe, it, expect, vi, afterEach } from "vitest";
import { nodeGenerationService } from "./node-generation.service";
import { ApiError } from "./read-json";

function respond(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe("nodeGenerationService (D366)", () => {
  it("starts an image generation and returns its id", async () => {
    respond(202, { generationId: "g1" });
    await expect(nodeGenerationService.startImage("n1", { modelId: "m" })).resolves.toEqual({ generationId: "g1" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/nodes/n1/image-generate",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ modelId: "m" }) }),
    );
  });

  it("starts a composite generation on its own route", async () => {
    respond(202, { generationId: "g2" });
    await nodeGenerationService.startComposite("n2", { instruction: "x" });
    expect(fetch).toHaveBeenCalledWith("/api/nodes/n2/composite-generate", expect.objectContaining({ method: "POST" }));
  });

  it("throws the server's message with its status, so a credit-limit refusal can be told apart", async () => {
    respond(402, { error: "Monthly credit limit reached" });
    const failure = nodeGenerationService.startImage("n1", {});
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 402 });
  });

  it("restores a version and returns what the node goes back to", async () => {
    respond(200, { output: "https://cdn/v1.png", modelUsed: "m", paramsUsed: { quality: "high" } });
    await expect(nodeGenerationService.restoreVersion("n1", "v1")).resolves.toEqual({
      output: "https://cdn/v1.png",
      modelUsed: "m",
      paramsUsed: { quality: "high" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/nodes/n1/restore-version",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ versionId: "v1" }) }),
    );
  });
});

describe("dubbing starts", () => {
  it("posts the language and the version to their routes", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ generationId: "g" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(nodeGenerationService.startDub("n1", { language: "hi-IN", style: "modern-colloquial" })).resolves.toEqual({ generationId: "g" });
    await expect(nodeGenerationService.startLipSync("n1", { versionId: "v1" })).resolves.toEqual({ generationId: "g" });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/nodes/n1/dub", "/api/nodes/n1/lip-sync"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ language: "hi-IN", style: "modern-colloquial" });
  });
});
