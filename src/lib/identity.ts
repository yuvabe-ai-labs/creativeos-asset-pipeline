// D29 soft identity: a name + role persisted in localStorage. Spoofable by design — it is
// an audit trail, not security. Upgrades to a real auth session later with no shape change
// (spec §5): only the SOURCE of Identity changes, not this type.
export type Identity = { name: string; role: "senior" | "designer" };

export const IDENTITY_KEY = "creativeos.identity";

export function parseIdentity(raw: string | null): Identity | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { name?: unknown; role?: unknown };
    if (
      typeof v.name === "string" &&
      v.name.trim() &&
      (v.role === "senior" || v.role === "designer")
    ) {
      return { name: v.name.trim(), role: v.role };
    }
  } catch {
    // fall through
  }
  return null;
}

export function serializeIdentity(id: Identity): string {
  return JSON.stringify(id);
}
