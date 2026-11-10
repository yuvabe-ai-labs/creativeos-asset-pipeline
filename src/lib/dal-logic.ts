import type { Access } from "@/lib/permissions/access";

export type PlatformRole = "super_admin" | "member";
export type OrgRole = "owner" | "senior" | "designer";

export type CallerContext = {
  userId: string;
  email: string | null;
  platformRole: PlatformRole;
  orgId: string;
  /** Derived from the preset key until plan 2 removes it; new code checks access, never this. */
  orgRole: OrgRole;
  mustChangePassword: boolean;
  /** D489: what this person may do. Read it through accessOf(), never directly. */
  access: Access;
};

// Reads the platform role from a JWT's app_metadata. Anything that is not the exact
// string "super_admin" is treated as a plain member — fail closed.
export function mapAppMetadataToPlatformRole(appMetadata: unknown): PlatformRole {
  if (
    appMetadata &&
    typeof appMetadata === "object" &&
    (appMetadata as Record<string, unknown>).platform_role === "super_admin"
  ) {
    return "super_admin";
  }
  return "member";
}

// Reads the forced-password-change flag from a JWT's app_metadata. Anything that isn't the
// literal boolean `true` is treated as "no change owed" — fail open here (unlike
// mapAppMetadataToPlatformRole's fail-closed default), since the cost of getting this wrong
// the OTHER way is locking every ordinary login out of the app on a malformed/missing flag.
export function mapAppMetadataToMustChangePassword(appMetadata: unknown): boolean {
  return (
    appMetadata !== null &&
    typeof appMetadata === "object" &&
    (appMetadata as Record<string, unknown>).must_change_password === true
  );
}

// The frozen Identity.role only distinguishes "can approve" (senior) from "cannot"
// (designer). Owners get full access in the pilot, so they map to senior. (Pilot only
// ever creates owner memberships — see D80/the Stage 1 index doc.)
export function orgRoleToIdentityRole(orgRole: OrgRole): "senior" | "designer" {
  return orgRole === "designer" ? "designer" : "senior";
}

// The three seeded presets map onto the old roles; any other preset reads as designer, the
// narrowest, for the few places still reading orgRole until plan 2.
export function presetKeyToOrgRole(presetKey: string): OrgRole {
  return presetKey === "owner" || presetKey === "senior" ? presetKey : "designer";
}
