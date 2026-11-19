"use client";

import { useMutation } from "@tanstack/react-query";
import { billingService, type CheckoutResult } from "@/services/billing.service";

// D514: the test page only writes. The credits it adds reach the profile popover through that
// popover's own realtime channel on credit_transactions, so nothing here is cached or invalidated.
export function useCreateTestOrder() {
  return useMutation({ mutationFn: () => billingService.createTestOrder() });
}

export function useConfirmTestPayment() {
  return useMutation({ mutationFn: (input: CheckoutResult) => billingService.confirmTestPayment(input) });
}
