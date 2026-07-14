import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/drive/client", () => ({
  exchangeRefreshToken: vi.fn(async () => "fake-token"),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeReq() {
  return new NextRequest("http://x/api/drive/folders");
}
function mockOk(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("GET /api/drive/folders", () => {
  beforeEach(() => fetchMock.mockReset());

  it("returns merged deduped folders from owned + shared queries", async () => {
    fetchMock.mockResolvedValueOnce(
      mockOk({ files: [{ id: "f1", name: "Brand Assets" }] }),
    );
    fetchMock.mockResolvedValueOnce(
      mockOk({ files: [{ id: "f2", name: "Shared Folder" }, { id: "f1", name: "Brand Assets" }] }),
    );

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.items).toHaveLength(2);
    expect(body.items.find((i: { id: string }) => i.id === "f1").isShared).toBe(false);
    expect(body.items.find((i: { id: string }) => i.id === "f2").isShared).toBe(true);
  });

  it("returns 500 when Drive token fails", async () => {
    const { exchangeRefreshToken } = await import("@/lib/drive/client");
    vi.mocked(exchangeRefreshToken).mockRejectedValueOnce(new Error("no token"));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });
});
