// src/lib/scripts/anchors.ts
// Ids the script view puts on its parts, so a link can jump to one ("S1 revised" jumps to S1,
// spec 4 §7). One place builds them.
const safe = (id: string) => id.replace(/\s+/g, "-");
export const SCRIPT_CONTEXT_ANCHOR = "script-context";
export const castAnchor = (castId: string) => `cast-${safe(castId)}`;
export const shotAnchor = (shotId: string) => `shot-${safe(shotId)}`;
