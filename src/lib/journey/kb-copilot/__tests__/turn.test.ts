import { describe, expect, it, vi } from "vitest";
import type { AgentModel } from "@/lib/journey/agent";
import type { ThreadMessage } from "@/lib/journey/thread/schema";
import { KB_CONVERSATION_WINDOW } from "../constants";
import type { KbContext } from "../context";
import { BuildAlreadyRunningError, runKbTurn, type KbActions } from "../turn";

type ModelInput = Parameters<AgentModel>[0];
type ModelOutput = Awaited<ReturnType<AgentModel>>;

function scripted(responses: ModelOutput[]) {
  const seen: ModelInput[] = [];
  const model: AgentModel = async (input) => {
    seen.push({ ...input, rounds: [...input.rounds] });
    return responses[Math.min(seen.length - 1, responses.length - 1)];
  };
  return { model, seen };
}

const empty: KbContext = {
  clientName: "Acme", clientSlug: "acme", unreviewed: null, kbStatus: "pending", hasVersion: false, websiteUrl: null, instagram: null, facebook: null,
  documentCount: 0, imageCount: 0, job: null, importing: [], studyingImages: false, importFailed: [], studyFailed: false, importedBefore: [],
};
const actions = (over: Partial<KbActions> = {}): KbActions => ({
  saveWebsite: vi.fn(async () => {}), saveSocials: vi.fn(async () => {}), startBuild: vi.fn(async () => {}), ...over,
});
const call = (name: string, args: unknown, id = "c1") => ({ id, name, args });
const say = (text: string): ModelOutput => ({ text, calls: [] });
const turn = (over: Partial<Parameters<typeof runKbTurn>[0]>) =>
  runKbTurn({ ctx: empty, history: [], text: "hi", attachments: [], actions: actions(), model: scripted([say("ok")]).model, ...over });
const outputs = (seen: ModelInput[]) => seen[seen.length - 1].rounds.flatMap((r) => r.results.map((x) => x.output));

