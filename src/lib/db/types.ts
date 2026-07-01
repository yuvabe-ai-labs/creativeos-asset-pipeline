// TypeScript shapes for our Supabase rows. snake_case = the actual DB columns.
// (Later we can auto-generate these with `supabase gen types`; hand-written is fine now.)

export type ClientRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  kb_status: "pending" | "in_review" | "ready";
  active_kb_version_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null; // null = active; ISO timestamp = archived
};

export type ClientBrandImageRow = {
  id: string;
  client_id: string;
  filename: string;
  file_ext: string;
  storage_url: string;
  size_bytes: number | null;
  created_at: string;
};

export type ClientKBDocumentRow = {
  id: string;
  client_id: string;
  filename: string;
  file_ext: string;
  storage_url: string;
  size_bytes: number | null;
  created_at: string;
};

export type ClientKBVersionRow = {
  id: string;
  client_id: string;
  output: Record<string, unknown>;
  model_used: string;
  doc_ids_used: string[];
  fill_rate: number | null;
  note: string | null;
  created_at: string;
};

export type CanvasRow = {
  id: string;
  client_id: string;
  slug: string;
  name: string;
  viewport: { x: number; y: number; zoom: number };
  created_at: string;
  updated_at: string;
  // D33 pessimistic lock — null when no one holds it.
  editing_session_id: string | null;
  editing_name: string | null;
  editing_heartbeat_at: string | null;
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
  // Frozen at generation, never mutated by edits (D22). The immutable record of the
  // model's raw attempt; `output` is the editable working copy that may diverge from it.
  generated_output: unknown;
  error: string | null;
  decision: string | null;
  note: string | null;
  operator: string | null;
  // D29 maker-checker approval flag (distinct from `decision`, the D22 quality signal).
  approval_status: "pending" | "approved" | "changes_requested";
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export type GenerationRow = {
  id: string;
  node_id: string;
  type: "image" | "video" | "prompt";
  status: "running" | "succeeded" | "failed";
  provider_job_id: string | null;
  model_used: string | null;
  params_snapshot: Record<string, unknown> | null;
  inputs_snapshot: Record<string, unknown> | null;
  tokens_used: Record<string, unknown> | null;
  credits_consumed: number | null;
  version_id: string | null;
  user_id: string | null;
  error: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
