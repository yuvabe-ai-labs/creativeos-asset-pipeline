// The Brief node's `compile` step — a pure function: (source + client context)
// → the model payload. The prompt + schema live separately in
// `src/prompts/brief-parse.ts` (versioned, evaluable, DB-ready); this file only
// *composes* the user message. No prompt text lives here.
import { briefParsePrompt } from "@/prompts/brief-parse";

export function compileBrief(source: string, clientContext: string) {
  const ctx = clientContext.trim()
    ? `Client context (use it to disambiguate and to enforce compliance — do not invent facts):\n${clientContext.trim()}\n\n`
    : "";
  const user = `${ctx}Reel brief to parse:\n${source.trim()}`;
  return { system: briefParsePrompt.system, user };
}
