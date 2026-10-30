import { describe, it, expect } from "vitest";
import { withRequestLines } from "../request-prompt";

const ROLES = "Reference roles: <IMAGE_REF_0> is the product (pouch): keep it exactly as pictured.";

describe("withRequestLines", () => {
  it("leads with the roles line on Omni, and adds no text line (composeOmniPrompt does)", () => {
    expect(withRequestLines("[0-3s] A hand.", { provider: "gemini", rolesLine: ROLES })).toBe(
      `${ROLES}\n\n[0-3s] A hand.`,
    );
  });

  // Prose after Kling's last triple risks being read as part of the final shot (D238).
  it("puts the no-text line ahead of Kling's triples", () => {
    expect(withRequestLines("shot 1, 3, A hand;", { provider: "kling", rolesLine: ROLES })).toBe(
      `${ROLES}\n\nNo on-screen text.\n\nshot 1, 3, A hand;`,
    );
  });

  it("closes Seedance's prompt with the no-text line", () => {
    expect(withRequestLines("0-3s: A hand.", { provider: "seedance", rolesLine: "" })).toBe(
      "0-3s: A hand.\n\nNo on-screen text.",
    );
  });

  it("returns the prompt unchanged when there is nothing to add", () => {
    expect(withRequestLines("A hand.", { provider: "veo", rolesLine: "" })).toBe("A hand.");
    expect(withRequestLines("A hand.", { provider: undefined, rolesLine: "  " })).toBe("A hand.");
  });
});
