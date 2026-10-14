import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-generate", () => ({ loadGenerateState: vi.fn() }));

import { loadGenerateState } from "@/lib/db/script-generate";
import { allowClient, generateScript, jsonRequest, SCRIPT_ID, stateOf } from "@/lib/scripts/copilot/__tests__/route-mocks";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const req = () => jsonRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/generate`, "GET");

describe("GET .../generate", () => {
  beforeEach(async () => { vi.resetAllMocks(); await allowClient(); });

  it("returns the workspace state", async () => {
    vi.mocked(loadGenerateState).mockResolvedValue(stateOf(generateScript()));
    const { GET } = await import("./route");
    const res = await GET(req() as never, { params });
    expect(res.status).toBe(200);
    expect((await res.json()).state.script.id).toBe(SCRIPT_ID);
    expect(loadGenerateState).toHaveBeenCalledWith("c1", SCRIPT_ID);
  });

  it("is a 404 for a missing or another client's script", async () => {
    vi.mocked(loadGenerateState).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(req() as never, { params })).status).toBe(404);
  });
});
