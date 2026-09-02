import { describe, it, expect } from "vitest";
import { shotComposeMultishotPrompt } from "../shot-compose-multishot";
import { shotComposePrompt } from "../shot-compose";

describe("shotComposeMultishotPrompt", () => {
  const s = shotComposeMultishotPrompt.system;

  // The unit is a SEQUENCE. Four alternatives for "the shot" is meaningless when the shot is
  // five cuts, and picking one should write all five.
  it("composes whole sequences, not alternatives for one shot", () => {
    expect(s).toMatch(/sequence/i);
    expect(s).toMatch(/cut together/i);
  });

  it("requires exactly one beat per beat of the shot, in order", () => {
    expect(s).toMatch(/EXACTLY one per beat/i);
    expect(s).toMatch(/in order/i);
  });

  it("requires a shared look across the beats", () => {
    expect(s).toMatch(/LOOK contract/);
    expect(s).toMatch(/same light direction/i);
  });

  it("asks for match cuts to be deliberate", () => {
    expect(s).toMatch(/MATCH CUT/i);
    expect(s).toMatch(/angle, ground and light direction/i);
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
    expect(shotComposeMultishotPrompt.model).toBe(shotComposePrompt.model);
  });

  it("carries the same global avoid-list as the single-shot composer", () => {
    for (const banned of ["medical", "before/after", "stunning"]) {
      expect(s.toLowerCase()).toContain(banned.toLowerCase());
    }
  });
});
