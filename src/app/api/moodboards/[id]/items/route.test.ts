import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// withMoodboard() gates these routes: it resolves the caller's org via
// resolveCallerContext and the board's org via an embedded moodboards->clients query on
// createServerSupabase(). Mock both directly rather than the DAL's internal Supabase
// calls, so the test needs no real env vars or session.
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn(async () => undefined) }));

// Board org, per test. Default: same org as the caller.
let boardOrgId: string | null = "org-1";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: boardOrgId === null ? null : { id: "board-1", clients: { org_id: boardOrgId } },
            error: null,
          }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/db/moodboards", () => ({
  listItems: vi.fn(),
  addItem: vi.fn(),
  getMoodboardClientId: vi.fn(),
}));
vi.mock("@/lib/market/ingest", () => ({ ingestReference: vi.fn() }));

import { listItems, addItem, getMoodboardClientId } from "@/lib/db/moodboards";
import { ingestReference } from "@/lib/market/ingest";

const params = Promise.resolve({ id: "board-1" });

describe("/api/moodboards/[id]/items", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    boardOrgId = "org-1";
  });

  it("GET lists items", async () => {
    vi.mocked(listItems).mockResolvedValue([
      { id: "i1", moodboard_id: "board-1", image_url: "https://x/y.jpg", source_url: null, kind: "image", note: null, added_by: null, thumbnail_url: null, position: 0, added_at: "t" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/moodboards/board-1/items"), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
    expect(vi.mocked(listItems)).toHaveBeenCalledWith("board-1");
  });

  it("POST routes an imageUrl clip through ingest (backward-compatible extension payload)", async () => {
    vi.mocked(getMoodboardClientId).mockResolvedValue("client-1");
    vi.mocked(ingestReference).mockResolvedValue({
      id: "i2", moodboard_id: "board-1", image_url: "https://x/z.jpg", source_url: "https://pin", kind: "image", note: null, added_by: null, thumbnail_url: null, position: 0, added_at: "t",
    });
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/moodboards/board-1/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: "https://x/z.jpg", sourceUrl: "https://pin" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    expect((await res.json()).item.image_url).toBe("https://x/z.jpg");
    expect(vi.mocked(ingestReference)).toHaveBeenCalledWith(expect.objectContaining({
      boardId: "board-1", clientId: "client-1", url: "https://x/z.jpg", sourceUrl: "https://pin", addedBy: "user-1",
    }));
  });

  it("POST routes a pageUrl clip (page-level context menu) through ingest with note", async () => {
    vi.mocked(getMoodboardClientId).mockResolvedValue("client-1");
    vi.mocked(ingestReference).mockResolvedValue({
      id: "i3", moodboard_id: "board-1", image_url: "https://www.instagram.com/reel/C8x/", source_url: "https://www.instagram.com/reel/C8x/", kind: "instagram", note: "opening hook", added_by: "user-1", thumbnail_url: null, position: 0, added_at: "t",
    });
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/moodboards/board-1/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageUrl: "https://www.instagram.com/reel/C8x/", note: "opening hook" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    expect(vi.mocked(ingestReference)).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.instagram.com/reel/C8x/", sourceUrl: "https://www.instagram.com/reel/C8x/", note: "opening hook",
    }));
  });

  it("POST returns 400 when imageUrl is missing", async () => {
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/moodboards/board-1/items", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("GET 404s for a board in another org, without reading its items", async () => {
    boardOrgId = "org-2";
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/moodboards/board-1/items"), { params });
    expect(res.status).toBe(404);
    expect(vi.mocked(listItems)).not.toHaveBeenCalled();
  });

  it("POST 404s for a board in another org, without writing", async () => {
    boardOrgId = "org-2";
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/moodboards/board-1/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: "https://x/z.jpg" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    expect(vi.mocked(addItem)).not.toHaveBeenCalled();
    expect(vi.mocked(ingestReference)).not.toHaveBeenCalled();
  });
});
