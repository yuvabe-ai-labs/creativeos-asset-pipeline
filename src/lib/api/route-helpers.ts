import { NextResponse } from "next/server";
import { getClientById } from "@/lib/db/clients";
import type { ClientRow } from "@/lib/db/types";

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
  return handler(clientId, client);
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
