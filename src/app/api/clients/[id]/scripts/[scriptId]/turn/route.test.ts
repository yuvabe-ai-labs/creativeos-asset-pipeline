import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-generate", () => ({
  getGenerateScript: vi.fn(), changeGenerateScript: vi.fn(), listScriptMessages: vi.fn(),
  insertScriptMessages: vi.fn(), loadGenerateState: vi.fn(),
}));
vi.mock("@/lib/scripts/copilot/context", () => ({ loadCopilotContext: vi.fn(), loadSignals: vi.fn() }));
vi.mock("@/lib/scripts/copilot/model", () => ({ structuredCaller: vi.fn(), streamingCaller: vi.fn() }));
vi.mock("@/lib/scripts/copilot/turn", () => ({ prepareTurn: vi.fn() }));

import { changeGenerateScript, getGenerateScript, insertScriptMessages, listScriptMessages, loadGenerateState } from "@/lib/db/script-generate";
import { loadCopilotContext } from "@/lib/scripts/copilot/context";
import { prepareTurn } from "@/lib/scripts/copilot/turn";
import { structuredCaller } from "@/lib/scripts/copilot/model";
import { allowClient, generateScript, jsonRequest, runChangeAgainst, SCRIPT_ID, stateOf } from "@/lib/scripts/copilot/__tests__/route-mocks";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
/** The turn answers as newline-delimited JSON: draft previews, then the final state. */
const lines = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
const send = (body: unknown) => jsonRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/turn`, "POST", body);

describe("POST .../turn", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await allowClient();
    vi.mocked(getGenerateScript).mockResolvedValue(generateScript());
    vi.mocked(listScriptMessages).mockResolvedValue([{ id: "m0", role: "assistant", content: "What format?", card: null, createdAt: "t" }]);
    vi.mocked(loadCopilotContext).mockResolvedValue({ clientName: "Jackfruit365", kbText: "KB", hasKb: true, library: [], avatars: [] });
    vi.mocked(changeGenerateScript).mockImplementation(runChangeAgainst(generateScript()) as never);
    vi.mocked(loadGenerateState).mockResolvedValue(stateOf(generateScript()));
  });

  it("saves the person's message first, runs the turn with the copilot's last message, then saves the replies", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: { brief: generateScript().brief }, result: [{ content: "UGC it is.", card: null }] }));
    const { POST } = await import("./route");
    const res = await POST(send({ text: "  UGC  " }) as never, { params });
    expect(res.status).toBe(200);
    const out = await lines(res);
    expect(vi.mocked(insertScriptMessages).mock.calls[0]).toEqual(["c1", SCRIPT_ID, "user-1", [{ role: "user", content: "UGC", card: null }]]);
    expect(vi.mocked(prepareTurn).mock.calls[0][0]).toMatchObject({ text: "UGC", lastAssistant: "What format?" });
    expect(vi.mocked(insertScriptMessages).mock.calls[1]).toEqual(["c1", SCRIPT_ID, null, [{ role: "assistant", content: "UGC it is.", card: null }]]);
    expect(res.headers.get("content-type")).toMatch(/application\/x-ndjson/);
    expect(out.at(-1)).toMatchObject({ type: "state", state: { script: { id: SCRIPT_ID } } });
    // The writer for the draft and edits, a quicker model for reading, angles and the card.
    expect(vi.mocked(structuredCaller).mock.calls.map((c) => c[0]).sort()).toEqual(["gemini-3.1-pro-preview", "gpt-5.4-mini"]);
  });

  it("streams draft previews before the final state", async () => {
    vi.mocked(prepareTurn).mockImplementation(async (_input, deps) => {
      deps.onDraft?.({ header: { title: "Kerala Piravi" }, context: {}, cast: [], shots: [] });
      return () => ({ patch: null, result: [{ content: "Done.", card: null }] });
    });
    const { POST } = await import("./route");
    const out = await lines(await POST(send({ text: "write it" }) as never, { params }));
    expect(out.map((l) => l.type)).toEqual(["draft", "state"]);
    expect(out[0].draft.header.title).toBe("Kerala Piravi");
  });

  it("keeps the person's message and says nothing changed when the model fails", async () => {
    vi.mocked(prepareTurn).mockRejectedValue(new Error("model down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    const res = await POST(send({ text: "hi" }) as never, { params });
    expect(res.status).toBe(200);
    expect((await lines(res)).at(-1).type).toBe("state");
    expect(vi.mocked(insertScriptMessages).mock.calls[1][3][0].content).toBe("Something went wrong on my side, and nothing was changed. Send that again.");
  });

  it("turns a refused save into the copilot's reply", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ error: "The script changed while I was working. Send that again.", status: 409 }));
    const { POST } = await import("./route");
    await lines(await POST(send({ text: "hi" }) as never, { params }));
    expect(vi.mocked(insertScriptMessages).mock.calls[1][3][0].content).toBe("The script changed while I was working. Send that again.");
  });

  it("refuses an empty message, an unknown script and a final script, saving nothing", async () => {
    const { POST } = await import("./route");
    expect((await POST(send({ text: "  " }) as never, { params })).status).toBe(400);
    vi.mocked(getGenerateScript).mockResolvedValueOnce(null);
    expect((await POST(send({ text: "hi" }) as never, { params })).status).toBe(404);
    vi.mocked(getGenerateScript).mockResolvedValueOnce(generateScript({ stage: "visualise" }));
    expect((await POST(send({ text: "hi" }) as never, { params })).status).toBe(409);
    expect(insertScriptMessages).not.toHaveBeenCalled();
  });
});
