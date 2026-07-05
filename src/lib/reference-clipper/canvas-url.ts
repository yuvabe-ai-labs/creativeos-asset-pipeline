export type ParsedCanvasUrl = { clientSlug: string; canvasSlug: string };

// Extracts the client + canvas slugs from a CreativeOS canvas page URL:
//   {origin}/clients/{clientSlug}/canvases/{canvasSlug}[/...][?query]
// Returns null for any URL that doesn't match that shape (or isn't a URL).
export function parseCanvasUrl(url: string): ParsedCanvasUrl | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = pathname.match(/^\/clients\/([^/]+)\/canvases\/([^/]+)/);
  if (!m) return null;
  return { clientSlug: m[1], canvasSlug: m[2] };
}
