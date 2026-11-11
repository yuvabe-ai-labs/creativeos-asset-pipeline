import { describe, it, expect } from "vitest";
import { ALL_PERMISSION_KEYS } from "./catalogue";
import { testAccess } from "./test-fixtures";
import { abilityFromPacked, canInBrowser, packAccessRules } from "./browser";

const CLIENTS = ["c1", "c2", "c3", undefined] as const;

describe("rules sent to the browser", () => {
  it("survive the server → browser round trip: every key answers the same for every client", () => {
    const access = testAccess({ keys: ["scripts.view", "scripts.edit", "credits.view", "downloads.view"], clientIds: ["c2", "c1"] });
    // JSON round trip = what the HTML and /api/me actually carry.
    const browser = abilityFromPacked(JSON.parse(JSON.stringify(packAccessRules(access))));
    for (const key of ALL_PERMISSION_KEYS) {
      for (const clientId of CLIENTS) {
        expect(canInBrowser(browser, key, clientId), `${key} @ ${clientId}`).toBe(
          canInBrowser(access.ability, key, clientId),
        );
      }
    }
  });

  it("refuses a client outside a picked list", () => {
    const ability = abilityFromPacked(packAccessRules(testAccess({ keys: ["scripts.edit"], clientIds: ["c1"] })));
    expect(canInBrowser(ability, "scripts.edit", "c1")).toBe(true);
    expect(canInBrowser(ability, "scripts.edit", "c9")).toBe(false);
  });

  it("without a client, answers whether the person has the key for any client (tabs, nav)", () => {
    const ability = abilityFromPacked(packAccessRules(testAccess({ keys: ["scripts.edit"], clientIds: ["c1"] })));
    expect(canInBrowser(ability, "scripts.edit")).toBe(true);
    expect(canInBrowser(ability, "scripts.delete")).toBe(false);
  });

  it("checks agency-wide keys without a client", () => {
    const ability = abilityFromPacked(packAccessRules(testAccess({ keys: ["credits.view"], clientIds: ["c1"] })));
    expect(canInBrowser(ability, "credits.view")).toBe(true);
    expect(canInBrowser(ability, "clients.edit")).toBe(false);
  });

  it("an empty rule list allows nothing", () => {
    const ability = abilityFromPacked([]);
    expect(ALL_PERMISSION_KEYS.some((k) => canInBrowser(ability, k, "c1"))).toBe(false);
  });
});
