// Validate the PATCH /api/clients/[id] body. Returns the archived boolean, or
// null when the body is malformed (caller maps null -> 400).
export function parseArchivedBody(body: unknown): boolean | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "archived" in body &&
    typeof (body as { archived: unknown }).archived === "boolean"
  ) {
    return (body as { archived: boolean }).archived;
  }
  return null;
}
