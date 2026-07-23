import { describe, it, expect } from "vitest";
import { mapAppMetadataToPlatformRole, orgRoleToIdentityRole } from "./dal-logic";

describe("mapAppMetadataToPlatformRole", () => {
  it("reads super_admin from app_metadata", () => {
    expect(mapAppMetadataToPlatformRole({ platform_role: "super_admin" })).toBe("super_admin");
  });
  it("defaults to member for anything else (fail closed)", () => {
    expect(mapAppMetadataToPlatformRole({ platform_role: "member" })).toBe("member");
    expect(mapAppMetadataToPlatformRole({})).toBe("member");
    expect(mapAppMetadataToPlatformRole(null)).toBe("member");
    expect(mapAppMetadataToPlatformRole(undefined)).toBe("member");
    expect(mapAppMetadataToPlatformRole({ platform_role: "hacker" })).toBe("member");
    expect(mapAppMetadataToPlatformRole("super_admin")).toBe("member"); // wrong shape entirely
  });
});

describe("orgRoleToIdentityRole", () => {
  it("maps owner to senior (full access, can approve)", () => {
    expect(orgRoleToIdentityRole("owner")).toBe("senior");
  });
  it("maps senior to senior", () => {
    expect(orgRoleToIdentityRole("senior")).toBe("senior");
  });
  it("maps designer to designer", () => {
    expect(orgRoleToIdentityRole("designer")).toBe("designer");
  });
});
