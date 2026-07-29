import "server-only";
import { notFound } from "next/navigation";
import { resolveCallerContext, type CallerContext } from "@/lib/dal";

// Gate for /admin/* pages and admin actions (Stage 1D). Non-super_admins get a 404 (do
// not reveal that an admin surface exists) — matches the withClient 404-not-403 rule
// this repo uses elsewhere (src/lib/api/route-helpers.ts).
export async function requireSuperAdmin(): Promise<CallerContext> {
  const caller = await resolveCallerContext();
  if (caller.platformRole !== "super_admin") notFound();
  return caller;
}
