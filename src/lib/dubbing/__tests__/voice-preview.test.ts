import { describe, it, expect } from "vitest";
import { DUB_LANGUAGES } from "../types";
import { pathForDubVoicePreview, previewLanguage, previewText } from "../voice-preview";

describe("voice previews", () => {
  it("has a line for every dub language, in that language, except Assamese which previews in English", () => {
    for (const { code } of DUB_LANGUAGES) {
      expect(previewText(code)).toBeTruthy();
      expect(previewLanguage(code)).toBe(code === "as-IN" ? "en-IN" : code);
    }
    expect(previewText("as-IN")).toMatch(/^Hello/);
  });

  it("keeps one sample per voice and preview language, under a versioned folder", () => {
    expect(pathForDubVoicePreview("ishita", "ta-IN")).toBe("dubbing/voice-previews/v1/ishita-ta-IN.wav");
    expect(pathForDubVoicePreview("shubh", "as-IN")).toBe("dubbing/voice-previews/v1/shubh-en-IN.wav");
  });
});
