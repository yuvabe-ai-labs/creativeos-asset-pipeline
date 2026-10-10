// The gallery's Scripts tab drags `{ scriptId }` under SCRIPT_DRAG_MIME (constants.ts), the same
// way the Avatars tab drags `{ avatarId }` (src/lib/avatars/canvas.ts).
export function parseScriptDragPayload(raw: string): { scriptId: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { scriptId?: unknown };
    return typeof parsed.scriptId === "string" && parsed.scriptId ? { scriptId: parsed.scriptId } : null;
  } catch {
    return null;
  }
}
