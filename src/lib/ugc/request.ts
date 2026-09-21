// Browser-side fetch for the UGC bench that records every call for the activity log.
// The point is debuggability: when something fails, the raw status + body is on screen
// and can be copied, instead of a vague "request failed".

export type LogEntry = {
  id: string;
  at: string;
  label: string;
  method: "GET" | "POST";
  url: string;
  ok: boolean;
  httpStatus: number | null;
  ms: number;
  request?: unknown;
  response: unknown;
};

export type Logger = (entry: Omit<LogEntry, "id" | "at">) => void;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function request<T extends { error?: string | null }>(
  log: Logger,
  label: string,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
  opts: { logSuccess?: boolean } = {},
): Promise<Result<T>> {
  const started = performance.now();
  const record = (ok: boolean, httpStatus: number | null, response: unknown) =>
    (!ok || opts.logSuccess !== false) &&
    log({ label, method, url, ok, httpStatus, ms: Math.round(performance.now() - started), request: body, response });

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const error = `Network error — is the dev server running? (${String(e)})`;
    record(false, null, { error });
    return { ok: false, error };
  }

  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    // The auth proxy answers an expired session with the login page (HTML), not JSON.
    const error = res.url.includes("/login")
      ? "Your login session expired — reload the page and log in again."
      : `Server returned non-JSON (HTTP ${res.status})`;
    record(false, res.status, { error, body: text.slice(0, 500) });
    return { ok: false, error };
  }

  const error = !res.ok ? (data.error ?? `HTTP ${res.status}`) : (data.error ?? null);
  record(!error, res.status, data);
  return error ? { ok: false, error } : { ok: true, data };
}
