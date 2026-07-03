import { describe, it, expect } from "vitest";
import { buildApprovalUpdate } from "./approval";

const AT = "2026-06-29T10:00:00.000Z";

describe("buildApprovalUpdate", () => {
  it("approved: stamps status + who + when, clears note", () => {
    expect(buildApprovalUpdate({ status: "approved", by: "Asha", at: AT, note: "ignored" }))
      .toEqual({ approval_status: "approved", approved_by: "Asha", approved_at: AT, note: null });
  });

  it("changes_requested: stamps who + when + keeps note", () => {
    expect(buildApprovalUpdate({ status: "changes_requested", by: "Asha", at: AT, note: "fix label" }))
      .toEqual({ approval_status: "changes_requested", approved_by: "Asha", approved_at: AT, note: "fix label" });
  });

  it("changes_requested with no note stores null", () => {
    expect(buildApprovalUpdate({ status: "changes_requested", by: "Asha", at: AT }))
      .toEqual({ approval_status: "changes_requested", approved_by: "Asha", approved_at: AT, note: null });
  });

  it("pending: resets everything (who/when/note cleared)", () => {
    expect(buildApprovalUpdate({ status: "pending", by: "Asha", at: AT, note: "x" }))
      .toEqual({ approval_status: "pending", approved_by: null, approved_at: null, note: null });
  });
});
