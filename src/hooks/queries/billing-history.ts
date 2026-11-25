"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAdminPayments, fetchBillingLog, fetchOwnerPayments } from "@/services/billing-history.service";

// Billing's history lists, a page at a time (D588). Page 1 is rendered by the server page and
// refreshed with it (router.refresh after every change), so it is never fetched here: the queries
// run only for older pages. staleTime 0 because a change adds a row at the top and shifts every
// older page by one.
export const billingHistoryKeys = {
  all: ["billing-history"] as const,
  log: (orgId: string, page: number) => [...billingHistoryKeys.all, "log", orgId, page] as const,
  ownerPayments: (page: number) => [...billingHistoryKeys.all, "owner-payments", page] as const,
  adminPayments: (page: number) => [...billingHistoryKeys.all, "admin-payments", page] as const,
};

const olderPage = { staleTime: 0, placeholderData: keepPreviousData } as const;

export function useBillingLogPage(orgId: string, page: number) {
  return useQuery({ queryKey: billingHistoryKeys.log(orgId, page), queryFn: () => fetchBillingLog(orgId, page), enabled: page > 1, ...olderPage });
}

export function useOwnerPaymentsPage(page: number) {
  return useQuery({ queryKey: billingHistoryKeys.ownerPayments(page), queryFn: () => fetchOwnerPayments(page), enabled: page > 1, ...olderPage });
}

export function useAdminPaymentsPage(page: number) {
  return useQuery({ queryKey: billingHistoryKeys.adminPayments(page), queryFn: () => fetchAdminPayments(page), enabled: page > 1, ...olderPage });
}
