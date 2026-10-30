// Starting points for a Refine with AI note — a phrase to edit, not a button to fire.
//
// Each names a change to a PHYSICAL property the writer can act on: shot size, pace, how much of
// the frame the product takes. "Make it cinematic" is a mood the model cannot execute, so it would
// be a suggestion to write a worse prompt.

// D442 — no "look" scope: the rules for every shot are the operator's, and the AI never rewrites them.
export type RefineScope = "all" | "cut";

export const REFINE_SUGGESTIONS: Record<RefineScope, string[]> = {
  // The whole plan: pace and emphasis, the two things that read across every beat.
  all: [
    "Punchier, faster cuts",
    "Calmer, longer holds",
    "Less product, more life",
    "Simpler — one idea per shot",
  ],
  // One beat: framing, movement, and whether the product actually reads.
  cut: [
    "Tighter framing",
    "Slower camera move",
    "Read the product clearly",
    "Different angle",
  ],
};
