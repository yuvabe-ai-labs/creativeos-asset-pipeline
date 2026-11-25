import { NextResponse } from "next/server";
import { getClientById } from "@/lib/db/clients";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ClientRow, CanvasRow, NodeRow } from "@/lib/db/types";
import type { CallerContext } from "@/lib/dal";
import { resolveImpersonationState, type ImpersonationState } from "@/lib/auth/impersonation";
import { accessOf, resolveActingCaller, type ActingCaller } from "@/lib/permissions/server";
import { check, FORBIDDEN_MESSAGE, type Decision } from "@/lib/permissions/check";
import type { Action } from "@/lib/permissions/model";
import { IMPERSONATION_READ_ONLY_MESSAGE } from "@/lib/auth/constants";
import { logImpersonationEvent } from "@/lib/db/impersonation-audit";
import { getReviewVersionByLink, type ReviewByToken } from "@/lib/db/client-reviews";
import type { ReviewVersionRow } from "@/lib/client-review/wire";
import { parseReviewLink, toCanonicalShareToken } from "@/lib/client-review/token";
import { getScriptReviewByToken } from "@/lib/db/script-reviews";
import type { ScriptReviewByToken } from "@/lib/script-review/wire";
import { unwrapEmbed } from "@/lib/db/embed";
import { getOrgById } from "@/lib/db/organizations";
import { getDisplayName } from "@/lib/db/profiles";
import type { Actor, OpResult } from "@/lib/people/ops";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResponse = NextResponse<any>;

// D539/D542: every handler names the one action it needs. Required, so TypeScript forces the
// decision; route-coverage.test.ts fails on any handler that skips the chokepoints.
export type Guard = { need: Action };

function decide(acting: ActingCaller, need: Action, clientId: string | null): Decision {
  return check(accessOf(acting.caller), need, { orgId: acting.effectiveOrgId, clientId });
}

