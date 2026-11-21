import { describe, it, expect } from "vitest";
import { refusalCopy, refusalToast } from "../refusal-copy";
import { CREDIT_REFUSALS } from "../grants";

describe("refused run messages", () => {
  it("has words for every reason, for owners and members", () => {
    for (const r of CREDIT_REFUSALS) {
      expect(refusalCopy(r, true).title, r).toBeTruthy();
      expect(refusalCopy(r, false).title, r).toBeTruthy();
    }
  });

  it("tells members to ask the owner and never mentions plans, payments or billing links", () => {
    for (const r of CREDIT_REFUSALS) {
      const c = refusalCopy(r, false);
      expect(c.text, r).toContain("Ask your agency owner.");
      expect(c.action, r).toBeNull();
      expect(`${c.title} ${c.text}`, r).not.toMatch(/top up|pick a plan|billing/i);
    }
  });

  it("gives owners the step that fixes it", () => {
    expect(refusalCopy("no_credits", true).action).toEqual({ label: "See plans", href: "/billing/plans" });
    expect(refusalCopy("used_up", true).action).toEqual({ label: "Top up", href: "/billing" });
    expect(refusalCopy("payment_due", true).action).toEqual({ label: "Open billing", href: "/billing" });
  });

  it("makes one toast line", () => {
    expect(refusalToast("free_ended", true)).toBe("Your free credits have ended. Pick a plan to keep generating. Everything you made is still here.");
  });
});
