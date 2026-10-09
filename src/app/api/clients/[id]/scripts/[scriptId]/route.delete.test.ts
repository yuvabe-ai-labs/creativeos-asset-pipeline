import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));
vi.mock("@/lib/db/script-generate", () => ({ archiveUnwrittenScript: vi.fn(), getGenerateScript: vi.fn() }));

import { archiveUnwrittenScript, getGenerateScript } from "@/lib/db/script-generate";
import { allowClient, generateScript, jsonRequest, reel01Doc, SCRIPT_ID } from "@/lib/scripts/copilot/__tests__/route-mocks";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const req = () => jsonRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}`, "DELETE");

describe("DELETE /api/clients/[id]/scripts/[scriptId]", () => {
  beforeEach(async () => { vi.resetAllMocks(); await allowClient(); });

  it("deletes a script the copilot has not written yet", async () => {
    vi.mocked(archiveUnwrittenScript).mockResolvedValue(true);
    const { DELETE } = await import("./route");
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(200);
    expect(archiveUnwrittenScript).toHaveBeenCalledWith("c1", SCRIPT_ID);
  });

  it("refuses a script that has a draft, and says why", async () => {
    vi.mocked(archiveUnwrittenScript).mockResolvedValue(false);
    vi.mocked(getGenerateScript).mockResolvedValue(generateScript({ doc: reel01Doc() }));
    const { DELETE } = await import("./route");
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/draft/i);
  });

  it("is a 404 for a missing, deleted or another client's script", async () => {
    vi.mocked(archiveUnwrittenScript).mockResolvedValue(false);
    vi.mocked(getGenerateScript).mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(404);
  });
});
