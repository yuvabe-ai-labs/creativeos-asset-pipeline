import { readJson } from "./read-json";

export type TestOrder = { orderId: string; amountPaise: number; credits: number; keyId: string };
export type CheckoutResult = { orderId: string; paymentId: string; signature: string };
export type TopUpOrder = { orderId: string; amountPaise: number; credits: number; keyId: string; name: string };
export type StartedSubscription = { subscriptionId: string; keyId: string };
export type SubscriptionCheckoutResult = { subscriptionId: string; paymentId: string; signature: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

class BillingService {
  async createTestOrder(): Promise<TestOrder> {
    return readJson<TestOrder>(await fetch("/api/billing/test-order", { method: "POST" }), "Could not start the payment.");
  }

  async confirmTestPayment(input: CheckoutResult): Promise<{ received: true }> {
    const res = await fetch("/api/billing/test-confirm", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) });
    return readJson<{ received: true }>(res, "The payment couldn't be confirmed.");
  }

  async startTopUp(priceId: string): Promise<TopUpOrder> {
    const res = await fetch("/api/billing/topup", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ priceId }) });
    return readJson<TopUpOrder>(res, "Could not start the payment.");
  }

  async confirmTopUp(input: CheckoutResult): Promise<{ received: true }> {
    const res = await fetch("/api/billing/topup/confirm", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) });
    return readJson<{ received: true }>(res, "The payment couldn't be confirmed.");
  }

  async subscribe(priceId: string): Promise<StartedSubscription> {
    const res = await fetch("/api/billing/subscribe", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ priceId }) });
    return readJson<StartedSubscription>(res, "Could not start the plan.");
  }

  async confirmSubscription(input: SubscriptionCheckoutResult): Promise<{ received: true }> {
    const res = await fetch("/api/billing/subscribe/confirm", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) });
    return readJson<{ received: true }>(res, "The payment couldn't be confirmed.");
  }

  async cancelPlan(): Promise<{ endsAt: string | null }> {
    return readJson<{ endsAt: string | null }>(await fetch("/api/billing/cancel", { method: "POST" }), "Could not cancel the plan.");
  }

  async changePlan(priceId: string): Promise<{ from: string | null }> {
    const res = await fetch("/api/billing/change", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ priceId }) });
    return readJson<{ from: string | null }>(res, "Could not change the plan.");
  }
}

export const billingService = new BillingService();
