import { describe, it, expect } from "vitest";
import { SETTING_ONLY } from "../script-parse";
import { clientTermsIn } from "@/lib/scripts/copilot/client-terms";

// Brand-neutral spec §3.2 — the script reader's subject rule keeps its three measured clauses, in
// words that fit any client: no skincare product, and not every reel is a product film.
describe("the script reader's subject rule", () => {
  it("names no client's product", () => {
    expect(clientTermsIn(SETTING_ONLY)).toEqual([]);
    for (const word of ["cream", "jar", "skin", "forearm", "rose petal", "butter", "These are product films"]) {
      expect(SETTING_ONLY).not.toContain(word);
    }
  });

  it("still leads with the subject and names the product as the script does", () => {
    expect(SETTING_ONLY).toContain("Lead with the SUBJECT");
    expect(SETTING_ONLY).toContain("NAMES the product as the source script names it");
  });

  it("covers a reel about a place, a service or a person", () => {
    expect(SETTING_ONLY).toContain("When it is about a place, a service or a person, lead with that subject the same way.");
  });
});
