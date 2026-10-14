import { scriptDocSchema, type ScriptDoc } from "../schema";
import { isScriptStage } from "../constants";
import type { ScriptRow } from "../rows";
import {
  briefSchema, EMPTY_BRIEF, EMPTY_NOTES, messageCardSchema, scriptNotesSchema,
  type GenerateScript, type ScriptMessage,
} from "./schema";

export type GenerateScriptRow = ScriptRow & { brief: unknown; notes: unknown; doc_version: number };
export type ScriptMessageRow = { id: string; role: string; content: string; card: unknown; created_at: string };

export function rowToGenerateScript(row: GenerateScriptRow): GenerateScript | null {
  if (!isScriptStage(row.stage)) return null;
  let doc: ScriptDoc | null = null;
  if (row.doc !== null && row.doc !== undefined) {
    const parsed = scriptDocSchema.safeParse(row.doc);
    if (!parsed.success) {
      console.warn(`[scripts] skipping script ${row.id}: ${parsed.error.message}`);
      return null;
    }
    doc = parsed.data;
  }
  const brief = briefSchema.safeParse(row.brief);
  const notes = scriptNotesSchema.safeParse(row.notes);
  const storedBrief = brief.success ? brief.data : EMPTY_BRIEF;
  return {
    id: row.id,
    clientId: row.client_id,
    stage: row.stage,
    doc,
    // A draft means the brief is done, whatever was stored (seeded scripts have no brief at all).
    brief: doc ? { ...storedBrief, phase: "written" } : storedBrief,
    notes: notes.success ? notes.data : EMPTY_NOTES,
    docVersion: row.doc_version ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToMessage(row: ScriptMessageRow): ScriptMessage {
  const card = messageCardSchema.safeParse(row.card);
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    card: row.card && card.success ? card.data : null,
    createdAt: row.created_at,
  };
}
