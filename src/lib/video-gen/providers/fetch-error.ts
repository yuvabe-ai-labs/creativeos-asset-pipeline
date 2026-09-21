import "server-only";

/**
 * Flatten an error's `cause` chain into one readable line.
 *
 * Node's fetch (undici) reports EVERY transport failure as the same opaque `TypeError: fetch
 * failed` — DNS failure, connection reset, TLS error, socket hang-up on an oversized body, and a
 * request abort all produce that identical string. The reason is only ever on `error.cause`, often
 * nested two levels deep with the useful part in a non-enumerable `code` (ECONNRESET, ENOTFOUND,
 * UND_ERR_SOCKET, ...).
 *
 * Rethrowing the bare message means a failed video generation says nothing about WHY, which is
 * exactly what happened here: a run failed with `TypeError: fetch failed` and no way to tell
 * whether it was the image download or the Omni call, let alone what went wrong.
 *
 * Depth-capped: a cause chain can be self-referential.
 */
export function describeFetchError(e: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = e;

  for (let depth = 0; depth < 5 && cur instanceof Error && !seen.has(cur); depth += 1) {
    seen.add(cur);
    const code = (cur as { code?: unknown }).code;
    const errno = (cur as { errno?: unknown }).errno;
    const detail = [typeof code === "string" ? code : null, typeof errno === "string" ? errno : null]
      .filter(Boolean)
      .join("/");
    parts.push(detail ? `${cur.message} [${detail}]` : cur.message);
    cur = (cur as { cause?: unknown }).cause;
  }

  if (parts.length === 0) return e instanceof Error ? e.message : String(e);
  return parts.join(" ← ");
}

/**
 * `fetch` that reports what actually went wrong.
 *
 * `label` names the call site ("Omni create", "image download"), because the generic message alone
 * cannot distinguish the several fetches one generation makes.
 */
export async function fetchOrThrow(
  label: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    throw new Error(`${label} could not reach the network: ${describeFetchError(e)}`);
  }
}
