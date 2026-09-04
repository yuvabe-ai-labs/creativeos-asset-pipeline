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

  it("is version 3", () => {
    expect(scriptParsePrompt.version).toBe(3);
  });
});
