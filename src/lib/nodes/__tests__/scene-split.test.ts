import { describe, it, expect } from "vitest";
import { parseSceneBody, compileSceneSplit } from "../scene-split";
import { SCENE_SPLIT_RULES } from "@/prompts/script-parse";

const vo = { text: "Meet the jar.", speaker: "narrator" };

describe("parseSceneBody", () => {
  it("accepts a scene with a description and a positive length", () => {
    expect(parseSceneBody({ description: " A → B ", duration_seconds: 6, voiceover: [vo] })).toEqual({
      description: " A → B ",
      duration_seconds: 6,
      voiceover: [vo],
    });
  });

  it("keeps an absent voiceover absent", () => {
    expect(parseSceneBody({ description: "x", duration_seconds: 3 })).toEqual({
      description: "x",
      duration_seconds: 3,
    });
  });

  it.each([
    [null],
    [{ description: "", duration_seconds: 3 }],
    [{ description: "x", duration_seconds: 0 }],
    [{ description: "x", duration_seconds: "3" }],
    [{ description: "x", duration_seconds: 3, voiceover: "no" }],
    [{ description: "x", duration_seconds: 3, voiceover: [{ speaker: "narrator" }] }],
  ])("rejects %j", (input) => {
    expect(parseSceneBody(input)).toBeNull();
  });
});

describe("compileSceneSplit", () => {
  it("carries the shared rules and the client context in the system message", () => {
    const { system } = compileSceneSplit({ description: "x", duration_seconds: 3 }, "Tone: warm");
    expect(system).toContain(SCENE_SPLIT_RULES);
    expect(system).toContain("Tone: warm");
  });

  it("puts the scene, its length and its numbered lines in the user message", () => {
    const { user } = compileSceneSplit({ description: "A → B", duration_seconds: 6, voiceover: [vo] }, "");
    expect(user).toContain("A → B");
    expect(user).toContain("6 seconds");
    expect(user).toContain('1. (narrator) "Meet the jar."');
  });

  it("says when the scene has no voiceover", () => {
    expect(compileSceneSplit({ description: "x", duration_seconds: 3 }, "").user).toContain(
      "Voiceover lines: none",
    );
  });
});
