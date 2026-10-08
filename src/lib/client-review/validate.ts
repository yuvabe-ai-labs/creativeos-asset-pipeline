import { COMMENT_BODY_MAX, CUT_EXTENSIONS, REVIEWER_NAME_MAX, TIMECODE_MAX_MS } from "./constants";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function text(value: unknown, label: string, max: number): Parsed<string> {
  if (typeof value !== "string") return { ok: false, error: `${label} is required.` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: `${label} is required.` };
  if (trimmed.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, value: trimmed };
}

export function record(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

// A <video> reports NaN before metadata loads; a comment written then is about 0:00.
export function toTimecodeMs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.round(seconds * 1000);
}

export function parseNewComment(
  input: unknown,
): Parsed<{ authorName: string; body: string; timecodeMs: number }> {
  const o = record(input);
  if (!o) return { ok: false, error: "Invalid request body." };
  const name = text(o.authorName, "Name", REVIEWER_NAME_MAX);
  if (!name.ok) return name;
  const body = text(o.body, "Comment", COMMENT_BODY_MAX);
  if (!body.ok) return body;
  const t = o.timecodeMs;
  if (typeof t !== "number" || !Number.isInteger(t) || t < 0 || t > TIMECODE_MAX_MS) {
    return { ok: false, error: "A timecode is required." };
  }
  return { ok: true, value: { authorName: name.value, body: body.value, timecodeMs: t } };
}

// Only the text is editable — the moment and the original author never change.
export function parseCommentEdit(
  input: unknown,
): Parsed<{ editorName: string; body: string }> {
  const o = record(input);
  if (!o) return { ok: false, error: "Invalid request body." };
  const name = text(o.editorName, "Name", REVIEWER_NAME_MAX);
  if (!name.ok) return name;
  const body = text(o.body, "Comment", COMMENT_BODY_MAX);
  if (!body.ok) return body;
  return { ok: true, value: { editorName: name.value, body: body.value } };
}

export function cutExtension(filename: string): string | null {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return null;
  const ext = filename.slice(idx + 1).toLowerCase();
  return CUT_EXTENSIONS.has(ext) ? ext : null;
}

// The finalize path must be exactly what pathForClientReviewCut produces: the node's
// prefix plus one `cut__<timestamp>.<ext>` segment. Anything looser (`..`, `%2e%2e`,
// extra segments) could point the public link at another tenant's object.
export function isCutPathFor(prefix: string, path: string): boolean {
  if (!path.startsWith(prefix)) return false;
  return /^cut__[A-Za-z0-9-]+\.(mp4|mov|webm)$/.test(path.slice(prefix.length));
}

// Comment ids are uuids; anything else can't match a row, so answer 404 without a query.
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
