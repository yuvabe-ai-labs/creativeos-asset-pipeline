"use client";

import { Loader2 } from "lucide-react";

/**
 * The "this one is being rewritten" strip, shown on the card a refine is working on.
 *
 * A refine locks every control on the node, so without this the card being rewritten and the six
 * cards merely waiting on it all read the same: greyed out. Dimming says "you cannot touch this",
 * which is true of all of them and answers the wrong question — the operator wants to know WHICH
 * one is moving.
 *
 * So the working card is marked in the POSITIVE — a tinted band, the brand colour, a spinner and a
 * sentence — and everything else keeps the neutral disabled treatment. Brightness, not dimness, is
 * what distinguishes it.
 *
 * The old text stays visible underneath rather than being replaced by a skeleton: it is what is
 * about to be thrown away, and seeing it is how the operator judges whether the rewrite improved
 * anything.
 */
export function RefineProgress({
  label,
  /**
   * The reassurance on the right. Narrow refines say what they are NOT touching, which is the
   * thing an operator with hand-edited beats actually wants to know. A whole-sequence rewrite
   * passes nothing, because for that one it would be a lie.
   */
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-2 flex items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin" strokeWidth={1.5} />
      <span>{label}</span>
      {hint && (
        <span className="ml-auto shrink-0 text-[0.65rem] font-normal text-primary/70">{hint}</span>
      )}
    </div>
  );
}
