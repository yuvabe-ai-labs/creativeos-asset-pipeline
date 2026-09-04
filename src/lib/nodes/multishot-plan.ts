// D231 — what the Multishot Prompt node's writer returns, and how it becomes a prompt.
//
// The model returns JSON ONLY. The flat prompt is rendered from that JSON by `renderPlan`, so the
// breakup view the operator reads and the string that gets billed cannot disagree — they are the
// same object rendered twice. Asking for prose AND JSON would give two representations the model
// produces independently, and they diverge eventually.
import type { MultishotCut } from "./multishot-cuts";

export type MultishotBeat = { cutId: string; text: string };

export type MultishotPlan = {
  version: 1;
  /**
   * The look & atmosphere block: light direction, time of day, lens feel, palette, grade.
   * Written by the model, governs every beat, rendered ABOVE the ladder. Required — it is the
   * only thing making separate cuts read as one film, and a sequence without one is a set of
   * unrelated clips.
   */
  look: string;
  beats: MultishotBeat[];
};

export type PlanParseResult =
  | { ok: true; plan: MultishotPlan }
  | { ok: false; reason: string };

/**
 * Validate a returned plan against the node's cuts.
 *
 * Rejected WHOLE on any failure. A partially applied plan leaves the node holding a mixture of
 * new and stale beats that neither the model nor the operator authored, and nothing downstream
 * could tell which was which.
 *
 * Note what is NOT in the schema: `seconds` (code takes it from the cuts, so the writer cannot
 * break the operator's budget) and `refs` (derived from the text by `refsCitedIn`, so a beat's
 * citations cannot disagree with its own prose).
 */
export function parsePlan(raw: unknown, cuts: MultishotCut[]): PlanParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "The writer did not return a plan." };
  }
  const candidate = raw as Partial<MultishotPlan>;

  const look = typeof candidate.look === "string" ? candidate.look.trim() : "";
  if (!look) {
    return { ok: false, reason: "The plan has no look — the cuts would not read as one film." };
  }

  if (!Array.isArray(candidate.beats)) {
    return { ok: false, reason: "The plan has no beats." };
  }

  const byId = new Map<string, string>();
  for (const beat of candidate.beats) {
    const cutId = (beat as MultishotBeat)?.cutId;
    const text = (beat as MultishotBeat)?.text;
    if (typeof cutId !== "string" || typeof text !== "string") {
      return { ok: false, reason: "A beat is missing its shot or its text." };
    }
    if (!cuts.some((c) => c.id === cutId)) {
      return { ok: false, reason: "The writer referenced a shot that isn't in this node." };
    }
    byId.set(cutId, text);
  }

  if (byId.size !== cuts.length) {
    return { ok: false, reason: "The plan does not cover every shot in this node." };
  }

  // Reordered to CUT order, not rejected: cut order is the edit, and the order the beats happen
  // to arrive in is an artifact of generation.
  return {
    ok: true,
    plan: {
      version: 1,
      look,
      beats: cuts.map((c) => ({ cutId: c.id, text: byId.get(c.id)! })),
    },
  };
}

/**
 * The compiled prompt: the look, a blank line, then the timecode ladder.
 *
 * One function for both the string sent to Omni and the ordering the breakup view renders, so
 * the look cannot end up in two different places.
 *
 * Times are cumulative and come from the CUTS, never from the plan — which is what makes the
 * ladder's final timestamp equal the request's duration by construction.
 */
export function renderPlan(plan: MultishotPlan, cuts: MultishotCut[]): string {
  const byId = new Map(plan.beats.map((b) => [b.cutId, b.text]));
  let at = 0;
  const ladder = cuts
    .map((cut) => {
      const from = at;
      at += cut.seconds;
      return `[${from}-${at}s] ${(byId.get(cut.id) ?? "").trim()}`;
    })
    .join("\n");

  return `${plan.look.trim()}\n\n${ladder}`;
}

const IMAGE_REF = /<IMAGE_REF_(\d+)>/g;

/**
 * Which references a beat cites, derived from its own text.
 *
 * Since D233 these are the OPERATOR's citations, not the writer's: the model is forbidden from
 * assigning `<IMAGE_REF_N>` itself and names the product in prose instead, so a token in a beat
 * got there by someone `@`-mentioning a reference in the editor. The shape is unchanged either
 * way — `imageRefDialect` emits the same token the writer used to.
 *
 * A regex is exact here because the token is machine-emitted and fixed-shape — unlike splitting
 * prose on `[0-2s]`-shaped headings, which is a drift bug waiting for its first unusual beat.
 */
export function refsCitedIn(text: string): number[] {
  const seen = new Set<number>();
  for (const match of text.matchAll(IMAGE_REF)) {
    seen.add(Number(match[1]));
  }
  return [...seen];
}
