// TypeScript shapes for our Supabase rows. snake_case = the actual DB columns.
// (Later we can auto-generate these with `supabase gen types`; hand-written is fine now.)

export type ClientRow = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  context_notes: string;
  created_at: string;
  updated_at: string;
};

export type CanvasRow = {
  id: string;
  client_id: string;
  slug: string;
  name: string;
  viewport: { x: number; y: number; zoom: number };
  created_at: string;
  updated_at: string;
};

export type NodeRow = {
  id: string;
  canvas_id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type NodeVersionRow = {
  id: string;
  node_id: string;
  inputs_used: Record<string, unknown>;
  params_used: Record<string, unknown>;
  model_used: string | null;
  output: unknown;
  error: string | null;
  decision: string | null;
  note: string | null;
  operator: string | null;
  created_at: string;
};
