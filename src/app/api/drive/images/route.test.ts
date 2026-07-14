import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/drive/client", () => ({
  exchangeRefreshToken: vi.fn(async () => "fake-token"),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

describe("GET /api/drive/images", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returns paginated recency-sorted image list", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          nextPageToken: "cursor-2",
          files: [
            {
              id: "img-1",
              name: "photo.jpg",
              mimeType: "image/jpeg",
              modifiedTime: "2026-07-14T00:00:00Z",
              ownedByMe: true,
              shared: false,
              parents: ["folder-a"],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "folder-a", name: "Photos" }),
      });

    const res = await GET(makeReq("http://x/api/drive/images"));
    const body = await res.json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: "img-1",
      name: "photo.jpg",
      thumbnailUrl: "/api/drive/thumbnail/img-1",
      previewUrl: "/api/drive/file/img-1",
      isShared: false,
      parentFolder: { id: "folder-a", name: "Photos" },
    });
    expect(body.nextPageToken).toBe("cursor-2");

    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain("mimeType+contains+%27image%2F%27");
    expect(firstCallUrl).toContain("orderBy=modifiedTime+desc");
    expect(firstCallUrl).toContain("pageSize=50");
    expect(firstCallUrl).toContain("includeItemsFromAllDrives=true");
  });

  it("forwards pageToken query param", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
    });

    await GET(makeReq("http://x/api/drive/images?pageToken=abc123"));

    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain("pageToken=abc123");
  });

  it("dedupes parent-folder lookups within a page", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [
            { id: "img-1", name: "a.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-14T00:00:00Z", ownedByMe: true, parents: ["fA"] },
            { id: "img-2", name: "b.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-13T00:00:00Z", ownedByMe: true, parents: ["fA"] },
            { id: "img-3", name: "c.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-12T00:00:00Z", ownedByMe: true, parents: ["fB"] },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "fA", name: "Folder A" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "fB", name: "Folder B" }),
      });

    await GET(makeReq("http://x/api/drive/images"));

    // 1 files.list + 2 unique folder gets = 3 fetches total
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns apiError on 5xx from Drive", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    });

    const res = await GET(makeReq("http://x/api/drive/images"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Drive API error");
  });

  it("marks isShared true when ownedByMe is false", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [
            { id: "s1", name: "shared.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-14T00:00:00Z", ownedByMe: false, parents: ["fA"] },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "fA", name: "F" }),
      });

    const res = await GET(makeReq("http://x/api/drive/images"));
    const body = await res.json();
    expect(body.items[0].isShared).toBe(true);
  });
});
