// src/app/api/me/route.ts
import { apiOk, withQuietErrors } from "@/lib/api/route-helpers";
import { resolveActingCaller } from "@/lib/permissions/server";
import { buildMePayload } from "@/lib/me/payload";

// Explicit, not just relying on cookies() inside resolveCallerContext() to opt this route out of
// caching: every auth-state transition (login, sign-out and sign-in as someone else, a forced
// password change) depends on fresh data here. Paired with fetchMe()'s cache: "no-store".
export const dynamic = "force-dynamic";

// Feeds useMe(). The caller is resolved once (plan 1, performance rule 6) and the payload is the
// same one the root layout seeds the first render with.
export async function GET() {
  const acting = await resolveActingCaller();
  // A failure is shown as plain copy, never a database message (AGENTS.md: plain user-facing copy).
  return withQuietErrors("Could not load your account.", async () => apiOk(await buildMePayload(acting)));
}
