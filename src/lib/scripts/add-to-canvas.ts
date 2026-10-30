import type { XYPosition } from "@xyflow/react";
import type { Script } from "./schema";
import type { ParseResult } from "@/lib/nodes/parse-script-node";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { printScript } from "./print";
import type { ScriptStoryboard, StoryboardPanel } from "./storyboard";
import { scriptCanvasAssets, type ScriptCanvasAssets } from "./asset-canvas";

type ScriptNodeFill = { title: string; source: string; storyboard?: ScriptStoryboard; assets?: ScriptCanvasAssets };

// Spec 1 §5.2 — what happens when an approved script lands on a canvas, as a plain function so
// every path (including failures) is testable without React. `useAddScriptNode` supplies the
// store, the avatar attach, the parse call and the toasts.

export type AddScriptDeps = {
  getDetail: (scriptId: string) => Promise<{ script: Script; leadAvatarId: string | null; storyboard: StoryboardPanel[] }>;
  addScriptNode: (nodeId: string, position: XYPosition, data: ScriptNodeFill) => void;
  attachAvatar: (avatarId: string, nodeId: string, position: XYPosition) => void;
  parse: (nodeId: string, source: string) => Promise<ParseResult>;
  writeParsed: (nodeId: string, output: ReelScript) => void;
  /** Puts the script into an existing empty Script node (a new canvas's seeded one). */
  fillScriptNode: (nodeId: string, data: ScriptNodeFill) => void;
  /** The canvas's shared "this node is parsing" flag (canvas store, never saved; D373). */
  setParsing: (nodeId: string, parsing: boolean) => void;
  newId: () => string;
  toast: {
    loading: (message: string) => string | number;
    success: (message: string, opts: { id: string | number }) => void;
    error: (message: string, opts?: { id: string | number }) => void;
  };
};

/** Shown after any parse failure: the node keeps its text, so the person can parse it again. */
const RETRY = "The script is on the canvas; open the node to parse it again.";

/** `opts.into` puts the script into that existing empty Script node instead of a new one. */
export async function addScriptToCanvas(scriptId: string, position: XYPosition, d: AddScriptDeps, opts: { into?: string } = {}): Promise<void> {
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
  // D381, D385 — the storyboard panels (current picks when added) ride on the node, frozen; a
  // script without any gets no key. D450 — so do its products, locations and per-shot picks.
  const assets = scriptCanvasAssets(scriptId, detail.script.doc);
  const fill: ScriptNodeFill = {
    title: header.title,
    source,
    ...(detail.storyboard.length > 0 && { storyboard: { scriptId, panels: detail.storyboard } }),
    ...(assets && { assets }),
  };
  const nodeId = opts.into ?? d.newId();
  if (opts.into) d.fillScriptNode(nodeId, fill);
  else d.addScriptNode(nodeId, position, fill);
  if (detail.leadAvatarId) d.attachAvatar(detail.leadAvatarId, nodeId, position);

  // The node reads "Parsing script…" for exactly as long as the parse runs, however it ends.
  d.setParsing(nodeId, true);
  try {
    await parseOnCanvas(nodeId, source, header.title, d);
  } finally {
    d.setParsing(nodeId, false);
  }
}

async function parseOnCanvas(nodeId: string, source: string, title: string, d: AddScriptDeps): Promise<void> {
  const toastId = d.toast.loading(`Parsing "${title}"…`);
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
  d.toast.success(`"${title}" parsed into ${n} shot${n === 1 ? "" : "s"}`, { id: toastId });
}
