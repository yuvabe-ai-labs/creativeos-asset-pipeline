import { readJson } from "./read-json";
import type { BillingLogPage } from "@/lib/db/billing-admin";
import type { OwnerPaymentsPage } from "@/lib/db/billing-owner";
import type { AdminPaymentsPage } from "@/lib/db/billing-admin-payments";

// Older pages of billing's history lists (D588): one call per route, typed through readJson.
export async function fetchBillingLog(orgId: string, page: number): Promise<BillingLogPage> {
  return readJson<BillingLogPage>(await fetch(`/api/admin/orgs/${orgId}/billing-log?page=${page}`), "Could not load the billing log.");
}

export async function fetchOwnerPayments(page: number): Promise<OwnerPaymentsPage> {
  return readJson<OwnerPaymentsPage>(await fetch(`/api/billing/payments?page=${page}`), "Could not load payments.");
}

export async function fetchAdminPayments(page: number): Promise<AdminPaymentsPage> {
  return readJson<AdminPaymentsPage>(await fetch(`/api/admin/payments?page=${page}`), "Could not load payments.");
}
