import { describe, it, expect } from "vitest";
import { scriptCopilotPrompt } from "../script-copilot";
import { clientTermsIn } from "@/lib/scripts/copilot/client-terms";

const SAFETY_LINE = "Follow the client's compliance rules in its KB. Never make up a testimonial, a number or a claim the KB doesn't give.";
const allText = [scriptCopilotPrompt.rules, ...Object.values(scriptCopilotPrompt.tasks)].join("\n");

describe("the script copilot's shared instructions", () => {
  it("name no client, product, food, festival or one client's reel formula (brand-neutral spec §2.1)", () => {
    expect(clientTermsIn(allText)).toEqual([]);
  });

  it("keep the one shared safety line, word for word", () => {
    expect(scriptCopilotPrompt.rules).toContain(SAFETY_LINE);
  });

  it("lets the script and brief win over an older message in the conversation", () => {
    expect(scriptCopilotPrompt.rules).toContain("When the conversation so far and the script or brief disagree, the script and brief win.");
  });

  // D447 — the copilot names products and places and sets each shot's picks, never their pictures.
  it("asks for products and locations in the draft, the import and the edits, never their pictures", () => {
    const { draft, edit, import: imp } = scriptCopilotPrompt.tasks;
    for (const t of [draft, imp]) {
      expect(t).toMatch(/products/);
      expect(t).toMatch(/locations/);
    }
    for (const o of ["add_product", "update_product", "remove_product", "add_location", "update_location", "remove_location"]) {
      expect(edit).toContain(o);
    }
    expect(draft).toMatch(/You never add pictures/);
    expect(edit).toMatch(/Never set or describe pictures/);
  });

  // D447 — the user saw "ordinary pair of slippers", the brand alone and "coffee" as a place.
  it("names products as sold and places as places, the same way in the draft, the import and the edits", () => {
    const { draft, edit, import: imp } = scriptCopilotPrompt.tasks;
    for (const t of [draft, edit, imp]) {
      expect(t).toMatch(/Never the brand on its own, never a competitor's product, and never an ordinary prop/);
      expect(t).toMatch(/Name a product the way the client sells it/);
      expect(t).toMatch(/Name a location as the place/);
      expect(t).toMatch(/Shots in the same place share one location/);
    }
  });

  it("is version 6", () => {
    expect(scriptCopilotPrompt.version).toBe(7);
  });

  it("commit each angle to a product moment and proof, with a review theme only where reviews fit", () => {
    const angles = scriptCopilotPrompt.tasks.angles;
    expect(angles).toContain("productMoment");
    expect(angles).toContain("proof");
    expect(angles).not.toContain("mealMoment");
    expect(angles).toMatch(/reviewTheme[^.]*"" unless/);
  });

  // Final review (spec §6): a client with no KB and no signals is still offered occasions.
  it("offer calendar occasions when there is no brand KB or market signal to draw on", () => {
    expect(scriptCopilotPrompt.tasks.extract).toContain("With no brand KB and no market signals, suggest occasions coming up in the calendar.");
  });

  it("ask every writing step for brand-aware suggestions", () => {
    for (const task of ["extract", "angles", "card", "draft", "edit"] as const) {
      expect(scriptCopilotPrompt.tasks[task]).toContain("suggestions:");
    }
  });
});

describe("the script copilot's card and draft prompts", () => {
  it("gives the card its exact short labels, so no instruction leaks into a label", () => {
    expect(scriptCopilotPrompt.tasks.card).toContain(
      'Use exactly these labels, in this order where they apply: "Format", "Post date", "Occasion", "Region", "Setting", "Product moment", "Review", "Proof", "Disclaimers".',
    );
    expect(scriptCopilotPrompt.tasks.card).not.toMatch(/Disclaimers \(which apply/);
  });

  it("lists the beats on the card, and the draft follows them", () => {
    expect(scriptCopilotPrompt.tasks.card).toContain("beats:");
    expect(scriptCopilotPrompt.tasks.draft).toContain("Follow the beats on the confirmed card, in order");
  });

  it("names disclaimers by what they say, never by a house code, on the card and in the draft", () => {
    for (const prompt of [scriptCopilotPrompt.tasks.card, scriptCopilotPrompt.tasks.draft]) {
      expect(prompt).toMatch(/never by a code such as "D1"/);
    }
  });
});
