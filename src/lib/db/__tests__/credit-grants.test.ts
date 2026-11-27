import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ rpc: m.rpc }) }));

import { listOpenGrants } from "../credit-grants";

describe("listOpenGrants", () => {
  it("reads credit_balance and turns numeric strings into numbers", async () => {
    m.rpc.mockResolvedValue({
      data: [{ grant_id: "g1", kind: "free", credits: "50000", used: "1200.5", left_credits: "48799.5", ends_at: "2026-12-03T00:00:00Z" }],
      error: null,
    });
    await expect(listOpenGrants("org")).resolves.toEqual([
      { id: "g1", kind: "free", credits: 50000, used: 1200.5, left: 48799.5, endsAt: "2026-12-03T00:00:00Z" },
    ]);
    expect(m.rpc).toHaveBeenCalledWith("credit_balance", { p_org_id: "org" });
  });

  it("throws a database error", async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(listOpenGrants("org")).rejects.toThrow("down");
  });
});
