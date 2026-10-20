import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ from: mocks.from }) }));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", { type: "editor", position: { x: 0, y: 0 }, canvas_id: "cv" }, { userId: "u1" }, "client-1", "org-1") };
});

import { POST } from "../route";

describe("POST /api/nodes/[id]/duplicate", () => {
  it("refuses to duplicate an Editor (one per canvas, D387)", async () => {
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "An Editor can't be duplicated: each canvas has one." });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
