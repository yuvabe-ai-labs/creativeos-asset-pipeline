// src/lib/db/script-reviews.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { ShareCodeTakenError } from "@/lib/db/client-reviews";
import type { ScriptStage } from "@/lib/scripts/constants";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { ScriptReviewEventKind, ShareScope } from "@/lib/script-review/constants";
import { tallyFeedback } from "@/lib/script-review/assemble";
import { columnsToPart, partToColumns } from "@/lib/script-review/parts";
import type {
  ChangedPart, CommentAuthorKind, Part, ScriptComment, ScriptReviewEvent, VersionVisuals,
} from "@/lib/script-review/types";
import {
  rowToComment, rowToEvent, rowToVersion, tokenRowToReview,
  type ScriptCommentRow, type ScriptEventRow, type ScriptReviewByToken, type ScriptReviewRow,
  type ScriptTokenRow, type ScriptVersion, type ScriptVersionRow,
} from "@/lib/script-review/wire";

// Script copilot spec 4 (D350). Team routes reach these through a script they already loaded with
// getScript(clientId, scriptId) — that is the client check; the public routes start from the share
// token. Every comment write also filters on review_id, so one link never touches another's rows.

const REVIEW_COLUMNS = "id, script_id, client_id, share_token, created_by, created_at";
const VERSION_COLUMNS = "id, review_id, number, scope, doc, visuals, created_at";
const COMMENT_COLUMNS =
  "id, review_id, part_kind, part_id, part_view, parent_id, author_kind, author_name, body, edited_by_name, " +
  "resolved_at, resolved_by_name, created_at, updated_at, version:script_review_versions!inner(number)";
const EVENT_COLUMNS = "id, script_id, kind, version_number, actor_kind, actor_name, detail, created_at";

const nonNull = <T>(v: T | null): v is T => v !== null;

export class ScriptReviewExistsError extends Error {
  constructor() {
    super("This script already has a review link.");
  }
}

export async function getScriptReviewForScript(scriptId: string): Promise<ScriptReviewRow | null> {
  const { data, error } = await createServerSupabase()
    .from("script_reviews")
    .select(REVIEW_COLUMNS)
    .eq("script_id", scriptId)
    .maybeSingle();
  if (error) throw error;
  return (data as ScriptReviewRow | null) ?? null;
}

export async function getScriptReviewByToken(token: string): Promise<ScriptReviewByToken | null> {
  const { data, error } = await createServerSupabase()
    .from("script_reviews")
    .select(`${REVIEW_COLUMNS}, client_scripts!inner(stage, archived_at), clients!inner(name, organizations!inner(name))`)
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? tokenRowToReview(data as unknown as ScriptTokenRow) : null;
}

/** Throws ShareCodeTakenError on a code clash (the caller retries one character longer, D311) and
 *  ScriptReviewExistsError when another request made this script's review first. */
export async function insertScriptReview(input: {
  scriptId: string;
  clientId: string;
  shareToken: string;
  createdBy: string;
}): Promise<ScriptReviewRow> {
  const { data, error } = await createServerSupabase()
    .from("script_reviews")
    .insert({ script_id: input.scriptId, client_id: input.clientId, share_token: input.shareToken, created_by: input.createdBy })
    .select(REVIEW_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      const which = `${error.message ?? ""} ${error.details ?? ""}`;
      if (which.includes("share_token")) throw new ShareCodeTakenError();
      throw new ScriptReviewExistsError();
    }
    throw error;
  }
  return data as ScriptReviewRow;
}

export async function listVersions(reviewId: string): Promise<ScriptVersion[]> {
  const { data, error } = await createServerSupabase()
    .from("script_review_versions")
    .select(VERSION_COLUMNS)
    .eq("review_id", reviewId)
    .order("number", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ScriptVersionRow[]).map(rowToVersion).filter(nonNull);
}

