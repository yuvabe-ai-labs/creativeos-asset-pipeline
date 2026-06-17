import type { ClientRow } from "./types";

// Pure mapper for the clients list (count + last_active derived from embedded
// canvas timestamps). Lives here, not in the server-only repo, so it is testable
// (mirrors recent-canvas.ts).

export type ClientWithCount = ClientRow & {
  canvas_count: number;
  last_active: string | null; // MAX(canvas.updated_at); null when no canvases
};

// Shape Supabase returns for `clients.select("*, canvases(updated_at)")`.
export type RawClientWithCanvases = ClientRow & {
  canvases: { updated_at: string }[] | null;
};

export function mapClientWithCount(row: RawClientWithCanvases): ClientWithCount {
  const canvases = row.canvases ?? [];
  const last_active =
    canvases.length === 0
      ? null
      : canvases.reduce(
          (max, c) => (c.updated_at > max ? c.updated_at : max),
          canvases[0].updated_at,
        );
  const { canvases: _drop, ...client } = row;
  void _drop;
  return { ...client, canvas_count: canvases.length, last_active };
}
