import { describe, it, expect, vi, beforeEach } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-generate", () => ({
  getGenerateScript: vi.fn(), changeGenerateScript: vi.fn(), changeVisualiseScript: vi.fn(), listScriptMessages: vi.fn(),
  insertScriptMessages: vi.fn(), loadGenerateState: vi.fn(),
}));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/scripts/visualise/board-server", () => ({ loadVisualiseBoard: vi.fn() }));
// At Visualise the board is told with the panel model's reference limit, from the model catalog.
vi.mock("@/lib/ai-models/catalog", async () => {
  const { seededModelCatalog } = await import("@/lib/ai-models/test-catalog");
  return { getAiCatalog: vi.fn(async () => seededModelCatalog()) };
});
vi.mock("@/lib/db/script-panels", () => ({ setPanelPick: vi.fn() }));
vi.mock("@/lib/scripts/copilot/context", () => ({ loadCopilotContext: vi.fn() }));
vi.mock("@/lib/scripts/copilot/model", () => ({ structuredCaller: vi.fn(), streamingCaller: vi.fn() }));
vi.mock("@/lib/scripts/copilot/turn", () => ({ prepareTurn: vi.fn() }));
vi.mock("@/lib/journey/market-copilot/from-script", () => ({ askMarketResearch: vi.fn() }));
// Work the route asks the platform to finish after the answer has gone, kept so the tests can run it.
const afterWork: Array<() => unknown> = [];
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: vi.fn((work: () => unknown) => { afterWork.push(work); }) }));

