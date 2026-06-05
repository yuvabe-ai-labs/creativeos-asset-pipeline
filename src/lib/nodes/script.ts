// The Script node's `compile` step — a pure function: (script + client context)
// → the model payload. The prompt + schema live separately in
// `src/prompts/script-parse.ts` (versioned, evaluable, DB-ready); this file only
// *composes* the user message.
import { scriptParsePrompt } from "@/prompts/script-parse";

export function compileScript(source: string, clientContext: string) {
  const ctx = clientContext.trim()
    ? `Client context (brand tone + compliance — do not introduce avoided words):\n${clientContext.trim()}\n\n`
    : "";
  const user = `${ctx}Reel script to extract:\n${source.trim()}`;
  return { system: scriptParsePrompt.system, user };
}
