import { NextResponse } from "next/server";
import { getClientById } from "@/lib/db/clients";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ClientRow, CanvasRow, NodeRow } from "@/lib/db/types";
import type { CallerContext } from "@/lib/dal";
import { resolveImpersonationState, type ImpersonationState } from "@/lib/auth/impersonation";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { denialFor, FORBIDDEN_MESSAGE, type Denial } from "@/lib/permissions/check";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { IMPERSONATION_READ_ONLY_MESSAGE } from "@/lib/auth/constants";
import { logImpersonationEvent } from "@/lib/db/impersonation-audit";
import { getReviewByToken, type ReviewByToken } from "@/lib/db/client-reviews";
import { toCanonicalShareToken } from "@/lib/client-review/token";
import { getScriptReviewByToken } from "@/lib/db/script-reviews";
import type { ScriptReviewByToken } from "@/lib/script-review/wire";
import { unwrapEmbed } from "@/lib/db/embed";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResponse = NextResponse<any>;

// D496: every handler names the one permission it needs. Required, so TypeScript forces the
// decision; route-coverage.test.ts fails on any handler that skips the chokepoints.
export type Guard = { need: PermissionKey };

function denial(denied: Denial, notFoundMessage: string): AnyResponse {
  return denied === "not_found" ? apiError(notFoundMessage, 404) : apiError(FORBIDDEN_MESSAGE, 403);
}

// The Stage 4 write-gate (D81): while impersonating and not in elevated mode, every
// non-GET/HEAD request is blocked before its handler runs. Allowed writes while
// elevated are audit-logged here too, so every call site that adopts this gate gets
// both behaviors for free — no per-route bookkeeping.
export async function assertImpersonationWriteAllowed(req: Request): Promise<AnyResponse | null> {
  return writeGate(req, await resolveImpersonationState());
}

async function writeGate(req: Request, impersonation: ImpersonationState): Promise<AnyResponse | null> {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return null;
  if (!impersonation.isImpersonating) return null;
  if (!impersonation.elevated) return apiError(IMPERSONATION_READ_ONLY_MESSAGE, 403);
  await logImpersonationEvent({
    operatorId: impersonation.operatorId,
    targetOrgId: impersonation.targetOrgId,
    eventType: "write_action",
    detail: { method, path: new URL(req.url).pathname },
  });
  return null;
}

// ── Route param type ──────────────────────────────────────────────────────────

export type RouteParams<K extends string = "id"> = {
  params: Promise<Record<K, string>>;
};

// ── Response helpers ──────────────────────────────────────────────────────────

export function apiError(
  message: string,
  status: number,
): NextResponse<{ error: string }> {
  return NextResponse.json({ error: message }, { status });
}

export function apiOk<T extends Record<string, unknown>>(
  data: T,
  status = 200,
): NextResponse<T> {
  return NextResponse.json(data, { status });
}

// ── Client resolution ─────────────────────────────────────────────────────────

// Every chokepoint below resolves the caller ONCE (resolveActingCaller) and hands the handler
// that caller and the agency being acted in. Handlers use them and never resolve the caller
// again: React's cache() does not dedupe inside route handlers, so a second resolution re-runs
// the Auth check and the access read, and loses the owner access an impersonator acts with.
export async function withClient(
  req: Request,
  params: Promise<{ id: string }>,
  guard: Guard,
  handler: (clientId: string, client: ClientRow, caller: CallerContext, effectiveOrgId: string) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: clientId } = await params;
  // The client lookup and the caller don't depend on each other (same reasoning as withNode).
  const [client, acting] = await Promise.all([getClientById(clientId), resolveActingCaller()]);
  // Org isolation: 404, never 403 — do not confirm foreign resources exist.
  if (!client || client.org_id !== acting.effectiveOrgId) return apiError("Client not found.", 404);

  const denied = denialFor(accessOf(acting.caller), guard.need, clientId);
  if (denied) return denial(denied, "Client not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  return handler(clientId, client, acting.caller, acting.effectiveOrgId);
}

// ── Canvas resolution ──────────────────────────────────────────────────────────

type CanvasWithOrg = CanvasRow & {
  clients: { org_id: string } | { org_id: string }[] | null;
};

// Same shape as withClient() for routes rooted at a canvas id (/api/canvas/[id]/*,
// /api/canvases/[cid]/*): agency, client scope and the permission, 404 before 403.
// Canvas -> client -> org in one query via an embedded join, beside the caller.
export async function withCanvas(
  req: Request,
  params: Promise<{ id: string }>,
  guard: Guard,
  handler: (canvasId: string, canvas: CanvasRow, caller: CallerContext, effectiveOrgId: string) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: canvasId } = await params;
  const supabase = createServerSupabase();
  const [{ data, error }, acting] = await Promise.all([
    supabase.from("canvases").select("*, clients!inner(org_id)").eq("id", canvasId).maybeSingle(),
    resolveActingCaller(),
  ]);
  if (error) throw error;
  if (!data) return apiError("Canvas not found.", 404);

  const row = data as unknown as CanvasWithOrg;
  const client = unwrapEmbed(row.clients);
  if (!client || client.org_id !== acting.effectiveOrgId) return apiError("Canvas not found.", 404);

  const denied = denialFor(accessOf(acting.caller), guard.need, row.client_id);
  if (denied) return denial(denied, "Canvas not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  const { clients: _clients, ...canvas } = row;
  return handler(canvasId, canvas as CanvasRow, acting.caller, acting.effectiveOrgId);
}

