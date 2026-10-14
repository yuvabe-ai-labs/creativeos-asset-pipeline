import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-generate", () => ({ changeGenerateScript: vi.fn(), loadGenerateState: vi.fn() }));

import { changeGenerateScript, loadGenerateState } from "@/lib/db/script-generate";
import { allowClient, generateScript, jsonRequest, reel01Doc, runChangeAgainst, SCRIPT_ID, stateOf } from "@/lib/scripts/copilot/__tests__/route-mocks";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const patch = (body: unknown) => jsonRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/fields`, "PATCH", body);

describe("PATCH .../fields", () => {
  beforeEach(async () => { vi.resetAllMocks(); await allowClient(); vi.mocked(loadGenerateState).mockResolvedValue(stateOf(generateScript())); });

  it("writes one typed field and nothing else", async () => {
    const current = generateScript({ doc: reel01Doc() });
    vi.mocked(changeGenerateScript).mockImplementation(runChangeAgainst(current) as never);
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ path: "shots.s02.visual", value: "Typed." }) as never, { params })).status).toBe(200);
    const change = vi.mocked(changeGenerateScript).mock.calls[0][2];
    const out = change(current) as { patch: { doc: ReturnType<typeof reel01Doc> } };
    expect(out.patch.doc.shots[1].visual).toBe("Typed.");
    expect(out.patch.doc.shots.filter((s) => s.id !== "s02")).toEqual(reel01Doc().shots.filter((s) => s.id !== "s02"));
  });

  it("refuses an unknown path (400) and an invalid value (422)", async () => {
    vi.mocked(changeGenerateScript).mockImplementation(runChangeAgainst(generateScript({ doc: reel01Doc() })) as never);
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ path: "shots.s02.id", value: "x" }) as never, { params })).status).toBe(400);
    expect((await PATCH(patch({ path: "shots.s02.lengthSeconds", value: "ninety" }) as never, { params })).status).toBe(422);
  });
});
