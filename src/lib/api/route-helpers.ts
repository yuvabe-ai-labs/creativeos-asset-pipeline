import { NextResponse } from "next/server";
import { getClientById } from "@/lib/db/clients";
import { getCanvasById } from "@/lib/db/canvases";
import type { ClientRow, CanvasRow } from "@/lib/db/types";
import { resolveCallerContext } from "@/lib/dal";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResponse = NextResponse<any>;

export async function withClient(
  params: Promise<{ id: string }>,
  handler: (clientId: string, client: ClientRow) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: clientId } = await params;
  const client = await getClientById(clientId);
  if (!client) return apiError("Client not found.", 404);

  // Org isolation: a client outside the caller's org is a 404 (never 403 — do not
  // confirm foreign resources exist). No super_admin bypass here — cross-org access
  // to a client's actual data is /admin's job or, later, impersonation (Stage 4), not
  // a standing exception on every route. super_admin's own clients still work fine.
  const caller = await resolveCallerContext();
  if (client.org_id !== caller.orgId) {
    return apiError("Client not found.", 404);
  }
  return handler(clientId, client);
}

// ── Canvas resolution ──────────────────────────────────────────────────────────

// Same org-isolation shape as withClient(), for the handful of routes rooted at a
// canvas id instead of a client id (/api/canvas/[id]/*, /api/canvases/[cid]/*) —
// these never went through withClient() at all, since it only guards
// /api/clients/[id]/*, so they had no org check whatsoever. Canvas -> client -> org.
export async function withCanvas(
  params: Promise<{ id: string }>,
  handler: (canvasId: string, canvas: CanvasRow) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: canvasId } = await params;
  const canvas = await getCanvasById(canvasId);
  if (!canvas) return apiError("Canvas not found.", 404);

  const client = await getClientById(canvas.client_id);
  const caller = await resolveCallerContext();
  if (!client || client.org_id !== caller.orgId) {
    return apiError("Canvas not found.", 404);
  }
  return handler(canvasId, canvas);
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
