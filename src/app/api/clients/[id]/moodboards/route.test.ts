import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// withClient() now enforces org isolation: it resolves the caller's org via
// resolveCallerContext and 404s when client.org_id doesn't match. Mock the DAL
// directly rather than its internal Supabase calls, so the test needs no real env
// vars or session — same approach as the drive route test.
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
}));

vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", name: "Acme", org_id: "org-1" })),
}));
vi.mock("@/lib/db/moodboards", () => ({
  listMoodboards: vi.fn(),
  createMoodboard: vi.fn(),
}));

import { listMoodboards, createMoodboard } from "@/lib/db/moodboards";
import { getClientById } from "@/lib/db/clients";

const params = Promise.resolve({ id: "client-1" });

describe("/api/clients/[id]/moodboards", () => {
  beforeEach(() => vi.resetAllMocks());

  it("GET lists the client's boards", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", name: "Acme", org_id: "org-1" } as never);
    vi.mocked(listMoodboards).mockResolvedValue([
      { id: "b1", client_id: "client-1", name: "Face cream", created_at: "t" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/clients/client-1/moodboards"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.moodboards).toHaveLength(1);
    expect(vi.mocked(listMoodboards)).toHaveBeenCalledWith("client-1");
  });

  it("POST creates a board and returns 201", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", name: "Acme", org_id: "org-1" } as never);
    vi.mocked(createMoodboard).mockResolvedValue({ id: "b2", client_id: "client-1", name: "Hair oil", created_at: "t" });
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/clients/client-1/moodboards", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Hair oil" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.moodboard.name).toBe("Hair oil");
    expect(vi.mocked(createMoodboard)).toHaveBeenCalledWith("client-1", "Hair oil");
  });

  it("POST returns 400 when name is missing", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", name: "Acme", org_id: "org-1" } as never);
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/clients/client-1/moodboards", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });
});
