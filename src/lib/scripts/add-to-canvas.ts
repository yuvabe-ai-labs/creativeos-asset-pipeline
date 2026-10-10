import type { XYPosition } from "@xyflow/react";
import type { Script } from "./schema";
import type { ParseResult } from "@/lib/nodes/parse-script-node";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { printScript } from "./print";

// Spec 1 §5.2 — what happens when an approved script lands on a canvas, as a plain function so
// every path (including failures) is testable without React. `useAddScriptNode` supplies the
// store, the avatar attach, the parse call and the toasts.

export type AddScriptDeps = {
  getDetail: (scriptId: string) => Promise<{ script: Script; leadAvatarId: string | null }>;
  addScriptNode: (nodeId: string, position: XYPosition, data: { title: string; source: string }) => void;
  attachAvatar: (avatarId: string, nodeId: string, position: XYPosition) => void;
  parse: (nodeId: string, source: string) => Promise<ParseResult>;
  writeParsed: (nodeId: string, output: ReelScript) => void;
  newId: () => string;
  toast: {
    loading: (message: string) => string | number;
    success: (message: string, opts: { id: string | number }) => void;
    error: (message: string, opts?: { id: string | number }) => void;
  };
};

/** Shown after any parse failure: the node keeps its text, so the person can parse it again. */
const RETRY = "The script is on the canvas; open the node to parse it again.";

export async function addScriptToCanvas(scriptId: string, position: XYPosition, d: AddScriptDeps): Promise<void> {
  let detail;
  try {
    detail = await d.getDetail(scriptId);
  } catch (e) {
    d.toast.error(e instanceof Error ? e.message : "Could not load the script.");
    return;
  }
  if (detail.script.stage !== "approved") {
    d.toast.error("Only approved scripts can go on a canvas.");
    return;
  }

  const { header } = detail.script.doc;
  const source = printScript(detail.script.doc);
  const nodeId = d.newId();
  d.addScriptNode(nodeId, position, { title: header.title, source });
  if (detail.leadAvatarId) d.attachAvatar(detail.leadAvatarId, nodeId, position);

  const toastId = d.toast.loading(`Parsing "${header.title}"…`);
  let result: ParseResult;
  try {
    result = await d.parse(nodeId, source);
  } catch {
    d.toast.error(`Could not parse the script. It is on the canvas; open the node to parse it again.`, { id: toastId });
    return;
  }
  if (!result.ok) {
    // The "saving" message already says how to retry; a hard failure gets the hint added.
    d.toast.error(result.reason === "failed" ? `${result.error.replace(/\.?$/, ".")} ${RETRY}` : result.error, { id: toastId });
    return;
  }
  d.writeParsed(nodeId, result.output);
  const n = result.output.visual_script?.shots?.length ?? 0;
  d.toast.success(`"${header.title}" parsed into ${n} shot${n === 1 ? "" : "s"}`, { id: toastId });
}
