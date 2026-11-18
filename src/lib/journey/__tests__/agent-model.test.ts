import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.fn();
const stream = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ responses: { create, stream } }) }));

import { openaiAgentModel } from "../agent-model";

const RESPONSE = { output: [], output_text: "Hi" };
const base = { system: "s", messages: [{ role: "user" as const, content: "hello" }], tools: {}, rounds: [] };

describe("openaiAgentModel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    create.mockResolvedValue(RESPONSE);
    // The SDK's stream helper: listeners are attached, then the final response is awaited.
    stream.mockImplementation(() => {
      const handlers: Record<string, (event: { delta: string }) => void> = {};
      const helper = {
        on(event: string, handler: (event: { delta: string }) => void) {
          handlers[event] = handler;
          return helper;
        },
        async finalResponse() {
          handlers["response.output_text.delta"]?.({ delta: "H" });
          handlers["response.output_text.delta"]?.({ delta: "i" });
          return RESPONSE;
        },
      };
      return helper;
    });
  });

  it("streams and forwards each piece of text when words are wanted", async () => {
    const onText = vi.fn();
    const out = await openaiAgentModel("m")({ ...base, onText });
    expect(stream).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(onText.mock.calls.map((c) => c[0])).toEqual(["H", "i"]);
    expect(out).toEqual({ text: "Hi", calls: [] });
  });

  it("does not stream when no words are wanted", async () => {
    const out = await openaiAgentModel("m")(base);
    expect(create).toHaveBeenCalledTimes(1);
    expect(stream).not.toHaveBeenCalled();
    expect(out).toEqual({ text: "Hi", calls: [] });
  });

  it("sends the same request either way, with the same time limit and no retry", async () => {
    await openaiAgentModel("m")(base);
    await openaiAgentModel("m")({ ...base, onText: vi.fn() });
    expect(stream.mock.calls[0][0]).toEqual(create.mock.calls[0][0]);
    expect(stream.mock.calls[0][1]).toEqual(create.mock.calls[0][1]);
    expect(create.mock.calls[0][1]).toEqual({ timeout: 20_000, maxRetries: 0 });
  });

  it("reads tool calls from a streamed response as from a plain one", async () => {
    const withCall = { output: [{ type: "function_call", call_id: "c1", name: "save_website", arguments: "{\"url\":\"acme.com\"}" }], output_text: "" };
    stream.mockImplementation(() => ({ on() { return this; }, finalResponse: async () => withCall }));
    const out = await openaiAgentModel("m")({ ...base, onText: vi.fn() });
    expect(out.calls).toEqual([{ id: "c1", name: "save_website", args: { url: "acme.com" } }]);
  });
});
