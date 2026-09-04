// Starting points for a Refine with AI note — a phrase to edit, not a button to fire.
//
// Each names a change to a PHYSICAL property the writer can act on: light direction, shot size,
// pace, how much of the frame the product takes. "Make it cinematic" is a mood, and a mood is
// exactly what the look block's own guidance forbids, so it would be a suggestion to write a
// worse prompt.

export type RefineScope = "all" | "look" | "cut";

export const REFINE_SUGGESTIONS: Record<RefineScope, string[]> = {
  // The whole plan: pace and emphasis, the two things that read across every beat.
  all: [
    "Punchier, faster cuts",
    "Calmer, longer holds",
    "Less product, more life",
    "Simpler — one idea per shot",
  ],
  // The look: the repeatable physical facts the block is supposed to be made of.
  look: [
    "Warmer, lower sun",
    "Overcast and soft",
    "Tighter lens feel",
    "Less contrast",
  ],
  // One beat: framing, movement, and whether the product actually reads.
  cut: [
    "Tighter framing",
    "Slower camera move",
    "Read the product clearly",
    "Different angle",
  ],
};
