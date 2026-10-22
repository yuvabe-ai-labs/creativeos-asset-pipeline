import { describe, it, expect } from "vitest";
import {
  AVATAR_BRIEF_SYSTEM, avatarBriefSchema, briefToFront, buildAvatarBriefUser, buildAvatarSheetPrompt, fallbackFront,
  SHEET_ORDER, type AvatarBrief,
} from "../avatar-character";
import { AVATAR_DESCRIPTION_MAX, AVATAR_VIEWS } from "@/lib/avatars/constants";

// The cast description that drew a man as a woman on staging (21 Oct 2026).
const rajan = {
  name: "Rajan",
  description: "Her husband Rajan, 58, in a white mundu and shirt, behind her. Warm, a little teasing, English with a Malayalam lilt.",
  setting: "Kerala",
  instructions: "",
};

const brief: AvatarBrief = {
  gender: "Male", age: "55+", ageYears: "58", ethnicity: "South Asian",
  appearance: "Medium build, warm brown skin, short greying hair, a neat moustache.",
  wardrobe: "A white cotton shirt over a white mundu with a thin gold border, brown leather sandals.",
  markers: "",
};

describe("the character brief (D395)", () => {
  it("tells the model the instructions win and other people's pronouns are not this person", () => {
    expect(AVATAR_BRIEF_SYSTEM).toMatch(/instructions override the script/);
    expect(AVATAR_BRIEF_SYSTEM).toMatch(/"her husband"/);
    expect(AVATAR_BRIEF_SYSTEM).toMatch(/Leave out voice, accent, personality/);
  });

  it("sends every part of the context under its own heading, the instructions marked as winning", () => {
    const user = buildAvatarBriefUser({ ...rajan, instructions: "Clean-shaven" });
    expect(user).toContain("## Name\nRajan");
    expect(user).toContain(`## How the script describes them\n${rajan.description}`);
    expect(user).toContain("## Where the script is set\nKerala");
    expect(user).toContain("## The operator's instructions (these win)\nClean-shaven");
    expect(buildAvatarBriefUser(rajan)).toContain("(these win)\n(none)");
  });

  it("only accepts the Studio's own attribute values", () => {
    expect(avatarBriefSchema.safeParse(brief).success).toBe(true);
    expect(avatarBriefSchema.safeParse({ ...brief, gender: "Man" }).success).toBe(false);
  });

  it("restates the person on their own, the gender first, with no trace of anyone else", () => {
    const front = briefToFront(brief);
    expect(front.description.startsWith("A 58-year-old South Asian man.")).toBe(true);
    expect(front.description).not.toMatch(/\bher\b|husband|behind/i);
    expect(front.attributes).toEqual({ gender: "Male", age: "55+", ethnicity: "South Asian" });
  });

  it("stays within what the front route takes", () => {
    expect(briefToFront({ ...brief, wardrobe: "x".repeat(3000) }).description).toHaveLength(AVATAR_DESCRIPTION_MAX);
  });

  it("falls back to the operator's words first, so they still win, and claims no attributes", () => {
    const front = fallbackFront({ ...rajan, instructions: "A man, 58, clean-shaven" });
    expect(front.description.startsWith("A man, 58, clean-shaven Her husband Rajan")).toBe(true);
    expect(front.attributes).toEqual({});
    expect(fallbackFront({ ...rajan, description: "" }).description).toBe("Rajan");
  });
});

describe("the turnaround sheet (D395)", () => {
  const prompt = buildAvatarSheetPrompt();

  it("asks for all four views in one image, in the order the route cuts them", () => {
    expect(SHEET_ORDER).toEqual(AVATAR_VIEWS);
    expect(prompt).toContain("turnaround sheet");
    expect(prompt).toContain("single row, in one wide image");
    expect(prompt.indexOf("1. Front view")).toBeLessThan(prompt.indexOf("2. Left profile"));
    expect(prompt.indexOf("2. Left profile")).toBeLessThan(prompt.indexOf("3. Right profile"));
    expect(prompt.indexOf("3. Right profile")).toBeLessThan(prompt.indexOf("4. Back view"));
  });

  it("states which edge each profile faces, so the two never face the same way (D339)", () => {
    expect(prompt).toContain("nose points to the LEFT edge");
    expect(prompt).toContain("nose points to the RIGHT edge");
  });

  it("lays the figures out so they can be cut apart: own quarter, gaps, no shadows joining them", () => {
    expect(prompt).toContain("centred in its own quarter");
    expect(prompt).toContain("no figure overlaps or touches another");
    expect(prompt).toContain("no cast shadows");
    expect(prompt).toContain("no dividing lines");
  });

  it("holds the person the same, head to toe, in every view", () => {
    expect(prompt).toContain("same person as the reference image");
    expect(prompt).toContain("head to toe");
    expect(prompt).toContain("identity markers");
    expect(prompt).toContain("no text");
  });
});
