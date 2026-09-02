import { describe, it, expect } from "vitest";
import { shotComposeMultishotPrompt } from "../shot-compose-multishot";
import { shotComposePrompt } from "../shot-compose";
import { MULTISHOT_AUTHORING_MODEL } from "../video-prompt-generate";

describe("shotComposeMultishotPrompt", () => {
  const s = shotComposeMultishotPrompt.system;

  // The unit is a SEQUENCE. Four alternatives for "the shot" is meaningless when the shot is
  // five cuts, and picking one should write all five.
  it("composes whole sequences, not alternatives for one shot", () => {
    expect(s).toMatch(/sequence/i);
    expect(s).toMatch(/cut together/i);
  });

  // Reversed deliberately. A parsed "beat" is often an act holding several real cuts, so forcing
  // one composed beat per parsed line forced the composer to write the wrong film — and the
  // client then refused the correct answer as a count mismatch. What is fixed is the TOTAL.
  it("lets the composer choose the beat count but fixes the total duration", () => {
    expect(s).toMatch(/beat count is YOURS to choose/i);
    expect(s).toMatch(/not a quota/i);
    expect(s).toMatch(/MUST sum to the stated total duration budget/i);
  });

  it("sets a one-second floor per beat", () => {
    expect(s).toMatch(/No beat is under 1 second/i);
  });

  it("asks for varied beat lengths, not an even slideshow", () => {
    expect(s).toMatch(/DIFFERENT lengths/i);
    expect(s).toMatch(/slideshow/i);
  });

  it("requires a shared look across the beats", () => {
    expect(s).toMatch(/LOOK contract/);
    expect(s).toMatch(/same light direction/i);
  });

  it("asks for match cuts to be deliberate", () => {
    expect(s).toMatch(/MATCH CUT/i);
    expect(s).toMatch(/shared ground plane, light direction or continued movement/i);
  });

  // The correction the research forced. The earlier version told the composer to cut consecutive
  // beats on a SHARED angle, which for one subject is the textbook definition of a jump cut.
  it("carries the 30-degree rule, and subordinates the match cut to it", () => {
    expect(s).toMatch(/30-DEGREE RULE/);
    expect(s).toMatch(/at least 30 degrees or change the shot size/i);
    expect(s).toMatch(/JUMP CUT/);
    expect(s).toMatch(/never at the cost of the 30-degree rule/i);
  });

  it("carries screen direction (the 180-degree rule)", () => {
    expect(s).toMatch(/SCREEN DIRECTION/);
    expect(s).toMatch(/180-degree rule/);
    expect(s).toMatch(/left-to-right/i);
  });

  it("declares seconds per beat in the schema", () => {
    const beat = shotComposeMultishotPrompt.schema.properties.sequences.items.properties.beats.items;
    expect(beat.required).toEqual(["description", "seconds"]);
    expect(beat.properties.seconds.type).toBe("number");
  });

  it("keeps each beat to one physical event", () => {
    expect(s).toMatch(/ONE physical event/i);
  });

  // The trap that lifts a product off the table on an i2v model.
  it("forbids describing an effect on the subject", () => {
    expect(s).toMatch(/never describe an effect on the subject/i);
  });

  it("returns three sequences", () => {
    expect(s).toMatch(/EXACTLY 3 sequences/);
  });

  it("declares a beats array per sequence", () => {
    const item = shotComposeMultishotPrompt.schema.properties.sequences.items;
    expect(item.required).toEqual(["title", "bestFor", "beats"]);
    expect(item.properties.beats.type).toBe("array");
    expect(item.additionalProperties).toBe(false);
  });

  // Both records are read by the same route and recorded on the same version row, so they must
  // be distinguishable — otherwise the eval flywheel cannot tell which prompt produced what.
  it("is a distinct versioned record from the single-shot composer", () => {
    expect(shotComposeMultishotPrompt.id).not.toBe(shotComposePrompt.id);
    expect(shotComposeMultishotPrompt.id).toBe("shot-compose-multishot");
    expect(shotComposeMultishotPrompt.version).toBeGreaterThanOrEqual(1);
  });

  // Composing a whole cut sequence — beat count, per-beat timings summing to the budget, a shared
  // look, and a role whose own cutting rule outranks the general ones — is a storyboard job, not
  // the one-shot rewrite the single-shot composer does. It runs on the larger model on purpose.
  it("runs on the multishot authoring model, not the single-shot mini", () => {
    expect(shotComposeMultishotPrompt.model).toBe(MULTISHOT_AUTHORING_MODEL);
    expect(shotComposeMultishotPrompt.model).not.toBe(shotComposePrompt.model);
  });

  it("carries the same global avoid-list as the single-shot composer", () => {
    for (const banned of ["medical", "before/after", "stunning"]) {
      expect(s.toLowerCase()).toContain(banned.toLowerCase());
    }
  });
});
