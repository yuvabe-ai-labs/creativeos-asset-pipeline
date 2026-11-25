import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

const updates: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({ update: (u: Record<string, unknown>) => { updates.push(u); return { eq: async () => ({ error: null }) }; } }),
  }),
}));
import { succeedGeneration } from "../generations";

beforeEach(() => { updates.length = 0; });

describe("succeedGeneration provider_bill", () => {
  it("writes the provider bill when given", async () => {
    const bill = { source: "provider_usage" as const, meters: { provider_unit: 6.4 }, raw: { billing: [] } };
    await succeedGeneration({ generationId: "g", providerBill: bill });
    expect(updates[0].provider_bill).toEqual(bill);
  });
  it("leaves the column untouched when omitted", async () => {
    await succeedGeneration({ generationId: "g" });
    expect("provider_bill" in updates[0]).toBe(false);
  });
  it("writes null when told so", async () => {
    await succeedGeneration({ generationId: "g", providerBill: null });
    expect(updates[0].provider_bill).toBeNull();
  });
});
