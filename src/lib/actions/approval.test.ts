import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCaller = vi.fn();
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();

vi.mock("@/lib/dal", () => ({ resolveCallerContext: () => mockCaller() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom, storage: { from: mockStorageFrom } }),
}));
// withAction is Stage 4's impersonation write-gate; pass it through so these tests
// exercise the approval rules rather than impersonation state.
vi.mock("@/lib/actions/with-action", () => ({
  withAction: (_name: string, fn: () => Promise<unknown>) => fn(),
}));
// D211-D214: annotations ride this action, but their DB writes are exercised as unit
// tests of insertDecision/insertAnnotations themselves (decisions.test.ts,
// annotations.test.ts) — here we only assert THIS action calls them correctly.
const mockInsertDecision = vi.fn(async (input: unknown) => void input);
vi.mock("@/lib/db/decisions", () => ({
  insertDecision: (input: unknown) => mockInsertDecision(input),
}));
const mockInsertAnnotations = vi.fn(async (rows: unknown) => void rows);
vi.mock("@/lib/db/annotations", () => ({
  insertAnnotations: (rows: unknown) => mockInsertAnnotations(rows),
}));

import { setVersionApprovalAction, markVersionApprovalSeenAction } from "./approval";
import type { AnnotationPayload } from "@/lib/review-annotations/payload";

function ann(over: Partial<AnnotationPayload> = {}): AnnotationPayload {
  return {
    seq: 1,
    kind: "image",
    timecodeMs: null,
    overlayBase64: "aGVsbG8=",
    frameBase64: null,
    note: "logo too small",
    ...over,
  };
}

function caller(orgRole: string, userId = "u1", orgId = "org-1") {
  return {
    userId,
    email: `${userId}@example.com`,
    platformRole: "member",
    orgId,
    orgRole,
    mustChangePassword: false,
  };
}

let updateSpy: ReturnType<typeof vi.fn>;

// Stubs the version-row lookup with a given org, and captures whatever update payload
// the action attempts to write. `uploadError` stubs the annotation-storage upload path
// (only reached when a test attaches annotations).
function stubDb(
  versionOrgId: string | null = "org-1",
  options: { uploadError?: { message: string } | null } = {},
) {
  const captured: { update?: Record<string, unknown> } = {};
  updateSpy = vi.fn((payload: Record<string, unknown>) => {
    captured.update = payload;
    return { eq: async () => ({ error: null }) };
  });
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          versionOrgId === null
            ? { data: null, error: null }
            : { data: { id: "v1", org_id: versionOrgId }, error: null },
      }),
    }),
    update: updateSpy,
  }));
  mockStorageFrom.mockImplementation(() => ({
    upload: async () => ({ error: options.uploadError ?? null }),
  }));
  return captured;
}

beforeEach(() => {
  mockFrom.mockReset();
  mockStorageFrom.mockReset();
  mockInsertDecision.mockClear();
  mockInsertAnnotations.mockClear();
  mockCaller.mockReset();
  mockCaller.mockResolvedValue(caller("senior"));
});

