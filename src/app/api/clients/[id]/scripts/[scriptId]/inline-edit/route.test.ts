import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-generate", () => ({ getGenerateScript: vi.fn(), changeGenerateScript: vi.fn(), insertScriptMessages: vi.fn(), loadGenerateState: vi.fn() }));
vi.mock("@/lib/scripts/copilot/context", () => ({ loadCopilotContext: vi.fn() }));
vi.mock("@/lib/scripts/copilot/model", () => ({ structuredCaller: vi.fn() }));

import { changeGenerateScript, getGenerateScript, insertScriptMessages, loadGenerateState } from "@/lib/db/script-generate";
import { loadCopilotContext } from "@/lib/scripts/copilot/context";
import { structuredCaller } from "@/lib/scripts/copilot/model";
import { allowClient, generateScript, jsonRequest, reel01Doc, runChangeAgainst, SCRIPT_ID, stateOf } from "@/lib/scripts/copilot/__tests__/route-mocks";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const post = (body: unknown) => jsonRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/inline-edit`, "POST", body);

describe("POST .../inline-edit", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await allowClient();
    const current = generateScript({ doc: reel01Doc() });
    vi.mocked(getGenerateScript).mockResolvedValue(current);
    vi.mocked(changeGenerateScript).mockImplementation(runChangeAgainst(current) as never);
    vi.mocked(loadCopilotContext).mockResolvedValue({ clientName: "J", kbText: "KB", hasKb: true, library: [], avatars: [] });
    vi.mocked(structuredCaller).mockReturnValue((async () => ({ replacement: "Today,", summary: "Warmer opening." })) as never);
    vi.mocked(loadGenerateState).mockResolvedValue(stateOf(current));
  });

  it("applies the edit at once, says what changed in the chat, and returns the undo", async () => {
    const vo = reel01Doc().shots[0].vo;
    const { POST } = await import("./route");
    const res = await POST(post({ path: "shots.s01.vo", selectedText: vo.split(" ")[0], offset: 0, instruction: "warmer" }) as never, { params });
    expect(res.status).toBe(200);
    expect((await res.json()).undo).toEqual({ path: "shots.s01.vo", before: vo });
    expect(vi.mocked(insertScriptMessages).mock.calls[0][3]).toEqual([{ role: "assistant", content: "Changed S1 VO: Warmer opening.", card: null }]);
  });

  it("refuses an empty selection or instruction, and text that is no longer there", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ path: "shots.s01.vo", selectedText: "", offset: 0, instruction: "x" }) as never, { params })).status).toBe(400);
    expect((await POST(post({ path: "shots.s01.vo", selectedText: "Golu", offset: 0, instruction: " " }) as never, { params })).status).toBe(400);
    expect((await POST(post({ path: "shots.s01.vo", selectedText: "not there", offset: 0, instruction: "x" }) as never, { params })).status).toBe(409);
  });
});