// ── Node resolution ───────────────────────────────────────────────────────────

type NodeWithOrgChain = NodeRow & {
  canvases:
    | { client_id: string; clients: { org_id: string } | { org_id: string }[] | null }
    | { client_id: string; clients: { org_id: string } | { org_id: string }[] | null }[]
    | null;
};

// Same org-isolation shape as withClient()/withCanvas(), for the 13 route files under
// /api/nodes/[id]/* — none of them went through withClient() (it only guards
// /api/clients/[id]/*), so they had no org check at all. Node -> canvas -> client -> org,
// resolved in ONE query via embedded joins (not three sequential round trips) — this
// runs on every generation request, so the chain is collapsed up front, not after the fact.
// Also hands the resolved CallerContext + clientId to the callback — routes that insert
// into generations (org_id not-null since 0014; client_id/user_id/email available too)
// need them and both are already resolved here, so no extra query to pass them along.
export async function withNode(
  req: Request,
  params: Promise<{ id: string }>,
  guard: Guard,
  handler: (
    nodeId: string,
    node: NodeRow,
    caller: CallerContext,
    clientId: string,
    effectiveOrgId: string,
  ) => Promise<AnyResponse>,
  // Route-local override for the "row doesn't exist" case only. Callers whose result is
  // meaningless for a missing node (e.g. /cost — no row means no generations, same
  // as zero) can hand back a soft default instead of the generic 404. Every denial stays
  // hard: another agency's node and a client outside the person's list are a 404, a
  // missing permission a 403, and the write gate still runs (access checks, not lookup misses).
  options?: { onNotFound?: () => AnyResponse },
): Promise<AnyResponse> {
  const { id: nodeId } = await params;
  const supabase = createServerSupabase();
  // The node lookup, the caller (an Auth-server session check plus a membership read) and
  // the impersonation cookie don't depend on each other, so they run side by side — this
  // wrapper fronts every node route, the focus views' reads included.
  //
  // The caller is resolved ONCE (resolveActingCaller): React's cache() does not dedupe inside
  // route handlers, so resolving it twice would re-run the Auth check and membership read.
  const [{ data, error }, acting] = await Promise.all([
    supabase
      .from("nodes")
      .select("*, canvases!inner(client_id, clients!inner(org_id))")
      .eq("id", nodeId)
      .maybeSingle(),
    resolveActingCaller(),
  ]);
  if (error) throw error;
  if (!data) return options?.onNotFound?.() ?? apiError("Node not found.", 404);

  const row = data as unknown as NodeWithOrgChain;
  const canvas = unwrapEmbed(row.canvases);
  const client = canvas ? unwrapEmbed(canvas.clients) : null;
  if (!canvas || !client || client.org_id !== acting.effectiveOrgId) {
    return apiError("Node not found.", 404);
  }

  const denied = denialFor(accessOf(acting.caller), guard.need, canvas.client_id);
  if (denied) return denial(denied, "Node not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  const { canvases: _canvases, ...node } = row;
  return handler(nodeId, node as NodeRow, acting.caller, canvas.client_id, acting.effectiveOrgId);
}

// ── Moodboard resolution ──────────────────────────────────────────────────────

type MoodboardWithOrg = {
  id: string;
  client_id: string;
  clients: { org_id: string } | { org_id: string }[] | null;
};

// Same org-isolation shape as withClient()/withCanvas()/withNode(), for the routes
// rooted at a moodboard id (/api/moodboards/[id]/*). Those shipped deliberately open
// under D14 ("auth deferred, like the rest of the app") and were never revisited when
// auth landed — so a board id from ANY org resolved and served, or deleted, its items.
// Moodboard -> client -> org in one query: another agency or a client outside the person's
// list is a 404, a missing permission a 403.
export async function withMoodboard(
  req: Request,
  moodboardId: string,
  guard: Guard,
  handler: (moodboardId: string, caller: CallerContext, effectiveOrgId: string) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const supabase = createServerSupabase();
  const [{ data, error }, acting] = await Promise.all([
    supabase
      .from("moodboards")
      .select("id, client_id, clients!inner(org_id)")
      .eq("id", moodboardId)
      .maybeSingle(),
    resolveActingCaller(),
  ]);
  if (error) throw error;
  if (!data) return apiError("Moodboard not found.", 404);

  const row = data as unknown as MoodboardWithOrg;
  const client = unwrapEmbed(row.clients);
  if (!client || client.org_id !== acting.effectiveOrgId) return apiError("Moodboard not found.", 404);

  const denied = denialFor(accessOf(acting.caller), guard.need, row.client_id);
  if (denied) return denial(denied, "Moodboard not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  return handler(moodboardId, acting.caller, acting.effectiveOrgId);
}

// For routes not rooted at one client or resource: the voice library, the moodboard index, the
// review inbox and counts. A client-scoped key passes when held for at least one client; the
// handler then filters what it returns with canSeeClient (D496).
export async function withAccess(
  req: Request,
  guard: Guard,
  handler: (caller: CallerContext, effectiveOrgId: string) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const acting = await resolveActingCaller();
  const denied = denialFor(accessOf(acting.caller), guard.need, null);
  if (denied) return denial(denied, "Not found.");
  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;
  return handler(acting.caller, acting.effectiveOrgId);
}

// ── Share-token resolution (D309) ─────────────────────────────────────────────

// The ONE unauthenticated entry point in the app: /api/r/[token]/* (exempted in
// src/proxy.ts). The token is the capability — no session, no org check, no
// impersonation gate (there is no operator here). Unknown → 404, like every other
// resolver; a malformed token never reaches the database.
export async function withShareToken(
  params: Promise<{ token: string }>,
  handler: (review: ReviewByToken) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { token: raw } = await params;
  // D311: a link is `<title-slug>-<code>`; only the code finds the review.
  const token = toCanonicalShareToken(raw);
  if (!token) return apiError("Review not found.", 404);
  const review = await getReviewByToken(token);
  if (!review) return apiError("Review not found.", 404);
  return handler(review);
}

// D356: the second named token resolver, for /api/r/s/[token]/* (script reviews). Same rules as
// withShareToken — under the same proxy exemption, no session, no org check, no impersonation
// gate — and the same link parsing (D311): only the code at the end finds the review.
export async function withScriptShareToken(
  params: Promise<{ token: string }>,
  handler: (review: ScriptReviewByToken) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { token: raw } = await params;
  const token = toCanonicalShareToken(raw);
  if (!token) return apiError("Review not found.", 404);
  const review = await getScriptReviewByToken(token);
  if (!review) return apiError("Review not found.", 404);
  return handler(review);
}

// ── Webhook auth ──────────────────────────────────────────────────────────────

// Shared-secret check for server-to-server webhooks (Trigger.dev tasks calling back
// into this app). No user session exists at this boundary — this answers "is this
// actually our own task/a trusted caller," not "who is this user."
export function isAuthorizedWebhook(req: Request): boolean {
  const secret = process.env.TRIGGER_WEBHOOK_SECRET;
  if (!secret) {
    console.error("TRIGGER_WEBHOOK_SECRET is not set — all webhook calls will be rejected");
    return false;
  }
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

// ── Try/catch wrapper ─────────────────────────────────────────────────────────

export async function withTryCatch(
  fallbackMessage: string,
  handler: () => Promise<AnyResponse>,
): Promise<AnyResponse> {
  try {
    return await handler();
  } catch (e) {
    // A Supabase error is a plain object, not an Error: without this log its cause was lost
    // and the browser saw only the fallback.
    console.error(`[api] ${fallbackMessage}`, e);
    const message = e instanceof Error ? e.message : fallbackMessage;
    return apiError(message, 500);
  }
}

/**
 * Like withTryCatch, but an unexpected error never reaches the browser: its message (a database
 * error, a provider's wording) goes to the server log and the caller gets only `fallbackMessage`.
 * For routes whose errors are shown to people as-is. Deliberate 4xx answers from the handler
 * (apiError) still pass through unchanged.
 */
export async function withQuietErrors(
  fallbackMessage: string,
  handler: () => Promise<AnyResponse>,
): Promise<AnyResponse> {
  try {
    return await handler();
  } catch (e) {
    console.error(`[api] ${fallbackMessage}`, e);
    return apiError(fallbackMessage, 500);
  }
}

// ── File helpers ──────────────────────────────────────────────────────────────

export async function parseFormFile(
  req: Request,
  fieldName = "file",
): Promise<{ file: File } | NextResponse<{ error: string }>> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return apiError("Invalid form data.", 400);
  }
  const file = formData.get(fieldName);
  if (!(file instanceof File)) {
    return apiError(`A '${fieldName}' field is required.`, 400);
  }
  return { file };
}

export function validateFileExtension(
  file: File,
  allowed: Set<string>,
): { ext: string } | NextResponse<{ error: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.has(ext)) {
    return apiError(
      `Unsupported file type '.${ext}'. Allowed: ${[...allowed].join(", ")}.`,
      400,
    );
  }
  return { ext };
}

export function validateFileSize(
  newBytes: number,
  existingBytes: number,
  limitBytes: number,
  limitLabel: string,
): NextResponse<{ error: string }> | null {
  if (existingBytes + newBytes > limitBytes) {
    const usedMB = (existingBytes / 1024 / 1024).toFixed(1);
    const newMB = (newBytes / 1024 / 1024).toFixed(1);
    return apiError(
      `Adding this file (${newMB} MB) would exceed the ${limitLabel} limit. Currently using ${usedMB} MB.`,
      400,
    );
  }
  return null;
}

// isApiError — type guard for the tagged-union pattern used by parseFormFile
// and validateFileExtension. Call after each helper: if (isApiError(r)) return r;
export function isApiError(
  value: unknown,
): value is NextResponse<{ error: string }> {
  return value instanceof NextResponse;
}
