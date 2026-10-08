import { describe, it, expect, vi, beforeEach } from "vitest";
import { scriptGenerateService } from "./script-generate.service";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const STATE = { script: { id: "s1" }, messages: [], openItems: [], avatars: [] };

describe("scriptGenerateService", () => {
  it("starts a new script and returns its id", async () => {
    reply({ scriptId: "s1" }, 201);
    expect(await scriptGenerateService.create("c1")).toBe("s1");
    expect(fetchMock).toHaveBeenCalledWith("/api/clients/c1/scripts", expect.objectContaining({ method: "POST" }));
  });

  it("sends a chat message, passes each draft preview on, and returns the state", async () => {
    const draft = { header: { title: "Kerala Piravi" }, context: {}, cast: [], shots: [] };
    // Split mid-line on purpose: the stream may cut a line anywhere.
    const body = `${JSON.stringify({ type: "draft", draft })}\n${JSON.stringify({ type: "state", state: STATE })}\n`;
    const cut = body.length - 10;
    const stream = new ReadableStream({ start(c) { const e = new TextEncoder(); c.enqueue(e.encode(body.slice(0, cut))); c.enqueue(e.encode(body.slice(cut))); c.close(); } });
    fetchMock.mockResolvedValueOnce(new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
    const seen: unknown[] = [];
    expect(await scriptGenerateService.turn("c1", "s1", "UGC", (d) => seen.push(d))).toEqual(STATE);
    expect(seen).toEqual([draft]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/clients/c1/scripts/s1/turn");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ text: "UGC" }) });
  });

  it("throws the stream's error line, and a refused message's JSON error", async () => {
    fetchMock.mockResolvedValueOnce(new Response(`${JSON.stringify({ type: "error", error: "Script not found." })}\n`, { status: 200 }));
    await expect(scriptGenerateService.turn("c1", "s1", "x")).rejects.toThrow("Script not found.");
    reply({ error: "Write a message first." }, 400);
    await expect(scriptGenerateService.turn("c1", "s1", " ")).rejects.toThrow("Write a message first.");
  });

  it("returns the undo with an inline edit", async () => {
    reply({ state: STATE, undo: { path: "shots.s01.vo", before: "Old" } });
    const out = await scriptGenerateService.inlineEdit("c1", "s1", { path: "shots.s01.vo", selectedText: "Old", offset: 0, instruction: "warmer" });
    expect(out.undo).toEqual({ path: "shots.s01.vo", before: "Old" });
  });

  it("throws the server's message", async () => {
    reply({ error: "Not final yet: 1 item is still open (REVIEW (S8): placeholder)." }, 409);
    await expect(scriptGenerateService.markFinal("c1", "s1")).rejects.toThrow("Not final yet");
  });
});
