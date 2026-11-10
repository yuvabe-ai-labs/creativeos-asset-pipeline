import { describe, it, expect } from "vitest";
import { can, canAnywhere, canSeeClient, denialFor, scopeIds, FORBIDDEN_MESSAGE } from "./check";
import { accessFromRow, ownerAccess } from "./access";
import { testAccess, testMembershipRow } from "./test-fixtures";

describe("permission checks", () => {
  const picked = testAccess({ keys: ["scripts.view", "scripts.edit", "clients.edit"], clientIds: ["c-1"] });
  const all = testAccess({ keys: ["scripts.view"] });

  it("allows a client-scoped key only for a client in the list", () => {
    expect(can(picked, "scripts.edit", "c-1")).toBe(true);
    expect(can(picked, "scripts.edit", "c-2")).toBe(false);
  });

  it("allows every client when the scope is all", () => {
    expect(can(all, "scripts.view", "any-client")).toBe(true);
  });

  it("refuses a key the person does not hold", () => {
    expect(can(all, "scripts.delete", "c-1")).toBe(false);
  });

  it("checks agency keys without a client", () => {
    expect(can(picked, "clients.edit")).toBe(true);
    expect(can(picked, "clients.delete")).toBe(false);
  });

  it("refuses a client-scoped key checked without a client (CASL would ignore conditions)", () => {
    // @ts-expect-error -- the type requires clientId for client-scoped keys
    expect(can(picked, "scripts.edit")).toBe(false);
  });

  it("canAnywhere: key held and at least one client", () => {
    expect(canAnywhere(picked, "scripts.edit")).toBe(true);
    expect(canAnywhere(testAccess({ keys: ["scripts.edit"], clientIds: [] }), "scripts.edit")).toBe(false);
    expect(canAnywhere(picked, "scripts.delete")).toBe(false);
  });

  it("canSeeClient follows the scope", () => {
    expect(canSeeClient(picked, "c-1")).toBe(true);
    expect(canSeeClient(picked, "c-2")).toBe(false);
    expect(canSeeClient(all, "c-2")).toBe(true);
  });

  it("denialFor: out of scope is not_found before forbidden", () => {
    expect(denialFor(picked, "scripts.delete", "c-2")).toBe("not_found");
    expect(denialFor(picked, "scripts.delete", "c-1")).toBe("forbidden");
    expect(denialFor(picked, "scripts.edit", "c-1")).toBeNull();
    expect(denialFor(picked, "clients.edit", null)).toBeNull();
    expect(denialFor(picked, "scripts.edit", null)).toBeNull();
    expect(denialFor(picked, "team.view", null)).toBe("forbidden");
  });

  it("owner access allows everything everywhere", () => {
    const owner = ownerAccess();
    expect(can(owner, "team.delete")).toBe(true);
    expect(can(owner, "video_generation.approve", "whatever")).toBe(true);
  });

  it("builds access from the RPC row", () => {
    const a = accessFromRow(
      testMembershipRow({ preset_key: "designer", is_owner: false, preset_keys: ["scripts.view"], granted: ["scripts.edit"], all_clients: false, client_ids: ["c-9"] }),
    );
    expect(a.presetKey).toBe("designer");
    expect(can(a, "scripts.edit", "c-9")).toBe(true);
    expect(can(a, "scripts.edit", "c-1")).toBe(false);
  });

  it("scopeIds is null for all clients and the list otherwise", () => {
    expect(scopeIds(all)).toBeNull();
    expect(scopeIds(picked)).toEqual(["c-1"]);
  });

  it("uses the agreed refusal copy", () => {
    expect(FORBIDDEN_MESSAGE).toBe("You don't have access to this. Ask your agency owner.");
  });
});
