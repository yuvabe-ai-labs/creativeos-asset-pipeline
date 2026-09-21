import { describe, it, expect } from "vitest";
import {
  SEQUENCE_ROLES,
  DEFAULT_SEQUENCE_ROLE,
  getSequenceRole,
  renderSequenceRole,
} from "../sequence-roles";
import { SHOT_ROLES } from "../shot-roles";

describe("SEQUENCE_ROLES", () => {
  it("has unique keys and a resolvable default", () => {
    expect(new Set(SEQUENCE_ROLES.map((r) => r.key)).size).toBe(SEQUENCE_ROLES.length);
    expect(SEQUENCE_ROLES.some((r) => r.key === DEFAULT_SEQUENCE_ROLE)).toBe(true);
  });

  // The catalogs are disjoint on purpose: a ShotRole names one frame's job, a SequenceRole names
  // what changes across a block of cuts. A shared key would silently resolve to the wrong one.
  it("shares no key with the single-shot catalog", () => {
    const shotKeys = new Set(SHOT_ROLES.map((r) => r.key));
    for (const role of SEQUENCE_ROLES) expect(shotKeys.has(role.key)).toBe(false);
  });

  it("gives every role an arc, a cut rule, slots and an avoid-list", () => {
    for (const role of SEQUENCE_ROLES) {
      expect(role.arc.length).toBeGreaterThan(20);
      expect(role.cutRule.length).toBeGreaterThan(20);
      expect(role.slots.length).toBeGreaterThan(0);
      expect(role.avoid.length).toBeGreaterThan(0);
    }
  });

  it("gives every role a sane beat range", () => {
    for (const role of SEQUENCE_ROLES) {
      const [min, max] = role.beats;
      // Below two beats there is no sequence, and above ten there is no room at the 1s floor
      // inside Omni's 10s ceiling.
      expect(min).toBeGreaterThanOrEqual(2);
      expect(max).toBeLessThanOrEqual(10);
      expect(min).toBeLessThanOrEqual(max);
    }
  });

  it("carries no hype adjectives", () => {
    for (const role of SEQUENCE_ROLES) {
      expect(`${role.arc} ${role.cutRule}`).not.toMatch(/cinematic|stunning|ultra realistic|8K/i);
    }
  });

  // Each pattern is governed by a DIFFERENT constraint, which is why cutRule is per-role rather
  // than one shared paragraph.
  it("names the constraint each pattern actually turns on", () => {
    expect(getSequenceRole("coverage").cutRule).toMatch(/30 degrees/);
    // The one pattern where an identical framing is correct rather than a jump cut.
    expect(getSequenceRole("transformation").cutRule).toMatch(/IDENTICAL/);
    // The one pattern that deliberately wants no continuity at all.
    expect(getSequenceRole("vignette").cutRule).toMatch(/NO continuity/);
    expect(getSequenceRole("process").cutRule).toMatch(/Match on action/i);
  });
});

describe("getSequenceRole", () => {
  it("falls back to the default for an unknown key", () => {
    expect(getSequenceRole("").key).toBe(DEFAULT_SEQUENCE_ROLE);
    // A key from the OTHER catalog, which happens when a node is toggled to multishot.
    expect(getSequenceRole("hero").key).toBe(DEFAULT_SEQUENCE_ROLE);
  });

  it("resolves a known key", () => {
    expect(getSequenceRole("cold-open").label).toBe("Cold-open hook");
  });
});

describe("renderSequenceRole", () => {
  const out = renderSequenceRole(getSequenceRole("coverage"));

  it("leads with the arc and the cut rule", () => {
    expect(out.indexOf("Arc —")).toBeLessThan(out.indexOf("must include"));
    expect(out.indexOf("Cutting —")).toBeLessThan(out.indexOf("must include"));
  });

  it("states the beat range and every list", () => {
    expect(out).toContain("4-5 beats");
    expect(out).toContain("close-up on the hands");
    expect(out).toContain("changing location");
  });
});
