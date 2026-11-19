import "server-only";

/** The test page and its routes exist only where RAZORPAY_TEST_PAGE=1: a developer's machine
 *  and the dev deployment. Test-mode payments are not real money (D514). */
export function isBillingTestEnabled(): boolean {
  return process.env.RAZORPAY_TEST_PAGE === "1";
}
