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
  saveWebsite: vi.fn(async (url: string) => url), saveSocials: vi.fn(async (handles: { instagram?: string; facebook?: string }) => handles), startBuild: vi.fn(async () => {}), setField: vi.fn(async () => true), ...over,
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
    expect(result.reply).toMatch(/^Saved the website./);
    expect(result.changed).toBe(true);
  });

  it("answers a plain save itself, with what comes next, and asks the model only once", async () => {
    const { model, seen } = scripted([{ text: "", calls: [call("save_website", { url: "acme.com" })] }, say("never asked")]);
    const result = await turn({ model });
    expect(seen).toHaveLength(1);
    expect(result.reply).toBe("Saved the website.\n\nShall I start the build?\nYou can add Instagram or Facebook handles, documents or images first.");
    expect(result.suggestions).toEqual(["Start the build"]);
    expect(result.saved).toEqual({ website: "acme.com" });
  });

  it("asks for the website after saving only a handle", async () => {
    const { model, seen } = scripted([{ text: "", calls: [call("save_socials", { instagram: "acme" })] }]);
    const result = await turn({ model });
    expect(seen).toHaveLength(1);
    expect(result.reply).toBe("Saved the handles.\n\nWhat is the brand's website?\nNo website? Attach brand documents here instead.");
    expect(result.saved).toEqual({ instagram: "acme" });
  });

  it("adds no next step to a refusal once the KB is built", async () => {
    const { model } = scripted([{ text: "", calls: [call("save_website", { url: "acme.com" })] }]);
    const result = await turn({ ctx: { ...empty, hasVersion: true, kbStatus: "in_review" }, model });
    expect(result.reply).toBe("The website cannot be changed here once the KB is built.");
    expect(result.saved).toEqual({});
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
    const { model } = scripted([{ text: "", calls: [call("save_website", { url: "new.com" })] }, say("Cannot.")]);
    const result = await turn({ ctx: { ...empty, websiteUrl: "https://acme.com", hasVersion: true, kbStatus: "ready" }, actions: a, model });
    expect(a.saveWebsite).not.toHaveBeenCalled();
    expect(result.reply).toBe("The website cannot be changed here once the KB is built.");
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

// ── Part 2: answering the review walk ─────────────────────────────────────────

import { reviewFields, REVIEW_FIELD_PATHS } from "../review";
import { kbWith } from "@/lib/kb/__tests__/fixtures";

describe("runKbTurn in review", () => {
  const inReview: KbContext = { ...empty, websiteUrl: "https://acme.com", hasVersion: true, kbStatus: "in_review", unreviewed: [] };
  const AGE = "target_audience.age_range";
  const PAINS = "target_audience.pain_points";
  const reviewOf = (over: Parameters<typeof kbWith>[0] = {}, pending: string | null = AGE) => ({ fields: reviewFields(kbWith(over)), pending });
  const withField = () => {
    const setField = vi.fn(async () => true);
    return { setField, a: actions({ setField }) };
  };

  it("knows all 43 fields by path", () => {
    expect(REVIEW_FIELD_PATHS).toHaveLength(43);
    expect(REVIEW_FIELD_PATHS).toContain("creative_direction.video.pacing");
  });

  it("saves the person's answer as an edit they stated", async () => {
    const { setField, a } = withField();
    const { model } = scripted([{ text: "", calls: [call("answer_field", { field: AGE, value: "30 to 45" })] }, say("Noted.")]);
    const result = await turn({ ctx: inReview, review: reviewOf(), actions: a, model, text: "it is 30 to 45" });
    expect(setField).toHaveBeenCalledWith(AGE, { value: "30 to 45", status: "edited", evidence_type: "explicit", confidence: "high" });
    expect(result.walk).toEqual({ settled: [AGE], skipped: false, more: false, stopped: false });
    expect(result.changed).toBe(true);
  });

  it("approves the value when the person agrees", async () => {
    const { setField, a } = withField();
    const { model } = scripted([{ text: "", calls: [call("confirm_field", { field: AGE })] }, say("Good.")]);
    const result = await turn({ ctx: inReview, review: reviewOf(), actions: a, model });
    expect(setField).toHaveBeenCalledWith(AGE, { status: "approved" });
    expect(result.walk.settled).toEqual([AGE]);
  });

  it("turns one string into a list for a list field, and a list into text for a text field", async () => {
    const { setField, a } = withField();
    const { model } = scripted([
      { text: "", calls: [call("answer_field", { field: PAINS, value: "dry skin, breakouts\n redness " }, "c1"), call("answer_field", { field: AGE, value: ["25", "40"] }, "c2")] },
      say("Saved."),
    ]);
    await turn({ ctx: inReview, review: reviewOf(), actions: a, model });
    expect(setField).toHaveBeenCalledWith(PAINS, expect.objectContaining({ value: ["dry skin", "breakouts", "redness"] }));
    expect(setField).toHaveBeenCalledWith(AGE, expect.objectContaining({ value: "25, 40" }));
  });

  it("refuses a field that is already reviewed, and writes nothing", async () => {
    const { setField, a } = withField();
    const { model, seen } = scripted([
      { text: "", calls: [call("answer_field", { field: AGE, value: "30 to 45" }, "c1"), call("confirm_field", { field: AGE }, "c2")] },
      say("It is already reviewed."),
    ]);
    const result = await turn({ ctx: inReview, review: reviewOf({ [AGE]: { status: "approved" } }, null), actions: a, model });
    expect(setField).not.toHaveBeenCalled();
    expect(outputs(seen)).toEqual(Array(2).fill("That field is already reviewed. It can be edited on the right. Proposing changes from the chat comes in a later step."));
    expect(result.walk.settled).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it("refuses when the field was reviewed by someone else while the model was thinking", async () => {
    // The stored row is what decides: the write reports that it changed nothing.
    const setField = vi.fn(async () => false);
    const { model, seen } = scripted([{ text: "", calls: [call("answer_field", { field: AGE, value: "30 to 45" })] }, say("It was just reviewed.")]);
    const result = await turn({ ctx: inReview, review: reviewOf(), actions: actions({ setField }), model });
    expect(outputs(seen)).toEqual(["That field is already reviewed. It can be edited on the right. Proposing changes from the chat comes in a later step."]);
    expect(result.walk.settled).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it("refuses the second write to a field it settled earlier in the same turn", async () => {
    const { setField, a } = withField();
    const { model } = scripted([
      { text: "", calls: [call("confirm_field", { field: AGE }, "c1"), call("answer_field", { field: AGE, value: "other" }, "c2")] },
      say("ok"),
    ]);
    await turn({ ctx: inReview, review: reviewOf(), actions: a, model });
    expect(setField).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty answer", async () => {
    const { setField, a } = withField();
    const { model, seen } = scripted([{ text: "", calls: [call("answer_field", { field: PAINS, value: " , " })] }, say("ok")]);
    await turn({ ctx: inReview, review: reviewOf(), actions: a, model });
    expect(setField).not.toHaveBeenCalled();
    expect(outputs(seen)).toEqual(["No value was given."]);
  });

  it("refuses to answer a field when no KB is in review", async () => {
    const { setField, a } = withField();
    const { model, seen } = scripted([{ text: "", calls: [call("answer_field", { field: AGE, value: "30" })] }, say("ok")]);
    await turn({ ctx: empty, review: null, actions: a, model });
    expect(setField).not.toHaveBeenCalled();
    expect(outputs(seen)).toEqual(["There is no brand KB in review to answer about."]);
  });

  it("skips only a question that is waiting, and records what the person asked of the walk", async () => {
    const { model, seen } = scripted([{ text: "", calls: [call("skip_question", {}, "c1"), call("keep_asking", {}, "c2")] }, say("ok")]);
    const skipped = await turn({ ctx: inReview, review: reviewOf(), model });
    expect(skipped.walk).toEqual({ settled: [], skipped: true, more: true, stopped: false });
    expect(skipped.changed).toBe(false);

    const none = scripted([{ text: "", calls: [call("skip_question", {}), call("stop_asking", {}, "c2")] }, say("ok")]);
    const result = await turn({ ctx: inReview, review: reviewOf({}, null), model: none.model });
    expect(outputs(none.seen)[0]).toBe("No question is waiting.");
    expect(result.walk).toEqual({ settled: [], skipped: false, more: false, stopped: true });
    expect(seen).toHaveLength(2);
  });

  it("has no tool that approves the KB", async () => {
    const { model, seen } = scripted([say("Only you can approve it.")]);
    await turn({ ctx: inReview, review: reviewOf(), model });
    expect(Object.keys(seen[0].tools).filter((name) => /approve|ready/i.test(name))).toEqual([]);
  });

  it("tells the model the pending question and each field's state", async () => {
    const { model, seen } = scripted([say("ok")]);
    await turn({ ctx: inReview, review: reviewOf({ [AGE]: { evidence_type: "inferred", value: "25 to 40" } }), model });
    expect(seen[0].system).toContain(`The question waiting for an answer is about: ${AGE}`);
    expect(seen[0].system).toContain(`${AGE} | Audience & Casting · Age Range | inferred | not reviewed | 25 to 40`);
    expect(seen[0].system).toContain("never ask about another field yourself");
  });
});
