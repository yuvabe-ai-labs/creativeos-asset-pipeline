// src/lib/script-review/parts.ts
import type { ScriptDoc } from "@/lib/scripts/schema";
import { AVATAR_VIEWS, AVATAR_VIEW_LABEL, isAvatarView, scopeIncludes, type AvatarView } from "./constants";
import type { Part, PartKind, VersionContent } from "./types";

// Spec 4 §5: a comment is on one whole part. Parts are keyed by the script's own stable ids (shot
// id, cast member id), never by position, so a comment stays on its shot when shots move.

export const PART_KINDS = ["context", "shot", "panel", "cast", "view"] as const satisfies readonly PartKind[];

/** A string key for maps. JSON, so no id can collide with another part's key. */
export function partKey(part: Part): string {
  switch (part.kind) {
    case "context":
      return JSON.stringify(["context"]);
    case "shot":
    case "panel":
      return JSON.stringify([part.kind, part.shotId]);
    case "cast":
      return JSON.stringify(["cast", part.castId]);
    case "view":
      return JSON.stringify(["view", part.castId, part.view]);
  }
}

/** The shot a part belongs to, for "On a removed shot" (spec 4 §5). */
export function partShotId(part: Part): string | null {
  return part.kind === "shot" || part.kind === "panel" ? part.shotId : null;
}

/** The part's name in this script: "Context", "S4", "S4 panel", "Meenakshi", "Meenakshi · Left view".
 *  Null when the script no longer has it. */
export function partLabel(part: Part, doc: ScriptDoc): string | null {
  switch (part.kind) {
    case "context":
      return "Context";
    case "shot":
    case "panel": {
      const i = doc.shots.findIndex((s) => s.id === part.shotId);
      if (i < 0) return null;
      return part.kind === "shot" ? `S${i + 1}` : `S${i + 1} panel`;
    }
    case "cast":
    case "view": {
      const member = doc.cast.find((c) => c.id === part.castId);
      if (!member) return null;
      return part.kind === "cast" ? member.name : `${member.name} · ${AVATAR_VIEW_LABEL[part.view]} view`;
    }
  }
}

const MISSING = 9_000;

/** Page order: the context card, then each cast member with its views, then each shot with its panel. */
export function partOrder(part: Part, doc: ScriptDoc): number {
  const shot = (id: string) => {
    const i = doc.shots.findIndex((s) => s.id === id);
    return i < 0 ? MISSING : i;
  };
  const cast = (id: string) => {
    const i = doc.cast.findIndex((c) => c.id === id);
    return i < 0 ? MISSING : i;
  };
  switch (part.kind) {
    case "context":
      return 0;
    case "cast":
      return 1 + cast(part.castId) * 10;
    case "view":
      return 1 + cast(part.castId) * 10 + 1 + AVATAR_VIEWS.indexOf(part.view);
    case "shot":
      return 100_000 + shot(part.shotId) * 2;
    case "panel":
      return 100_000 + shot(part.shotId) * 2 + 1;
  }
}

/** Spec 4 §5: the parts this version showed the client, so the only ones that take comments.
 *  The scope decides; visuals a scope does not include are ignored even when present. */
export function versionParts(version: VersionContent): Part[] {
  const parts: Part[] = [{ kind: "context" }];
  for (const shot of version.doc.shots) parts.push({ kind: "shot", shotId: shot.id });
  for (const member of version.doc.cast) {
    parts.push({ kind: "cast", castId: member.id });
    const avatar = scopeIncludes(version.scope, "avatars") ? version.visuals.avatars[member.id] : undefined;
    if (!avatar) continue;
    for (const view of AVATAR_VIEWS) {
      if (avatar.views[view]) parts.push({ kind: "view", castId: member.id, view });
    }
  }
  if (scopeIncludes(version.scope, "panels")) {
    for (const shot of version.doc.shots) {
      if (version.visuals.panels[shot.id]) parts.push({ kind: "panel", shotId: shot.id });
    }
  }
  return parts;
}

export function isPartInVersion(part: Part, version: VersionContent): boolean {
  const key = partKey(part);
  return versionParts(version).some((p) => partKey(p) === key);
}

const isId = (value: unknown): value is string => typeof value === "string" && value.length >= 1 && value.length <= 64;

/** A part from untrusted JSON, or null. Ids follow the script schema's limits (1–64 characters). */
export function parsePart(input: unknown): Part | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const kind = o.kind;
  if (kind === "context") return { kind };
  if (kind === "shot" || kind === "panel") return isId(o.shotId) ? { kind, shotId: o.shotId } : null;
  if (kind === "cast") return isId(o.castId) ? { kind, castId: o.castId } : null;
  if (kind === "view") {
    const view = o.view;
    return isId(o.castId) && isAvatarView(view) ? { kind, castId: o.castId, view } : null;
  }
  return null;
}

export function partToColumns(part: Part): { part_kind: PartKind; part_id: string | null; part_view: AvatarView | null } {
  switch (part.kind) {
    case "context":
      return { part_kind: "context", part_id: null, part_view: null };
    case "shot":
    case "panel":
      return { part_kind: part.kind, part_id: part.shotId, part_view: null };
    case "cast":
      return { part_kind: "cast", part_id: part.castId, part_view: null };
    case "view":
      return { part_kind: "view", part_id: part.castId, part_view: part.view };
  }
}

export function columnsToPart(kind: string, id: string | null, view: string | null): Part | null {
  if (kind === "context") return parsePart({ kind });
  if (kind === "cast") return parsePart({ kind, castId: id });
  if (kind === "view") return parsePart({ kind, castId: id, view });
  return parsePart({ kind, shotId: id });
}
