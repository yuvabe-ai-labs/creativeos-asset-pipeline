import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const insert = vi.fn();
// The update chain records its filters and resolves to `updated` at maybeSingle().
const filters: [string, unknown][] = [];
let updated: { data: unknown; error: unknown } = { data: null, error: null };
const update = vi.fn(() => {
  const c = {
    eq: (col: string, value: unknown) => { filters.push([col, value]); return c; },
    select: () => c,
    maybeSingle: async () => updated,
  };
  return c;
});
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ from: () => ({ insert, update }) }) }));

import { claimCopilotCard, insertCopilotMessages } from "../copilot-messages";
import type { BrandsCard } from "@/lib/journey/thread/schema";

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
  update.mockClear();
  filters.length = 0;
  updated = { data: null, error: null };
});

describe("insertCopilotMessages", () => {
  it("stores a person's message under them and the copilot's under nobody", async () => {
    await insertCopilotMessages("c1", "onboarding", "u1", [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }]);
    expect(insert.mock.calls[0][0].map((r: { created_by: string | null }) => r.created_by)).toEqual(["u1", null]);
  });

  it("stores an assistant message under the person it is about when told to", async () => {
    await insertCopilotMessages("c1", "onboarding", null, [{ role: "assistant", content: "Asha approved the brand KB.", createdBy: "u1" }]);
    expect(insert.mock.calls[0][0][0].created_by).toBe("u1");
  });
});

describe("claimCopilotCard", () => {
  const next: BrandsCard = { kind: "brands", status: "fetching", focus: null, jobId: null, brands: [] };

  it("writes the next card only while the stored one is still in the expected status", async () => {
    updated = { data: { card: next }, error: null };
    expect(await claimCopilotCard("c1", "m1", "brands", "pending", next)).toEqual(next);
    expect(update).toHaveBeenCalledWith({ card: next });
    expect(filters).toEqual(expect.arrayContaining([
      ["id", "m1"], ["client_id", "c1"], ["card->>kind", "brands"], ["card->>status", "pending"],
    ]));
  });

  it("returns null to the second caller of a double click: the card moved", async () => {
    updated = { data: null, error: null };
    expect(await claimCopilotCard("c1", "m1", "brands", "pending", next)).toBeNull();
  });

  it("throws when the write fails", async () => {
    updated = { data: null, error: new Error("down") };
    await expect(claimCopilotCard("c1", "m1", "brands", "pending", next)).rejects.toThrow("down");
  });
});
