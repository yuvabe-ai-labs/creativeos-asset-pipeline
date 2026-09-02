import { describe, it, expect } from "vitest";
import { renderMultishotComposeContext, sequenceFits } from "../shot-compose";
import { getShotRole } from "../shot-roles";

const role = getShotRole("");

describe("sequenceFits", () => {
  it("accepts a sequence with one beat per beat", () => {
    expect(sequenceFits({ title: "t", beats: ["a", "b", "c"] }, 3)).toEqual({ ok: true });
  });

  // A short sequence applied anyway would leave the last beat holding its OLD description —
  // two directions inside one clip, which is the incoherence the LOOK contract exists to prevent.
  it("refuses a short sequence and says both counts", () => {
    const v = sequenceFits({ title: "t", beats: ["a", "b"] }, 3);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toBe("This direction has 2 beats but the shot has 3.");
  });

  it("refuses a long sequence", () => {
    expect(sequenceFits({ title: "t", beats: ["a", "b", "c", "d"] }, 3).ok).toBe(false);
  });

  it("singularises one beat", () => {
    const v = sequenceFits({ title: "t", beats: ["a"] }, 3);
    expect(v.ok === false && v.reason).toContain("has 1 beat but");
  });

  it("treats a missing beats array as zero", () => {
    expect(sequenceFits({ title: "t" } as never, 2).ok).toBe(false);
  });
});

describe("renderMultishotComposeContext", () => {
  const shots = [
    { description: "hands lift the jar", duration_seconds: 4 },
    { description: "macro on the lid", duration_seconds: 3 },
  ];

  it("renders a numbered, cumulative timecode ladder", () => {
    const out = renderMultishotComposeContext({ shots, role, clientContext: "" });
    expect(out).toContain("1. [0-4s] hands lift the jar");
    expect(out).toContain("2. [4-7s] macro on the lid");
  });

  // The model writes to the wrong scale without it: a one-second beat is a gesture, not a scene.
  it("states the beat count and total length", () => {
    expect(renderMultishotComposeContext({ shots, role, clientContext: "" }))
      .toContain("2 beats, 7s total");
  });

  it("includes the role's slots and avoid-list", () => {
    const out = renderMultishotComposeContext({ shots, role, clientContext: "" });
    expect(out).toContain(`Role: ${role.label}`);
    expect(out).toContain(role.slots[0]);
    expect(out).toContain(role.avoid[0]);
  });

  it("includes the objective and brand context only when present", () => {
    const withBoth = renderMultishotComposeContext({
      shots, role, clientContext: "Warm, grounded.", objective: "Sell the shoe",
    });
    expect(withBoth).toContain("Objective: Sell the shoe");
    expect(withBoth).toContain("Brand context:\nWarm, grounded.");

    const without = renderMultishotComposeContext({ shots, role, clientContext: "  ", objective: "  " });
    expect(without).not.toContain("Objective:");
    expect(without).not.toContain("Brand context:");
  });

  it("names an empty beat rather than emitting a blank ladder row", () => {
    const out = renderMultishotComposeContext({
      shots: [{ description: "" }, { description: "second" }],
      role,
      clientContext: "",
    });
    expect(out).toContain("(no description yet)");
  });
});
