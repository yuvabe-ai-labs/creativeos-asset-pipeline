import { readJson } from "./read-json";

export type TestOrder = { orderId: string; amountPaise: number; credits: number; keyId: string };
export type CheckoutResult = { orderId: string; paymentId: string; signature: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

class BillingService {
  async createTestOrder(): Promise<TestOrder> {
    return readJson<TestOrder>(await fetch("/api/billing/test-order", { method: "POST" }), "Could not start the payment.");
  }

  async confirmTestPayment(input: CheckoutResult): Promise<{ received: true }> {
    const res = await fetch("/api/billing/test-confirm", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) });
    return readJson<{ received: true }>(res, "The payment couldn't be confirmed.");
  }
}

export const billingService = new BillingService();
