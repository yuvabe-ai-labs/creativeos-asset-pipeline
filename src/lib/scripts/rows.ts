import { scriptDocSchema, type Script } from "./schema";
import { isScriptStage } from "./constants";

export type ScriptRow = {
  id: string;
  client_id: string;
  stage: string;
  doc: unknown;
  approved_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A row the app can show, or null. A row that fails validation (hand-edited, or from an
 *  older shape) is skipped with a warning rather than breaking the whole library. */
export function rowToScript(row: ScriptRow): Script | null {
  const doc = scriptDocSchema.safeParse(row.doc);
  if (!doc.success || !isScriptStage(row.stage)) {
    console.warn(`[scripts] skipping script ${row.id}: ${doc.success ? `unknown stage "${row.stage}"` : doc.error.message}`);
    return null;
  }
  return {
    id: row.id,
    clientId: row.client_id,
    stage: row.stage,
    doc: doc.data,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
