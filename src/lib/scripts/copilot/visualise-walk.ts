import type { ScriptDoc } from "../schema";
import type { Avatar } from "@/lib/avatars/schema";
import { castReadyForPanels } from "../visualise/panel-inputs";
import { listSentence } from "@/lib/avatars/generation";
import type { GenerateAllPlan, PanelView } from "../visualise/state";

// Piece 5.1 §3.2 (D526) — the copilot leads at Visualise. Each step is worked out by code from the
// board as it stands, every time it is shown, and never stored: a step done by hand on the page, or
// through the copilot, simply is not the next step any more. The order: who plays each character
// (lead first), avatars that are not ready to draw, panels being drawn, the pictures the shots still
// to draw use (adding one after drawing means paying to redraw), drawing, then the send.

export type WalkInput = { doc: ScriptDoc; avatars: ReadonlyMap<string, Avatar>; views: ReadonlyMap<string, PanelView>; plan: GenerateAllPlan };
export type MissingPicture = { id: string; kind: "location" | "product"; name: string };
export type VisualiseStep =
  | { kind: "cast"; castId: string; name: string; drawable: number }
  | { kind: "finish_avatar"; castId: string; name: string; drawable: number }
  | { kind: "pictures"; missing: MissingPicture[]; plan: GenerateAllPlan }
  | { kind: "draw"; plan: GenerateAllPlan }
  | { kind: "drawing"; count: number }
  | { kind: "send" };

/** The characters a panel needs a face for, lead first: anyone on screen in at least one shot. */
function onScreenCast(doc: ScriptDoc) {
  const seen = new Set(doc.shots.flatMap((s) => s.onScreen));
  return doc.cast.filter((c) => seen.has(c.id)).sort((a, b) => Number(b.isLead) - Number(a.isLead));
}

/** The locations and products the shots still to draw use, with no picture yet. */
export function missingPictures(doc: ScriptDoc, shotIds: readonly string[]): MissingPicture[] {
  const toDraw = new Set(shotIds);
  const shots = doc.shots.filter((s) => toDraw.has(s.id));
  const locations = new Set(shots.flatMap((s) => (s.location ? [s.location] : [])));
  const products = new Set(shots.flatMap((s) => s.products));
  return [
    ...doc.locations.filter((l) => locations.has(l.id) && !l.image).map((l) => ({ id: l.id, kind: "location" as const, name: l.name })),
    ...doc.products.filter((p) => products.has(p.id) && p.images.length === 0).map((p) => ({ id: p.id, kind: "product" as const, name: p.name })),
  ];
}

export function visualiseStep({ doc, avatars, views, plan }: WalkInput): VisualiseStep {
  const drawable = plan.shotIds.length;
  for (const c of onScreenCast(doc)) {
    if (!c.avatarId) return { kind: "cast", castId: c.id, name: c.name, drawable };
    if (!castReadyForPanels(avatars.get(c.avatarId))) return { kind: "finish_avatar", castId: c.id, name: c.name, drawable };
  }
  const drawing = [...views.values()].filter((v) => v.status === "generating").length;
  if (drawing > 0) return { kind: "drawing", count: drawing };
  const missing = missingPictures(doc, plan.shotIds);
  if (missing.length > 0) return { kind: "pictures", missing, plan };
  if (drawable > 0) return { kind: "draw", plan };
  return { kind: "send" };
}

/** Piece 5.1 §3.5 — what the send card names before the button. It never blocks the send. A panel
 *  out of date still shows the client its picked version, so only shots with none are counted. */
export function sendMissing({ doc, avatars, views, pendingCard }: WalkInput & { pendingCard: boolean }): string[] {
  const statuses = doc.shots.map((s) => views.get(s.id)?.status);
  const bare = statuses.filter((s) => s === "not_yet" || s === "failed" || s === "waiting").length;
  const drawing = statuses.filter((s) => s === "generating").length;
  const uncast = onScreenCast(doc).filter((c) => !castReadyForPanels(c.avatarId ? avatars.get(c.avatarId) : undefined)).map((c) => c.name);
  const out: string[] = [];
  if (bare > 0) out.push(bare === 1 ? "1 shot has no panel; the client will see it as text only." : `${bare} shots have no panel; the client will see them as text only.`);
  if (drawing > 0) out.push(drawing === 1 ? "1 panel is still being drawn." : `${drawing} panels are still being drawn.`);
  if (uncast.length > 0) out.push(`${listSentence(uncast)} ${uncast.length === 1 ? "has" : "have"} no avatar.`);
  if (pendingCard) out.push("A change is still waiting for you in the chat.");
  return out;
}
