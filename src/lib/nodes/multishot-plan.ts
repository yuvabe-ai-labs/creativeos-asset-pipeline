// D231 — what the Multishot Prompt node's writer returns, and how it becomes a prompt.
//
// The model returns JSON ONLY. The flat prompt is rendered from that JSON by `renderPlan`, so the
// breakup view the operator reads and the string that gets billed cannot disagree — they are the
// same object rendered twice. Asking for prose AND JSON would give two representations the model
// produces independently, and they diverge eventually.
import type { MultishotCut } from "./multishot-cuts";
import type { MultishotCapability, LadderCheck } from "./multishot-models";

export type MultishotBeat = { cutId: string; text: string };

export type MultishotPlan = {
  version: 1;
  /**
   * The look & atmosphere block: light direction, time of day, lens feel, palette, grade.
   * Governs every beat, rendered ABOVE the ladder.
   *
   * D262 — may be EMPTY, and empty means "the script states no look". It was required, which
   * forced the writer to invent one whenever a script gave none, and it filled the gap from the
   * brand context — a season, a weather, a place the script never asked for. Only stated look
   * direction is transcribed now; with none, nothing is sent and each shot's own text carries it.
   */
  look: string;
  beats: MultishotBeat[];
  /**
   * D236 — the model whose writer produced these beats. Absent = Gemini Omni: every plan written
   * before this field existed was Omni's, because it was the only multishot model. That fallback
   * IS the migration; nothing is backfilled.
   *
   * It lives on the PLAN, not only on the Multishot node, because the node's `targetModel` is a
   * setting the operator can change at any time while the beats stay exactly as written. Every
   * consumer that decides a format (`renderPlan`), a token dialect (`refsCitedIn`) or a legal
   * model (the video-generate guard) must read THIS, or switching the Select after a plan exists
   * silently reinterprets it — Omni beats holding `<IMAGE_REF_0>` rendered into a Kling triple as
   * literal prose, with every guard passing because they all compared against the node instead.
   */
  targetModel?: string;
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

  // D262 — blank is legal ("the script states no look"); malformed is not. An absent key reads as
  // blank, but a number or an object where the look belongs is a broken response.
  if (candidate.look !== undefined && typeof candidate.look !== "string") {
    return { ok: false, reason: "The plan's look is not text." };
  }
  const look = (candidate.look ?? "").trim();

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
  //
  // `targetModel` (D236) is PRESERVED, not rebuilt: this function returns a fresh object, so a
  // field it does not copy is a field it silently deletes. Every narrow refine round-trips its
  // plan through here (mergeRefinedPlan spreads `...plan` and re-validates the whole), and a
  // stamp dropped on the first look rewrite would leave the plan reading as Omni's forever after.
  // Left ABSENT when absent rather than defaulted to Gemini Omni here, so "unstamped" stays
  // distinguishable in stored data from "stamped for the default" — both resolve to Omni via
  // `multishotCapabilityFor`, so no consumer has to care which it is.
  return {
    ok: true,
    plan: {
      version: 1,
      look,
      beats: cuts.map((c) => ({ cutId: c.id, text: byId.get(c.id)! })),
      ...(typeof candidate.targetModel === "string"
        ? { targetModel: candidate.targetModel }
        : {}),
    },
  };
}

/**
 * The look, a blank line, then the ladder — or the ladder alone when the look is empty (D262). A
 * blank look is sent as nothing: a prompt opening on two empty lines reads to the model as a
 * missing section, and on Kling it spends character budget on whitespace.
 */
function withLook(look: string, ladder: string): string {
  const trimmed = look.trim();
  return trimmed ? `${trimmed}\n\n${ladder}` : ladder;
}