export async function getLatestVersion(reviewId: string): Promise<ScriptVersion | null> {
  const { data, error } = await createServerSupabase()
    .from("script_review_versions")
    .select(VERSION_COLUMNS)
    .eq("review_id", reviewId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToVersion(data as ScriptVersionRow) : null;
}

export type ShareResult = { status: "ok"; version: ScriptVersion } | { status: "stale" | "not_in_review" };

export async function shareVersion(input: {
  reviewId: string;
  expectedLatest: number;
  scope: ShareScope;
  doc: ScriptDoc;
  visuals: VersionVisuals;
  changes: ChangedPart[];
  sharedBy: string;
  actorName: string;
}): Promise<ShareResult> {
  const { data, error } = await createServerSupabase().rpc("script_review_share", {
    p_review_id: input.reviewId,
    p_expected_latest: input.expectedLatest,
    p_scope: input.scope,
    p_doc: input.doc,
    p_visuals: input.visuals,
    p_changes: input.changes,
    p_shared_by: input.sharedBy,
    p_actor_name: input.actorName,
  });
  if (error) throw error;
  const out = data as { status?: string; version?: ScriptVersionRow } | null;
  if (out?.status === "ok" && out.version) {
    const version = rowToVersion(out.version);
    if (!version) throw new Error("The shared version could not be read back.");
    return { status: "ok", version };
  }
  if (out?.status === "stale" || out?.status === "not_in_review") return { status: out.status };
  throw new Error(`Unexpected share result: ${JSON.stringify(out)}`);
}

export type ApproveStatus = "ok" | "already" | "stale" | "partial" | "not_in_review" | "not_found";
const APPROVE_STATUSES: readonly string[] = ["ok", "already", "stale", "partial", "not_in_review", "not_found"];

export async function approveVersion(input: { reviewId: string; versionNumber: number; actorName: string }): Promise<ApproveStatus> {
  const { data, error } = await createServerSupabase().rpc("script_review_approve", {
    p_review_id: input.reviewId,
    p_version_number: input.versionNumber,
    p_actor_name: input.actorName,
  });
  if (error) throw error;
  if (typeof data === "string" && APPROVE_STATUSES.includes(data)) return data as ApproveStatus;
  throw new Error(`Unexpected approval result: ${String(data)}`);
}

export async function moveScriptStage(input: {
  scriptId: string;
  clientId: string;
  from: ScriptStage;
  to: ScriptStage;
  event: ScriptReviewEventKind;
  actorName: string;
}): Promise<boolean> {
  const { data, error } = await createServerSupabase().rpc("script_review_move", {
    p_script_id: input.scriptId,
    p_client_id: input.clientId,
    p_from: input.from,
    p_to: input.to,
    p_kind: input.event,
    p_actor_name: input.actorName,
  });
  if (error) throw error;
  return data === true;
}

export async function listScriptComments(reviewId: string): Promise<ScriptComment[]> {
  const { data, error } = await createServerSupabase()
    .from("script_review_comments")
    .select(COMMENT_COLUMNS)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as ScriptCommentRow[]).map(rowToComment).filter(nonNull);
}

/** Head-only count, for MAX_COMMENTS_PER_REVIEW (D309's bound on one link's write volume). */
export async function countScriptComments(reviewId: string): Promise<number> {
  const { count, error } = await createServerSupabase()
    .from("script_review_comments")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId);
  if (error) throw error;
  return count ?? 0;
}

export async function getCommentForReply(
  reviewId: string,
  commentId: string,
): Promise<{ id: string; versionId: string; part: Part; parentId: string | null } | null> {
  const { data, error } = await createServerSupabase()
    .from("script_review_comments")
    .select("id, version_id, parent_id, part_kind, part_id, part_view")
    .eq("id", commentId)
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    id: string; version_id: string; parent_id: string | null; part_kind: string; part_id: string | null; part_view: string | null;
  };
  const part = columnsToPart(row.part_kind, row.part_id, row.part_view);
  return part ? { id: row.id, versionId: row.version_id, part, parentId: row.parent_id } : null;
}

