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

export function CopilotThinking() {
  const still = useReducedMotion();
  // One clock drives everything, so the glyph, the verb and the seconds never drift apart.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), FRAME_MS);
    return () => clearInterval(id);
  }, []);

  const elapsed = tick * FRAME_MS;
  const glyph = still ? "✻" : GLYPHS[tick % GLYPHS.length];
  const verb = VERBS[Math.floor(elapsed / VERB_MS) % VERBS.length];
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="thinking-pill inline-flex items-center gap-2 rounded-full py-1.5 pl-3 pr-3.5 text-sm">
      <span className="sr-only">The copilot is thinking.</span>
      <span aria-hidden className="w-4 text-center text-base leading-none text-primary">{glyph}</span>
      <span aria-hidden key={verb} className="thinking-verb-in">
        <span className="text-shimmer-brand font-medium">{verb}…</span>
      </span>
      {seconds > 0 && <span aria-hidden className="text-xs tabular-nums text-muted-foreground">{seconds}s</span>}
    </div>
  );
}
