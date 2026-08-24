import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCaller = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/dal", () => ({ resolveCallerContext: () => mockCaller() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));
// withAction is Stage 4's impersonation write-gate; pass it through so these tests
// exercise the approval rules rather than impersonation state.
vi.mock("@/lib/actions/with-action", () => ({
  withAction: (_name: string, fn: () => Promise<unknown>) => fn(),
}));

import { setVersionApprovalAction } from "./approval";

// Stubs the version-row lookup with a given org, and captures whatever update payload
// the action attempts to write.
function stubDb(versionOrgId: string | null) {
  const captured: { update?: Record<string, unknown> } = {};
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          versionOrgId === null
            ? { data: null, error: null }
            : { data: { id: "v1", org_id: versionOrgId }, error: null },
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      captured.update = payload;
      return { eq: async () => ({ error: null }) };
    },
  }));
  return captured;
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

beforeEach(() => {
  mockFrom.mockReset();
  mockCaller.mockReset();
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
      note: null,
    });
  });
});
