import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// The picker index is session-scoped now — it resolves the caller's org and lists only
// that org's clients. Mock the DAL directly so the test needs no env vars or session.
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

vi.mock("@/lib/db/moodboards", () => ({
  listClientsWithMoodboards: vi.fn(),
}));

import { listClientsWithMoodboards } from "@/lib/db/moodboards";

describe("GET /api/moodboards", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns clients with their boards", async () => {
    vi.mocked(listClientsWithMoodboards).mockResolvedValue([
      { slug: "acme", name: "Acme", boards: [{ id: "b1", name: "Face cream" }] },
      { slug: "beta", name: "Beta", boards: [] },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(2);
    expect(body.clients[0].boards[0].name).toBe("Face cream");
  });

  it("scopes the listing to the caller's org", async () => {
    vi.mocked(listClientsWithMoodboards).mockResolvedValue([]);
    const { GET } = await import("./route");
    await GET();
    expect(vi.mocked(listClientsWithMoodboards)).toHaveBeenCalledWith("org-1");
  });
});
