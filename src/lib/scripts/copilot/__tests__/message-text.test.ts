import { describe, it, expect } from "vitest";
import { messageParagraphs } from "../message-text";
import { openingMessage, questionFor } from "../brief";

describe("messageParagraphs", () => {
  it("lifts the copilot's question out of the opening, with its hint after it", () => {
    const parts = messageParagraphs(openingMessage({ clientName: "Jackfruit 365", formats: ["UGC"], hasKb: true }));
    expect(parts).toEqual([
      { kind: "text", text: "Working from Jackfruit 365's brand KB, house rules included." },
      { kind: "text", text: "Four things before I write: format, occasion, who leads, angle." },
      { kind: "question", question: "What format is this reel?", hint: "Pick one below or describe your own." },
    ]);
  });

  it("reads every fixed question as a question, after an acknowledgement", () => {
    const occasion = messageParagraphs(`UGC it is.\n\n${questionFor("occasion", { formats: [], avatars: [] })}`);
    expect(occasion[1]).toEqual({ kind: "question", question: "What's the occasion or theme, and the post date if you have one?", hint: "" });
    expect(messageParagraphs(questionFor("lead", { formats: [], avatars: [] }))[0].kind).toBe("question");
  });

  it("leaves a paragraph that only ends in a question as plain text", () => {
    expect(messageParagraphs("I tightened the hook. Want the payoff warmer too?")).toEqual([
      { kind: "text", text: "I tightened the hook. Want the payoff warmer too?" },
    ]);
  });
});
