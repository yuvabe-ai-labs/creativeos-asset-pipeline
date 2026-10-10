import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-generate", () => ({ getGenerateScript: vi.fn(), markScriptFinal: vi.fn() }));

import { getGenerateScript, markScriptFinal } from "@/lib/db/script-generate";
import { allowClient, generateScript, jsonRequest, reel01Doc, SCRIPT_ID } from "@/lib/scripts/copilot/__tests__/route-mocks";
import reel06 from "@/lib/scripts/fixtures/reel-06.json";
import { scriptDocSchema } from "@/lib/scripts/schema";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const post = () => jsonRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/mark-final`, "POST");
const ready = () => generateScript({ doc: scriptDocSchema.parse(reel06), docVersion: 7 });

describe("POST .../mark-final", () => {
  beforeEach(async () => { vi.resetAllMocks(); await allowClient(); });

  it("moves a client-ready script to Visualise, on the version it checked", async () => {
    vi.mocked(getGenerateScript).mockResolvedValue(ready());
    vi.mocked(markScriptFinal).mockResolvedValue(true);
    const { POST } = await import("./route");
    const res = await POST(post() as never, { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stage: "visualise" });
    expect(markScriptFinal).toHaveBeenCalledWith("c1", SCRIPT_ID, 7);
  });

  it("moves a drafted script with items still open: the browser asked the person first (D363)", async () => {
    vi.mocked(getGenerateScript).mockResolvedValue({
      ...generateScript({ doc: reel01Doc(), docVersion: 3 }), // still holds the review placeholder
      notes: { brief: "", confirmations: [{ id: "c1", text: "Sat 14 Nov", confirmed: false }] },
    });
    vi.mocked(markScriptFinal).mockResolvedValue(true);
    const { POST } = await import("./route");
    const res = await POST(post() as never, { params });
    expect(res.status).toBe(200);
    expect(markScriptFinal).toHaveBeenCalledWith("c1", SCRIPT_ID, 3);
  });

  it("refuses a script with no draft yet", async () => {
    vi.mocked(getGenerateScript).mockResolvedValue(generateScript({ doc: null }));
    const { POST } = await import("./route");
    const res = await POST(post() as never, { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("There's no draft to mark final yet.");
    expect(markScriptFinal).not.toHaveBeenCalled();
  });

  it("refuses when the script moved on between the check and the move, and when it is not at Generate", async () => {
    vi.mocked(getGenerateScript).mockResolvedValueOnce(ready());
    vi.mocked(markScriptFinal).mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    expect((await POST(post() as never, { params })).status).toBe(409);
    vi.mocked(getGenerateScript).mockResolvedValueOnce({ ...ready(), stage: "visualise" });
    expect((await POST(post() as never, { params })).status).toBe(409);
  });
});
