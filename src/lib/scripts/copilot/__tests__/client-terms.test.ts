import { describe, it, expect } from "vitest";
import { clientTermsIn } from "../client-terms";

describe("clientTermsIn", () => {
  it("finds one client's words in any case, as parts of longer words too", () => {
    expect(clientTermsIn("Two SPOONS of flour")).toEqual(["spoon", "flour"]);
  });

  it("finds nothing in brand-neutral text", () => {
    expect(clientTermsIn("A couple walks onto the balcony at sunset.")).toEqual([]);
  });
});
