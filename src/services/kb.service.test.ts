import { afterEach, describe, expect, it, vi } from "vitest";
import { kbService } from "./kb.service";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const patches = [{ path: ["brand_profile", "tagline"], patch: { status: "approved" as const } }];

describe("kbService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("saves field patches through the fields route", async () => {
    const fetchMock = vi.fn(async () => ok({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await kbService.patchFields("c1", { versionId: "v1", patches });
    expect(fetchMock).toHaveBeenCalledWith("/api/clients/c1/kb/fields", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId: "v1", patches }),
    });
  });

  it("approves through the ready route, with the version when the caller has one", async () => {
    const fetchMock = vi.fn(async () => ok({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await kbService.approve("c1");
    await kbService.approve("c1", "v1");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/clients/c1/kb/ready", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/clients/c1/kb/ready", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId: "v1" }) });
  });

  it("fails with the route's own words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "The brand KB was rebuilt. Reload to see the new one." }) })));
    await expect(kbService.patchFields("c1", { versionId: "v1", patches })).rejects.toThrow("The brand KB was rebuilt. Reload to see the new one.");
  });
});
