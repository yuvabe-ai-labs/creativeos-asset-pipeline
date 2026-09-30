import type {
  Avatar, AvatarImage, AvatarStatus, AvatarVoice, AvatarVoiceSample, PersonType,
} from "./schema";
import type { AvatarPatch } from "./utils";

export type AvatarRow = {
  id: string;
  client_id: string;
  name: string;
  story: string;
  person_type: PersonType | null;
  front: AvatarImage | null;
  sheet: AvatarImage | null;
  sheet_stale: boolean;
  voice: AvatarVoice | null;
  voice_sample: AvatarVoiceSample | null;
  status: AvatarStatus;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToAvatar(row: AvatarRow): Avatar {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    story: row.story,
    personType: row.person_type,
    front: row.front,
    sheet: row.sheet,
    sheetStale: row.sheet_stale,
    voice: row.voice,
    voiceSample: row.voice_sample,
    status: row.status,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMN: Record<keyof AvatarPatch, string> = {
  name: "name",
  story: "story",
  personType: "person_type",
  front: "front",
  sheet: "sheet",
  sheetStale: "sheet_stale",
  status: "status",
};

/** Only keys present in the patch are written; `undefined` is skipped, `null` is kept. */
export function patchToRow(patch: AvatarPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof AvatarPatch)[]) {
    if (patch[key] !== undefined) out[COLUMN[key]] = patch[key];
  }
  return out;
}
