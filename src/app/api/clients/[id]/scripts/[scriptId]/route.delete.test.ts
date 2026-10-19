import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn(), deleteScript: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));

import { deleteScript } from "@/lib/db/scripts";
import { SCRIPT_DELETE_BLOCKED, SCRIPT_DELETE_BLOCKS } from "@/lib/scripts/constants";
import { allowClient, jsonRequest, SCRIPT_ID } from "@/lib/scripts/copilot/__tests__/route-mocks";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const req = () => jsonRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}`, "DELETE");

describe("DELETE /api/clients/[id]/scripts/[scriptId]", () => {
  beforeEach(async () => { vi.resetAllMocks(); await allowClient(); });

  it("deletes the script for good, at any stage (D384)", async () => {
    vi.mocked(deleteScript).mockResolvedValue("deleted");
    const { DELETE } = await import("./route");
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(200);
    expect(deleteScript).toHaveBeenCalledWith("c1", SCRIPT_ID);
  });

  it.each(SCRIPT_DELETE_BLOCKS)("refuses when %s, and says why", async (block) => {
    vi.mocked(deleteScript).mockResolvedValue(block);
    const { DELETE } = await import("./route");
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(SCRIPT_DELETE_BLOCKED[block]);
  });

  it("is a 404 for a missing, already deleted or another client's script", async () => {
    vi.mocked(deleteScript).mockResolvedValue("not_found");
    const { DELETE } = await import("./route");
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(404);
  });
});
