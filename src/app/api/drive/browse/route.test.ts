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

  // A Drive query (decoded) from the nth fetch call.
  const queryOf = (n: number) => new URL(fetchMock.mock.calls[n][0] as string).searchParams.get("q") ?? "";

  it("applies q search by name, within the folder", async () => {
    fetchMock
      .mockResolvedValueOnce(mockOk({ files: [] })) // no subfolders
      .mockResolvedValueOnce(mockOk({ files: [] }));
    await GET(makeReq("folderId=abc&q=logo"));
    // main switched search from fullText to name matching (059ccf3)
    expect(queryOf(1)).toContain("name contains 'logo'");
    expect(queryOf(1)).toContain("'abc' in parents");
  });

  it("searches every subfolder, not only the folder's own files", async () => {
    const folder = (id: string) => ({ id, name: id, mimeType: "application/vnd.google-apps.folder", modifiedTime: "2026-07-01T00:00:00Z" });
    fetchMock
      .mockResolvedValueOnce(mockOk({ files: [folder("sub1"), folder("sub2")] })) // level 1
      .mockResolvedValueOnce(mockOk({ files: [folder("deep")] })) // level 2
      .mockResolvedValueOnce(mockOk({ files: [] })) // level 3: none
      .mockResolvedValueOnce(
        mockOk({ files: [{ id: "img9", name: "logo-gold.png", mimeType: "image/png", modifiedTime: "2026-07-02T00:00:00Z" }] }),
      );
    const res = await GET(makeReq("folderId=root&q=logo"));
    const body = await res.json();

    expect(queryOf(0)).toContain("mimeType='application/vnd.google-apps.folder'");
    expect(queryOf(1)).toContain("'sub1' in parents or 'sub2' in parents");
    expect(queryOf(2)).toContain("'deep' in parents");
    const search = queryOf(3);
    for (const id of ["root", "sub1", "sub2", "deep"]) expect(search).toContain(`'${id}' in parents`);
    expect(search).toContain("name contains 'logo'");
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["img9"]);
  });

  it("does not walk subfolders when browsing without a search", async () => {
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    await GET(makeReq("folderId=abc"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(queryOf(0)).not.toContain("mimeType=");
  });

  it("reports a search on a folder Drive no longer has as folder_not_found", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" });
    const res = await GET(makeReq("folderId=gone&q=logo"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("folder_not_found");
  });

  it("reports another Drive failure during a search as a 502", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "rate limited" });
    const res = await GET(makeReq("folderId=abc&q=logo"));
    expect(res.status).toBe(502);
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
