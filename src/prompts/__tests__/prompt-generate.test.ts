import { describe, it, expect } from "vitest";
import { promptGeneratePrompt } from "../prompt-generate";
import { DEFAULT_INSTRUCTION } from "@/lib/nodes/prompt";

// BUG-005 — scripts state action and dialogue but rarely a look, environment, weather or time of
// day. The image writer made "Setting — location, time of day, environment, atmosphere" a REQUIRED
// element, so for an unstated setting it composed one from the brand context. D262 already stopped
// this for the multishot writers; the image writer is held to the same rule.
describe("promptGeneratePrompt setting rule", () => {
  const system = promptGeneratePrompt.system;

  it("no longer requires a location or time of day", () => {
    expect(system).not.toMatch(/Setting — location, time of day, environment, atmosphere/);
  });

  it("takes the setting only from what is stated", () => {
    expect(system).toMatch(/only from what is stated/i);
  });

  it("names the brand context as not a source of setting", () => {
    expect(system).toMatch(/brand context tells you[\s\S]{0,200}It is NOT a\s+source of setting/);
  });

  it("falls back to a plain neutral backdrop rather than an invented place", () => {
    expect(system).toMatch(/plain, neutral/i);
    expect(system).toMatch(/weather, season, time of day or\s+location/i);
  });

  it("bumps the version so outputs are attributable to the new rule", () => {
    expect(promptGeneratePrompt.version).toBeGreaterThanOrEqual(6);
  });

  // The default instruction asked for "subject, setting, lighting" — a request to fill the gap.
  it("does not ask the writer to supply a setting by default", () => {
    expect(DEFAULT_INSTRUCTION).not.toMatch(/setting/i);
  });
});
