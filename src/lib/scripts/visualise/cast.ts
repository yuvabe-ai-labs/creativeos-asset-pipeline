import type { ScriptStage } from "@/lib/scripts/constants";
import { scriptDocSchema } from "@/lib/scripts/schema";

// Spec 3 — the rules for what Visualise may change, in one place.

/** D347 — cast links, panels and picks change while the script is at Visualise, and while it
 *  is In review (spec 4: editing stays allowed; each share is a frozen copy). */
export const VISUALISE_STAGES = ["visualise", "in_review"] as const satisfies readonly ScriptStage[];

export function isVisualiseStage(stage: ScriptStage): boolean {
  return (VISUALISE_STAGES as readonly ScriptStage[]).includes(stage);
}

/** D347 — why an avatar cannot be archived, or null when no live script uses it. */
export function archiveRefusal(usedIn: string[]): string | null {
  if (usedIn.length === 0) return null;
  if (usedIn.length === 1) {
    return `This avatar is in ${usedIn[0]}, so it can't be archived. Change it in that script first.`;
  }
  return `This avatar is in ${usedIn.length} scripts (${usedIn.join(", ")}), so it can't be archived. Change it in those scripts first.`;
}

export type CastLinkResult =
  | { ok: true; doc: Record<string, unknown> }
  | { ok: false; error: string; status: 404 | 409 | 422 };

/** D338 — the one write Visualise makes into a script: a cast member's avatar link, applied to
 *  the document AS STORED, so any key this code does not know (spec 2's, spec 4's) survives.
 *  Two people in one script never share an avatar: each needs their own face. */
export function withCastAvatar(rawDoc: unknown, castId: string, avatarId: string | null): CastLinkResult {
  const doc = rawDoc as { cast?: unknown } | null;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.cast)) {
    return { ok: false, error: "This script has no cast.", status: 422 };
  }
  const cast = doc.cast as Record<string, unknown>[];
  const index = cast.findIndex((c) => c?.id === castId);
  if (index < 0) return { ok: false, error: "No such person in this script.", status: 404 };
  if (avatarId) {
    const other = cast.find((c, i) => i !== index && c?.avatarId === avatarId);
    if (other) {
      return { ok: false, error: `${String(other.name ?? "Someone else")} already has this avatar in this script.`, status: 409 };
    }
  }
  const next = { ...(doc as Record<string, unknown>), cast: cast.map((c, i) => (i === index ? { ...c, avatarId } : c)) };
  if (!scriptDocSchema.safeParse(next).success) {
    return { ok: false, error: "The script could not be saved with that change.", status: 422 };
  }
  return { ok: true, doc: next };
}
