import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const insertMock = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({ insert: insertMock }),
  })),
}));

import { logImpersonationEvent } from "./impersonation-audit";

describe("logImpersonationEvent", () => {
  beforeEach(() => vi.resetAllMocks());

  it("inserts a session_started row with no detail", async () => {
    insertMock.mockResolvedValueOnce({ error: null });
    await logImpersonationEvent({
      operatorId: "op-1",
      targetOrgId: "org-2",
      eventType: "session_started",
    });
    expect(insertMock).toHaveBeenCalledWith({
      operator_id: "op-1",
      target_org_id: "org-2",
      event_type: "session_started",
      detail: null,
    });
  });

  it("inserts a write_action row with detail", async () => {
    insertMock.mockResolvedValueOnce({ error: null });
    await logImpersonationEvent({
      operatorId: "op-1",
      targetOrgId: "org-2",
      eventType: "write_action",
      detail: { method: "POST", path: "/api/clients/client-1" },
    });
    expect(insertMock).toHaveBeenCalledWith({
      operator_id: "op-1",
      target_org_id: "org-2",
      event_type: "write_action",
      detail: { method: "POST", path: "/api/clients/client-1" },
    });
  });

  it("swallows insert errors (audit logging must never break the request)", async () => {
    insertMock.mockResolvedValueOnce({ error: { message: "db down" } });
    await expect(
      logImpersonationEvent({ operatorId: "op-1", targetOrgId: "org-2", eventType: "session_ended" }),
    ).resolves.toBeUndefined();
  });
});
