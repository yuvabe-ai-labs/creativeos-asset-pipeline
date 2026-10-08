import { describe, it, expect } from "vitest";
import { scriptDocSchema, type ScriptDoc } from "../schema";
import reel01 from "../fixtures/reel-01.json";

const clone = (): ScriptDoc => structuredClone(reel01) as ScriptDoc;

describe("scriptDocSchema", () => {
  it("accepts the seeded Reel 01", () => {
    const parsed = scriptDocSchema.safeParse(reel01);
    expect(parsed.success).toBe(true);
  });

  it("Reel 01 has 14 shots, Meenakshi as the lead, and her husband in the cast", () => {
    const doc = scriptDocSchema.parse(reel01);
    expect(doc.shots).toHaveLength(14);
    expect(doc.cast.filter((c) => c.isLead).map((c) => c.name)).toEqual(["Meenakshi"]);
    expect(doc.cast.map((c) => c.name)).toContain("Meenakshi's husband");
    expect(doc.header.format).toBe("UGC");
  });

  it("Reel 01's header carries the production line every outline ends with", () => {
    expect(scriptDocSchema.parse(reel01).header.production).toBe("AI-generated");
  });

  it("rejects a cast with no lead", () => {
    const doc = clone();
    doc.cast = doc.cast.map((c) => ({ ...c, isLead: false }));
    expect(scriptDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a cast with two leads", () => {
    const doc = clone();
    doc.cast = doc.cast.map((c) => ({ ...c, isLead: true }));
    expect(scriptDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a shot that names someone outside the cast", () => {
    const doc = clone();
    doc.shots[0] = { ...doc.shots[0], onScreen: ["nobody-here"] };
    expect(scriptDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects duplicate shot ids", () => {
    const doc = clone();
    doc.shots[1] = { ...doc.shots[1], id: doc.shots[0].id };
    expect(scriptDocSchema.safeParse(doc).success).toBe(false);
  });

  it("accepts any free-text beat label and format", () => {
    const doc = clone();
    doc.shots[0] = { ...doc.shots[0], beat: "WHAT IT IS" };
    doc.header = { ...doc.header, format: "Founder-led (option)" };
    expect(scriptDocSchema.safeParse(doc).success).toBe(true);
  });
});
