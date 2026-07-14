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

/** Empty sharedTree walker: matches root call → returns 0 folders/files. */
function mockEmptySharedTree() {
  fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
}

describe("GET /api/drive/images (default corpus)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("makes three parallel queries (owned + shared + sharedTree-root) on first page and merges deduped", async () => {
    // Owned
    fetchMock.mockResolvedValueOnce(
      mockOk({
        nextPageToken: "owned-2",
        files: [
          { id: "owned-1", name: "mine-old.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-10T00:00:00Z", ownedByMe: true, parents: ["fA"] },
          { id: "dup-x", name: "dup.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-12T00:00:00Z", ownedByMe: true, parents: ["fB"] },
        ],
      }),
    );
    // Directly shared
    fetchMock.mockResolvedValueOnce(
      mockOk({
        nextPageToken: null,
        files: [
          { id: "shared-1", name: "colleague.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-14T00:00:00Z", ownedByMe: false, shared: true, parents: ["fC"] },
          { id: "dup-x", name: "dup.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-12T00:00:00Z", ownedByMe: false, shared: true, parents: ["fB"] },
        ],
      }),
    );
    // sharedTree root — 1 shared folder + 0 direct images.
    fetchMock.mockResolvedValueOnce(
      mockOk({
        files: [
          { id: "shared-folder", name: "SF", mimeType: "application/vnd.google-apps.folder", modifiedTime: "2026-07-13T00:00:00Z" },
        ],
      }),
    );
    // sharedTree depth 1 — 1 nested image
    fetchMock.mockResolvedValueOnce(
      mockOk({
        files: [
          { id: "nested-in-shared", name: "nested.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-13T00:00:00Z", ownedByMe: false, shared: true, parents: ["shared-folder"] },
        ],
      }),
    );

    // Folder metadata lookups (4 unique parents: fA, fB, fC, shared-folder)
    fetchMock.mockResolvedValueOnce(mockOk({ id: "fA", name: "Folder A" }));
    fetchMock.mockResolvedValueOnce(mockOk({ id: "fB", name: "Folder B" }));
    fetchMock.mockResolvedValueOnce(mockOk({ id: "fC", name: "Folder C" }));
    fetchMock.mockResolvedValueOnce(mockOk({ id: "shared-folder", name: "SF" }));

    const res = await GET(makeReq("http://x/api/drive/images"));
    const body = await res.json();

    // 4 unique items: shared-1, dup-x (owned wins), owned-1, nested-in-shared.
    expect(body.items).toHaveLength(4);
    expect(new Set(body.items.map((i: { id: string }) => i.id))).toEqual(
      new Set(["owned-1", "dup-x", "shared-1", "nested-in-shared"]),
    );

    // First 3 fetches are the parallel query bundle.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain("%27me%27+in+owners");
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain("sharedWithMe%3Dtrue");
  });

  it("encodes nextPageToken as base64 of both cursors when either corpus has more", async () => {
    fetchMock.mockResolvedValueOnce(mockOk({ nextPageToken: "owned-cursor", files: [] }));
    fetchMock.mockResolvedValueOnce(mockOk({ nextPageToken: "shared-cursor", files: [] }));
    mockEmptySharedTree();

    const res = await GET(makeReq("http://x/api/drive/images"));
    const body = await res.json();

    expect(body.nextPageToken).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(body.nextPageToken, "base64").toString("utf-8"));
    expect(decoded).toEqual({ ownedToken: "owned-cursor", sharedToken: "shared-cursor" });
  });

  it("returns null nextPageToken when both paginated corpora are exhausted", async () => {
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    mockEmptySharedTree();

    const res = await GET(makeReq("http://x/api/drive/images"));
    const body = await res.json();
    expect(body.nextPageToken).toBeNull();
  });

  it("only re-queries paginated corpora on follow-up pages (no sharedTree walk)", async () => {
    const cursor = Buffer.from(JSON.stringify({ sharedToken: "shared-next" })).toString("base64");
    fetchMock.mockResolvedValueOnce(mockOk({ files: [], nextPageToken: null }));

    await GET(makeReq(`http://x/api/drive/images?pageToken=${encodeURIComponent(cursor)}`));

    // Only 1 fetch: shared query. No owned query, no sharedTree walker.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("sharedWithMe%3Dtrue");
    expect(url).toContain("pageToken=shared-next");
  });
});