describe("runKbTurn", () => {
  it("saves the website the model asks for and reports a change", async () => {
    const a = actions();
    const { model } = scripted([{ text: "", calls: [call("save_website", { url: "acme.com" })] }, say("Saved acme.com.")]);
    const result = await turn({ actions: a, model });
    expect(a.saveWebsite).toHaveBeenCalledWith("acme.com");
    expect(result.reply).toBe("Saved acme.com.");
    expect(result.changed).toBe(true);
  });

  it("refuses to start a build while one is running", async () => {
    const a = actions();
    const { model, seen } = scripted([{ text: "", calls: [call("start_build", {})] }, say("One is running.")]);
    const result = await turn({ ctx: { ...empty, websiteUrl: "https://acme.com", job: { status: "researching", phaseMessage: null } }, actions: a, model });
    expect(a.startBuild).not.toHaveBeenCalled();
    expect(outputs(seen)).toEqual(["A build is already running."]);
    expect(result.changed).toBe(false);
  });

  it("refuses to start a build with no website and no document", async () => {
    const a = actions();
    const { model, seen } = scripted([{ text: "", calls: [call("start_build", {})] }, say("I need a source.")]);
    await turn({ actions: a, model });
    expect(a.startBuild).not.toHaveBeenCalled();
    expect(outputs(seen)).toEqual(["I need a website or at least one document first."]);
  });

  it("refuses to start a build once the KB exists", async () => {
    const a = actions();
    const { model, seen } = scripted([{ text: "", calls: [call("start_build", {})] }, say("Already built.")]);
    await turn({ ctx: { ...empty, websiteUrl: "https://acme.com", hasVersion: true, kbStatus: "in_review" }, actions: a, model });
    expect(a.startBuild).not.toHaveBeenCalled();
    expect(outputs(seen)).toEqual(["The brand KB is already built. Changes to it come in a later step."]);
  });

  it("saves the website and starts the build in one turn on an empty client", async () => {
    const a = actions();
    const { model } = scripted([
      { text: "", calls: [call("save_website", { url: "acme.com" }, "c1"), call("start_build", {}, "c2")] },
      say("Saved and started."),
    ]);
    const result = await turn({ actions: a, model });
    expect(a.saveWebsite).toHaveBeenCalledWith("acme.com");
    expect(a.startBuild).toHaveBeenCalledTimes(1);
    expect(result.changed).toBe(true);
  });

  it("does not start a second build in the same turn", async () => {
    const a = actions();
    const { model, seen } = scripted([
      { text: "", calls: [call("start_build", {}, "c1"), call("start_build", {}, "c2")] },
      say("Started."),
    ]);
    await turn({ ctx: { ...empty, documentCount: 1 }, actions: a, model });
    expect(a.startBuild).toHaveBeenCalledTimes(1);
    expect(outputs(seen)).toEqual(["Started the build.", "A build is already running."]);
  });

  it("answers in words when the build was started by someone else a moment ago", async () => {
    const a = actions({ startBuild: vi.fn(async () => { throw new BuildAlreadyRunningError(); }) });
    const { model, seen } = scripted([{ text: "", calls: [call("start_build", {})] }, say("One is running.")]);
    const result = await turn({ ctx: { ...empty, documentCount: 1 }, actions: a, model });
    expect(outputs(seen)).toEqual(["A build is already running."]);
    expect(result.reply).toBe("One is running.");
    expect(result.changed).toBe(false);
  });

  it("says what the tool said when the model adds no words of its own", async () => {
    const { model } = scripted([{ text: "", calls: [call("start_build", {})] }, say("")]);
    const result = await turn({ ctx: { ...empty, websiteUrl: "https://acme.com", job: { status: "researching", phaseMessage: null } }, model });
    expect(result.reply).toBe("A build is already running.");
  });

  it("does not change the website once the KB is built", async () => {
    const a = actions();
    const { model, seen } = scripted([{ text: "", calls: [call("save_website", { url: "new.com" })] }, say("Cannot.")]);
    const result = await turn({ ctx: { ...empty, websiteUrl: "https://acme.com", hasVersion: true, kbStatus: "ready" }, actions: a, model });
    expect(a.saveWebsite).not.toHaveBeenCalled();
    expect(outputs(seen)).toEqual(["The website cannot be changed here once the KB is built."]);
    expect(result.changed).toBe(false);
  });

  it("saves the handles it is given", async () => {
    const a = actions();
    const { model } = scripted([{ text: "", calls: [call("save_socials", { instagram: "acmeskin" })] }, say("Saved.")]);
    const result = await turn({ actions: a, model });
    expect(a.saveSocials).toHaveBeenCalledWith({ instagram: "acmeskin" });
    expect(result.changed).toBe(true);
  });

  it("offers the reply choices the model set", async () => {
    const { model } = scripted([
      { text: "", calls: [call("reply_choices", { choices: ["Yes, start", "Add documents first"] })] },
      say("Shall I start?"),
    ]);
    expect((await turn({ model })).suggestions).toEqual(["Yes, start", "Add documents first"]);
  });

  it("falls back to offering the build when it can start and the model set no choices", async () => {
    expect((await turn({ ctx: { ...empty, documentCount: 1 } })).suggestions).toEqual(["Start the build"]);
  });

  it("offers nothing once the build has just been started", async () => {
    const { model } = scripted([{ text: "", calls: [call("start_build", {})] }, say("Started.")]);
    expect((await turn({ ctx: { ...empty, documentCount: 1 }, model })).suggestions).toEqual([]);
  });

  it("tells the model what was attached", async () => {
    const { model, seen } = scripted([say("Thanks.")]);
    await turn({
      model, text: "Here you go",
      attachments: [
        { kind: "document", id: "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11", name: "brand.pdf", url: null },
        { kind: "image", id: "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c12", name: "hero.png", url: "https://x/hero.png" },
      ],
    });
    const messages = seen[0].messages;
    expect(messages[messages.length - 1]).toEqual({ role: "user", content: "Here you go\nAttached: brand.pdf (document), hero.png (image)" });
  });

  it("sends only the most recent history", async () => {
    const history: ThreadMessage[] = Array.from({ length: KB_CONVERSATION_WINDOW + 5 }, (_, i) => ({
      id: `m${i}`, role: i % 2 ? "assistant" : "user", content: `message ${i}`, card: null, attachments: [], suggestions: [], createdAt: "",
    }));
    const { model, seen } = scripted([say("ok")]);
    await turn({ model, history });
    expect(seen[0].messages).toHaveLength(KB_CONVERSATION_WINDOW + 1);
    expect(seen[0].messages[0].content).toBe("message 5");
  });
});
