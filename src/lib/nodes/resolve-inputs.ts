import "server-only";
import { getNodeActiveKB, getUpstreamOutputs } from "@/lib/db/nodes";
import { buildParseContext, normalizeSlices, type KBSliceKey } from "@/lib/kb/parse-context";
import { getNodeOutput } from "@/lib/nodes/node-output";

const TYPE_LABEL: Record<string, string> = {
  script: "Script",
  text: "Note",
  prompt: "Prompt",
  shot: "Shot",
};

export type ResolvedPromptInputs = {
  clientContext: string;
  kbVersionId: string | null;
  slices: KBSliceKey[];
  upstream: { nodeId: string; versionId: string | null; label: string; text: string }[];
};

// resolveInputs for the Prompt node: ambient client KB (walk node->canvas->client,
// reuse the Script pipeline) + upstream edge outputs (each normalized to text).
// Returns null when the node is missing (lets routes 404 during the autosave race).
export async function resolvePromptInputs(
  nodeId: string,
  slicesInput: unknown,
): Promise<ResolvedPromptInputs | null> {
  const kbCtx = await getNodeActiveKB(nodeId);
  if (!kbCtx) return null;

  const slices = normalizeSlices(slicesInput);
  const clientContext = kbCtx.kb ? buildParseContext(kbCtx.kb, slices) : "";

  const ups = await getUpstreamOutputs(nodeId);
  const upstream = ups
    .map((u) => ({
      nodeId: u.nodeId,
      versionId: u.versionId,
      label: TYPE_LABEL[u.type] ?? u.type,
      text: getNodeOutput({ type: u.type, data: u.data, activeOutput: u.activeOutput }),
    }));
  // Note: we do NOT drop empty-output upstreams here. `compilePrompt` already skips
  // empty-text blocks when building the model payload, and keeping them lets the UI
  // distinguish "connected but no output yet" from "not connected at all".

  return { clientContext, kbVersionId: kbCtx.kbVersionId, slices, upstream };
}
