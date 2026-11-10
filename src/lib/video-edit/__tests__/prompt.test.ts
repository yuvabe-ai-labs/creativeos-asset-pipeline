import { describe, it, expect } from "vitest";
import { composeVideoEditPrompt, instructionForDisplay, mentionedImageIds, plainInstruction } from "../prompt";

const PACK = { id: "n-pack", label: "Jackfruit 365 pack" };
const NEHA = { id: "n-neha", label: "Neha, front" };

describe("composeVideoEditPrompt", () => {
  it("ends with Google's recommended keep line and sends no control strings", () => {
    const text = composeVideoEditPrompt({ instruction: "  Make the flour beige.  ", references: [] });
    expect(text).toBe("Make the flour beige.\n\nKeep everything else the same.");
  });
  it("lists the references in the order they are attached, in plain words", () => {
    const text = composeVideoEditPrompt({ instruction: "Swap the pack.", references: [PACK, NEHA] });
    expect(text).toContain("Reference images, in the order attached: 1. Jackfruit 365 pack. 2. Neha, front.");
    expect(text).not.toContain("IMAGE_REF");
  });
  it("writes an @-mention as the image's name and position", () => {
    const text = composeVideoEditPrompt({ instruction: "Replace the pot with @[Image: pack](n-pack).", references: [NEHA, PACK] });
    expect(text.startsWith("Replace the pot with Jackfruit 365 pack (reference image 2).")).toBe(true);
  });
});

describe("mentionedImageIds", () => {
  it("returns each mentioned id once, in order", () => {
    expect(mentionedImageIds("@[Image: a](n-a) then @[Image: b](n-b) and @[Image: a](n-a)")).toEqual(["n-a", "n-b"]);
    expect(mentionedImageIds("no mentions")).toEqual([]);
  });
});

describe("plainInstruction", () => {
  it("falls back to the stored name for a mention that isn't attached", () => {
    expect(plainInstruction("Use @[Image: old pack](gone)", [PACK])).toBe("Use Image: old pack");
  });
});

describe("instructionForDisplay", () => {
  it("shows mentions by name", () => {
    expect(instructionForDisplay("Replace the pot with @[Image: pack](n-pack)")).toBe("Replace the pot with pack");
  });
});
