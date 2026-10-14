// Shared by every browser-side service that calls the app's own API routes: parses the JSON
// body and throws the server's `error` message (or a fallback) when the response is not ok.

/** A failed API call, carrying the HTTP status — so a caller can tell "not found" (404) from a
 *  failure worth retrying, which a bare Error message cannot say. Still an Error: every existing
 *  `catch (e) { e.message }` keeps working. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

export async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((json as { error?: string }).error ?? fallback, res.status);
  return json as T;
}
