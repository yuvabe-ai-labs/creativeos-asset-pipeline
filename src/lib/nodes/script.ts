// The Script node's `compile` step — a pure function: (script + client context
// + optional market-signal brief) → the model payload. The prompt + schema and
// the mode instructions live in `src/prompts/script-parse.ts` (versioned,
// evaluable, DB-ready); this file only *composes* the two messages.
import { scriptParsePrompt } from "@/prompts/script-parse";
import type { SignalMode } from "@/lib/market/constants";

export function compileScript(
  source: string,
  clientContext: string,
  signalBrief = "",
  signalMode: SignalMode = "tint",
) {
  const ctx = clientContext.trim();
  const brief = signalBrief.trim();
  const mode = brief ? scriptParsePrompt.signalModes[signalMode] : "";

  // The user message carries the DATA: the signal briefs (a description of a
  // market, not a set of orders) and the script to extract.
  const user = `${brief ? `${brief}\n\n` : ""}Reel script to extract:\n${source.trim()}`;

  // The system message carries the INSTRUCTIONS, in precedence order, because a
  // rule stated only in the user message loses to the system prompt — that is
  // what made the flavour a no-op in 11/13 measured parses, and it would rank a
  // market signal above the client's compliance text just as easily.
  //   1. the extraction prompt
  //   2. the client's brand + compliance context
  //   3. COMPLIANCE FIRST — names 2 as outranking everything below it
  //   4. the signal's mode instruction
  // Both 2/3 and 4 are conditional, so an unflavoured parse with no KB context
  // still gets exactly the bare system prompt it always got.
  const system = [
    scriptParsePrompt.system,
    ctx ? `${scriptParsePrompt.clientContextHeading}\n${ctx}` : "",
    ctx || mode ? scriptParsePrompt.complianceFirst : "",
    mode,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, user };
}
