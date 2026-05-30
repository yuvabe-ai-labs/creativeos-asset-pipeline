// In-memory domain types for increment 1B.
// These mirror the future Supabase tables (clients → canvases → nodes), but for now
// they live only in React state and reset on refresh. In 1D they become DB-backed.

export type Canvas = {
  id: string;
  name: string;
  createdAt: number;
};

export type Client = {
  id: string;
  name: string;
  logo?: string; // data URL (1B in-memory); becomes a storage path in 1D
  contextNotes: string; // "ambient" client context (see architecture doc)
  canvases: Canvas[];
  createdAt: number;
};