/**
 * The compiled prompt: the look, a blank line, then the beats in the target model's own format.
 *
 * One function for both the string sent to the model and the ordering the breakup view renders,
 * so the look cannot end up in two different places.
 *
 * Times are cumulative (Omni) or per-shot (Kling) but come from the CUTS in both cases, never
 * from the plan — which is what makes the ladder agree with the request's duration by
 * construction rather than by check.
 *
 * ALWAYS RETURNS A STRING, including for a plan that violates the model's character budgets. This
 * is the display path as well as the send path: the focus view renders it live while the operator
 * types, and blanking the panel at the moment they are trying to read the text they need to
 * shorten would be the worst possible time to withhold it. `checkPlanLimits` below is the gate the
 * money path calls.
 */
export function renderPlan(
  plan: MultishotPlan,
  cuts: MultishotCut[],
  cap: MultishotCapability,
): string {
  const byId = new Map(plan.beats.map((b) => [b.cutId, b.text]));

  if (cap.shotFormat === "triple") {
    // D238 — Kling's API format: lowercase `shot`, a comma-separated triple of number, seconds
    // and text, semicolon-terminated. NOT the `Shot N (Xs):` form in kling-omni-system-prompt.md
    // and the CHUPPS reference — those are the web console's syntax, and sending them would put
    // prose in front of a parser that then reads the whole prompt as ONE shot. A wrong-but-
    // accepted payload is the failure mode that does not announce itself.
    //
    // The look leads as prose. Kling's format has no slot for it and repeating a ~300-character
    // look inside every beat would eat most of the 512-character budget six times over. This is
    // the spec's one acknowledged guess (§6) — if the first real generation shows it ignored or
    // absorbed into shot 1, fold a compressed look into each beat instead.
    const shots = cuts
      .map((cut, i) => {
        // A semicolon inside beat prose would terminate the shot early and silently change the
        // cut count. Commas are safe: only the first two are structural, and the parser takes the
        // rest of the triple as text.
        //
        // This is the ONLY rewrite applied to a beat, and deliberately so. A trailing period was
        // stripped here at one point to avoid stacking ".;" at the seam — but that is cosmetic,
        // not structural: a parser splitting on `;` reads ".;" correctly. Rewriting the
        // operator's authored prose for tidiness is the same mistake `imageRefDialect` refuses to
        // make when it echoes an unknown token rather than renumbering it. Only correctness earns
        // a rewrite.
        const text = (byId.get(cut.id) ?? "").trim().replace(/;/g, ",");
        return `shot ${i + 1}, ${cut.seconds}, ${text};`;
      })
      .join("\n");
    return withLook(plan.look, shots);
  }

  if (cap.shotFormat === "bare-timecode") {
    // D244 — Seedance 2.5's bare `0-2s:` prefix, no brackets. Cumulative from the CUTS like
    // Omni's ladder, so the final timestamp equals the request's duration by construction.
    //
    // NOT the only form the vendor uses, and the original comment here overstated that. Its
    // tutorial writes bare `N-Ms:` ranges about as often as `0:00-0:03` MM:SS ones, plus a few
    // `Shot N [0:00-0:03]`. Unlike Kling — whose API genuinely parses one comma/semicolon grammar
    // and reads anything else as a single shot (D238) — Seedance appears to read timing from
    // prose rather than a strict format, so this is a choice among forms it understands, not the
    // one form it accepts. Bare seconds were chosen because they need no minute arithmetic from a
    // cut ladder already measured in seconds. If a real generation shows it cutting more reliably
    // on MM:SS, switching is a one-branch change and nothing downstream depends on this shape.
    //
    // No text rewrite. Kling's branch replaces semicolons because a stray `;` terminates a shot
    // in its comma/semicolon triple grammar; nothing here is delimited that way, so the
    // operator's prose — and its `@Image N` handles — pass through byte-for-byte.
    let at = 0;
    const ladder = cuts
      .map((cut) => {
        const from = at;
        at += cut.seconds;
        return `${from}-${at}s: ${(byId.get(cut.id) ?? "").trim()}`;
      })
      .join("\n");
    return withLook(plan.look, ladder);
  }

  let at = 0;
  const ladder = cuts
    .map((cut) => {
      const from = at;
      at += cut.seconds;
      return `[${from}-${at}s] ${(byId.get(cut.id) ?? "").trim()}`;
    })
    .join("\n");

  return withLook(plan.look, ladder);
}

