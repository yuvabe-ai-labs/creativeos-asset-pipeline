import type { CanvasRow } from "./types";

// A canvas flattened with its owning client, for the global "recent canvases" list.
// The pure mapper lives here (not in the server-only canvases repo) so it is testable.

type EmbeddedClient = {
  slug: string;
  name: string;
  logo_url: string | null;
};

// Shape Supabase returns for `canvases.select("*, clients(slug, name, logo_url)")`.
// PostgREST may surface a to-one relation as an object or a single-element array.
export type RawRecentCanvasRow = CanvasRow & {
  clients: EmbeddedClient | EmbeddedClient[] | null;
};

export type RecentCanvas = CanvasRow & {
  client_slug: string;
  client_name: string;
  client_logo_url: string | null;
};

export function mapRecentCanvas(raw: RawRecentCanvasRow): RecentCanvas {
  const { clients, ...canvas } = raw;
  const client = Array.isArray(clients) ? (clients[0] ?? null) : clients;
  return {
    ...canvas,
    client_slug: client?.slug ?? "",
    client_name: client?.name ?? "",
    client_logo_url: client?.logo_url ?? null,
  };
}
