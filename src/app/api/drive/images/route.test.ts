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

function mockOk(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("GET /api/drive/images", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("makes two parallel queries (owned + shared) and merges results, deduped by id, sorted by modifiedTime desc", async () => {
    // Owned query
    fetchMock.mockResolvedValueOnce(
      mockOk({
        nextPageToken: "owned-2",
        files: [
          {
            id: "owned-1",
            name: "mine-old.jpg",
            mimeType: "image/jpeg",
            modifiedTime: "2026-07-10T00:00:00Z",
            ownedByMe: true,
            shared: false,
            parents: ["fA"],
          },
          {
            id: "dup-x",
            name: "dup.jpg",
            mimeType: "image/jpeg",
            modifiedTime: "2026-07-12T00:00:00Z",
            ownedByMe: true,
            parents: ["fB"],
          },
        ],
      }),
    );
    // Shared query
    fetchMock.mockResolvedValueOnce(
      mockOk({
        nextPageToken: null,
        files: [
          {
            id: "shared-1",
            name: "colleague.jpg",
            mimeType: "image/jpeg",
            modifiedTime: "2026-07-14T00:00:00Z",
            ownedByMe: false,
            shared: true,
            parents: ["fC"],
          },
          {
            id: "dup-x",
            name: "dup.jpg",
            mimeType: "image/jpeg",
            modifiedTime: "2026-07-12T00:00:00Z",
            ownedByMe: false,
            shared: true,
            parents: ["fB"],
          },
        ],
      }),
    );
    // Folder lookups (3 unique folders)
    fetchMock.mockResolvedValueOnce(mockOk({ id: "fA", name: "Folder A" }));
    fetchMock.mockResolvedValueOnce(mockOk({ id: "fB", name: "Folder B" }));
    fetchMock.mockResolvedValueOnce(mockOk({ id: "fC", name: "Folder C" }));

    const res = await GET(makeReq("http://x/api/drive/images"));
    const body = await res.json();

    // 3 unique items after dedupe (owned-1, dup-x, shared-1)
    expect(body.items).toHaveLength(3);
    // Sorted by modifiedTime desc: shared-1 (2026-07-14) > dup-x (2026-07-12) > owned-1 (2026-07-10)
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([
      "shared-1",
      "dup-x",
      "owned-1",
    ]);
    // The owned copy of the duplicate wins (first inserted)
    expect(body.items[1].isShared).toBe(false);

    // Two files.list queries + 3 folder lookups = 5 fetches total
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // First query should be the owned one
    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain("%27me%27+in+owners");
    // Second query should be sharedWithMe=true
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain("sharedWithMe%3Dtrue");
  });

  it("encodes nextPageToken as base64 of both cursors when either corpus has more", async () => {
    fetchMock.mockResolvedValueOnce(
      mockOk({ nextPageToken: "owned-cursor", files: [] }),
    );
    fetchMock.mockResolvedValueOnce(
      mockOk({ nextPageToken: "shared-cursor", files: [] }),
    );

    const res = await GET(makeReq("http://x/api/drive/images"));
    const body = await res.json();

    expect(body.nextPageToken).toBeTruthy();
    const decoded = JSON.parse(
      Buffer.from(body.nextPageToken, "base64").toString("utf-8"),
    );
    expect(decoded).toEqual({
      ownedToken: "owned-cursor",
      sharedToken: "shared-cursor",
    });
  });

  it("returns null nextPageToken when both corpora are exhausted", async () => {
    fetchMock.mockResolvedValueOnce(
      mockOk({ files: [] }),
    );
    fetchMock.mockResolvedValueOnce(
      mockOk({ files: [] }),
    );

    const res = await GET(makeReq("http://x/api/drive/images"));
    const body = await res.json();
    expect(body.nextPageToken).toBeNull();
  });

  it("only re-queries a corpus if its cursor is still present", async () => {
    // Follow-up page where only the shared corpus has more.
    const cursor = Buffer.from(
      JSON.stringify({ sharedToken: "shared-next" }),
    ).toString("base64");

    // Only one files.list call expected (shared).
    fetchMock.mockResolvedValueOnce(
      mockOk({ files: [], nextPageToken: null }),
    );

    await GET(
      makeReq(`http://x/api/drive/images?pageToken=${encodeURIComponent(cursor)}`),
    );

    // 1 shared query only (no owned query, no folder lookups since files is empty)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("sharedWithMe%3Dtrue");
    expect(url).toContain("pageToken=shared-next");
  });

  it("marks isShared true when ownedByMe is false", async () => {
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    fetchMock.mockResolvedValueOnce(
      mockOk({
        files: [
          {
            id: "s1",
            name: "shared.jpg",
            mimeType: "image/jpeg",
            modifiedTime: "2026-07-14T00:00:00Z",
            ownedByMe: false,
            parents: ["fA"],
          },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(mockOk({ id: "fA", name: "F" }));

    const res = await GET(makeReq("http://x/api/drive/images"));
    const body = await res.json();
    expect(body.items[0].isShared).toBe(true);
  });

  it("returns apiError on 5xx from Drive", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    });
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));

    const res = await GET(makeReq("http://x/api/drive/images"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Drive API error");
  });
});
