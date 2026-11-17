import { describe, it, expect } from "vitest";
import { reel01Doc } from "@/lib/scripts/visualise/__tests__/fixtures";
import { shotsUsing, spokenLine } from "../utils";

describe("shotsUsing (D465: which shots a location or product is in)", () => {
  const doc = () => {
    const d = reel01Doc();
    d.shots = d.shots.slice(0, 3).map((s, i) => ({
      ...s,
      location: i === 1 ? null : "L1",
      products: i === 2 ? ["P1"] : [],
    }));
    return d;
  };

  it("lists the shots in reel order", () => {
    expect(shotsUsing(doc(), { locationId: "L1" })).toBe("S1, S3");
    expect(shotsUsing(doc(), { productId: "P1" })).toBe("S3");
  });

  it("is empty when no shot uses it", () => {
    expect(shotsUsing(doc(), { productId: "nope" })).toBe("");
  });
});

describe("spokenLine", () => {
  it("wraps a line in curly quotes", () => {
    expect(spokenLine("Saturday means idli.")).toBe("“Saturday means idli.”");
  });

  it("does not double quotes the line already has", () => {
    expect(spokenLine("\"Bye Ma! Wait!\"")).toBe("“Bye Ma! Wait!”");
    expect(spokenLine(" “Bye Ma!” ")).toBe("“Bye Ma!”");
  });
});
