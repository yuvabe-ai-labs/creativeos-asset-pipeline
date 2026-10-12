import type { z } from "zod";
import type { StreamingCall, StructuredCall } from "./model";
import { EMPTY_PARTIAL_DRAFT, parsePartialDraft, type PartialDraft } from "./partial-draft";

/** A call whose answer is shaped like a draft (header, cast, shots), streamed into the pane: the empty
 *  draft line at once (D366), then a new line each time a header field, a person or a whole shot has
 *  arrived (D337). Used by the first draft and by a pasted script's import. */
export async function streamDraftCall<S extends z.ZodType>(
  deps: { call: StructuredCall; stream?: StreamingCall; onDraft?: (draft: PartialDraft) => void },
  args: { name: string; system: string; user: string; schema: S },
): Promise<z.infer<S>> {
  deps.onDraft?.(EMPTY_PARTIAL_DRAFT);
  if (!deps.stream) return deps.call(args);
  let shown = "0:0:0";
  return deps.stream(args, (text) => {
    const partial = parsePartialDraft(text);
    if (!partial) return;
    const sig = `${Object.keys(partial.header).length}:${partial.cast.length}:${partial.shots.length}`;
    if (sig === shown) return;
    shown = sig;
    deps.onDraft?.(partial);
  });
}