describe("setVersionApprovalAction", () => {
  it("rejects a designer — R2.2, even calling the action directly", async () => {
    mockCaller.mockResolvedValue(caller("designer"));
    stubDb("org-1");
    await expect(setVersionApprovalAction("v1", { status: "approved" })).rejects.toThrow(
      /not permitted/i,
    );
  });

  it("does not even read the version for a designer — the role gate is first", async () => {
    mockCaller.mockResolvedValue(caller("designer"));
    stubDb("org-1");
    await expect(
      setVersionApprovalAction("v1", { status: "approved" }),
    ).rejects.toThrow();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects a version belonging to another org", async () => {
    mockCaller.mockResolvedValue(caller("senior"));
    stubDb("org-2");
    await expect(setVersionApprovalAction("v1", { status: "approved" })).rejects.toThrow(
      /not found/i,
    );
  });

  it("rejects a version that does not exist", async () => {
    mockCaller.mockResolvedValue(caller("senior"));
    stubDb(null);
    await expect(setVersionApprovalAction("v1", { status: "approved" })).rejects.toThrow(
      /not found/i,
    );
  });

  it("rejects changes_requested with a blank note — R6.5 on the server", async () => {
    mockCaller.mockResolvedValue(caller("senior"));
    stubDb("org-1");
    await expect(
      setVersionApprovalAction("v1", { status: "changes_requested", note: "   " }),
    ).rejects.toThrow(/note is required/i);
  });

  it("accepts changes_requested with a real note", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubDb("org-1");
    await setVersionApprovalAction("v1", {
      status: "changes_requested",
      note: "Skin tone reads orange.",
    });
    expect(captured.update).toMatchObject({
      approval_status: "changes_requested",
      note: "Skin tone reads orange.",
      approved_by_user_id: "senior-1",
    });
  });

  it("writes the CALLER's id as reviewer, never a client-supplied value", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubDb("org-1");
    await setVersionApprovalAction("v1", { status: "approved" });
    expect(captured.update).toMatchObject({
      approval_status: "approved",
      approved_by_user_id: "senior-1",
    });
  });

  it("permits an owner — owner and senior are equivalent for approval", async () => {
    mockCaller.mockResolvedValue(caller("owner", "owner-1"));
    const captured = stubDb("org-1");
    await setVersionApprovalAction("v1", { status: "approved" });
    expect(captured.update).toMatchObject({ approved_by_user_id: "owner-1" });
  });

  it("permits self-approval — R2.5, a one-senior agency would otherwise deadlock", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubDb("org-1");
    await setVersionApprovalAction("v1", { status: "approved" });
    expect(captured.update).toMatchObject({ approval_status: "approved" });
  });

  it("reset to pending clears reviewer and note without needing one", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubDb("org-1");
    await setVersionApprovalAction("v1", { status: "pending" });
    expect(captured.update).toEqual({
      approval_status: "pending",
      approved_by_user_id: null,
      approved_at: null,
      approved_seen_at: null,
      note: null,
    });
  });
});

describe("setVersionApprovalAction — decision history (D173-D175)", () => {
  it("logs a decision when approving", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    stubDb("org-1");
    await setVersionApprovalAction("v1", { status: "approved" });
    expect(mockInsertDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: "v1",
        orgId: "org-1",
        status: "approved",
        decidedByUserId: "senior-1",
      }),
    );
  });

  it("logs a decision when rejecting, including the note", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    stubDb("org-1");
    await setVersionApprovalAction("v1", {
      status: "changes_requested",
      note: "fix it",
    });
    expect(mockInsertDecision).toHaveBeenCalledWith(
      expect.objectContaining({ status: "changes_requested", note: "fix it" }),
    );
  });

  it("does NOT log a decision when resetting to pending — D174", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    stubDb("org-1");
    await setVersionApprovalAction("v1", { status: "pending" });
    expect(mockInsertDecision).not.toHaveBeenCalled();
  });

  it("does not fail the action if the decision-log insert fails — D175", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubDb("org-1");
    mockInsertDecision.mockRejectedValueOnce(new Error("log db down"));
    await expect(
      setVersionApprovalAction("v1", { status: "approved" }),
    ).resolves.toBeUndefined();
    // The status update itself still succeeded — a logging failure must never roll it back
    // or surface as an error to the reviewer.
    expect(captured.update).toMatchObject({ approval_status: "approved" });
  });
});

