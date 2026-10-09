import { describe, it, expect } from "vitest";
import { scriptCopilotPrompt } from "../script-copilot";

describe("the script copilot's card and draft prompts", () => {
  it("gives the card its exact short labels, so no instruction leaks into a label", () => {
    expect(scriptCopilotPrompt.tasks.card).toContain(
      'Use exactly these labels, in this order where they apply: "Format", "Post date", "Occasion", "Region", "Home and kit", "Meal and product use", "Review", "Proof lines", "Disclaimers".',
    );
    expect(scriptCopilotPrompt.tasks.card).not.toMatch(/Disclaimers \(which apply/);
  });

  it("names disclaimers by what they say, never by a house code, on the card and in the draft", () => {
    for (const prompt of [scriptCopilotPrompt.tasks.card, scriptCopilotPrompt.tasks.draft]) {
      expect(prompt).toMatch(/never by a code such as "D1"/);
    }
  });
});
