import { describe, it, expect, vi } from "vitest";
import { parseScriptNode } from "./parse-script-node";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noSleep = () => Promise.resolve();

describe("parseScriptNode", () => {
  it("returns the parsed output on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { output: { title: "Golu starts today" } }));
    const result = await parseScriptNode("n1", "text", { fetchImpl, sleep: noSleep });
    expect(result).toEqual({ ok: true, output: { title: "Golu starts today" } });
    expect(fetchImpl).toHaveBeenCalledWith("/api/nodes/n1/parse", expect.objectContaining({ method: "POST", body: JSON.stringify({ source: "text" }) }));
  });

  it("retries while the node is still autosaving, then succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(404, { error: "Node not found." }))
      .mockResolvedValueOnce(json(200, { output: { title: "x" } }));
    const sleep = vi.fn(noSleep);
    const result = await parseScriptNode("n1", "text", { fetchImpl, sleep, waitMs: 900 });
    expect(result.ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(900);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up as 'saving' after the last attempt still 404s", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(404, { error: "Node not found." }));
    const result = await parseScriptNode("n1", "text", { fetchImpl, sleep: noSleep, attempts: 3 });
    expect(result).toMatchObject({ ok: false, reason: "saving" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("reports the server's error without retrying a real failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(500, { error: "Extraction failed" }));
    const result = await parseScriptNode("n1", "text", { fetchImpl, sleep: noSleep });
    expect(result).toEqual({ ok: false, reason: "failed", error: "Extraction failed" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to a plain message when the error body is not JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("oops", { status: 502 }));
    const result = await parseScriptNode("n1", "text", { fetchImpl, sleep: noSleep });
    expect(result).toEqual({ ok: false, reason: "failed", error: "Parsing failed." });
  });
});
