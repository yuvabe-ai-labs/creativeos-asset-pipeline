import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rows = [
  { version_id: "v1", credits_charged: 30 },
  { version_id: "v1", credits_charged: 45 },
  { version_id: "v1", credits_charged: 45 },
  { version_id: "v2", credits_charged: 10 },
];
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: () => ({ select: () => ({ in: () => ({ not: async () => ({ data: rows, error: null }) }) }) }) }),
}));
import { getCreditsChargedByVersionIds } from "../generations";

describe("getCreditsChargedByVersionIds", () => {
  it("sums every generation charged to a version (a dub plus its lip syncs)", async () => {
    const m = await getCreditsChargedByVersionIds(["v1", "v2"]);
    expect(m.get("v1")).toBe(120);
    expect(m.get("v2")).toBe(10);
  });
});
