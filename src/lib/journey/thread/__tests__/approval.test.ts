import { describe, expect, it } from "vitest";
import { approvalMessage } from "../approval";

describe("approvalMessage", () => {
  it("says who approved what, and what that opens", () => {
    expect(approvalMessage({ what: "the brand KB", by: "Asha", byId: null, opens: "Market research is now open." })).toEqual({
      role: "assistant", content: "Asha approved the brand KB. Market research is now open.", suggestions: [],
      card: { kind: "approval", what: "the brand KB", by: "Asha", byId: null },
    });
  });

  it("says only who approved when nothing opens", () => {
    expect(approvalMessage({ what: "the change", by: "Asha", byId: null }).content).toBe("Asha approved the change.");
  });
});