export async function insertScriptComment(input: {
  reviewId: string;
  versionId: string;
  part: Part;
  parentId: string | null;
  authorKind: CommentAuthorKind;
  authorName: string;
  authorUserId: string | null;
  body: string;
}): Promise<ScriptComment> {
  const { data, error } = await createServerSupabase()
    .from("script_review_comments")
    .insert({
      review_id: input.reviewId,
      version_id: input.versionId,
      ...partToColumns(input.part),
      parent_id: input.parentId,
      author_kind: input.authorKind,
      author_name: input.authorName,
      author_user_id: input.authorUserId,
      body: input.body,
    })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw error;
  const comment = rowToComment(data as unknown as ScriptCommentRow);
  if (!comment) throw new Error("The comment could not be read back.");
  return comment;
}

/** Filtering on the review AND author_kind = 'client' is the ownership check: a link edits only its
 *  own review's client comments, never a team reply. Only the text changes. */
export async function updateClientComment(input: {
  reviewId: string;
  commentId: string;
  body: string;
  editedByName: string;
}): Promise<ScriptComment | null> {
  const { data, error } = await createServerSupabase()
    .from("script_review_comments")
    .update({ body: input.body, edited_by_name: input.editedByName, updated_at: new Date().toISOString() })
    .eq("id", input.commentId)
    .eq("review_id", input.reviewId)
    .eq("author_kind", "client")
    .select(COMMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToComment(data as unknown as ScriptCommentRow) : null;
}

/** Only a thread's first comment carries the Resolved mark; a reply id matches nothing. */
export async function setThreadResolved(input: {
  reviewId: string;
  commentId: string;
  resolved: boolean;
  byName: string | null;
}): Promise<ScriptComment | null> {
  const { data, error } = await createServerSupabase()
    .from("script_review_comments")
    .update({
      resolved_at: input.resolved ? new Date().toISOString() : null,
      resolved_by_name: input.resolved ? input.byName : null,
    })
    .eq("id", input.commentId)
    .eq("review_id", input.reviewId)
    .is("parent_id", null)
    .select(COMMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToComment(data as unknown as ScriptCommentRow) : null;
}

export async function listScriptEvents(scriptId: string): Promise<ScriptReviewEvent[]> {
  const { data, error } = await createServerSupabase()
    .from("script_review_events")
    .select(EVENT_COLUMNS)
    .eq("script_id", scriptId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ScriptEventRow[]).map(rowToEvent).filter(nonNull);
}

export async function hasApproval(scriptId: string, versionNumber: number): Promise<boolean> {
  const { count, error } = await createServerSupabase()
    .from("script_review_events")
    .select("id", { count: "exact", head: true })
    .eq("script_id", scriptId)
    .eq("kind", "approved")
    .eq("version_number", versionNumber);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Client comments and approvals per script, for one client's library (spec 4 §6). */
export async function listFeedbackCounts(clientId: string): Promise<Record<string, number>> {
  const supabase = createServerSupabase();
  const [comments, approvals] = await Promise.all([
    supabase
      .from("script_review_comments")
      .select("script_reviews!inner(script_id, client_id)")
      .eq("author_kind", "client")
      .eq("script_reviews.client_id", clientId),
    supabase
      .from("script_review_events")
      .select("script_id, client_scripts!inner(client_id)")
      .eq("kind", "approved")
      .eq("client_scripts.client_id", clientId),
  ]);
  if (comments.error) throw comments.error;
  if (approvals.error) throw approvals.error;
  type ReviewEmbed = { script_id: string } | { script_id: string }[] | null;
  const commentScriptIds = ((comments.data ?? []) as unknown as { script_reviews: ReviewEmbed }[]).flatMap((r) => {
    const review = Array.isArray(r.script_reviews) ? r.script_reviews[0] : r.script_reviews;
    return review ? [review.script_id] : [];
  });
  const approvalScriptIds = ((approvals.data ?? []) as { script_id: string }[]).map((r) => r.script_id);
  return tallyFeedback(commentScriptIds, approvalScriptIds);
}
