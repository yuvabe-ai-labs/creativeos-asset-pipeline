import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { isWaiting } from "./check";
import { ONBOARDING_PATH, shouldSendToOnboarding } from "./onboarding-route";
import { accessOf, resolveActingCallerOrNull, type ActingCaller } from "./server";

export { ONBOARDING_PATH };

/** Spec §2.4: someone signed up and waiting, or a member on no client, sees only the
 *  onboarding screen. Their client pages are already the 404 page (no row for the client). */
export function sendWaitingToOnboarding({ caller, effectiveOrgId }: ActingCaller): void {
  if (isWaiting(accessOf(caller), effectiveOrgId)) redirect(ONBOARDING_PATH);
}

/** Spec §4.4, for the root layout on a full page load. Reuses the caller the layout already
 *  resolves for this request (cache()), so it adds no read. A failed read is never "waiting":
 *  the page renders and refuses what it must on its own. */
export async function sendWaitingToOnboardingOn(path: string | null): Promise<void> {
  if (!shouldSendToOnboarding(path, true)) return;
  let waiting = false;
  try {
    const acting = await resolveActingCallerOrNull();
    waiting = acting !== null && isWaiting(accessOf(acting.caller), acting.effectiveOrgId);
  } catch (e) {
    unstable_rethrow(e);
    return;
  }
  if (waiting) redirect(ONBOARDING_PATH);
}
