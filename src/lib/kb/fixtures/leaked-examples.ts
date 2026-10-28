// Example values that once sat in the kb-extract prompt or the KB schema descriptions and were
// copied, verbatim, into client KBs whose sources never said them (October 2026). The prompt and
// schema must never carry them again, and an extraction must never output one its sources lack.
export const LEAKED_KB_EXAMPLES: readonly RegExp[] = [
  /results may vary/i,
  /for external use only/i,
  /hype language/i,
  /aggressive urgency/i,
  /\bheal(s|ed|ing|er)?\b/i,
  /\bcur(e|es|ed|ing|ative)\b/i,
  /guaranteed results/i,
  /clinically proven/i,
  /permanent fix/i,
  /\b(nourishes|soothes|comforts)\b/i,
  /INTRO:\s*hook/i,
];
