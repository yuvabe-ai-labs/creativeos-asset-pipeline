// src/lib/script-review/version.ts
import type { CastMember, ScriptDoc, Shot } from "@/lib/scripts/schema";
import { scopeIncludes } from "./constants";
import { partLabel } from "./parts";
import type { ChangedPart, Part, VersionContent } from "./types";

const shotText = (s: Shot) => JSON.stringify([s.beat, s.lengthSeconds, s.visual, s.vo, s.onScreenText, s.onScreen]);
const memberText = (c: CastMember) => JSON.stringify([c.name, c.description, c.isLead]);
const contextText = (d: ScriptDoc) => JSON.stringify([d.header, d.context]);

/** Spec 4 §7: which parts changed between two shares, for the activity line "S1, S4, S5 and the
 *  avatar revised". A new picked panel or new avatar images count as a change to that shot or cast
 *  member only when both shares showed them: widening the scope is said by the share line itself,
 *  not as fourteen changes. Order: context, shots (in the new order), removed shots, cast. */
export function diffVersions(prev: VersionContent | null, next: VersionContent): ChangedPart[] {
  if (!prev) return [];
  const out: ChangedPart[] = [];
  const add = (part: Part, change: ChangedPart["change"], doc: ScriptDoc) => {
    const label = partLabel(part, doc);
    if (label) out.push({ part, change, label });
  };

  if (contextText(prev.doc) !== contextText(next.doc)) add({ kind: "context" }, "revised", next.doc);

  const panelsInBoth = scopeIncludes(prev.scope, "panels") && scopeIncludes(next.scope, "panels");
  const prevShots = new Map(prev.doc.shots.map((s) => [s.id, s]));
  for (const shot of next.doc.shots) {
    const part: Part = { kind: "shot", shotId: shot.id };
    const before = prevShots.get(shot.id);
    if (!before) {
      add(part, "added", next.doc);
      continue;
    }
    const panelChanged =
      panelsInBoth && (prev.visuals.panels[shot.id]?.takeId ?? null) !== (next.visuals.panels[shot.id]?.takeId ?? null);
    if (shotText(before) !== shotText(shot) || panelChanged) add(part, "revised", next.doc);
  }
  const nextShotIds = new Set(next.doc.shots.map((s) => s.id));
  for (const shot of prev.doc.shots) {
    if (!nextShotIds.has(shot.id)) add({ kind: "shot", shotId: shot.id }, "removed", prev.doc);
  }

  const avatarsInBoth = scopeIncludes(prev.scope, "avatars") && scopeIncludes(next.scope, "avatars");
  const prevCast = new Map(prev.doc.cast.map((c) => [c.id, c]));
  for (const member of next.doc.cast) {
    const part: Part = { kind: "cast", castId: member.id };
    const before = prevCast.get(member.id);
    if (!before) {
      add(part, "added", next.doc);
      continue;
    }
    const avatarChanged =
      avatarsInBoth &&
      JSON.stringify(prev.visuals.avatars[member.id] ?? null) !== JSON.stringify(next.visuals.avatars[member.id] ?? null);
    if (memberText(before) !== memberText(member) || avatarChanged) add(part, "revised", next.doc);
  }
  const nextCastIds = new Set(next.doc.cast.map((c) => c.id));
  for (const member of prev.doc.cast) {
    if (!nextCastIds.has(member.id)) add({ kind: "cast", castId: member.id }, "removed", prev.doc);
  }
  return out;
}

export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "S1, S4, S5 and Meenakshi revised · S6 added · S9 removed", or null when nothing changed. */
export function describeChanges(changes: ChangedPart[]): string | null {
  const groups = (["revised", "added", "removed"] as const)
    .map((change) => ({ change, labels: changes.filter((c) => c.change === change).map((c) => c.label) }))
    .filter((g) => g.labels.length > 0)
    .map((g) => `${joinWithAnd(g.labels)} ${g.change}`);
  return groups.length > 0 ? groups.join(" · ") : null;
}
