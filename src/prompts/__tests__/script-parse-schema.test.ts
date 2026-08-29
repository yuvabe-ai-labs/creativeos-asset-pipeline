import { describe, it, expect } from "vitest";
import { scriptParsePrompt } from "../script-parse";

describe("script-parse schema", () => {
  const shotProps = (scriptParsePrompt.schema as {
    properties: { visual_script: { properties: { shots: { items: {
      properties: Record<string, unknown>; required: string[];
    } } } } };
  }).properties.visual_script.properties.shots.items;

  it("declares duration_seconds as a required integer on every shot", () => {
    expect(shotProps.properties.duration_seconds).toEqual({ type: "integer" });
    expect(shotProps.required).toContain("duration_seconds");
  });

  // OpenAI strict mode requires every property to appear in `required`.
  it("keeps every shot property required, as strict mode demands", () => {
    expect(shotProps.required.sort()).toEqual(
      Object.keys(shotProps.properties).sort(),
    );
  });

  // The one instruction that silently ruins every group if it is missing. Scripts write
  // cumulative ranges ("8-14 sec"); the value must be the LENGTH (6), not the range end (14).
  it("tells the model the value is a length, not the end of a range", () => {
    expect(scriptParsePrompt.system).toContain("8-14 sec");
    expect(scriptParsePrompt.system).toMatch(/length/i);
  });

  it("declares beat_index and beat_label as required on every shot", () => {
    expect(shotProps.properties.beat_index).toEqual({ type: "integer" });
    expect(shotProps.properties.beat_label).toEqual({ type: "string" });
    expect(shotProps.required).toContain("beat_index");
    expect(shotProps.required).toContain("beat_label");
  });

  // D198 — the defect this replaced. The old instruction said "split the shot list into
  // individual shots", but a script's shot list IS its timecoded blocks, so the model split at
  // block level and stopped: a 20s script with 18 camera setups came back as 5 entries.
  it("says a timecoded block is a beat containing several shots", () => {
    expect(scriptParsePrompt.system).toMatch(/beat/i);
    expect(scriptParsePrompt.system).toMatch(/several shots/i);
    expect(scriptParsePrompt.system).toMatch(/camera setup/i);
    expect(scriptParsePrompt.system).toContain("Do NOT return one entry per timecoded block");
  });

  // A rule alone under-splits; the worked example is what makes the split land.
  it("carries a worked example showing one block becoming four shots", () => {
    expect(scriptParsePrompt.system).toContain("FOUR shots, not one");
  });

  it("is version 3", () => {
    expect(scriptParsePrompt.version).toBe(3);
  });
});