describe("setVersionApprovalAction with annotations", () => {
  it("rejects annotations on any status except changes_requested", async () => {
    stubDb();
    await expect(
      setVersionApprovalAction("v1", { status: "approved", annotations: [ann()] }),
    ).rejects.toThrow(/request changes/i);
  });

  it("rejects an invalid batch before touching storage or the DB", async () => {
    stubDb();
    await expect(
      setVersionApprovalAction("v1", {
        status: "changes_requested",
        note: "fix it",
        annotations: [ann({ note: " " })],
      }),
    ).rejects.toThrow(/note/i);
    expect(mockStorageFrom).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("aborts the whole action when an upload fails — no status update, no decision", async () => {
    stubDb("org-1", { uploadError: { message: "quota" } });
    await expect(
      setVersionApprovalAction("v1", {
        status: "changes_requested",
        note: "fix it",
        annotations: [ann()],
      }),
    ).rejects.toThrow(/quota/);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertAnnotations).not.toHaveBeenCalled();
  });

  it("uploads, updates status, then writes decision + annotation rows sharing one decision id", async () => {
    stubDb();
    await setVersionApprovalAction("v1", {
      status: "changes_requested",
      note: "fix it",
      annotations: [ann()],
    });
    expect(updateSpy).toHaveBeenCalled();
    const decision = mockInsertDecision.mock.calls[0][0] as { id?: string };
    const rows = mockInsertAnnotations.mock.calls[0][0] as { decision_id: string }[];
    expect(decision.id).toBeTruthy();
    expect(rows[0].decision_id).toBe(decision.id);
    expect(rows[0]).toMatchObject({
      org_id: "org-1",
      seq: 1,
      kind: "image",
      mask_path: "org-1/" + decision.id + "/1-mask.png",
      note: "logo too small",
    });
  });

  it("a decision-log failure is best-effort WITHOUT annotations but strict WITH them", async () => {
    stubDb();
    mockInsertDecision.mockRejectedValueOnce(new Error("log down"));
    // Without annotations: swallowed (existing D175 behavior).
    await expect(
      setVersionApprovalAction("v1", { status: "changes_requested", note: "fix it" }),
    ).resolves.toBeUndefined();

    mockInsertDecision.mockRejectedValueOnce(new Error("log down"));
    // With annotations: the decision row is load-bearing (annotations reference it) — strict.
    await expect(
      setVersionApprovalAction("v1", {
        status: "changes_requested",
        note: "fix it",
        annotations: [ann()],
      }),
    ).rejects.toThrow(/log down/);
  });

  it("still enforces the role gate", async () => {
    stubDb();
    mockCaller.mockResolvedValue(caller("designer", "u2"));
    await expect(
      setVersionApprovalAction("v1", { status: "approved" }),
    ).rejects.toThrow(/not permitted/i);
  });
});

// Stubs the version-row lookup with a given operator/status/seen state, and captures
// whatever update payload the action attempts to write (or records that none was).
function stubSeenDb(row: {
  operatorUserId: string | null;
  approvalStatus: string;
  approvedSeenAt: string | null;
} | null) {
  const captured: { update?: Record<string, unknown>; updated: boolean } = { updated: false };
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          row === null
            ? { data: null, error: null }
            : {
                data: {
                  id: "v1",
                  operator_user_id: row.operatorUserId,
                  approval_status: row.approvalStatus,
                  approved_seen_at: row.approvedSeenAt,
                },
                error: null,
              },
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      captured.update = payload;
      captured.updated = true;
      return { eq: async () => ({ error: null }) };
    },
  }));
  return captured;
}

describe("markVersionApprovalSeenAction", () => {
  it("stamps approved_seen_at when the caller is the maker of an approved, unseen version", async () => {
    mockCaller.mockResolvedValue(caller("designer", "ruby-1"));
    const captured = stubSeenDb({
      operatorUserId: "ruby-1",
      approvalStatus: "approved",
      approvedSeenAt: null,
    });
    await markVersionApprovalSeenAction("v1");
    expect(captured.updated).toBe(true);
    expect(captured.update).toHaveProperty("approved_seen_at");
    expect(typeof captured.update?.approved_seen_at).toBe("string");
  });

  it("is a no-op for a version belonging to someone else", async () => {
    mockCaller.mockResolvedValue(caller("designer", "ruby-1"));
    const captured = stubSeenDb({
      operatorUserId: "someone-else",
      approvalStatus: "approved",
      approvedSeenAt: null,
    });
    await markVersionApprovalSeenAction("v1");
    expect(captured.updated).toBe(false);
  });

  it("is a no-op when the version is not approved", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubSeenDb({
      operatorUserId: "senior-1",
      approvalStatus: "pending",
      approvedSeenAt: null,
    });
    await markVersionApprovalSeenAction("v1");
    expect(captured.updated).toBe(false);
  });

  it("is a no-op when already seen", async () => {
    mockCaller.mockResolvedValue(caller("designer", "ruby-1"));
    const captured = stubSeenDb({
      operatorUserId: "ruby-1",
      approvalStatus: "approved",
      approvedSeenAt: "2026-08-24T00:00:00Z",
    });
    await markVersionApprovalSeenAction("v1");
    expect(captured.updated).toBe(false);
  });

  it("is a no-op for a version that does not exist — never throws (fire-and-forget caller)", async () => {
    mockCaller.mockResolvedValue(caller("designer", "ruby-1"));
    const captured = stubSeenDb(null);
    await expect(markVersionApprovalSeenAction("v1")).resolves.toBeUndefined();
    expect(captured.updated).toBe(false);
  });
});
