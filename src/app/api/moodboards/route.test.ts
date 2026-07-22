import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
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
});
