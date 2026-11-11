import { describe, it, expect } from "vitest";
import { unwrapEmbed } from "./embed";

describe("unwrapEmbed", () => {
  it("takes an embedded row as an object or a one-element array", () => {
    expect(unwrapEmbed({ org_id: "o1" })).toEqual({ org_id: "o1" });
    expect(unwrapEmbed([{ org_id: "o1" }])).toEqual({ org_id: "o1" });
  });

  it("answers null for no row", () => {
    expect(unwrapEmbed([])).toBeNull();
    expect(unwrapEmbed(null)).toBeNull();
    expect(unwrapEmbed(undefined)).toBeNull();
  });
});
