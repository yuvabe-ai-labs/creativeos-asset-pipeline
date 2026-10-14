import type {
  Avatar, AvatarImage, AvatarSheetViews, AvatarStatus, AvatarVoice, AvatarVoiceSample, PersonType, AvatarCandidate,
} from "./schema";
import type { AvatarPatch } from "./utils";
import type { GenerationRow } from "@/lib/db/types";

export type AvatarRow = {
  id: string;
  client_id: string;
  name: string;
  story: string;
  person_type: PersonType | null;
  likeness_consent_by: string | null;
  likeness_consent_at: string | null;
  front: AvatarImage | null;
  sheet: AvatarImage | null;
  sheet_stale: boolean;
  sheet_views: AvatarSheetViews | null;
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
    likenessConsentBy: row.likeness_consent_by,
    likenessConsentAt: row.likeness_consent_at,
    front: row.front,
    sheet: row.sheet,
    sheetStale: row.sheet_stale,
    sheetViews: row.sheet_views ?? null,
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
  likenessConsentBy: "likeness_consent_by",
  likenessConsentAt: "likeness_consent_at",
  front: "front",
  sheet: "sheet",
  sheetStale: "sheet_stale",
  sheetViews: "sheet_views",
  status: "status",
  voice: "voice",
  voiceSample: "voice_sample",
};

/** Only keys present in the patch are written; `undefined` is skipped, `null` is kept. */
export function patchToRow(patch: AvatarPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof AvatarPatch)[]) {
    if (patch[key] !== undefined) out[COLUMN[key]] = patch[key];
  }
  return out;
}

// ── Generations → avatar images (plan 2) ──────────────────────────────────────

type GenerationInputs = { slot?: string; prompt?: string; batchId?: string | null; referenceUrls?: unknown[] };
type GenerationMeta = { width?: number | null; height?: number | null; sizeBytes?: number };

/** A succeeded avatar generation as an image whose source records how it was made (D289). */
export function generationToImage(row: GenerationRow): AvatarImage | null {
  if (row.status !== "succeeded" || !row.output_snapshot) return null;
  const inputs = (row.inputs_snapshot ?? {}) as GenerationInputs;
  const meta = (row.meta ?? {}) as GenerationMeta;
  return {
    url: row.output_snapshot,
    width: meta.width ?? null,
    height: meta.height ?? null,
    sizeBytes: meta.sizeBytes ?? 0,
    source: {
      kind: "generated",
      modelId: row.model_used ?? "",
      mode: (inputs.referenceUrls?.length ?? 0) > 0 ? "edit" : "text",
      prompt: inputs.prompt ?? "",
      generatedAt: row.created_at,
      generationId: row.id,
      // runAvatarGeneration stores the provider's bytes as they arrive.
      untouched: true,
    },
  };
}

/** A succeeded FRONT generation as something the operator can pick. */
export function generationToCandidate(row: GenerationRow): AvatarCandidate | null {
  const inputs = (row.inputs_snapshot ?? {}) as GenerationInputs;
  if (inputs.slot !== "front") return null;
  const image = generationToImage(row);
  if (!image) return null;
  return {
    generationId: row.id,
    batchId: inputs.batchId ?? null,
    url: image.url,
    modelId: row.model_used ?? "",
    createdAt: row.created_at,
    width: image.width,
    height: image.height,
    sizeBytes: image.sizeBytes,
  };
}
