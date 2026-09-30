// Shared by every browser-side service that calls the app's own API routes: parses the JSON
// body and throws the server's `error` message (or a fallback) when the response is not ok.
export async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? fallback);
  return json as T;
}
