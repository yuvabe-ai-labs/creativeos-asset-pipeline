import { describe, it, expect } from "vitest";
import {
  buildApprovalUpdate,
  canSetApproval,
  requiresNote,
  standingChangeRequest,
  type VersionDecisionSummary,
} from "./approval";

// BUG-001 — annotations must render only for the change request that is still in force.
describe("standingChangeRequest", () => {
  const cr: VersionDecisionSummary = {
    id: "d1",
    status: "changes_requested",
    note: "fix the label",
    reviewerName: "Asha",
    decidedAt: "2026-09-16T10:00:00.000Z",
    annotations: [],
  };
  const approved: VersionDecisionSummary = {
    id: "d2",
    status: "approved",
    note: null,
    reviewerName: "Asha",
    decidedAt: "2026-09-16T11:00:00.000Z",
  };

  it("returns the newest decision while changes are requested", () => {
    expect(standingChangeRequest("changes_requested", [cr])).toBe(cr);
  });

  // The reported bug: request changes -> undo -> approve left the old request's pins live.
  it("returns nothing once the version is approved, even with an older request logged", () => {
    expect(standingChangeRequest("approved", [approved, cr])).toBeNull();
  });

  it("returns nothing after an undo back to pending", () => {
    expect(standingChangeRequest("pending", [cr])).toBeNull();
  });

  it("returns nothing when the newest decision is not a change request", () => {
    expect(standingChangeRequest("changes_requested", [approved, cr])).toBeNull();
  });

  it("returns nothing with no decisions", () => {
    expect(standingChangeRequest("changes_requested", undefined)).toBeNull();
  });
});

const AT = "2026-06-29T10:00:00.000Z";
// `by` is a user id after D167, not a display name — the reviewer is a real reference.
const BY = "user-asha";

describe("buildApprovalUpdate", () => {
  it("approved: stamps status + who + when, clears note", () => {
    expect(buildApprovalUpdate({ status: "approved", by: BY, at: AT, note: "ignored" }))
      .toEqual({ approval_status: "approved", approved_by_user_id: BY, approved_at: AT, approved_seen_at: null, note: null });
  });

  it("changes_requested: stamps who + when + keeps note", () => {
    expect(buildApprovalUpdate({ status: "changes_requested", by: BY, at: AT, note: "fix label" }))
      .toEqual({ approval_status: "changes_requested", approved_by_user_id: BY, approved_at: AT, approved_seen_at: null, note: "fix label" });
  });

  it("changes_requested with no note stores null", () => {
    expect(buildApprovalUpdate({ status: "changes_requested", by: BY, at: AT }))
      .toEqual({ approval_status: "changes_requested", approved_by_user_id: BY, approved_at: AT, approved_seen_at: null, note: null });
  });

  it("pending: resets everything (who/when/note cleared)", () => {
    expect(buildApprovalUpdate({ status: "pending", by: BY, at: AT, note: "x" }))
      .toEqual({ approval_status: "pending", approved_by_user_id: null, approved_at: null, approved_seen_at: null, note: null });
  });
});

describe("canSetApproval", () => {
  it("permits owner and senior", () => {
    expect(canSetApproval("owner")).toBe(true);
    expect(canSetApproval("senior")).toBe(true);
  });

  it("refuses designer — R2.1, the whole point of the check", () => {
    expect(canSetApproval("designer")).toBe(false);
  });
});

describe("requiresNote", () => {
  it("requires a note for a rejection — R6.5", () => {
    expect(requiresNote("changes_requested")).toBe(true);
  });

  it("does not require one for approval or reset", () => {
    expect(requiresNote("approved")).toBe(false);
    expect(requiresNote("pending")).toBe(false);
  });
});
