import type { PanelFaces, PanelTake } from "./schema";

export type PanelTakeRow = {
  id: string;
  client_id: string;
  script_id: string;
  shot_id: string;
  generation_id: string | null;
  status: string;
  url: string | null;
  width: number | null;
  height: number | null;
  prompt: string;
  prompt_edited: boolean;
  shot_key: string;
  faces: unknown;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const STATUSES = new Set(["running", "succeeded", "failed"]);

function isFaces(value: unknown): value is PanelFaces {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function rowToPanelTake(row: PanelTakeRow): PanelTake {
  return {
    id: row.id,
    scriptId: row.script_id,
    shotId: row.shot_id,
    status: STATUSES.has(row.status) ? (row.status as PanelTake["status"]) : "failed",
    url: row.url,
    width: row.width,
    height: row.height,
    prompt: row.prompt,
    promptEdited: row.prompt_edited,
    shotKey: row.shot_key,
    faces: isFaces(row.faces) ? row.faces : {},
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
