// The Editor's canvas rules: one per canvas (D388), and connecting a clip is refused while it
// generates or has no finished take (D390): a job finishing later would become the current take
// and change a reel that was already cut.
import { readDubbingOutput } from "@/lib/dubbing/types";
import { ONE_CLIENT_REVIEW_PER_CANVAS } from "@/lib/client-review/rules";

export const ONE_EDITOR_PER_CANVAS = "This canvas already has an Editor. Open it from the canvas to keep cutting.";
export const EDITOR_DUPLICATE_REFUSED = "An Editor can't be duplicated: each canvas has one.";
export const CONNECT_WHILE_GENERATING = "This clip is still generating. Connect it to the Editor once it finishes.";
export const CONNECT_WITHOUT_TAKE = "This clip has no finished take yet. Connect it to the Editor once it has one.";

/** Why a node of `type` can't be added here, or null. One Editor (D388) and one Client review
 *  node (D495) per canvas. */
export function addNodeRefusal(type: string, nodes: readonly { type?: string }[]): string | null {
  if (type === "editor" && nodes.some((n) => n.type === "editor")) return ONE_EDITOR_PER_CANVAS;
  if (type === "client-review" && nodes.some((n) => n.type === "client-review")) return ONE_CLIENT_REVIEW_PER_CANVAS;
  return null;
}

/** Why `source` can't be connected to a `targetType` node, or null. Only the Editor refuses. */
export function editorConnectRefusal(
  source: { type?: string; data: unknown },
  targetType: string | undefined,
  isGenerating: boolean,
): string | null {
  if (targetType !== "editor") return null;
  if (isGenerating) return CONNECT_WHILE_GENERATING;
  const parsed = (source.data as { parsed?: unknown } | null)?.parsed;
  const hasTake = source.type === "dubbing" ? readDubbingOutput(parsed) !== null : typeof parsed === "string";
  return hasTake ? null : CONNECT_WITHOUT_TAKE;
}
