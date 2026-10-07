import type { EditIntent } from "@/lib/image-gen/edit-prompt";
import { buildCompositeEditPrompt } from "@/prompts/composite-generate";
import { mentionIds, resolveCompositeMentions, type CompositeRef } from "./references";
import type { CompositeUpstreamItem } from "./upstream-items";

// D312 — the Edit panel's final-prompt preview: the same builder the route uses, numbered over
// the picture being edited (image 1) and then the ticked or mentioned references in input order.
// The client sends it only when the operator hand-edits it; otherwise the server builds its own,
// so preview and request cannot disagree about which image is which.
export function compositeEditPreview(args: {
  items: CompositeUpstreamItem[];
  selectedIds: string[];
  instruction: string;
  intent: EditIntent;
  hasAvatar: boolean;
}): string {
  if (!args.instruction.trim()) return "";
  const wanted = new Set([...args.selectedIds, ...mentionIds(args.instruction)]);
  const extras: CompositeRef[] = args.items
    .filter((i) => wanted.has(i.id) && i.fileUrl)
    .map((i, n) => ({
      nodeId: i.id,
      name: i.label,
      role: "image",
      image: { url: i.fileUrl as string },
      position: n + 2,
    }));
  return buildCompositeEditPrompt({
    instruction: resolveCompositeMentions(args.instruction, extras),
    intent: args.intent,
    extras,
    hasAvatar: args.hasAvatar,
  });
}
