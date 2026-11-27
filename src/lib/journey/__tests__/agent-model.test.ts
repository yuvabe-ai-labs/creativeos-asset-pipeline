import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.fn();
const stream = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ responses: { create, stream } }) }));

import { z } from "zod";
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
    expect(stream.mock.calls[0][1]).toMatchObject(create.mock.calls[0][1]);
    expect(create.mock.calls[0][1]).toEqual({ timeout: 20_000, maxRetries: 0 });
  });

  it("keeps the model's separate messages apart, instead of gluing them together", async () => {
    // The SDK's output_text joins every message with nothing between: "Confirmed that field.Got it."
    const msg = (id: string, text: string) => ({ type: "message", id, role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] });
    create.mockResolvedValue({ output: [msg("m1", "Confirmed that field."), msg("m2", "Got it.")], output_text: "Confirmed that field.Got it." });
    const out = await openaiAgentModel("m")(base);
    expect(out.text).toBe("Confirmed that field.\n\nGot it.");
  });

  it("reads tool calls from a streamed response as from a plain one", async () => {
    const withCall = { output: [{ type: "function_call", call_id: "c1", name: "save_website", arguments: "{\"url\":\"acme.com\"}" }], output_text: "" };
    stream.mockImplementation(() => ({ on() { return this; }, finalResponse: async () => withCall }));
    const out = await openaiAgentModel("m")({ ...base, onText: vi.fn() });
    expect(out.calls).toEqual([{ id: "c1", name: "save_website", args: { url: "acme.com" } }]);
  });

  it("sends a streamed tool call back without the fields only the SDK adds", async () => {
    // What the SDK's stream helper really returns: each tool call gains parsed_arguments, each
    // message part gains parsed. The API does not accept those back as input.
    const parsed = {
      output: [
        { type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Let me", annotations: [], parsed: null }] },
        { type: "function_call", id: "f1", call_id: "c1", name: "save_website", arguments: "{}", status: "completed", parsed_arguments: null },
      ],
      output_text: "Let me",
    };
    stream.mockImplementationOnce(() => ({ on() { return this; }, finalResponse: async () => parsed }));
    const model = openaiAgentModel("m");
    await model({ ...base, onText: vi.fn() });
    await model({ ...base, onText: vi.fn(), rounds: [{ calls: [{ id: "c1", name: "save_website", args: {} }], results: [{ id: "c1", output: "ok" }] }] });
    const sent = JSON.stringify(stream.mock.calls[1][0].input);
    expect(sent).toContain("save_website");
    expect(sent).not.toContain("parsed_arguments");
    expect(sent).not.toContain("\"parsed\"");
  });

  it("gives a streamed call a limit that covers the whole reply, not only the start of it", async () => {
    await openaiAgentModel("m")({ ...base, onText: vi.fn() });
    expect(stream.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("makes the model call a tool only when asked, and only while that tool is offered", async () => {
    const tool = { description: "d", schema: z.object({}), run: async () => "ok" };
    await openaiAgentModel("m")({ ...base, tools: { propose_change: tool } });
    expect(create.mock.calls[0][0].tool_choice).toBeUndefined();
    await openaiAgentModel("m")({ ...base, tools: { propose_change: tool }, force: "propose_change" });
    expect(create.mock.calls[1][0].tool_choice).toEqual({ type: "function", name: "propose_change" });
    await openaiAgentModel("m")({ ...base, tools: { other: tool }, force: "propose_change" });
    expect(create.mock.calls[2][0].tool_choice).toBeUndefined();
  });
});
