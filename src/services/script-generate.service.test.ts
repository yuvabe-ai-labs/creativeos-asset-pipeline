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

  it("sends a chat message and returns the state", async () => {
    reply({ state: STATE });
    expect(await scriptGenerateService.turn("c1", "s1", "UGC")).toEqual(STATE);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/clients/c1/scripts/s1/turn");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ text: "UGC" }) });
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
