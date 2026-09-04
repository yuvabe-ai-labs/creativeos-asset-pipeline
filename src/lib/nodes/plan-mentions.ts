// Mentioning parts of the PLAN inside a Refine with AI note — "@Look & atmosphere colder,
// @Shot 2 tighter".
//
// A refine note is prose, and prose about a shot ladder is ambiguous: "the second one" could mean
// the second shot, the second reference, or the second sentence. A mention pins it to a `cutId`,
// which is the only handle the writer and the plan agree on.
//
// Deliberately a SEPARATE vocabulary from image references. `@V-Strap` names an attached picture
// and resolves to `<IMAGE_REF_N>`; `@Shot 2` names a slot in this node's own plan and resolves to
// a cutId. Same `@` gesture, same chip editor, two different things being pointed at — so they
// live in different id spaces and never collide.

import type { MultishotCut } from "./multishot-cuts";

/** The id used for the look block. Not a cutId — no cut can be called this. */
export const LOOK_MENTION_ID = "plan:look";

export type PlanMentionable = { id: string; label: string; type: string };

/**
 * What the `@` menu offers inside a refine note: the look block, then every shot in ladder order.
 *
 * Shots are labelled by POSITION ("Shot 2"), because that is what the operator is looking at on
 * screen — the cutId is a uuid they never see. The id carries the cutId, so the label can change
 * with the ladder without the binding moving.
 */
export function planMentionables(cuts: MultishotCut[]): PlanMentionable[] {
  return [
    { id: LOOK_MENTION_ID, label: "Look & atmosphere", type: "look" },
    ...cuts.map((cut, i) => ({ id: cut.id, label: `Shot ${i + 1}`, type: "shot" })),
  ];
}

const TOKEN = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Turn a note's mention tokens into something the writer can act on, server-side.
 *
 * `@[Shot 2](c2)` becomes `Shot 2 (cutId: c2)` — the label keeps the note readable, the cutId makes
 * it unambiguous against the shot list already in the turn. `@[Look & atmosphere](plan:look)`
 * becomes `the LOOK block`.
 *
 * A token whose id is no longer in the ladder (a cut deleted after the note was typed) degrades to
 * its bare label rather than being dropped: the operator still said something about it, and
 * silently deleting half their sentence is worse than a slightly vague one.
 */
export function resolvePlanMentions(note: string, cuts: MultishotCut[]): string {
  if (!note.includes("@[")) return note;
  const position = new Map(cuts.map((cut, i) => [cut.id, i + 1]));

  return note.replace(TOKEN, (_match, label: string, id: string) => {
    if (id === LOOK_MENTION_ID) return "the LOOK block";
    const n = position.get(id);
    return n === undefined ? label : `Shot ${n} (cutId: ${id})`;
  });
}
