import { describe, expect, it, vi } from "vitest";
import type { AgentModel } from "@/lib/journey/agent";
import type { ThreadMessage } from "@/lib/journey/thread/schema";
import { KB_CONVERSATION_WINDOW } from "../constants";
import type { KbContext } from "../context";
import { BuildAlreadyRunningError, runKbTurn, type KbActions } from "../turn";
import { traceRecorder } from "../../trace/recorder";

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
  documentCount: 0, imageCount: 0, job: null, importing: [], studyingImages: false, importedBefore: [],
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

  it("shows the model a stored status line that has no words, as its lines (D518)", async () => {
    const history: ThreadMessage[] = [{
      id: "m1", role: "assistant", content: "", attachments: [], suggestions: [], createdAt: "",
      card: { kind: "status", lines: [{ text: "Could not collect images and video from Instagram. You can try again from Brand assets.", state: "failed" }] },
    }];
    const { model, seen } = scripted([say("ok")]);
    await turn({ model, history });
    expect(seen[0].messages[0]).toEqual({ role: "assistant", content: "Could not collect images and video from Instagram. You can try again from Brand assets." });
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
    expect(outputs(seen)).toEqual(Array(2).fill("That field is already reviewed. Use propose_change to suggest a new value; the person approves it."));
    expect(result.walk.settled).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it("refuses when the field was reviewed by someone else while the model was thinking", async () => {
    // The stored row is what decides: the write reports that it changed nothing.
    const setField = vi.fn(async () => false);
    const { model, seen } = scripted([{ text: "", calls: [call("answer_field", { field: AGE, value: "30 to 45" })] }, say("It was just reviewed.")]);
    const result = await turn({ ctx: inReview, review: reviewOf(), actions: actions({ setField }), model });
    expect(outputs(seen)).toEqual(["That field is already reviewed. Use propose_change to suggest a new value; the person approves it."]);
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

  it("carries out 'Yes, that's right' on the waiting field itself, without asking the model (D519)", async () => {
    const { setField, a } = withField();
    const model = vi.fn(async () => { throw new Error("the model must not be asked"); });
    const result = await turn({ ctx: inReview, review: reviewOf(), actions: a, model, text: "Yes, that's right" });
    expect(model).not.toHaveBeenCalled();
    expect(setField).toHaveBeenCalledWith(AGE, { status: "approved" });
    expect(result.walk).toEqual({ settled: [AGE], skipped: false, more: false, stopped: false });
    expect(result.reply).toBe("Marked Age Range as right.");
    expect(result.changed).toBe(true);
  });

  it("carries out the walk's other buttons with a reply worded by code", async () => {
    const model = vi.fn(async () => { throw new Error("the model must not be asked"); });
    const skipped = await turn({ ctx: inReview, review: reviewOf(), model, text: "Skip this one" });
    expect(skipped.walk.skipped).toBe(true);
    expect(skipped.reply).toBe("Skipped. It stays for you to review on the right.");
    const more = await turn({ ctx: inReview, review: reviewOf({}, null), model, text: "Keep asking" });
    expect(more.walk.more).toBe(true);
    expect(more.reply).toBe("Sure.");
    const stopped = await turn({ ctx: inReview, review: reviewOf({}, null), model, text: "I'll review the rest" });
    expect(stopped.walk.stopped).toBe(true);
    expect(stopped.reply).toBe("No more questions. The rest is for you to review on the right.");
    expect(model).not.toHaveBeenCalled();
  });

  it("says plainly when a confirmed field turned out to be reviewed already", async () => {
    const setField = vi.fn(async () => false);
    const model = vi.fn(async () => { throw new Error("the model must not be asked"); });
    const result = await turn({ ctx: inReview, review: reviewOf(), actions: actions({ setField }), model, text: "Yes, that's right" });
    expect(result.reply).toMatch(/already reviewed/);
    expect(result.walk.settled).toEqual([]);
  });

  it("still asks the model when a button's words come with a file", async () => {
    const { model, seen } = scripted([say("ok")]);
    await turn({ ctx: inReview, review: reviewOf(), model, text: "Yes, that's right", attachments: [{ kind: "document", id: "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11", name: "brand.pdf", url: null }] });
    expect(seen).toHaveLength(1);
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

// ── Showing work as it happens (D514) ────────────────────────────────────────

describe("runKbTurn, reporting as it goes", () => {
  const inReview: KbContext = { ...empty, websiteUrl: "https://acme.com", hasVersion: true, kbStatus: "in_review", unreviewed: [] };
  const AGE = "target_audience.age_range";
  const review = () => ({ fields: reviewFields(kbWith({})), pending: AGE });

  it("reports a saved website the moment it is stored", async () => {
    const saved = vi.fn();
    const { model } = scripted([{ text: "", calls: [call("save_website", { url: "acme.com" })] }]);
    await turn({ model, on: { saved } });
    expect(saved).toHaveBeenCalledWith({ website: "acme.com" });
  });

  it("reports only the handles that were stored", async () => {
    const saved = vi.fn();
    const { model } = scripted([{ text: "", calls: [call("save_socials", { instagram: "acme" })] }]);
    await turn({ model, on: { saved } });
    expect(saved).toHaveBeenCalledWith({ instagram: "acme" });
  });

  it("says the page changed when a field is written", async () => {
    const page = vi.fn();
    const { model } = scripted([{ text: "", calls: [call("answer_field", { field: AGE, value: "30 to 50" })] }, say("Good.")]);
    await turn({ ctx: inReview, review: review(), model, on: { page } });
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("says the page changed when a build starts", async () => {
    const page = vi.fn();
    const { model } = scripted([{ text: "", calls: [call("start_build", {})] }, say("Started.")]);
    await turn({ ctx: { ...empty, documentCount: 1 }, model, on: { page } });
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("does not say the page changed when a write was refused", async () => {
    const page = vi.fn();
    const refusedField = scripted([{ text: "", calls: [call("answer_field", { field: AGE, value: "30 to 50" })] }, say("It was reviewed already.")]);
    await turn({ ctx: inReview, review: review(), actions: actions({ setField: vi.fn(async () => false) }), model: refusedField.model, on: { page } });
    const refusedBuild = scripted([{ text: "", calls: [call("start_build", {})] }, say("One is running.")]);
    await turn({ ctx: { ...empty, documentCount: 1, job: { status: "researching", phaseMessage: null } }, model: refusedBuild.model, on: { page } });
    expect(page).not.toHaveBeenCalled();
  });

  it("labels the tools that change the page, and no others", async () => {
    const { model, seen } = scripted([say("ok")]);
    await turn({ model });
    const labels = Object.fromEntries(Object.entries(seen[0].tools).flatMap(([name, tool]) => (tool.label ? [[name, tool.label]] : [])));
    expect(labels).toEqual({
      save_website: "Saving the website…", save_socials: "Saving the handles…",
      answer_field: "Saving your answer…", confirm_field: "Saving your answer…", start_build: "Starting the build…",
      propose_change: "Preparing the change…",
    });
  });

  it("passes the model's words, a reset and the step through", async () => {
    const order: string[] = [];
    const model: AgentModel = async (input) => {
      if (input.rounds.length === 0) {
        input.onText?.("Let me");
        return { text: "Let me", calls: [call("start_build", {})] };
      }
      input.onText?.("Started.");
      return { text: "Started.", calls: [] };
    };
    await turn({
      ctx: { ...empty, documentCount: 1 }, model,
      on: { text: (d) => order.push(`text:${d}`), reset: () => order.push("reset"), step: (l) => order.push(`step:${l}`), page: () => order.push("page") },
    });
    expect(order).toEqual(["text:Let me", "reset", "step:Starting the build…", "page", "text:Started."]);
  });

  it("keeps the words the model wrote beside its reply buttons, and offers those buttons", async () => {
    const { model, seen } = scripted([{ text: "Shall I start?", calls: [call("reply_choices", { choices: ["Start the build"] })] }, say("never asked")]);
    const result = await turn({ ctx: { ...empty, documentCount: 1 }, model });
    expect(seen).toHaveLength(1);
    expect(result.reply).toBe("Shall I start?");
    expect(result.suggestions).toEqual(["Start the build"]);
  });
});

// ── Change cards (piece 2.3, D517) ───────────────────────────────────────────

describe("runKbTurn, changing reviewed fields", () => {
  const V1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11";
  const TONE = "brand_profile.tone_of_voice";
  const WORDS = "compliance.never_use_words";
  const AGE = "target_audience.age_range";
  const approved: KbContext = { ...empty, websiteUrl: "https://acme.com", hasVersion: true, kbStatus: "ready", unreviewed: [] };
  const output = kbWith({ [TONE]: { value: "Warm", status: "approved" }, [WORDS]: { value: ["cheap"], status: "edited" } });
  const kb = { versionId: V1, output };

  it("turns a change to a reviewed field into a card, sourced to the person, and ends with the fixed reply", async () => {
    const { model, seen } = scripted([{ text: "", calls: [call("propose_change", { changes: [{ field: TONE, value: "Warm and plain" }] })] }, say("never asked")]);
    const result = await turn({ ctx: approved, kb, model });
    expect(seen).toHaveLength(1);
    expect(result.card).toMatchObject({ kind: "change", versionId: V1, status: "pending", fields: [{ path: TONE, before: "Warm", after: "Warm and plain", from: "You, in this chat", docId: null }] });
    expect(result.reply).toBe("Here is the change. Nothing changes until you approve it.");
    expect(result.changed).toBe(false);
  });

  it("labels the step 'Preparing the change…'", async () => {
    const { model, seen } = scripted([say("ok")]);
    await turn({ ctx: approved, kb, model });
    expect(seen[0].tools.propose_change.label).toBe("Preparing the change…");
  });

  it("puts every field of one turn on one card, a list value as a list", async () => {
    const { model } = scripted([{ text: "", calls: [
      call("propose_change", { changes: [{ field: TONE, value: "Plain" }] }, "c1"),
      call("propose_change", { changes: [{ field: WORDS, value: "cheap, chemical-free" }] }, "c2"),
    ] }]);
    const result = await turn({ ctx: approved, kb, model });
    expect(result.card?.fields.map((f) => [f.path, f.after])).toEqual([[TONE, "Plain"], [WORDS, ["cheap", "chemical-free"]]]);
  });

  it("refuses a change that equals what is there, and makes no card", async () => {
    const { model, seen } = scripted([{ text: "", calls: [call("propose_change", { changes: [{ field: TONE, value: " Warm " }] })] }, say("It already says that.")]);
    const result = await turn({ ctx: approved, kb, model });
    expect(outputs(seen)).toEqual(["Error: That is already the value."]);
    expect(result.card).toBeNull();
  });

  // 2026-11-19: "edit the mission statement to …" on an unreviewed field went to propose_change, was
  // refused with "Use answer_field", and the model told the person so instead of saving. The words
  // were the person's own, so code saves them as their answer: no second try left to the model.
  it("saves the person's words for a field nobody has reviewed yet as their answer, during the review", async () => {
    const setField = vi.fn(async () => true);
    const inReview: KbContext = { ...approved, kbStatus: "in_review", unreviewed: [AGE] };
    const { model, seen } = scripted([{ text: "", calls: [call("propose_change", { changes: [{ field: AGE, value: "30 to 50" }] })] }, say("never asked")]);
    const result = await turn({ ctx: inReview, kb, review: { fields: reviewFields(output), pending: null }, actions: actions({ setField }), model });
    expect(setField).toHaveBeenCalledWith(AGE, { value: "30 to 50", status: "edited", evidence_type: "explicit", confidence: "high" });
    expect(seen).toHaveLength(1);
    expect(result.walk.settled).toEqual([AGE]);
    expect(result.card).toBeNull();
    expect(result.reply).toMatch(/^Saved .+\.$/);
    expect(result.changed).toBe(true);
  });

  it("tells the model when a field it would save was reviewed a moment ago, and saves nothing", async () => {
    const setField = vi.fn(async () => false);
    const inReview: KbContext = { ...approved, kbStatus: "in_review", unreviewed: [AGE] };
    const { model, seen } = scripted([{ text: "", calls: [call("propose_change", { changes: [{ field: AGE, value: "30 to 50" }] })] }, say("Someone just reviewed it.")]);
    const result = await turn({ ctx: inReview, kb, review: { fields: reviewFields(output), pending: null }, actions: actions({ setField }), model });
    expect(outputs(seen)).toEqual(["Error: That field was reviewed a moment ago, so nothing was saved."]);
    expect(result.walk.settled).toEqual([]);
    expect(result.card).toBeNull();
  });

  it("still fills an unreviewed field directly during the first review", async () => {
    const setField = vi.fn(async () => true);
    const inReview: KbContext = { ...approved, kbStatus: "in_review", unreviewed: [AGE] };
    const { model } = scripted([{ text: "", calls: [call("answer_field", { field: AGE, value: "30 to 50" })] }, say("Noted.")]);
    const result = await turn({ ctx: inReview, kb, review: { fields: reviewFields(output), pending: null }, actions: actions({ setField }), model });
    expect(setField).toHaveBeenCalled();
    expect(result.card).toBeNull();
  });

  it("refuses answer_field on a reviewed field and points the model to propose_change", async () => {
    const setField = vi.fn(async () => true);
    const { model, seen } = scripted([{ text: "", calls: [call("answer_field", { field: TONE, value: "Bold" })] }, say("ok")]);
    await turn({ ctx: approved, kb, actions: actions({ setField }), model });
    expect(setField).not.toHaveBeenCalled();
    expect(outputs(seen)[0]).toBe("That field is already reviewed. Use propose_change to suggest a new value; the person approves it.");
  });

  it("refuses a change when there is no brand KB yet", async () => {
    const { model, seen } = scripted([{ text: "", calls: [call("propose_change", { changes: [{ field: TONE, value: "Bold" }] })] }, say("ok")]);
    const result = await turn({ model });
    expect(outputs(seen)).toEqual(["Error: There is no brand KB to change yet."]);
    expect(result.card).toBeNull();
  });

  it("tells the model each field's current value on an approved KB, and how to change one", async () => {
    const { model, seen } = scripted([say("ok")]);
    await turn({ ctx: approved, kb, model });
    expect(seen[0].system).toContain(`${TONE} | `);
    expect(seen[0].system).toContain("propose_change");
    expect(seen[0].system).not.toContain("comes in a later step");
  });

describe("runKbTurn, a change that is only partly allowed (review fix)", () => {
  const V1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11";
  const TONE = "brand_profile.tone_of_voice";
  const AGE = "target_audience.age_range";
  const output = kbWith({ [TONE]: { value: "Warm", status: "approved" } });
  const inReview: KbContext = { ...empty, websiteUrl: "https://acme.com", hasVersion: true, kbStatus: "in_review", unreviewed: [AGE] };

  it("puts a reviewed field on the card and saves an unreviewed one, from one call, asking the model once", async () => {
    const setField = vi.fn(async () => true);
    const { model, seen } = scripted([
      { text: "", calls: [call("propose_change", { changes: [{ field: TONE, value: "Plain" }, { field: AGE, value: "30 to 50" }] })] },
      say("never asked"),
    ]);
    const result = await turn({ ctx: inReview, kb: { versionId: V1, output }, review: { fields: reviewFields(output), pending: null }, actions: actions({ setField }), model });
    expect(seen).toHaveLength(1);
    expect(setField).toHaveBeenCalledWith(AGE, expect.objectContaining({ value: "30 to 50", status: "edited" }));
    expect(result.card?.fields.map((f) => f.path)).toEqual([TONE]);
    expect(result.reply).toMatch(/^Saved .+\. Here is the change. Nothing changes until you approve it.$/);
  });

  it("keeps the allowed field on the card and tells the model about the refused one, so it can say so", async () => {
    const WORDS = "compliance.never_use_words";
    const both = kbWith({ [TONE]: { value: "Warm", status: "approved" }, [WORDS]: { value: ["cheap"], status: "edited" } });
    const { model, seen } = scripted([
      { text: "", calls: [call("propose_change", { changes: [{ field: TONE, value: "Plain" }, { field: WORDS, value: "cheap" }] })] },
      say("I added the tone change. The banned words already say that."),
    ]);
    const result = await turn({ ctx: inReview, kb: { versionId: V1, output: both }, review: { fields: reviewFields(both), pending: null }, model });
    expect(seen).toHaveLength(2);
    expect(outputs(seen)[0]).toMatch(/^Error: Added .*Tone of Voice.* to the change. Not added: That is already the value.$/);
    expect(result.card?.fields.map((f) => f.path)).toEqual([TONE]);
  });

  it("tells the model when a later call adds nothing, instead of saying it was added", async () => {
    const { model, seen } = scripted([
      { text: "", calls: [
        call("propose_change", { changes: [{ field: TONE, value: "Plain" }] }, "c1"),
        call("propose_change", { changes: [{ field: TONE, value: "Warm" }] }, "c2"),
      ] },
      say("ok"),
    ]);
    await turn({ ctx: { ...inReview, kbStatus: "ready", unreviewed: [] }, kb: { versionId: V1, output }, model });
    expect(outputs(seen)[1]).toBe("Error: That is already the value.");
  });

  it("no longer says reading new sources comes later, while a KB is in review", async () => {
    const { model, seen } = scripted([say("ok")]);
    await turn({ ctx: inReview, kb: { versionId: V1, output }, review: { fields: reviewFields(output), pending: null }, model });
    expect(seen[0].system).not.toContain("comes in a later step");
    expect(seen[0].system).toContain("read it against the brand KB");
  });
});
});

// ── Turn traces (D521) ───────────────────────────────────────────────────────

describe("runKbTurn, reporting to a trace", () => {
  const AGE = "target_audience.age_range";
  const TONE = "brand_profile.tone_of_voice";
  const inReview: KbContext = { ...empty, websiteUrl: "https://acme.com", hasVersion: true, kbStatus: "in_review", unreviewed: [] };
  const review = (over: Parameters<typeof kbWith>[0] = {}) => ({ fields: reviewFields(kbWith(over)), pending: AGE });

  it("records a reply button carried out by code, with no model call", async () => {
    const recorder = traceRecorder();
    const { model, seen } = scripted([say("never asked")]);
    await turn({ ctx: inReview, review: review(), model, text: "Yes, that's right", trace: recorder });
    expect(seen).toHaveLength(0);
    const rec = recorder.record();
    expect(rec.sent).toBeNull();
    expect(rec.rounds).toEqual([]);
    expect(rec.choice).toMatchObject({ tool: "confirm_field", output: expect.stringMatching(/^Marked .+ as right\.$/) });
  });

  it("records a refusal a tool returns as a sentence", async () => {
    const recorder = traceRecorder();
    const { model } = scripted([{ text: "", calls: [call("answer_field", { field: TONE, value: "Bold" })] }, say("It is reviewed.")]);
    await turn({ ctx: inReview, review: review({ [TONE]: { status: "approved" } }), model, trace: recorder });
    expect(recorder.record().refusals).toEqual(["That field is already reviewed. Use propose_change to suggest a new value; the person approves it."]);
  });

  it("passes the trace to the agent loop", async () => {
    const recorder = traceRecorder();
    const { model } = scripted([say("Hello.")]);
    await turn({ model, trace: recorder });
    expect(recorder.record().sent?.system).toContain("brand KB copilot");
    expect(recorder.record().rounds.map((r) => r.text)).toEqual(["Hello."]);
  });
});

// ── Review fixes (D521 whole-branch review) ──────────────────────────────────

describe("runKbTurn, review fixes", () => {
  const AGE = "target_audience.age_range";
  const inReview: KbContext = { ...empty, websiteUrl: "https://acme.com", hasVersion: true, kbStatus: "in_review", unreviewed: [AGE] };
  const output = kbWith({});
  const kb = { versionId: "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11", output };

  it("ends a save-only change on code's words, not on words the model wrote expecting a card", async () => {
    const { model, seen } = scripted([
      { text: "Here is a change card for the age range. Approve it to apply.", calls: [call("propose_change", { changes: [{ field: AGE, value: "30 to 50" }] })] },
      say("never asked"),
    ]);
    const result = await turn({ ctx: inReview, kb, review: { fields: reviewFields(output), pending: null }, model });
    expect(seen).toHaveLength(1);
    expect(result.card).toBeNull();
    expect(result.reply).toMatch(/^Saved .+\.$/);
  });

  it("keeps the model's words when it was asked again after the save", async () => {
    const { model } = scripted([
      { text: "", calls: [call("propose_change", { changes: [{ field: AGE, value: "30 to 50" }] }, "c1"), call("skip_question", {}, "c2")] },
      say("Saved the age range; nothing was waiting to skip."),
    ]);
    const result = await turn({ ctx: inReview, kb, review: { fields: reviewFields(output), pending: null }, model });
    expect(result.reply).toBe("Saved the age range; nothing was waiting to skip.");
  });

  it("records a reply button whose tool throws, with the error as its output", async () => {
    const recorder = traceRecorder();
    const setField = vi.fn(async () => { throw new Error("network down"); });
    const { model } = scripted([say("never asked")]);
    await expect(turn({ ctx: inReview, review: { fields: reviewFields(output), pending: AGE }, actions: actions({ setField }), model, text: "Yes, that's right", trace: recorder })).rejects.toThrow("network down");
    expect(recorder.record().choice).toMatchObject({ tool: "confirm_field", output: "Error: network down" });
  });
});

// ── The page shows the copilot's work (D520) ────────────────────────────────

describe("runKbTurn, naming what it changes", () => {
  const AGE = "target_audience.age_range";
  const inReview: KbContext = { ...empty, websiteUrl: "https://acme.com", hasVersion: true, kbStatus: "in_review", unreviewed: [AGE] };
  const review = () => ({ fields: reviewFields(kbWith({})), pending: AGE });

  it("reports a review field as being written, then written, around the save", async () => {
    const target = vi.fn();
    const { model } = scripted([{ text: "", calls: [call("answer_field", { field: AGE, value: "30 to 50" })] }, say("Good.")]);
    await turn({ ctx: inReview, review: review(), model, on: { target } });
    expect(target.mock.calls).toEqual([[`kb:${AGE}`, "writing"], [`kb:${AGE}`, "written"]]);
  });

  it("reports a refused write as not written", async () => {
    const target = vi.fn();
    const { model } = scripted([say("never asked")]);
    await turn({ ctx: inReview, review: review(), actions: actions({ setField: vi.fn(async () => false) }), model, text: "Yes, that's right", on: { target } });
    expect(target.mock.calls).toEqual([[`kb:${AGE}`, "writing"], [`kb:${AGE}`, "unwritten"]]);
  });

  it("reports a write that throws as not written, and still throws", async () => {
    const target = vi.fn();
    const { model } = scripted([say("never asked")]);
    await expect(turn({ ctx: inReview, review: review(), actions: actions({ setField: vi.fn(async () => { throw new Error("down"); }) }), model, text: "Yes, that's right", on: { target } })).rejects.toThrow("down");
    expect(target.mock.calls).toEqual([[`kb:${AGE}`, "writing"], [`kb:${AGE}`, "unwritten"]]);
  });

  it("reports 'written' before asking the page to re-read", async () => {
    const seen: string[] = [];
    const { model } = scripted([{ text: "", calls: [call("answer_field", { field: AGE, value: "30 to 50" })] }, say("Good.")]);
    await turn({ ctx: inReview, review: review(), model, on: { target: (_t, phase) => seen.push(phase), page: () => seen.push("page") } });
    expect(seen).toEqual(["writing", "written", "page"]);
  });

  it("reports the website and handles it saves as form targets", async () => {
    const target = vi.fn();
    const site = scripted([{ text: "", calls: [call("save_website", { url: "acme.com" })] }]);
    await turn({ model: site.model, on: { target } });
    expect(target.mock.calls).toEqual([["kb-form:website", "writing"], ["kb-form:website", "written"]]);
    target.mockClear();
    const socials = scripted([{ text: "", calls: [call("save_socials", { instagram: "acme" })] }]);
    await turn({ model: socials.model, on: { target } });
    expect(target.mock.calls).toEqual([["kb-form:instagram", "writing"], ["kb-form:instagram", "written"]]);
  });
});
