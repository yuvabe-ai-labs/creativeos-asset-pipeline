import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentAnswerError, MAX_AGENT_ROUNDS, runAgent, type AgentModel, type AgentTool } from "../agent";

type ModelInput = Parameters<AgentModel>[0];
type ModelOutput = Awaited<ReturnType<AgentModel>>;

/** A model that returns the scripted responses in order and records what it was given. */
function scripted(responses: ModelOutput[]) {
  const seen: ModelInput[] = [];
  const model: AgentModel = async (input) => {
    seen.push({ ...input, rounds: [...input.rounds] });
    return responses[Math.min(seen.length - 1, responses.length - 1)];
  };
  return { model, seen };
}

const saveWebsite = (run = vi.fn(async () => "Saved.")): Record<string, AgentTool> => ({
  save_website: { description: "Save the website", schema: z.object({ url: z.string() }), run },
});
const base = { system: "sys", messages: [{ role: "user" as const, content: "hi" }] };
const call = (name: string, args: unknown, id = "c1") => ({ id, name, args });

describe("runAgent", () => {
  it("returns the text when the model calls nothing", async () => {
    const { model, seen } = scripted([{ text: "Hello", calls: [] }]);
    expect(await runAgent({ ...base, model, tools: saveWebsite() })).toEqual({ text: "Hello", ran: [] });
    expect(seen).toHaveLength(1);
  });

  it("runs a tool, feeds its output back and returns the next reply", async () => {
    const run = vi.fn(async () => "Saved.");
    const { model, seen } = scripted([
      { text: "", calls: [call("save_website", { url: "acme.com" })] },
      { text: "Done, saved it.", calls: [] },
    ]);
    const result = await runAgent({ ...base, model, tools: saveWebsite(run) });
    expect(run).toHaveBeenCalledWith({ url: "acme.com" });
    expect(seen[1].rounds[0].results).toEqual([{ id: "c1", output: "Saved." }]);
    expect(result).toEqual({ text: "Done, saved it.", ran: ["save_website"] });
  });

  it("tells the model when it asks for a tool that does not exist", async () => {
    const { model, seen } = scripted([{ text: "", calls: [call("delete_everything", {})] }, { text: "Sorry.", calls: [] }]);
    const result = await runAgent({ ...base, model, tools: saveWebsite() });
    expect(seen[1].rounds[0].results).toEqual([{ id: "c1", output: "Error: no such tool." }]);
    expect(result.ran).toEqual([]);
  });

  it("does not run a tool whose arguments fail its schema", async () => {
    const run = vi.fn(async () => "Saved.");
    const { model, seen } = scripted([{ text: "", calls: [call("save_website", { url: 42 })] }, { text: "Hm.", calls: [] }]);
    const result = await runAgent({ ...base, model, tools: saveWebsite(run) });
    expect(run).not.toHaveBeenCalled();
    expect(seen[1].rounds[0].results[0].output).toMatch(/^Error: invalid arguments/);
    expect(result.ran).toEqual([]);
  });

  it("reports a tool that throws and still returns a reply", async () => {
    const run = vi.fn(async () => { throw new Error("boom"); });
    const { model, seen } = scripted([{ text: "", calls: [call("save_website", { url: "a.com" })] }, { text: "It failed.", calls: [] }]);
    const result = await runAgent({ ...base, model, tools: saveWebsite(run) });
    expect(seen[1].rounds[0].results).toEqual([{ id: "c1", output: "Error: boom" }]);
    expect(result).toEqual({ text: "It failed.", ran: [] });
  });

  it("takes the tools away after the last round, so a model that never stops must answer", async () => {
    const { model, seen } = scripted([{ text: "", calls: [call("save_website", { url: "a.com" })] }]);
    const result = await runAgent({ ...base, model, tools: saveWebsite() });
    expect(seen).toHaveLength(MAX_AGENT_ROUNDS + 1);
    expect(Object.keys(seen[MAX_AGENT_ROUNDS].tools)).toEqual([]);
    expect(Object.keys(seen[0].tools)).toEqual(["save_website"]);
    expect(result.text).toBe("Done.");
  });

  describe("with a strict answer", () => {
    const answer = z.object({ angles: z.array(z.string()).length(3) });

    it("returns the checked answer after a tool round, and gives every call the schema", async () => {
      const { model, seen } = scripted([
        { text: "", calls: [call("save_website", { url: "a.com" })] },
        { text: "", calls: [], answer: { angles: ["a", "b", "c"] } },
      ]);
      const result = await runAgent({ ...base, model, tools: saveWebsite(), answer });
      expect(result.answer).toEqual({ angles: ["a", "b", "c"] });
      expect(result.ran).toEqual(["save_website"]);
      expect(seen.every((input) => input.answer === answer)).toBe(true);
    });

    it("fails clearly when the final answer does not fit", async () => {
      const { model } = scripted([{ text: "", calls: [], answer: { angles: ["a"] } }]);
      await expect(runAgent({ ...base, model, tools: {}, answer })).rejects.toBeInstanceOf(AgentAnswerError);
    });
  });

  it("ends the turn after a round of tools that end it, without asking the model again", async () => {
    const tools = saveWebsite();
    tools.save_website.ends = true;
    const { model, seen } = scripted([{ text: "", calls: [call("save_website", { url: "acme.com" })] }, { text: "never asked", calls: [] }]);
    expect(await runAgent({ ...base, model, tools })).toEqual({ text: "Done.", ran: ["save_website"] });
    expect(seen).toHaveLength(1);
  });

  it("keeps the words the model wrote beside the calls that ended the turn", async () => {
    const tools = saveWebsite();
    tools.save_website.ends = true;
    const { model } = scripted([{ text: "Saving that now.", calls: [call("save_website", { url: "acme.com" })] }]);
    expect((await runAgent({ ...base, model, tools })).text).toBe("Saving that now.");
  });

  it("asks the model again when a tool that ends the turn failed", async () => {
    const tools = saveWebsite(vi.fn(async () => { throw new Error("not a website"); }));
    tools.save_website.ends = true;
    const { model, seen } = scripted([{ text: "", calls: [call("save_website", { url: "x" })] }, { text: "That is not a website.", calls: [] }]);
    expect((await runAgent({ ...base, model, tools })).text).toBe("That is not a website.");
    expect(seen).toHaveLength(2);
  });

  it("asks the model again when the round also held a tool that does not end the turn", async () => {
    const tools: Record<string, AgentTool> = { ...saveWebsite(), other: { description: "x", schema: z.object({}), run: async () => "ok" } };
    tools.save_website.ends = true;
    const { model, seen } = scripted([{ text: "", calls: [call("save_website", { url: "acme.com" }, "c1"), call("other", {}, "c2")] }, { text: "Both done.", calls: [] }]);
    expect((await runAgent({ ...base, model, tools })).text).toBe("Both done.");
    expect(seen).toHaveLength(2);
  });

  it("does not end early when a structured answer is owed", async () => {
    const tools = saveWebsite();
    tools.save_website.ends = true;
    const { model, seen } = scripted([{ text: "", calls: [call("save_website", { url: "acme.com" })] }, { text: "", calls: [], answer: { ok: true } }]);
    const result = await runAgent({ ...base, model, tools, answer: z.object({ ok: z.boolean() }) });
    expect(result.answer).toEqual({ ok: true });
    expect(seen).toHaveLength(2);
  });
});

