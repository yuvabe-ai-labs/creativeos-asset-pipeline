import { NextResponse } from "next/server";
import { getClientById } from "@/lib/db/clients";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ClientRow, CanvasRow, NodeRow } from "@/lib/db/types";
import { resolveOrgId, resolveCallerContext, type CallerContext } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { IMPERSONATION_READ_ONLY_MESSAGE } from "@/lib/auth/constants";
import { logImpersonationEvent } from "@/lib/db/impersonation-audit";

// PostgREST may surface an embedded to-one relation as an object or a single-element
// array, depending on schema-cache heuristics (same ambiguity handled in
// recent-canvas.ts and organizations.ts::listOrgMembers). Shared here since withCanvas
// and withNode both need it (withNode needs it twice, for two nested levels).
function unwrapEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResponse = NextResponse<any>;

// The Stage 4 write-gate (D81): while impersonating and not in elevated mode, every
// non-GET/HEAD request is blocked before its handler runs. Allowed writes while
// elevated are audit-logged here too, so every call site that adopts this gate gets
// both behaviors for free — no per-route bookkeeping.
export async function assertImpersonationWriteAllowed(req: Request): Promise<AnyResponse | null> {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return null;

  const impersonation = await resolveImpersonationState();
  if (!impersonation.isImpersonating) return null;

  if (!impersonation.elevated) {
    return apiError(IMPERSONATION_READ_ONLY_MESSAGE, 403);
  }

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

export async function withClient(
  req: Request,
  params: Promise<{ id: string }>,
  handler: (clientId: string, client: ClientRow) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: clientId } = await params;
  const client = await getClientById(clientId);
  if (!client) return apiError("Client not found.", 404);

  // Org isolation: a client outside the effective org (the caller's own org, or the
  // impersonation target when active — resolveOrgId() decides which) is a 404 (never
  // 403 — do not confirm foreign resources exist).
  const effectiveOrgId = await resolveOrgId();
  if (client.org_id !== effectiveOrgId) {
    return apiError("Client not found.", 404);
  }

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  return handler(clientId, client);
}

// ── Canvas resolution ──────────────────────────────────────────────────────────

type CanvasWithOrg = CanvasRow & {
  clients: { org_id: string } | { org_id: string }[] | null;
};

// Same org-isolation shape as withClient(), for the handful of routes rooted at a
// canvas id instead of a client id (/api/canvas/[id]/*, /api/canvases/[cid]/*) —
// these never went through withClient() at all, since it only guards
// /api/clients/[id]/*, so they had no org check whatsoever. Canvas -> client -> org,
// resolved in one query via an embedded join, not two sequential lookups.
export async function withCanvas(
  req: Request,
  params: Promise<{ id: string }>,
  handler: (canvasId: string, canvas: CanvasRow) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: canvasId } = await params;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("*, clients!inner(org_id)")
    .eq("id", canvasId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return apiError("Canvas not found.", 404);

  const row = data as unknown as CanvasWithOrg;
  const client = unwrapEmbed(row.clients);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) {
    return apiError("Canvas not found.", 404);
  }

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const { clients: _clients, ...canvas } = row;
  return handler(canvasId, canvas as CanvasRow);
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
  handler: (
    nodeId: string,
    node: NodeRow,
    caller: CallerContext,
    clientId: string,
    effectiveOrgId: string,
  ) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: nodeId } = await params;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nodes")
    .select("*, canvases!inner(client_id, clients!inner(org_id))")
    .eq("id", nodeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return apiError("Node not found.", 404);

  const row = data as unknown as NodeWithOrgChain;
  const canvas = unwrapEmbed(row.canvases);
  const client = canvas ? unwrapEmbed(canvas.clients) : null;
  const effectiveOrgId = await resolveOrgId();
  if (!canvas || !client || client.org_id !== effectiveOrgId) {
    return apiError("Node not found.", 404);
  }

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const caller = await resolveCallerContext();
  const { canvases: _canvases, ...node } = row;
  return handler(nodeId, node as NodeRow, caller, canvas.client_id, effectiveOrgId);
}

// ── Moodboard resolution ──────────────────────────────────────────────────────

type MoodboardWithOrg = {
  id: string;
  clients: { org_id: string } | { org_id: string }[] | null;
};

// Same org-isolation shape as withClient()/withCanvas()/withNode(), for the routes
// rooted at a moodboard id (/api/moodboards/[id]/*). Those shipped deliberately open
// under D14 ("auth deferred, like the rest of the app") and were never revisited when
// auth landed — so a board id from ANY org resolved and served, or deleted, its items.
// Moodboard -> client -> org in one query, 404 (never 403) on mismatch.
export async function withMoodboard(
  req: Request,
  moodboardId: string,
  handler: (moodboardId: string, caller: CallerContext) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboards")
    .select("id, clients!inner(org_id)")
    .eq("id", moodboardId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return apiError("Moodboard not found.", 404);

  const client = unwrapEmbed((data as unknown as MoodboardWithOrg).clients);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) {
    return apiError("Moodboard not found.", 404);
  }

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const caller = await resolveCallerContext();
  return handler(moodboardId, caller);
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
    const message = e instanceof Error ? e.message : fallbackMessage;
    return apiError(message, 500);
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
