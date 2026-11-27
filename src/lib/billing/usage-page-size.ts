/** Rows per page in billing's history lists (D583, D588); shared by each server read and its
 *  browser pager, so both count pages the same way. */
export const USAGE_RUNS_PAGE_SIZE = 20;
export const BILLING_LOG_PAGE_SIZE = 10;
export const OWNER_PAYMENTS_PAGE_SIZE = 10;
export const ADMIN_PAYMENTS_PAGE_SIZE = 25;

/** A page number from a query string: 1 to 500, anything else is 1. */
export function pageParam(raw: string | null): number {
  return Math.max(1, Math.min(500, Number(raw ?? "1") || 1));
}

/** How many pages `total` rows fill, at least one. */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}