/** A scripted model that also writes: each response may carry the pieces of text it sends through
 *  `onText` before it returns. */
function writing(responses: (ModelOutput & { deltas?: string[] })[]) {
  const seen: ModelInput[] = [];
  const model: AgentModel = async (input) => {
    seen.push({ ...input, rounds: [...input.rounds] });
    const { deltas, ...response } = responses[Math.min(seen.length - 1, responses.length - 1)];
    for (const delta of deltas ?? []) input.onText?.(delta);
    return response;
  };
  return { model, seen };
}

describe("runAgent, reporting as it goes", () => {
  /** Callbacks that record everything in the order it happened. */
  function recorder() {
    const order: string[] = [];
    return { order, on: { text: (d: string) => order.push(`text:${d}`), reset: () => order.push("reset"), step: (l: string) => order.push(`step:${l}`) } };
  }

  it("passes the model's words on as they are written", async () => {
    const { model } = writing([{ text: "Hello", calls: [], deltas: ["Hel", "lo"] }]);
    const { order, on } = recorder();
    await runAgent({ ...base, model, tools: saveWebsite(), on });
    expect(order).toEqual(["text:Hel", "text:lo"]);
  });

  it("clears words the model wrote before it asked for a tool", async () => {
    const { model } = writing([
      { text: "Let me", calls: [call("save_website", { url: "acme.com" })], deltas: ["Let me"] },
      { text: "Saved.", calls: [], deltas: ["Saved."] },
    ]);
    const { order, on } = recorder();
    await runAgent({ ...base, model, tools: saveWebsite(), on });
    expect(order).toEqual(["text:Let me", "reset", "text:Saved."]);
  });

  it("does not clear anything when the round with a tool wrote no words", async () => {
    const { model } = writing([{ text: "", calls: [call("save_website", { url: "acme.com" })] }, { text: "Saved.", calls: [], deltas: ["Saved."] }]);
    const { order, on } = recorder();
    await runAgent({ ...base, model, tools: saveWebsite(), on });
    expect(order).toEqual(["text:Saved."]);
  });

  it("names the step before a labelled tool runs, and says nothing for an unlabelled one", async () => {
    const { order, on } = recorder();
    const tools: Record<string, AgentTool> = {
      save_website: { description: "x", schema: z.object({ url: z.string() }), label: "Saving the website…", run: async () => { order.push("ran:save_website"); return "ok"; } },
      other: { description: "x", schema: z.object({}), run: async () => { order.push("ran:other"); return "ok"; } },
    };
    const { model } = writing([{ text: "", calls: [call("save_website", { url: "acme.com" }, "c1"), call("other", {}, "c2")] }, { text: "Done both.", calls: [] }]);
    await runAgent({ ...base, model, tools, on });
    expect(order).toEqual(["step:Saving the website…", "ran:save_website", "ran:other"]);
  });

  it("gives the model no way to send words when a structured answer is owed", async () => {
    const { model, seen } = writing([{ text: "", calls: [], answer: { ok: true }, deltas: ["{"] }]);
    const { order, on } = recorder();
    await runAgent({ ...base, model, tools: {}, answer: z.object({ ok: z.boolean() }), on });
    expect(seen[0].onText).toBeUndefined();
    expect(order).toEqual([]);
  });

  it("gives the model no way to send words when nobody is listening for them", async () => {
    const { model, seen } = writing([{ text: "Hello", calls: [], deltas: ["Hello"] }]);
    expect(await runAgent({ ...base, model, tools: saveWebsite() })).toEqual({ text: "Hello", ran: [] });
    expect(seen[0].onText).toBeUndefined();
  });
});