const IMAGE_REF = /<IMAGE_REF_(\d+)>/g;
const KLING_IMAGE_REF = /@image_(\d+)/g;
const SEEDANCE_IMAGE_REF = /@Image (\d+)/g;

/**
 * Which references a beat cites, derived from its own text, in the target model's token shape.
 *
 * Since D233 these are the OPERATOR's citations, not the writer's: the model is forbidden from
 * assigning tokens itself and names the product in prose instead, so a token in a beat got there
 * by someone `@`-mentioning a reference in the editor.
 *
 * ALWAYS ZERO-BASED on the way out, whatever the model's wire format. Callers use the result to
 * index `promptRefImages`, so returning Kling's or Seedance's 1-based numbers would mark the wrong
 * reference as uncited — off by one, on a display that exists to catch exactly that class of
 * mistake.
 */
export function refsCitedIn(text: string, cap: MultishotCapability): number[] {
  const seen = new Set<number>();
  // Exhaustive switch: a new dialect is a COMPILE error here rather than a silent fall back
  // to returning an empty set (D245). Without this default, adding a fourth refTokenDialect
  // literal would compile cleanly and silently return "cites nothing" — exactly the silent
  // failure D245 exists to prevent.
  switch (cap.refTokenDialect) {
    case "kling-image":
      for (const match of text.matchAll(KLING_IMAGE_REF)) seen.add(Number(match[1]) - 1);
      break;
    case "seedance-image":
      for (const match of text.matchAll(SEEDANCE_IMAGE_REF)) seen.add(Number(match[1]) - 1);
      break;
    case "image-ref":
      for (const match of text.matchAll(IMAGE_REF)) seen.add(Number(match[1]));
      break;
    default: {
      // A dialect with no case here would otherwise return "cites nothing" silently. Assigning
      // to `never` makes it a compile error instead — the same guarantee dialectForCapability
      // gets for free by returning from every branch (D245).
      const unhandled: never = cap.refTokenDialect;
      throw new Error(`refsCitedIn: unhandled reference dialect ${String(unhandled)}`);
    }
  }
  return [...seen];
}

/**
 * Whether this plan fits the target model's character budgets.
 *
 * Separate from `renderPlan` on purpose — see that function's note. The whole-prompt figure is
 * measured on the RENDERED string, because that is what is actually sent: the look, the triples
 * and their punctuation all count against the 3072.
 *
 * A model that states no character limits (`null`) passes everything. `null` is not "unknown, so
 * guess a number" — it is "the vendor publishes no ceiling", and inventing one here would refuse
 * prompts Omni accepts.
 */
export function checkPlanLimits(
  plan: MultishotPlan,
  cuts: MultishotCut[],
  cap: MultishotCapability,
): LadderCheck {
  if (cap.maxCutChars !== null) {
    const byId = new Map(plan.beats.map((b) => [b.cutId, b.text]));
    for (const [i, cut] of cuts.entries()) {
      const text = (byId.get(cut.id) ?? "").trim();
      if (text.length > cap.maxCutChars) {
        return {
          ok: false,
          reason: `Shot ${i + 1} is ${text.length} characters · ${cap.label} allows ${cap.maxCutChars}. Shorten it, or rewrite that shot with AI.`,
        };
      }
    }
  }

  if (cap.maxPromptChars !== null) {
    const rendered = renderPlan(plan, cuts, cap);
    if (rendered.length > cap.maxPromptChars) {
      return {
        ok: false,
        reason: `The whole prompt is ${rendered.length} characters · ${cap.label} allows ${cap.maxPromptChars}. Shorten the look block or the longest shots.`,
      };
    }
  }

  return { ok: true };
}

/** What a narrow refine returns: one of the two, never both. */
export type PlanFragment = { look?: string; text?: string };

