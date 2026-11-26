/** The one pack the test page sells (D573): ₹100 for 1,000 credits. */
export const TEST_PACK = { amountPaise: 10_000, credits: 1_000 } as const;

/** A plan unpaid this long is ended by the nightly check (Razorpay would keep raising unpaid
 *  invoices forever); Admin › Payments shows the day it ends. */
export const PAYMENT_DUE_END_DAYS = 30;
