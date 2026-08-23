// Shared limit/offset parsing for the review list endpoints. Clamped, because these come
// straight off a query string: an unbounded `limit` is a trivial way to make the server do
// unbounded work, and a negative `offset` makes PostgREST's .range() throw.
export const MAX_PAGE_SIZE = 50;
export const FALLBACK_PAGE_SIZE = 25;

export function parsePageParams(search: URLSearchParams): {
  limit: number;
  offset: number;
} {
  const rawLimit = Number(search.get("limit"));
  const rawOffset = Number(search.get("offset"));

  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE)
    : FALLBACK_PAGE_SIZE;

  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  return { limit, offset };
}
