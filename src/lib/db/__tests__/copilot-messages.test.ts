import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const insert = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ from: () => ({ insert }) }) }));

import { insertCopilotMessages } from "../copilot-messages";

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
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