function denial(decision: Exclude<Decision, "allow">, notFoundMessage: string): AnyResponse {
  return decision === "not_found" ? apiError(notFoundMessage, 404) : apiError(FORBIDDEN_MESSAGE, 403);
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

  const decision = decide(acting, guard.need, clientId);
  if (decision !== "allow") return denial(decision, "Client not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  return handler(clientId, client, acting.caller, acting.effectiveOrgId);
}

// ── Canvas resolution ──────────────────────────────────────────────────────────

type CanvasWithOrg = CanvasRow & {
  clients: { org_id: string } | { org_id: string }[] | null;
};

/** A canvas lookup that Supabase answered with an error: logged, and a plain 500 for the user. */
function canvasReadFailed(error: { message: string }): NextResponse<{ error: string }> {
  console.error("[canvas-read]", error.message);
  return apiError("We couldn't open this canvas. Please try again.", 500);
}

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
  if (error) return canvasReadFailed(error);
  if (!data) return apiError("Canvas not found.", 404);

  const row = data as unknown as CanvasWithOrg;
  const client = unwrapEmbed(row.clients);
  if (!client || client.org_id !== acting.effectiveOrgId) return apiError("Canvas not found.", 404);

  const decision = decide(acting, guard.need, row.client_id);
  if (decision !== "allow") return denial(decision, "Canvas not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  const { clients: _clients, ...canvas } = row;
  return handler(canvasId, canvas as CanvasRow, acting.caller, acting.effectiveOrgId);
}

// ── Body-named canvas resolution ──────────────────────────────────────────────

/** The canvas a request body names, once it is known to be in the caller's effective org. */
export type VerifiedCanvas = {
  id: string;
  orgId: string;
  clientId: string;
  scriptId: string | null;
};

type BodyCanvasRow = {
  client_id: string;
  source_script_id: string | null;
  clients: { org_id: string } | { org_id: string }[] | null;
};

// withCanvas() for routes that take the canvas id from the request BODY instead of the
// path (the copilot routes). src/proxy.ts only requires a signed-in user, so without this
// any caller could name another org's canvas and read its content back. Canvas -> client ->
// org in one query, only the columns used, beside the caller (resolved once, as in withNode()).
// Another agency's canvas or a client outside the person's list is a 404, a missing permission
// a 403, and the impersonation write gate runs as in withCanvas().
export async function withBodyCanvas(
  req: Request,
  canvasId: string,
  guard: Guard,
  handler: (canvas: VerifiedCanvas, caller: CallerContext) => Promise<AnyResponse | Response>,
): Promise<AnyResponse | Response> {
  const supabase = createServerSupabase();
  const [{ data, error }, acting] = await Promise.all([
    supabase
      .from("canvases")
      .select("client_id, source_script_id, clients!inner(org_id)")
      .eq("id", canvasId)
      .maybeSingle(),
    resolveActingCaller(),
  ]);
  if (error) return canvasReadFailed(error);
  if (!data) return apiError("Canvas not found.", 404);

  const row = data as unknown as BodyCanvasRow;
  const client = unwrapEmbed(row.clients);
  if (!client || client.org_id !== acting.effectiveOrgId) {
    return apiError("Canvas not found.", 404);
  }

  const decision = decide(acting, guard.need, row.client_id);
  if (decision !== "allow") return denial(decision, "Canvas not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  return handler(
    { id: canvasId, orgId: client.org_id, clientId: row.client_id, scriptId: row.source_script_id },
    acting.caller,
  );
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

  const decision = decide(acting, guard.need, canvas.client_id);
  if (decision !== "allow") return denial(decision, "Node not found.");

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

  const decision = decide(acting, guard.need, row.client_id);
  if (decision !== "allow") return denial(decision, "Moodboard not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  return handler(moodboardId, acting.caller, acting.effectiveOrgId);
}

// For routes not rooted at one client or resource: the voice library, the moodboard index, the
// review inbox and counts. A client action passes when held on at least one client the person is
// on; the handler then keeps what it returns to those clients (clientIdsWith).
export async function withAccess(
  req: Request,
  guard: Guard,
  handler: (caller: CallerContext, effectiveOrgId: string) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const acting = await resolveActingCaller();
  const decision = decide(acting, guard.need, null);
  if (decision !== "allow") return denial(decision, "Not found.");
  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;
  return handler(acting.caller, acting.effectiveOrgId);
}

// ── Team (spec §6.1, §6.2, §6.6) ──────────────────────────────────────────────

export type TeamContext = {
  orgId: string;
  orgName: string;
  caller: CallerContext;
  /** Who is acting, for invites and emails ("{Inviter} has invited you"). */
  actor: Actor;
  /** Set when the route has a clientId: that client, checked to be in this agency. */
  client: ClientRow | null;
  /** A super admin working on the agency from Admin (not while viewing as it). */
  viaAdmin: boolean;
  /** The caller holds manage_team (the owner, or Admin). False for an Invite holder: the people
   *  read then keeps to their clients and withholds invite links and permissions. */
  canManage: boolean;
  /** Writes made from Admin go to the audit log as admin_action; a no-op for the owner. */
  logAdmin: (action: string, detail?: Record<string, unknown>) => Promise<void>;
};

// One chokepoint for the owner's Team and Members screens, Invite holders' Members screens and
// Admin's People and Clients tabs. need "manage_team" is owner only. need "invite" is checked on
// the route's client, taken from the URL (a client the caller is not on is a 404, one where they
// lack Invite a 403), or on any client when the route names none (the people read); the owner
// always passes. Both run under the usual impersonation write gate. A super admin working from
// Admin passes for any agency (D85: Admin is platform administration, not acting as the agency)
// and each change is audit-logged; while they view as this same agency, the agency path and its
// write gate apply. The agency, the client and the caller are read side by side, once.
export async function withTeam(
  req: Request,
  params: Promise<{ orgId: string; clientId?: string }>,
  guard: { need: "manage_team" | "invite" },
  handler: (ctx: TeamContext) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { orgId, clientId } = await params;
  const [acting, org, client] = await Promise.all([
    resolveActingCaller(),
    getOrgById(orgId),
    clientId ? getClientById(clientId) : Promise.resolve(null),
  ]);
  // One message for every 404 here, so an outsider can't tell whether a client belongs to an agency.
  if (!org) return apiError("Not found.", 404);
  if (clientId && (!client || client.org_id !== orgId)) return apiError("Not found.", 404);

  const { caller, impersonation } = acting;
  const viewingThisAgency = impersonation.isImpersonating && impersonation.targetOrgId === orgId;
  const viaAdmin = caller.platformRole === "super_admin" && !viewingThisAgency;
  let canManage = viaAdmin;
  if (!viaAdmin) {
    if (orgId !== acting.effectiveOrgId) return apiError("Not found.", 404);
    const access = accessOf(caller);
    // The named client goes to the check for both needs: someone not on it gets 404 before an
    // owner-only action's 403, so the refusal never confirms the client exists (spec §4.2 step 4).
    const decision = check(access, guard.need, { orgId, clientId: clientId ?? null });
    if (decision !== "allow") return denial(decision, "Not found.");
    const blocked = await writeGate(req, impersonation);
    if (blocked) return blocked;
    canManage = check(access, "manage_team", { orgId, clientId: null }) === "allow";
  }

  // One primary-key read, after the gate so a refused caller costs nothing more.
  const name = await getDisplayName(caller.userId);
  const logAdmin = async (action: string, detail: Record<string, unknown> = {}) => {
    if (!viaAdmin) return;
    await logImpersonationEvent({ operatorId: caller.userId, targetOrgId: orgId, eventType: "admin_action", detail: { action, ...detail } });
  };
  return handler({
    orgId,
    orgName: org.name,
    caller,
    actor: { userId: caller.userId, name: name ?? `Someone at ${org.name}` },
    client,
    viaAdmin,
    canManage,
    logAdmin,
  });
}

/** A people rule's answer as a response: refusals with their status and words. */
export function opResponse<T extends Record<string, unknown>>(result: OpResult<T | null>): AnyResponse {
  if (!result.ok) return apiError(result.error, result.status);
  return apiOk(result.value ?? {});
}

// ── Share-token resolution (D309) ─────────────────────────────────────────────

// The ONE unauthenticated entry point in the app: /api/r/[token]/* (exempted in
// src/proxy.ts). The token is the capability — no session, no org check, no
// impersonation gate (there is no operator here). Unknown → 404, like every other
// resolver; a malformed token never reaches the database.
//
// D496: a link names one version (`<title-slug>-<code>-v<n>`, no suffix = v1). The handler gets
// that version and only ever acts on it; a version that doesn't exist is a 404.
export async function withShareToken(
  params: Promise<{ token: string }>,
  handler: (review: ReviewByToken, version: ReviewVersionRow) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { token: raw } = await params;
  const link = parseReviewLink(raw);
  if (!link) return apiError("Review not found.", 404);
  const found = await getReviewVersionByLink(link.token, link.versionNo);
  if (!found) return apiError("Review not found.", 404);
  return handler(found.review, found.version);
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
