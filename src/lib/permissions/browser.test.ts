import { describe, it, expect } from "vitest";
import { testAccess, testOwnerAccess } from "./test-fixtures";
import { abilityFromPacked, browserClientScope, canInBrowser, canSeeClientInScope, packAccessRules } from "./browser";

// Task 5 → Task 7 bridge: the six-permission access turned back into the rules the browser reads.
describe("rules sent to the browser", () => {
  it("give the owner every key on every client", () => {
    const ability = abilityFromPacked(JSON.parse(JSON.stringify(packAccessRules(testOwnerAccess(), "org-1"))));
    expect(canInBrowser(ability, "team.edit")).toBe(true);
    expect(canInBrowser(ability, "scripts.delete", "c9")).toBe(true);
  });

  it("give a member the levels they hold, on the clients they can view", () => {
    const ability = abilityFromPacked(packAccessRules(testAccess({ permissions: ["view", "edit"], clientIds: ["c1"] }), "org-1"));
    expect(canInBrowser(ability, "scripts.edit", "c1")).toBe(true);
    expect(canInBrowser(ability, "canvases.edit", "c1")).toBe(true);
    expect(canInBrowser(ability, "scripts.edit", "c9")).toBe(false);
    expect(canInBrowser(ability, "scripts.delete", "c1")).toBe(false);
    expect(canInBrowser(ability, "clients.edit")).toBe(false);
  });

  it("refuses a client-scoped key for an empty client id (outside a canvas)", () => {
    const ability = abilityFromPacked(packAccessRules(testAccess({ permissions: ["view", "edit"], clientIds: ["c1"] }), "org-1"));
    expect(canInBrowser(ability, "scripts.edit", "")).toBe(false);
  });

  it("an empty rule list allows nothing", () => {
    expect(canInBrowser(abilityFromPacked([]), "scripts.view", "c1")).toBe(false);
  });
});

describe("client scope decision", () => {
  it("all sees every client, a list sees only its clients, unknown sees none", () => {
    expect(canSeeClientInScope(browserClientScope("all"), "c9")).toBe(true);
    const some = browserClientScope(["c1", "c2"]);
    expect(canSeeClientInScope(some, "c1")).toBe(true);
    expect(canSeeClientInScope(some, "c9")).toBe(false);
    expect(canSeeClientInScope(browserClientScope(undefined), "c1")).toBe(false);
  });
});