/**
 * Merge a narrowly-scoped rewrite into an existing plan, then validate the whole.
 *
 * A `"look"` or `"cut"` refine asks the model for ONLY the fragment being rewritten, so the beats
 * it did not touch are untouched by CONSTRUCTION — there is nothing to drift. This replaces asking
 * for the whole plan with "leave the rest unchanged", which is an instruction models drift on, and
 * whose drift silently overwrote beats the operator had hand-edited.
 *
 * Returns `PlanParseResult` rather than a plan so a merge that cannot be validated is refused
 * through the same path a bad generation already takes — and so the merged whole is checked against
 * the cuts, which is what keeps a narrow edit from producing a plan that disagrees with the budget.
 */
export function mergeRefinedPlan(
  plan: MultishotPlan,
  scope: "look" | "cut",
  fragment: PlanFragment,
  cutId: string | undefined,
  cuts: MultishotCut[],
): PlanParseResult {
  if (scope === "look") {
    // D262 — a blank rewrite is the writer following its rule on a script that states no look,
    // so it clears the look rather than failing the refine.
    return parsePlan({ ...plan, look: (fragment.look ?? "").trim() }, cuts);
  }

  if (!cutId) return { ok: false, reason: "No shot was named for this rewrite." };
  const text = (fragment.text ?? "").trim();
  if (!text) return { ok: false, reason: "The writer returned an empty shot." };
  if (!plan.beats.some((b) => b.cutId === cutId)) {
    return { ok: false, reason: "That shot is not in this plan." };
  }

  return parsePlan(
    { ...plan, beats: plan.beats.map((b) => (b.cutId === cutId ? { ...b, text } : b)) },
    cuts,
  );
}

/**
 * Has the operator hand-edited the plan since it was last generated, restored or saved?
 *
 * Drives the Multishot Prompt focus view's Save button, its "Unsaved changes" pill, the sheet's
 * close-confirm, and the lockout on every path that would replace the plan wholesale (D240, D242).
 *
 * Compared FIELD-WISE rather than by `JSON.stringify`: stringify is key-order dependent, so a plan
 * the server happened to serialise `beats`-before-`look` would read as edited; it would also
 * silently start comparing any field later added to MultishotPlan, editable or not. `version` and
 * `targetModel` are deliberately excluded for exactly that reason — a schema literal and a
 * generation stamp (D236), neither of which the operator can type into, so a difference in either
 * is not an unsaved edit.
 *
 * A null draft is never dirty: there is nothing to save. A draft with nothing saved is.
 */
export function planIsDirty(
  saved: MultishotPlan | null,
  draft: MultishotPlan | null,
): boolean {
  if (!draft) return false;
  if (!saved) return true;
  if (saved.look !== draft.look) return true;
  if (saved.beats.length !== draft.beats.length) return true;
  return saved.beats.some(
    (b, i) => b.cutId !== draft.beats[i].cutId || b.text !== draft.beats[i].text,
  );
}

/**
 * Write one beat's text, returning a new plan. Every other beat is returned BY REFERENCE.
 *
 * Extracted from the focus view's `updateBeat` after a real bug: an editor callback held a stale
 * render's plan, so writing one beat also wrote back that snapshot's version of every other beat —
 * clearing all the shots and pasting into the first resurrected the rest, which read as the paste
 * being duplicated across them.
 *
 * Two properties make that class of bug unrepresentable here, and both are tested:
 *   - it is PURE, so it cannot read a stale plan out of a closure; the caller passes the current
 *     one (the view uses the functional setState form to guarantee that), and
 *   - untouched beats keep their object identity, so "did this write touch a neighbour?" is
 *     answerable with `===` rather than by eyeballing text.
 *
 * An unknown `cutId` is a no-op returning the SAME plan object, not a clone: a write aimed at a
 * shot that is not in this plan should change nothing, and returning the same reference lets a
 * caller see that nothing changed.
 */
export function setBeatText(
  plan: MultishotPlan,
  cutId: string,
  text: string,
): MultishotPlan {
  if (!plan.beats.some((b) => b.cutId === cutId)) return plan;
  return {
    ...plan,
    beats: plan.beats.map((b) => (b.cutId === cutId ? { ...b, text } : b)),
  };
}
