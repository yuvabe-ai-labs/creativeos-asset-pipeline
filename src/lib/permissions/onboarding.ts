import "server-only";
import { redirect } from "next/navigation";
import { isWaiting } from "./check";
import { accessOf, type ActingCaller } from "./server";

export const ONBOARDING_PATH = "/onboarding";

/** Spec §2.4: someone signed up and waiting, or on no client they can view, sees only the
 *  onboarding screen. Their client pages are already the 404 page (no row with View). */
export function sendWaitingToOnboarding({ caller, effectiveOrgId }: ActingCaller): void {
  if (isWaiting(accessOf(caller), effectiveOrgId)) redirect(ONBOARDING_PATH);
}
