import "server-only";
import { getNodeActiveKB, getUpstreamOutputs } from "@/lib/db/nodes";
import { buildParseContext, normalizeSlices, type KBSliceKey } from "@/lib/kb/parse-context";
import { getNodeOutput } from "@/lib/nodes/node-output";

const TYPE_LABEL: Record<string, string> = {
  script: "Script",
  text: "Note",
  prompt: "Prompt",
  file: "File",
};

export type UpstreamPreview = {
  nodeId: string;
  versionId: string | null;
  label: string;
  type: string;
  text: string;
  fileUrl?: string;
  fileKind?: string;
};

export type ResolvedPromptInputs = {
  clientContext: string;
  kbVersionId: string | null;
  slices: KBSliceKey[];
  upstream: UpstreamPreview[];
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
  const upstream = ups.map((u) => ({
    nodeId: u.nodeId,
    versionId: u.versionId,
    label: TYPE_LABEL[u.type] ?? u.type,
    type: u.type,
    text: getNodeOutput({ type: u.type, data: u.data, activeOutput: u.activeOutput }),
    fileUrl: u.type === "file" ? (u.data.fileUrl as string | undefined) : undefined,
    fileKind: u.type === "file" ? (u.data.fileKind as string | undefined) : undefined,
  }));
  // Note: we do NOT drop empty-output upstreams here. `compilePrompt` already skips
  // empty-text blocks when building the model payload, and keeping them lets the UI
  // distinguish "connected but no output yet" from "not connected at all".

  return { clientContext, kbVersionId: kbCtx.kbVersionId, slices, upstream };
}
