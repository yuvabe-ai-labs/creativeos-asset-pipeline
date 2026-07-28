import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/moodboards", () => ({
  listItems: vi.fn(),
  addItem: vi.fn(),
}));

import { listItems, addItem } from "@/lib/db/moodboards";

const params = Promise.resolve({ id: "board-1" });

describe("/api/moodboards/[id]/items", () => {
  beforeEach(() => vi.resetAllMocks());

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
});
