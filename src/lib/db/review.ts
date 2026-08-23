import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDisplayNames } from "./profiles";
import {
  summarizeCounts,
  inboxFilterFor,
  type ReviewCounts,
  type InboxItem,
} from "@/lib/review/queue";

// One page of a review list. Small enough that the first paint is fast on a slow
// connection, large enough that a normal canvas needs no second fetch.
export const DEFAULT_PAGE_SIZE = 25;
import type { OrgRole } from "@/lib/dal-logic";
import type { ApprovalStatus } from "@/lib/approval";

// D159: every function here is a filter over the ONE review_queue_items view (migration
// 0031). Counts, the canvas drawer and the org-wide inbox cannot drift apart, because
// there is nothing to drift from.

// Shape the view returns. Local on purpose: it is a projection, not a domain type.
type QueueRow = {
  org_id: string;
  client_id: string;
  client_name: string;
  client_slug: string;
  canvas_id: string;
  canvas_name: string;
  canvas_slug: string;
  node_id: string;
  node_type: string;
  node_title: string | null;
  version_id: string;
  output: unknown;
  approval_status: ApprovalStatus;
  note: string | null;
  operator_user_id: string | null;
  operator: string | null;
  created_at: string;
};

const QUEUE_COLUMNS =
  "org_id, client_id, client_name, client_slug, canvas_id, canvas_name, canvas_slug, " +
  "node_id, node_type, node_title, version_id, output, approval_status, note, " +
  "operator_user_id, operator, created_at";

// R5.1/R5.2/R5.3 — one RPC call, never one query per row (PRD §8: the client list renders
// for every org member on every visit).
export async function getOrgReviewCounts(orgId: string): Promise<ReviewCounts> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("org_review_counts", { p_org_id: orgId });
  if (error) throw error;
  return summarizeCounts(
    ((data ?? []) as { client_id: string; canvas_id: string; pending: number }[]).map(
      (r) => ({ clientId: r.client_id, canvasId: r.canvas_id, pending: r.pending }),
    ),
  );
}

// Resolves maker names in ONE round trip for the whole page of rows, then maps. Doing it
// per row would be the N+1 PRD §8 warns about, wearing a different costume.
async function toInboxItems(orgId: string, rows: QueueRow[]): Promise<InboxItem[]> {
  const names = await resolveDisplayNames(
    orgId,
    rows.map((r) => r.operator_user_id).filter((id): id is string => !!id),
  );
  return rows.map((r) => ({
    versionId: r.version_id,
    nodeId: r.node_id,
    nodeType: r.node_type,
    nodeTitle: r.node_title,
    clientName: r.client_name,
    clientSlug: r.client_slug,
    canvasName: r.canvas_name,
    canvasSlug: r.canvas_slug,
    output: typeof r.output === "string" ? r.output : null,
    approvalStatus: r.approval_status,
    note: r.note,
    operatorUserId: r.operator_user_id,
    // R11.3 -> R11.4: the current display name, else the legacy free-text operator, else
    // nothing. Degrades visibly; never blocks the row from rendering.
    makerName: (r.operator_user_id && names.get(r.operator_user_id)) || r.operator || null,
    createdAt: r.created_at,
  }));
}

// R6.1/R6.2 — the canvas review drawer. Pending only: the drawer holds what is still
// outstanding (R6.6), so an item leaves it the moment it is decided, without anything
// having to remove it.
export async function listCanvasPendingItems(
  orgId: string,
  canvasId: string,
  page: { limit: number; offset: number } = { limit: DEFAULT_PAGE_SIZE, offset: 0 },
): Promise<InboxItem[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("review_queue_items")
    .select(QUEUE_COLUMNS)
    .eq("org_id", orgId)
    .eq("canvas_id", canvasId)
    .eq("approval_status", "pending")
    // Secondary sort on version_id: created_at alone is not unique enough on a batch
    // generated in the same second, and a non-deterministic order makes offset paging
    // drop or repeat rows between pages.
    .order("created_at", { ascending: false })
    .order("version_id", { ascending: false })
    .range(page.offset, page.offset + page.limit - 1);
  if (error) throw error;
  // `as unknown as` because review_queue_items is a VIEW created in migration 0031 and is
  // absent from the generated Supabase types, so the client infers GenericStringError[].
  // Same shape as route-helpers.ts's NodeWithOrgChain cast.
  return toInboxItems(orgId, (data ?? []) as unknown as QueueRow[]);
}

// R9.1/R9.5 — the org-wide navbar popover. Fetches both actionable states and lets the
// pure selector decide, so the role rule lives in exactly one tested place rather than
// being re-expressed as a SQL filter that could disagree with it.
export async function listOrgReviewInbox(
  orgId: string,
  userId: string,
  role: OrgRole,
  page: { limit: number; offset: number } = { limit: DEFAULT_PAGE_SIZE, offset: 0 },
): Promise<InboxItem[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("review_queue_items")
    .select(QUEUE_COLUMNS)
    .eq("org_id", orgId)
    // The role rule runs in SQL, not in JS after the fetch — otherwise every page comes
    // back the wrong size (ask for 25, get 9). inboxFilterFor is proven equivalent to
    // selectInboxFor by queue.test.ts.
    .or(inboxFilterFor(role, userId))
    .order("created_at", { ascending: false })
    .order("version_id", { ascending: false })
    .range(page.offset, page.offset + page.limit - 1);
  if (error) throw error;
  // Cast explained at listCanvasPendingItems above (view absent from generated types).
  return toInboxItems(orgId, (data ?? []) as unknown as QueueRow[]);
}
