// The caller's display name and approval role. SOURCED FROM THE SESSION — useIdentity()
// fetches /api/me, which resolves the caller server-side via resolveCallerContext(); the
// `role` here is the collapse of the real org_role (owner|senior -> "senior").
//
// This was localStorage-backed and spoofable under D29's soft identity. It has not been
// since auth landed, and the shape never changed — only the source did, exactly as D29 §5
// predicted.
//
// It is still NOT the security boundary. Approval permission is enforced in
// setVersionApprovalAction against the caller's resolved org role (D166). Use this to
// decide what to RENDER, never what to permit.
export type Identity = { name: string; role: "senior" | "designer" };

// UNUSED since identity moved to the session. Nothing outside this file and its test
// references IDENTITY_KEY / parseIdentity / serializeIdentity any more — they are the
// localStorage mechanics of D29's soft identity, kept for now rather than deleted in the
// same change that tightened approval permission (D166), because removing exports makes a
// security diff harder to review for the thing that actually matters. Safe to delete.
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
