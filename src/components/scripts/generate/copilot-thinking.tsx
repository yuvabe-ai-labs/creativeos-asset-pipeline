"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

// The copilot's working line, after Claude Code's: a glyph that cycles, a verb the brand gradient
// travels through, and a seconds counter (a first draft can think for ~25 s before it shows).
// Styles live in globals.css (.thinking-pill, .text-shimmer-brand, .thinking-verb-in).

const FRAME_MS = 120;
/** Claude Code's spinner frames, played out and back so the sparkle grows and shrinks. */
const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
const VERB_MS = 2600;
const VERBS = ["Thinking of ideas", "Mulling angles", "Brewing hooks", "Reading the house rules", "Sketching shots"];

/** Once the first draft is being written (D367): the angles are settled by then. */
const WRITING_VERBS = ["Writing the first draft", "Sketching shots", "Timing each shot", "Checking the house rules", "Writing the voiceover"];

export function CopilotThinking({ writing = false }: { writing?: boolean }) {
  const still = useReducedMotion();
  // One clock drives everything, so the glyph, the verb and the seconds never drift apart.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), FRAME_MS);
    return () => clearInterval(id);
  }, []);

  // The tick the writing began on, so the writing verbs open on the first one while the seconds
  // keep counting the whole wait (set during render: React's pattern for state that follows a prop).
  const [writingFrom, setWritingFrom] = useState<number | null>(writing ? 0 : null);
  if (writing && writingFrom === null) setWritingFrom(tick);
  if (!writing && writingFrom !== null) setWritingFrom(null);

  const elapsed = tick * FRAME_MS;
  const glyph = still ? "✻" : GLYPHS[tick % GLYPHS.length];
  const verbs = writingFrom === null ? VERBS : WRITING_VERBS;
  const verb = verbs[Math.floor((tick - (writingFrom ?? 0)) * FRAME_MS / VERB_MS) % verbs.length];
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="thinking-pill inline-flex items-center gap-2 rounded-full py-1.5 pl-3 pr-3.5 text-sm">
      <span className="sr-only">{writing ? "The copilot is writing the first draft." : "The copilot is thinking."}</span>
      <span aria-hidden className="w-4 text-center text-base leading-none text-primary">{glyph}</span>
      <span aria-hidden key={verb} className="thinking-verb-in">
        <span className="text-shimmer-brand font-medium">{verb}…</span>
      </span>
      {seconds > 0 && <span aria-hidden className="text-xs tabular-nums text-muted-foreground">{seconds}s</span>}
    </div>
  );
}
