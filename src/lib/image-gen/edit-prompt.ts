import { resolveMentionTokens, type MentionUpstream } from "@/lib/nodes/resolve-mention-tokens";

export type EditIntent = "remove" | "replace" | "add" | "modify" | "freeform";

const MASK_CLAUSE =
  " Apply the change only within the selected (masked) region and blend it seamlessly; " +
  "keep everything outside the region unchanged.";

export function buildEditPrompt(input: {
  instruction: string;
  intent?: EditIntent;
  hasExtraReference?: boolean;
  masked?: boolean;
  upstream?: MentionUpstream[];
}): string {
  // Resolve @[Label](nodeId) tokens before building the template.
  const instruction = input.upstream
    ? resolveMentionTokens(input.instruction.trim(), input.upstream)
    : input.instruction.trim();

  const intent = input.intent ?? (input.hasExtraReference ? "add" : "freeform");

  let base: string;
  switch (intent) {
    case "remove":
      base =
        `Using the provided image, remove ${instruction}. Keep everything else exactly the ` +
        `same — preserve the original subject, style, lighting, composition, and all remaining ` +
        `elements, and fill the vacated area so the edit is seamless.`;
      break;
    case "replace":
      base =
        `Using the provided image as the base scene, replace ${instruction} with the product ` +
        `shown in the additional reference image(s). Match the original placement, scale, ` +
        `perspective, lighting, and shadows. Keep everything else in the scene exactly the same.`;
      break;
    case "add":
      base =
        `Using the provided image as the base scene, add ${instruction} using the product shown ` +
        `in the additional reference image(s). Integrate it naturally with realistic scale, ` +
        `perspective, lighting, and shadows, and keep everything else in the scene exactly the same.`;
      break;
    case "modify":
    case "freeform":
    default:
      base =
        `Using the provided image, change only ${instruction}. Keep everything else exactly the ` +
        `same — preserve the original style, lighting, composition, and all other elements.`;
      break;
  }

  return input.masked ? base + MASK_CLAUSE : base;
}

export function assembleEditReferences(input: {
  baseImageUrl: string;
  extraUrls: string[];
  max: number;
}): string[] {
  const extras = input.extraUrls.filter((u) => u !== input.baseImageUrl);
  return [input.baseImageUrl, ...extras].slice(0, Math.max(1, input.max));
}

// Resolve which connected image node is the edit base. A generated attempt always wins (base
// = the attempt, so this returns null and the caller uses the attempt's URL). Otherwise the
// operator's explicit pick wins when that node is still connected; if it isn't (disconnected
// or deleted) we fall back to the first connected image — today's implicit rule — never a
// dangling base. Order of `connected` mirrors the canvas node list.
export function resolveBaseNodeId(input: {
  connected: Array<{ id: string }>;
  baseReferenceNodeId?: string;
  hasAttempt: boolean;
}): string | null {
  if (input.hasAttempt) return null;
  const pinned =
    input.baseReferenceNodeId &&
    input.connected.find((c) => c.id === input.baseReferenceNodeId);
  if (pinned) return pinned.id;
  return input.connected[0]?.id ?? null;
}

// Resolve the connected nodes the user marked as references for this edit into URLs. Base is
// excluded (it's the image being edited, not an extra). Empty selection = the D27 default (all
// other connected images). Order-preserving, deduped (spec §7).
export function selectEditReferenceUrls(input: {
  connected: Array<{ id: string; url: string }>;
  selectedIds: string[];
  baseUrl?: string;
}): string[] {
  const nonBase = input.connected.filter((c) => !!c.url && c.url !== input.baseUrl);
  const chosen =
    input.selectedIds.length > 0
      ? nonBase.filter((c) => input.selectedIds.includes(c.id))
      : nonBase;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chosen) {
    if (!seen.has(c.url)) {
      seen.add(c.url);
      out.push(c.url);
    }
  }
  return out;
}
