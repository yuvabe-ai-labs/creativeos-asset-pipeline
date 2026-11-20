"use client";

import { useMutation } from "@tanstack/react-query";
import { billingService, type CheckoutResult, type SubscriptionCheckoutResult } from "@/services/billing.service";

// D514: the test page only writes. The credits it adds reach the profile popover through that
// popover's own realtime channel on credit_transactions, so nothing here is cached or invalidated.
export function useCreateTestOrder() {
  return useMutation({ mutationFn: () => billingService.createTestOrder() });
}

export function useConfirmTestPayment() {
  return useMutation({ mutationFn: (input: CheckoutResult) => billingService.confirmTestPayment(input) });
}

// Monthly plans (D521). The plan state is read by the server page; after each step the page
// refreshes itself, so nothing here is cached either.
export function useSubscribe() {
  return useMutation({ mutationFn: (priceId: string) => billingService.subscribe(priceId) });
}

export function useConfirmSubscription() {
  return useMutation({ mutationFn: (input: SubscriptionCheckoutResult) => billingService.confirmSubscription(input) });
}

export function useCancelPlan() {
  return useMutation({ mutationFn: () => billingService.cancelPlan() });
}

export function useChangePlan() {
  return useMutation({ mutationFn: (priceId: string) => billingService.changePlan(priceId) });
}
