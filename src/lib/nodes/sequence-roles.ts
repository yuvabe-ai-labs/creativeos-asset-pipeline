// Curated SEQUENCE-role catalog for multishot shots (D203), sibling of shot-roles.ts.
//
// The two catalogs answer different questions and cannot be merged. A ShotRole names the job ONE
// FRAME does in a funnel — hook, hero, texture, application. A SequenceRole names the job a BLOCK
// OF CUTS does, and what changes across them; "product hero" says nothing about how five cuts
// relate to each other, which is the only thing that matters once a shot is a sequence.
//
// Every entry is a documented pattern, not an invention:
//   - coverage        — Rosenblum's five-shot method (hands, face, wide, over-shoulder, creative)
//   - establish       — the classic wide -> medium -> close progression
//   - vignette / hook / brand-close — the act structure in ref/multishot-refs/chupps-20s-omni-prompts.md
//   - feature-run     — commercial convention: 4-8 isolated angles, a hero, and detail close-ups
//   - process         — tutorial grammar, ordered and causal
//   - transformation  — the graphic-match chain
//
// `cutRule` is the field with no analogue in shot-roles.ts, and it is the point: each pattern is
// governed by a different continuity constraint, and naming it per role is what stops the composer
// applying "vary the angle 30 degrees" to a transformation chain, where a locked frame IS the edit.

export type SequenceRole = {
  key: string;
  label: string;
  /** Sensible beat count for this pattern, inclusive. Guidance for the composer, never enforced. */
  beats: [number, number];
  /** What CHANGES from beat to beat. The through-line that makes the cuts a sequence. */
  arc: string;
  /** The continuity constraint that governs this pattern's cuts specifically. */
  cutRule: string;
  slots: string[]; // what the sequence as a whole must make concrete
  avoid: string[]; // per-role compliance, on top of the global avoid-list
};

export const SEQUENCE_ROLES: SequenceRole[] = [
  {
    key: "cold-open",
    label: "Cold-open hook",
    beats: [3, 5],
    arc: "Tension escalates and nothing is explained. Each beat is a fragment of a different moment; the viewer assembles it.",
    cutRule:
      "Hard cuts only. The jaggedness IS the hook — do not smooth it with match cuts, and do not open on an establishing shot.",
    slots: ["a fragment of an action per beat", "one recurring visual motif", "an unresolved question by the last beat"],
    avoid: ["an establishing wide", "a beat that explains the product", "a resolved or settled final frame"],
  },
  {
    key: "vignette",
    label: "Vignette montage",
    beats: [3, 6],
    arc: "A different person, place and moment every beat. Nothing carries across except the look — that is the argument: many lives, one product.",
    cutRule:
      "Every cut is a hard cut to a new subject. Deliberately NO continuity between beats: no match cuts, no shared screen direction, no through-line character.",
    slots: ["a distinct subject per beat", "a distinct setting per beat", "the product visible in each", "one shared palette and light direction"],
    avoid: ["a single character running through the beats", "a narrative that depends on beat order", "two beats in the same location"],
  },
  {
    key: "coverage",
    label: "Coverage of one action",
    beats: [4, 5],
    arc: "One subject doing one thing, seen from a widening set of positions: hands, face, wide, over-the-shoulder, then one unexpected angle.",
    cutRule:
      "At least 30 degrees of angle change between consecutive beats, and screen direction locked for the whole sequence. This is the pattern the 30-degree rule was written for.",
    slots: ["a close-up on the hands", "a close-up on the face", "a wide establishing the space", "an over-the-shoulder or POV", "one unexpected angle"],
    avoid: ["cutting between two similar framings", "changing location", "reversing which way the subject faces"],
  },
  {
    key: "establish",
    label: "Establish, develop, reveal",
    beats: [3, 5],
    arc: "Information narrows. Each beat is tighter than the one before, ending on the detail the whole sequence was built to show.",
    cutRule:
      "Each beat is a distinctly smaller shot size than the last. Where a movement carries across a cut, name it in both beats so the halves join.",
    slots: ["a wide that establishes place and time", "a medium that isolates the subject", "a close that delivers the reveal"],
    avoid: ["cutting wider after going close", "revealing the payoff in the first beat", "two beats at the same distance"],
  },
  {
    key: "process",
    label: "Process or demo",
    beats: [3, 6],
    arc: "Ordered causal steps. Beat two is only possible because beat one happened, so the order cannot be permuted.",
    cutRule:
      "Match on action between steps: name the movement that carries across each cut. Keep hands entering from the same side of frame throughout.",
    slots: ["the starting state", "one hand action per beat", "the tool or contact point", "the finished state"],
    avoid: ["skipping a step the next one depends on", "cutting away mid-action with no match", "a messy or inconsistent surface between beats"],
  },
  {
    key: "feature-run",
    label: "Product feature run",
    beats: [3, 6],
    arc: "One product, several isolated angles — macro, profile, scale, in-hand — converging on a hero framing.",
    cutRule:
      "Change the angle well past 30 degrees on every cut. The product itself does NOT move or change position between beats; only the camera does.",
    slots: ["a macro on material or texture", "an angle that reads the whole silhouette", "something establishing scale", "a final hero framing with the label readable"],
    avoid: ["the product shifting position between beats", "two adjacent beats from near-identical angles", "props competing with the product"],
  },
  {
    key: "transformation",
    label: "Transformation chain",
    beats: [3, 5],
    arc: "One variable changes and everything else is nailed down — the same frame, the same light, the same ground, a different wardrobe or state each beat.",
    cutRule:
      "Graphic match: hold framing, angle and light IDENTICAL across the cut. This is the one pattern where a near-identical angle is correct rather than a jump cut, and it only works if it is exact.",
    slots: ["the fixed framing, stated once and repeated", "the one variable that changes per beat", "a fixed anchor point in frame"],
    avoid: ["reframing between beats", "changing light or background", "changing more than the one variable"],
  },
  {
    key: "brand-close",
    label: "Brand close",
    beats: [3, 5],
    arc: "Converges. Separate threads gather into one final held frame the copy can sit on.",
    cutRule:
      "The final beat is a static hold of at least 1.5 seconds, with the framing settled before it ends — a close that is still moving cannot carry an end card.",
    slots: ["beats that converge on one subject or arrangement", "a readable product or logo in the final beat", "clear space for a CTA", "a still final hold"],
    avoid: ["ending mid-move", "a final frame too busy for copy", "introducing a new idea in the last beat"],
  },
];

export const DEFAULT_SEQUENCE_ROLE = "establish";

export function getSequenceRole(key: string): SequenceRole {
  return (
    SEQUENCE_ROLES.find((r) => r.key === key) ??
    SEQUENCE_ROLES.find((r) => r.key === DEFAULT_SEQUENCE_ROLE)!
  );
}

/** The role block for the composer's user turn — arc and cut rule first, they govern the rest. */
export function renderSequenceRole(role: SequenceRole): string {
  return [
    `Sequence role: ${role.label} (${role.beats[0]}-${role.beats[1]} beats is typical)`,
    `Arc — ${role.arc}`,
    `Cutting — ${role.cutRule}`,
    `This sequence must include: ${role.slots.join(", ")}`,
    `Avoid for this role: ${role.avoid.join(", ")}`,
  ].join("\n");
}
