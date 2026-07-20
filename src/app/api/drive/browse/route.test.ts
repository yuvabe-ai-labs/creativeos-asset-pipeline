import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/drive/client", () => ({
  exchangeRefreshToken: vi.fn(async () => "fake-token"),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeReq(qs: string) {
  return new NextRequest(`http://x/api/drive/browse?${qs}`);
}
function mockOk(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("GET /api/drive/browse", () => {
  beforeEach(() => fetchMock.mockReset());

  it("returns images and folders for a given folderId", async () => {
    fetchMock.mockResolvedValueOnce(
      mockOk({
        nextPageToken: null,
        files: [
          { id: "sub1", name: "Logos", mimeType: "application/vnd.google-apps.folder", modifiedTime: "2026-07-14T00:00:00Z" },
          { id: "img1", name: "hero.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-13T00:00:00Z", thumbnailLink: "https://thumb/img1" },
        ],
      }),
    );

    const res = await GET(makeReq("folderId=root123"));
    const body = await res.json();

    expect(body.items).toHaveLength(2);
    const folder = body.items.find((i: { id: string }) => i.id === "sub1");
    const image = body.items.find((i: { id: string }) => i.id === "img1");
    expect(folder.thumbnailUrl).toBeNull();
    expect(image.thumbnailUrl).toBe("/api/drive/thumbnail/img1");
    expect(image.previewUrl).toBe("/api/drive/file/img1");

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("root123");
    expect(url).toContain("in+parents");
  });

  it("applies q search within folder", async () => {
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    await GET(makeReq("folderId=abc&q=logo"));
    const url = fetchMock.mock.calls[0][0] as string;
    // main switched search from fullText to name matching (059ccf3)
    expect(url).toContain("name+contains");
    expect(url).toContain("logo");
  });

  it("returns 400 when folderId missing", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(400);
  });

  it("returns 404 with folder_not_found when Drive returns 404", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" });
    const res = await GET(makeReq("folderId=gone"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("folder_not_found");
  });

  it("forwards pageToken for pagination", async () => {
    fetchMock.mockResolvedValueOnce(mockOk({ files: [], nextPageToken: "next-tok" }));
    await GET(makeReq("folderId=abc&pageToken=prev-tok"));
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("pageToken=prev-tok");
  });
});