describe("GET /api/drive/images (search)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("passes q as fullText contains in owned + shared + sharedTree queries", async () => {
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    mockEmptySharedTree();

    await GET(makeReq("http://x/api/drive/images?q=logo"));

    const ownedUrl = fetchMock.mock.calls[0][0] as string;
    const sharedUrl = fetchMock.mock.calls[1][0] as string;
    const treeUrl = fetchMock.mock.calls[2][0] as string;
    expect(ownedUrl).toContain("fullText+contains+%27logo%27");
    expect(sharedUrl).toContain("fullText+contains+%27logo%27");
    expect(treeUrl).toContain("fullText+contains+%27logo%27");
  });

  it("escapes single quotes in search term to prevent q-string injection", async () => {
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    mockEmptySharedTree();

    await GET(makeReq("http://x/api/drive/images?q=" + encodeURIComponent("a'b")));

    const url = fetchMock.mock.calls[0][0] as string;
    // Escaped single quote — encoded as %5C%27 in URL
    expect(url).toContain("%5C%27");
  });
});

describe("GET /api/drive/images (sharedOnly)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("walks the sharedWithMe subtree and returns images from nested shared folders", async () => {
    // Roots
    fetchMock.mockResolvedValueOnce(
      mockOk({
        files: [
          { id: "top-img", name: "top.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-14T00:00:00Z", ownedByMe: false, shared: true, parents: ["shared-root"] },
          { id: "shared-folder", name: "Shared Folder", mimeType: "application/vnd.google-apps.folder", modifiedTime: "2026-07-13T00:00:00Z" },
        ],
      }),
    );
    // Depth 1
    fetchMock.mockResolvedValueOnce(
      mockOk({
        files: [
          { id: "nested-img", name: "nested.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-12T00:00:00Z", ownedByMe: false, shared: true, parents: ["shared-folder"] },
          { id: "deeper-folder", name: "Deeper", mimeType: "application/vnd.google-apps.folder", modifiedTime: "2026-07-11T00:00:00Z" },
        ],
      }),
    );
    // Depth 2
    fetchMock.mockResolvedValueOnce(
      mockOk({
        files: [
          { id: "deep-img", name: "deep.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-10T00:00:00Z", ownedByMe: false, shared: true, parents: ["deeper-folder"] },
        ],
      }),
    );
    // Folder lookups
    fetchMock.mockResolvedValueOnce(mockOk({ id: "shared-root", name: "Root" }));
    fetchMock.mockResolvedValueOnce(mockOk({ id: "shared-folder", name: "Shared Folder" }));
    fetchMock.mockResolvedValueOnce(mockOk({ id: "deeper-folder", name: "Deeper" }));

    const res = await GET(makeReq("http://x/api/drive/images?sharedOnly=1"));
    const body = await res.json();

    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["top-img", "nested-img", "deep-img"]);
    for (const i of body.items) expect(i.isShared).toBe(true);
    expect(body.nextPageToken).toBeNull();

    const rootUrl = fetchMock.mock.calls[0][0] as string;
    expect(rootUrl).toContain("sharedWithMe%3Dtrue");
  });
});

describe("GET /api/drive/images (folderIds)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("queries each folder in parallel and merges deduped", async () => {
    fetchMock.mockResolvedValueOnce(
      mockOk({
        files: [
          { id: "a", name: "a.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-14T00:00:00Z", parents: ["fA"] },
          { id: "shared-x", name: "shared.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-13T00:00:00Z", parents: ["fA"] },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockOk({
        files: [
          { id: "b", name: "b.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-12T00:00:00Z", parents: ["fB"] },
          { id: "shared-x", name: "shared.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-13T00:00:00Z", parents: ["fA"] },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(mockOk({ id: "fA", name: "A" }));
    fetchMock.mockResolvedValueOnce(mockOk({ id: "fB", name: "B" }));

    const res = await GET(makeReq("http://x/api/drive/images?folderIds=fA,fB"));
    const body = await res.json();

    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["a", "shared-x", "b"]);

    const fAUrl = fetchMock.mock.calls[0][0] as string;
    const fBUrl = fetchMock.mock.calls[1][0] as string;
    expect(fAUrl).toContain("%27fA%27+in+parents");
    expect(fBUrl).toContain("%27fB%27+in+parents");
  });
});

describe("GET /api/drive/images (errors)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returns apiError on 5xx from Drive", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    });
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    mockEmptySharedTree();

    const res = await GET(makeReq("http://x/api/drive/images"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Drive API error");
  });
});
