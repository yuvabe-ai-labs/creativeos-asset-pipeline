import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// withMoodboard() gates this route: it resolves the caller's org via
// resolveCallerContext and the board's org via an embedded moodboards->clients query.
// Mock both directly, so the test needs no real env vars or session.
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
vi.mock("@/lib/db/impersonation-audit", () => ({
  logImpersonationEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "board-1", clients: { org_id: "org-1" } },
            error: null,
          }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/db/moodboards", () => ({ getItem: vi.fn(), removeItem: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));

import { getItem, removeItem } from "@/lib/db/moodboards";
import { removeObject } from "@/lib/storage";

const params = Promise.resolve({ id: "board-1", itemId: "item-1" });
const req = () =>
  new NextRequest("http://localhost/api/moodboards/board-1/items/item-1", { method: "DELETE" });

function item(over: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    moodboard_id: "board-1",
    image_url: "https://x/a.mp4",
    source_url: null,
    kind: "video",
    note: null,
    added_by: null,
    thumbnail_url: "https://gcs/t.jpg",
    position: 0,
    added_at: "now",
    media_url: "https://gcs/m.mp4",
    media_bytes: 100,
    media_type: "video/mp4",
    archive_status: "ready",
    archive_error: null,
    archive_attempts: 1,
    archive_started_at: null,
    archived_at: "now",
    ...over,
  };
}

describe("DELETE /api/moodboards/[id]/items/[itemId]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("removes the archived media and the thumbnail along with the row", async () => {
    vi.mocked(getItem).mockResolvedValue(item() as never);
    const { DELETE } = await import("./route");

    const res = await DELETE(req(), { params });

    expect(res.status).toBe(200);
    expect(vi.mocked(removeObject)).toHaveBeenCalledWith("https://gcs/m.mp4");
    expect(vi.mocked(removeObject)).toHaveBeenCalledWith("https://gcs/t.jpg");
    expect(vi.mocked(removeItem)).toHaveBeenCalledWith("item-1");
  });

  it("skips objects the item never had", async () => {
    vi.mocked(getItem).mockResolvedValue(item({ media_url: null, thumbnail_url: null }) as never);
    const { DELETE } = await import("./route");

    await DELETE(req(), { params });

    expect(vi.mocked(removeObject)).not.toHaveBeenCalled();
    expect(vi.mocked(removeItem)).toHaveBeenCalledWith("item-1");
  });

  // An orphaned object is recoverable; a row that refuses to delete is not. Storage
  // must never be able to block someone deleting their own reference.
  it("still deletes the row when object removal fails", async () => {
    vi.mocked(getItem).mockResolvedValue(item() as never);
    vi.mocked(removeObject).mockRejectedValue(new Error("GCS unreachable"));
    const { DELETE } = await import("./route");

    const res = await DELETE(req(), { params });

    expect(res.status).toBe(200);
    expect(vi.mocked(removeItem)).toHaveBeenCalledWith("item-1");
  });

  it("still deletes the row when the item can no longer be read", async () => {
    vi.mocked(getItem).mockResolvedValue(null);
    const { DELETE } = await import("./route");

    const res = await DELETE(req(), { params });

    expect(res.status).toBe(200);
    expect(vi.mocked(removeItem)).toHaveBeenCalledWith("item-1");
  });
});