import { changeGenerateScript, changeVisualiseScript, getGenerateScript, insertScriptMessages, listScriptMessages, loadGenerateState } from "@/lib/db/script-generate";
import { getScript } from "@/lib/db/scripts";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";
import { setPanelPick } from "@/lib/db/script-panels";
import { loadCopilotContext } from "@/lib/scripts/copilot/context";
import { prepareTurn } from "@/lib/scripts/copilot/turn";
import { askMarketResearch } from "@/lib/journey/market-copilot/from-script";
import { streamingCaller, structuredCaller } from "@/lib/scripts/copilot/model";
import { allowClient, AVATAR_ID, generateScript, jsonRequest, runChangeAgainst, SCRIPT_ID, stateOf } from "@/lib/scripts/copilot/__tests__/route-mocks";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
/** The turn answers as newline-delimited JSON: draft previews, then the final state. */
const lines = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
const send = (body: unknown) => jsonRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/turn`, "POST", body);

describe("POST .../turn", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    afterWork.length = 0;
    await allowClient();
    vi.mocked(getGenerateScript).mockResolvedValue(generateScript());
    vi.mocked(listScriptMessages).mockResolvedValue([{ id: "m0", role: "assistant", content: "What format?", card: null, suggestions: [], createdAt: "t" }]);
    vi.mocked(loadCopilotContext).mockResolvedValue({ clientName: "Jackfruit365", kbText: "KB", hasKb: true, library: [], avatars: [], today: "Wed 28 Oct 2026", signals: { brief: "", digest: "", list: [], all: [] } });
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
    expect(vi.mocked(prepareTurn).mock.calls[0][0]).toMatchObject({ text: "UGC", history: [{ id: "m0", content: "What format?" }] });
    expect(vi.mocked(insertScriptMessages).mock.calls[1]).toEqual(["c1", SCRIPT_ID, null, [{ role: "assistant", content: "UGC it is.", card: null }]]);
    expect(res.headers.get("content-type")).toMatch(/application\/x-ndjson/);
    expect(out.at(-1)).toMatchObject({ type: "state", state: { script: { id: SCRIPT_ID } } });
    // The writer for the draft and edits, a quicker model for reading, angles and the card.
    expect(vi.mocked(structuredCaller).mock.calls.map((c) => c[0]).sort()).toEqual(["gemini-3.1-pro-preview", "gpt-5.4-mini"]);
    // D560 — every call's cost is recorded for the caller the route already resolved.
    const recording = { recordFor: { orgId: "org-1", clientId: "c1", userId: "user-1", userEmail: undefined, scriptId: SCRIPT_ID }, recordType: "script" };
    for (const c of vi.mocked(structuredCaller).mock.calls) expect(c[1]).toEqual(recording);
    expect(vi.mocked(streamingCaller).mock.calls[0]).toEqual(["gemini-3.1-pro-preview", recording]);
  });

  // Final review, Important 5 (performance rule 8): market signals feed the brief's suggestions and
  // angles only; an edit turn after the draft never reads them, so it never downloads them.
  it("loads market signals before the draft, and not for an edit", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: null, result: [{ content: "ok", card: null }] }));
    const { POST } = await import("./route");
    await lines(await POST(send({ text: "UGC" }) as never, { params }));
    expect(vi.mocked(loadCopilotContext).mock.calls[0][1]).toEqual({ signals: true });
    const written = generateScript({ doc: scriptDocSchema.parse(reel01) });
    vi.mocked(getGenerateScript).mockResolvedValue(written);
    await lines(await POST(send({ text: "Shorter hook" }) as never, { params }));
    expect(vi.mocked(loadCopilotContext).mock.calls[1][1]).toEqual({ signals: false });
  });

  it("loads market signals for an edit when the script is built from some, so a rewrite can read them (D531)", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: null, result: [{ content: "ok", card: null }] }));
    const { POST } = await import("./route");
    const built = generateScript({ doc: scriptDocSchema.parse(reel01) });
    vi.mocked(getGenerateScript).mockResolvedValue({ ...built, brief: { ...built.brief, signalIds: ["s1"] } });
    await lines(await POST(send({ text: "Rewrite with these signals" }) as never, { params }));
    expect(vi.mocked(loadCopilotContext).mock.calls[0][1]).toEqual({ signals: true });
  });

  it("hands research the turn asked for to market research, after the reply (D532)", async () => {
    vi.mocked(prepareTurn).mockImplementation(async (_input, deps) => {
      deps.onResearch?.("what competitors post for monsoon");
      return () => ({ patch: null, result: [{ content: "Handed over.", card: null }] });
    });
    const { POST } = await import("./route");
    await lines(await POST(send({ text: "research what competitors post for monsoon" }) as never, { params }));
    expect(askMarketResearch).not.toHaveBeenCalled();
    await Promise.all(afterWork.map((w) => w()));
    expect(askMarketResearch).toHaveBeenCalledWith(expect.objectContaining({
      client: expect.objectContaining({ id: "c1" }), userId: "user-1", question: "what competitors post for monsoon",
    }));
  });

  it("registers the after-reply work in the handler itself, not from inside the stream (review fix)", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    vi.mocked(prepareTurn).mockImplementation(async (_input, deps) => {
      await held;
      deps.onResearch?.("q");
      return () => ({ patch: null, result: [{ content: "ok", card: null }] });
    });
    const { POST } = await import("./route");
    const res = await POST(send({ text: "research q" }) as never, { params });
    // The turn is still running inside the stream, and the work is already registered.
    expect(afterWork).toHaveLength(1);
    release();
    await lines(res);
    await Promise.all(afterWork.map((w) => w()));
    expect(askMarketResearch).toHaveBeenCalledTimes(1);
  });

  it("asks nothing of market research when the turn asked for no research", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: null, result: [{ content: "ok", card: null }] }));
    const { POST } = await import("./route");
    await lines(await POST(send({ text: "UGC" }) as never, { params }));
    await Promise.all(afterWork.map((w) => w()));
    expect(askMarketResearch).not.toHaveBeenCalled();
  });

  it("takes a pasted script longer than an ordinary message, up to 30,000 characters", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: null, result: [{ content: "ok", card: null }] }));
    const { POST } = await import("./route");
    expect((await POST(send({ text: "x".repeat(4001) }) as never, { params })).status).toBe(200);
    expect(vi.mocked(prepareTurn).mock.calls[0][0].text).toHaveLength(4001);
    const res = await POST(send({ text: "x".repeat(30001) }) as never, { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Keep a message under 30,000 characters.");
  });

  it("passes a lead chip's avatar on to the turn, and drops one that is not an id", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: null, result: [{ content: "ok", card: null }] }));
    const { POST } = await import("./route");
    await lines(await POST(send({ text: "James", leadAvatarId: AVATAR_ID }) as never, { params }));
    expect(vi.mocked(prepareTurn).mock.calls[0][0]).toMatchObject({ text: "James", leadAvatarId: AVATAR_ID });
    await lines(await POST(send({ text: "James", leadAvatarId: "nope" }) as never, { params }));
    expect(vi.mocked(prepareTurn).mock.calls[1][0]).toMatchObject({ leadAvatarId: null });
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
    vi.mocked(getGenerateScript).mockResolvedValueOnce(generateScript({ stage: "in_review" }));
    expect((await POST(send({ text: "hi" }) as never, { params })).status).toBe(409);
    vi.mocked(getGenerateScript).mockResolvedValueOnce(generateScript({ stage: "approved" }));
    expect((await POST(send({ text: "hi" }) as never, { params })).status).toBe(409);
    expect(insertScriptMessages).not.toHaveBeenCalled();
  });
});

// Copilot journey spec §5.3: new scripts wait for approved market research; a pasted script does not.
describe("POST .../turn while market research is pending", () => {
  const GATE = "New scripts open once market research is approved. You can paste a script you already have.";
  const pasted = Array.from({ length: 8 }, (_, i) => `Shot ${i + 1}: ${"words ".repeat(12)}`).join("\n");

  beforeEach(async () => {
    vi.resetAllMocks();
    await allowClient();
    const { getClientById } = await import("@/lib/db/clients");
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1", kb_status: "ready", market_status: "pending" } as never);
    vi.mocked(getGenerateScript).mockResolvedValue(generateScript());
    vi.mocked(listScriptMessages).mockResolvedValue([]);
    vi.mocked(loadCopilotContext).mockResolvedValue({ clientName: "Jackfruit365", kbText: "KB", hasKb: true, library: [], avatars: [], today: "Wed 28 Oct 2026", signals: { brief: "", digest: "", list: [], all: [] } });
    vi.mocked(changeGenerateScript).mockImplementation(runChangeAgainst(generateScript()) as never);
    vi.mocked(loadGenerateState).mockResolvedValue(stateOf(generateScript()));
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: null, result: [{ content: "ok", card: null }] }));
  });

  it("refuses a chat message on an unwritten script", async () => {
    const { POST } = await import("./route");
    const res = await POST(send({ text: "Write me a festival reel" }) as never, { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(GATE);
    expect(insertScriptMessages).not.toHaveBeenCalled();
    expect(prepareTurn).not.toHaveBeenCalled();
  });

  it("lets a pasted script through", async () => {
    const { POST } = await import("./route");
    const res = await POST(send({ text: pasted }) as never, { params });
    expect(res.status).toBe(200);
    await lines(res);
    expect(prepareTurn).toHaveBeenCalledTimes(1);
  });

  it("lets an already written script be edited", async () => {
    vi.mocked(getGenerateScript).mockResolvedValue(generateScript({ doc: scriptDocSchema.parse(reel01) }));
    const { POST } = await import("./route");
    const res = await POST(send({ text: "Shorter hook" }) as never, { params });
    expect(res.status).toBe(200);
    await lines(res);
    expect(prepareTurn).toHaveBeenCalledTimes(1);
  });

  it("changes nothing once market research is approved", async () => {
    const { getClientById } = await import("@/lib/db/clients");
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1", kb_status: "ready", market_status: "approved" } as never);
    const { POST } = await import("./route");
    const res = await POST(send({ text: "Write me a festival reel" }) as never, { params });
    expect(res.status).toBe(200);
    await lines(res);
    expect(prepareTurn).toHaveBeenCalledTimes(1);
  });
});

// Piece 5.1 (D524) — the copilot answers at Visualise too.
describe("POST .../turn at Visualise", () => {
  const doc = scriptDocSchema.parse(reel01);
  const atVisualise = generateScript({ stage: "visualise", doc, updatedAt: "t1" });
  const script = { id: SCRIPT_ID, clientId: "c1", stage: "visualise" as const, doc, approvedAt: null, createdAt: "t", updatedAt: "t1" };
  const take = (id: string, shotId: string, createdAt: string) => ({
    id, scriptId: SCRIPT_ID, shotId, status: "succeeded" as const, url: "u", width: 1, height: 1, prompt: "p", promptEdited: false,
    shotKey: "k", faces: {}, error: null, createdAt, updatedAt: createdAt,
  });
  const board = { avatars: [], kits: [], picks: {}, takes: [take("a1", "s01", "2026-10-08T10:00:00.000Z"), take("a2", "s01", "2026-10-08T11:00:00.000Z")] };

  beforeEach(async () => {
    vi.resetAllMocks();
    await allowClient();
    vi.mocked(getGenerateScript).mockResolvedValue(atVisualise);
    vi.mocked(listScriptMessages).mockResolvedValue([]);
    vi.mocked(loadCopilotContext).mockResolvedValue({ clientName: "Jackfruit365", kbText: "KB", hasKb: true, library: [], avatars: [], today: "Wed 28 Oct 2026", signals: { brief: "", digest: "", list: [], all: [] } });
    vi.mocked(changeVisualiseScript).mockImplementation(runChangeAgainst(atVisualise) as never);
    vi.mocked(loadGenerateState).mockResolvedValue(stateOf(atVisualise));
    vi.mocked(getScript).mockResolvedValue(script as never);
    vi.mocked(loadVisualiseBoard).mockResolvedValue(board as never);
  });

  it("answers a message at Visualise, with the stage and the board", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: null, result: [{ content: "Three panels are left.", card: null }] }));
    const { POST } = await import("./route");
    const res = await POST(send({ text: "how many are left?" }) as never, { params });
    expect(res.status).toBe(200);
    expect((await lines(res)).at(-1)).toMatchObject({ type: "state" });
    expect(vi.mocked(prepareTurn).mock.calls[0][0]).toMatchObject({ stage: "visualise", board: { shots: expect.arrayContaining([expect.objectContaining({ id: "s01", versions: 2 })]) } });
  });

  it("saves through the Visualise write at Visualise", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: { doc }, result: [{ content: "Done.", card: null }] }));
    const { POST } = await import("./route");
    await lines(await POST(send({ text: "shorter hook" }) as never, { params }));
    expect(changeVisualiseScript).toHaveBeenCalled();
    expect(changeGenerateScript).not.toHaveBeenCalled();
  });

  it("sets a pick only for a drawn take of that shot, and saves the reply without its picks", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: null, result: [{ content: "Picked.", card: null, picks: [{ shotId: "s01", version: 1 }, { shotId: "s02", version: 9 }] }] }));
    const { POST } = await import("./route");
    await lines(await POST(send({ text: "use the first S1" }) as never, { params }));
    expect(vi.mocked(setPanelPick).mock.calls).toEqual([[SCRIPT_ID, "s01", "a1"]]);
    expect(vi.mocked(insertScriptMessages).mock.calls[1][3]).toEqual([{ role: "assistant", content: "Picked.", card: null }]);
  });

  it("records a picture with its target and answers without the model", async () => {
    const withPicture = { ...doc, locations: [{ id: "cafe", name: "the café", description: "d", image: { url: "https://storage/cafe.png", name: "cafe.png" } as never }] };
    vi.mocked(getGenerateScript).mockResolvedValue({ ...atVisualise, doc: withPicture });
    const { POST } = await import("./route");
    const res = await POST(send({ text: "", picture: { url: "https://storage/cafe.png", name: "cafe.png", target: "location:cafe" } }) as never, { params });
    expect(res.status).toBe(200);
    await lines(res);
    expect(vi.mocked(insertScriptMessages).mock.calls[0][3]).toEqual([
      { role: "user", content: "", card: { kind: "picture", url: "https://storage/cafe.png", name: "cafe.png", target: "location:cafe" } },
    ]);
    expect(vi.mocked(insertScriptMessages).mock.calls[1][3]).toEqual([{ role: "assistant", content: "Added it to the café.", card: null }]);
    expect(prepareTurn).not.toHaveBeenCalled();
  });

  it("refuses a picture that is not on the script", async () => {
    const { POST } = await import("./route");
    const res = await POST(send({ text: "", picture: { url: "https://elsewhere/x.png", name: "x.png", target: "location:cafe" } }) as never, { params });
    expect(res.status).toBe(400);
    expect(insertScriptMessages).not.toHaveBeenCalled();
  });

  // Final review, Important 3 — the copilot is told a picture came with the words.
  it("tells the copilot about a picture sent with words, and saves the words as typed", async () => {
    const withPicture = { ...doc, locations: [{ id: "cafe", name: "the café", description: "d", image: { url: "https://storage/cafe.png", name: "cafe.png" } as never }] };
    vi.mocked(getGenerateScript).mockResolvedValue({ ...atVisualise, doc: withPicture });
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: null, result: [{ content: "Lovely.", card: null }] }));
    const { POST } = await import("./route");
    await lines(await POST(send({ text: "here's the café", picture: { url: "https://storage/cafe.png", name: "cafe.png", target: "location:cafe" } }) as never, { params }));
    expect(vi.mocked(prepareTurn).mock.calls[0][0].text).toBe(`[The person attached a picture, "cafe.png", to the café; it is already on the board.] here's the café`);
    expect(vi.mocked(insertScriptMessages).mock.calls[0][3][0]).toMatchObject({ content: "here's the café" });
  });
});

