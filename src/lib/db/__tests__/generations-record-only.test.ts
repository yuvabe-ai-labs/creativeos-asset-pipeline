import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

const inserts: Record<string, unknown>[] = [];
let insertError: { message: string } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row);
        return { error: insertError };
      },
    }),
  }),
}));
import { insertRecordOnlyGeneration } from "../generations";

beforeEach(() => {
  inserts.length = 0;
  insertError = null;
});

const bill = { source: "provider_usage" as const, meters: { input_token: 100 } };

describe("insertRecordOnlyGeneration", () => {
  it("inserts a succeeded, no-credit, ownerless row", async () => {
    await insertRecordOnlyGeneration({
      orgId: "o",
      type: "copilot",
      modelUsed: "gemini:gemini-3.1-pro-preview",
      modelPriceId: "p1",
      costUsd: 0.004,
      providerBill: bill,
    });
    expect(inserts).toEqual([
      {
        org_id: "o",
        client_id: null,
        user_id: null,
        meta: null,
        node_id: null,
        avatar_id: null,
        script_id: null,
        type: "copilot",
        model_used: "gemini:gemini-3.1-pro-preview",
        model_price_id: "p1",
        status: "succeeded",
        record_only: true,
        cost_usd: 0.004,
        credits_charged: 0,
        provider_bill: bill,
        tokens_used: null,
        updated_at: expect.any(String),
      },
    ]);
  });

  it("rejects when Supabase returns an error", async () => {
    insertError = { message: "boom" };
    await expect(
      insertRecordOnlyGeneration({
        orgId: "o",
        type: "kb",
        modelUsed: "m",
        modelPriceId: null,
        costUsd: null,
        providerBill: bill,
      }),
    ).rejects.toThrow(/boom/);
  });
});
