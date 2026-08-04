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
}));

import { listItems, addItem } from "@/lib/db/moodboards";

const params = Promise.resolve({ id: "board-1" });

describe("/api/moodboards/[id]/items", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    boardOrgId = "org-1";
  });

  it("GET lists items", async () => {
    vi.mocked(listItems).mockResolvedValue([
      { id: "i1", moodboard_id: "board-1", image_url: "https://x/y.jpg", source_url: null, position: 0, added_at: "t" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/moodboards/board-1/items"), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
    expect(vi.mocked(listItems)).toHaveBeenCalledWith("board-1");
  });

  it("POST adds an item and returns 201", async () => {
    vi.mocked(addItem).mockResolvedValue({
      id: "i2", moodboard_id: "board-1", image_url: "https://x/z.jpg", source_url: "https://pin", position: 0, added_at: "t",
    });
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/moodboards/board-1/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: "https://x/z.jpg", sourceUrl: "https://pin" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    expect((await res.json()).item.image_url).toBe("https://x/z.jpg");
    expect(vi.mocked(addItem)).toHaveBeenCalledWith("board-1", { imageUrl: "https://x/z.jpg", sourceUrl: "https://pin" });
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
  });
});
