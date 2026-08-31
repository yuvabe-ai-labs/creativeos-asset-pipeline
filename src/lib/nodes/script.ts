// The Script node's `compile` step — a pure function: (script + client context
// + optional market-signal brief) → the model payload. The prompt + schema and
// the mode instructions live in `src/prompts/script-parse.ts` (versioned,
// evaluable, DB-ready); this file only *composes* the user message.
import { scriptParsePrompt } from "@/prompts/script-parse";
import type { SignalMode } from "@/lib/market/constants";

export function compileScript(
  source: string,
  clientContext: string,
  signalBrief = "",
  signalMode: SignalMode = "tint",
) {
  const ctx = clientContext.trim()
    ? `Client context (brand tone + compliance — do not introduce avoided words):\n${clientContext.trim()}\n\n`
    : "";
  const signals = signalBrief.trim()
    ? `${signalBrief.trim()}\n\n${scriptParsePrompt.signalModes[signalMode]}\n\n`
    : "";
  const user = `${ctx}${signals}Reel script to extract:\n${source.trim()}`;
  return { system: scriptParsePrompt.system, user };
}
