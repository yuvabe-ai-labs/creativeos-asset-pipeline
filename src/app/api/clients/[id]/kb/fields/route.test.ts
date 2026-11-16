import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ patchKBFields: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ insertCopilotMessages: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { insertCopilotMessages } from "@/lib/db/copilot-messages";
import { patchKBFields } from "@/lib/db/kb";

const V1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11";
const V2 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c99";
const params = Promise.resolve({ id: "c1" });
const patch = (body: unknown) => new NextRequest("http://localhost/api/clients/c1/kb/fields", { method: "PATCH", body: JSON.stringify(body) });
const approve = { path: ["brand_profile", "tagline"], patch: { status: "approved" } };

describe("PATCH /api/clients/:id/kb/fields", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("o1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", slug: "acme", org_id: "o1", active_kb_version_id: V1 } as never);
  });

  it("saves the patches to the active version and says so in the thread", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ versionId: V1, patches: [approve, { path: ["compliance", "disclaimers"], patch: { value: ["a"], status: "edited" } }] }), { params });
    expect(res.status).toBe(200);
    expect(patchKBFields).toHaveBeenCalledWith(V1, [approve, { path: ["compliance", "disclaimers"], patch: { value: ["a"], status: "edited" } }]);
    expect(vi.mocked(insertCopilotMessages).mock.calls[0][3]).toEqual([
      { role: "assistant", content: "Manual edits saved: 2 fields.", card: { kind: "note" }, suggestions: [], createdBy: "u1" },
    ]);
  });

  it("says one field in the singular", async () => {
    const { PATCH } = await import("./route");
    await PATCH(patch({ versionId: V1, patches: [approve] }), { params });
    expect(vi.mocked(insertCopilotMessages).mock.calls[0][3][0].content).toBe("Manual edits saved: 1 field.");
  });

  it("still saves when the thread cannot be written", async () => {
    vi.mocked(insertCopilotMessages).mockRejectedValue(new Error("down"));
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ versionId: V1, patches: [approve] }), { params })).status).toBe(200);
  });

  it("refuses an empty or malformed body", async () => {
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ versionId: V1, patches: [] }), { params })).status).toBe(400);
    expect((await PATCH(patch({ patches: [approve] }), { params })).status).toBe(400);
    expect(patchKBFields).not.toHaveBeenCalled();
  });

  it("refuses a path that is not a KB field", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ versionId: V1, patches: [approve, { path: ["brand_profile", "nope"], patch: { status: "approved" } }] }), { params });
    expect(res.status).toBe(400);
    expect(patchKBFields).not.toHaveBeenCalled();
  });

  it("refuses a version that is not the active one", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ versionId: V2, patches: [approve] }), { params });
    expect(res.status).toBe(409);
    expect(patchKBFields).not.toHaveBeenCalled();
  });
});
