"use client";

import { useMutation } from "@tanstack/react-query";
import { billingService, type CheckoutResult, type SubscriptionCheckoutResult } from "@/services/billing.service";

// D573: the test page only writes. The credits it adds reach the profile popover through that
// popover's own realtime channel on credit_transactions, so nothing here is cached or invalidated.
export function useCreateTestOrder() {
  return useMutation({ mutationFn: () => billingService.createTestOrder() });
}

export function useConfirmTestPayment() {
  return useMutation({ mutationFn: (input: CheckoutResult) => billingService.confirmTestPayment(input) });
}

// Monthly plans (D580). The plan state is read by the server page; after each step the page
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

// Approve a new plan price the owner's way of paying can't move to (D595).
export function useApproveNewPrice() {
  return useMutation({ mutationFn: () => billingService.approveNewPrice() });
}

// Top-ups (D581): one payment; the credits come with the order.paid webhook.
export function useStartTopUp() {
  return useMutation({ mutationFn: (priceId: string) => billingService.startTopUp(priceId) });
}

export function useConfirmTopUp() {
  return useMutation({ mutationFn: (input: CheckoutResult) => billingService.confirmTopUp(input) });
}

// Pay a due plan charge on the payment page (D585).
export function usePayNow() {
  return useMutation({ mutationFn: () => billingService.payNow() });
}
