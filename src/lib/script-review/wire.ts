// src/lib/script-review/wire.ts
// Database rows to app types. Pure: safe to import anywhere.
import { z } from "zod";
import { isScriptStage, type ScriptStage } from "@/lib/scripts/constants";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { isScriptReviewEventKind, isShareScope } from "./constants";
import { columnsToPart, parsePart } from "./parts";
import type { ChangedPart, ScriptComment, ScriptReviewEvent, VersionContent } from "./types";

type Embed<T> = T | T[] | null;
function one<T>(value: Embed<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type ScriptReviewRow = {
  id: string;
  script_id: string;
  client_id: string;
  share_token: string;
  created_by: string | null;
  created_at: string;
};

export type ScriptVersionRow = {
  id: string;
  review_id: string;
  number: number;
  scope: string;
  doc: unknown;
  visuals: unknown;
  created_at: string;
};

export type ScriptCommentRow = {
  id: string;
  review_id: string;
  part_kind: string;
  part_id: string | null;
  part_view: string | null;
  parent_id: string | null;
  author_kind: string;
  author_name: string;
  body: string;
  edited_by_name: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  created_at: string;
  updated_at: string;
  /** PostgREST embed `version:script_review_versions!inner(number)`: an object or a one-item array. */
  version: Embed<{ number: number }>;
};

export type ScriptEventRow = {
  id: string;
  script_id: string;
  kind: string;
  version_number: number | null;
  actor_kind: string;
  actor_name: string;
  detail: unknown;
  created_at: string;
};

export type ScriptTokenRow = ScriptReviewRow & {
  client_scripts: Embed<{ stage: string; archived_at: string | null }>;
  clients: Embed<{ name: string; organizations: Embed<{ name: string }> }>;
};

/** The review behind a share link, with what the page header needs: the studio and the client. */
export type ScriptReviewByToken = ScriptReviewRow & { stage: ScriptStage; clientName: string; orgName: string };

export type ScriptVersion = VersionContent & { id: string; number: number; sharedAt: string };

const viewUrl = z.string().nullable();
const versionVisualsSchema = z.object({
  avatars: z.record(
    z.string(),
    z.object({
      avatarId: z.string(),
      name: z.string(),
      views: z.object({ front: viewUrl, left: viewUrl, right: viewUrl, back: viewUrl }),
      voice: z.object({ name: z.string().nullable(), sampleUrl: z.string().nullable() }).nullable(),
    }),
  ),
  panels: z.record(z.string(), z.object({ takeId: z.string(), url: z.string() })),
});

export function rowToVersion(row: ScriptVersionRow): ScriptVersion | null {
  const doc = scriptDocSchema.safeParse(row.doc);
  const visuals = versionVisualsSchema.safeParse(row.visuals);
  if (!doc.success || !visuals.success || !isShareScope(row.scope)) {
    console.warn(`[script-review] skipping version ${row.id}: doc ${doc.success}, visuals ${visuals.success}, scope "${row.scope}"`);
    return null;
  }
  return { id: row.id, number: row.number, scope: row.scope, doc: doc.data, visuals: visuals.data, sharedAt: row.created_at };
}

export function rowToComment(row: ScriptCommentRow): ScriptComment | null {
  const part = columnsToPart(row.part_kind, row.part_id, row.part_view);
  const version = one(row.version);
  const authorKind = row.author_kind;
  if (!part || !version || (authorKind !== "client" && authorKind !== "team")) return null;
  return {
    id: row.id,
    versionNumber: version.number,
    part,
    parentId: row.parent_id,
    authorKind,
    authorName: row.author_name,
    body: row.body,
    editedByName: row.edited_by_name,
    resolvedAt: row.resolved_at,
    resolvedByName: row.resolved_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseChanges(value: unknown): ChangedPart[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ChangedPart[] => {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const part = o ? parsePart(o.part) : null;
    const change = o?.change;
    const label = o?.label;
    if (!part || typeof label !== "string" || (change !== "revised" && change !== "added" && change !== "removed")) return [];
    return [{ part, change, label }];
  });
}

export function rowToEvent(row: ScriptEventRow): ScriptReviewEvent | null {
  const actorKind = row.actor_kind;
  if (!isScriptReviewEventKind(row.kind) || (actorKind !== "client" && actorKind !== "team")) return null;
  const detail = row.detail && typeof row.detail === "object" ? (row.detail as Record<string, unknown>) : {};
  return {
    id: row.id,
    kind: row.kind,
    versionNumber: row.version_number,
    actorKind,
    actorName: row.actor_name,
    scope: isShareScope(detail.scope) ? detail.scope : null,
    changes: parseChanges(detail.changes),
    createdAt: row.created_at,
  };
}

/** Null for an archived script: spec 4 §10, deleting the script kills the link. */
export function tokenRowToReview(row: ScriptTokenRow): ScriptReviewByToken | null {
  const { client_scripts, clients, ...review } = row;
  const script = one(client_scripts);
  const client = one(clients);
  if (!script || script.archived_at || !isScriptStage(script.stage) || !client) return null;
  return { ...review, stage: script.stage, clientName: client.name, orgName: one(client.organizations)?.name ?? "" };
}
