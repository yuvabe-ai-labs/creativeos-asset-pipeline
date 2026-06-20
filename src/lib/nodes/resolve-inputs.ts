import "server-only";
import { getNodeActiveKB, getUpstreamOutputs } from "@/lib/db/nodes";
import { buildParseContext, normalizeSlices, type KBSliceKey } from "@/lib/kb/parse-context";
import { getNodeOutput } from "@/lib/nodes/node-output";
import { renderShotForVideo } from "@/lib/nodes/render-shot-for-video";
import type { ReelScript } from "@/lib/nodes/reel-script";

const TYPE_LABEL: Record<string, string> = {
  script: "Script",
  text: "Note",
  prompt: "Prompt",
  file: "File",
  shot: "Shot",
  draw: "Sketch",
  "image-gen": "Image",
  "video-prompt": "Video Prompt",
};

export type UpstreamPreview = {
  nodeId: string;
  versionId: string | null;
  label: string;
  type: string;
  text: string;
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
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

  // A Shot already carries the full reel script narrowed to its one shot (D21), so
  // we do NOT walk to its parent Script — that would pass the entire reel (all shots)
  // into every per-shot image prompt. Each upstream contributes only itself.
  const upstream = ups.map((u) => ({
    nodeId: u.nodeId,
    versionId: u.versionId,
    label: TYPE_LABEL[u.type] ?? u.type,
    type: u.type,
    text: getNodeOutput({ type: u.type, data: u.data, activeOutput: u.activeOutput }),
    fileUrl:
      u.type === "file" || u.type === "draw"
        ? (u.data.fileUrl as string | undefined)
        : undefined,
    fileKind:
      u.type === "file" || u.type === "draw"
        ? (u.data.fileKind as string | undefined)
        : undefined,
    useLlm: u.type === "file" ? (u.data.useLlm as boolean | undefined) : undefined,
  }));
  // Note: we do NOT drop empty-output upstreams here. `compilePrompt` already skips
  // empty-text blocks when building the model payload, and keeping them lets the UI
  // distinguish "connected but no output yet" from "not connected at all".

  return { clientContext, kbVersionId: kbCtx.kbVersionId, slices, upstream };
}

export type RawUpstream = {
  nodeId: string;
  versionId: string | null;
  type: string;
  data: Record<string, unknown>;
  activeOutput: unknown;
};

// Pure mapping of one upstream node into a video-prompt UpstreamPreview. Differs from the
// image path in two ways: a Shot renders via renderShotForVideo (action/objective, not the
// D23 image slice), and an Image Gen still travels as a VISION fileUrl with no text leak.
export function mapUpstreamForVideo(u: RawUpstream): UpstreamPreview {
  const base: UpstreamPreview = {
    nodeId: u.nodeId,
    versionId: u.versionId,
    label: TYPE_LABEL[u.type] ?? u.type,
    type: u.type,
    text: "",
  };

  if (u.type === "image-gen") {
    // The still's URL is the active output (a string). Feed it as vision, never as text.
    const url = typeof u.activeOutput === "string" ? u.activeOutput : undefined;
    return { ...base, text: "", fileUrl: url, fileKind: "image" };
  }
  if (u.type === "shot") {
    return { ...base, text: renderShotForVideo((u.data.script ?? null) as ReelScript | null) };
  }
  if (u.type === "file" || u.type === "draw") {
    return {
      ...base,
      text: getNodeOutput({ type: u.type, data: u.data, activeOutput: u.activeOutput }),
      fileUrl: u.data.fileUrl as string | undefined,
      fileKind: u.data.fileKind as string | undefined,
      useLlm: u.type === "file" ? (u.data.useLlm as boolean | undefined) : undefined,
    };
  }
  return { ...base, text: getNodeOutput({ type: u.type, data: u.data, activeOutput: u.activeOutput }) };
}

// resolveInputs for the Video Prompt node: ambient client KB + upstream edge outputs, mapped
// for motion (shots → action/objective; Image Gen still → vision frame). Mirrors
// resolvePromptInputs but leaves the image-Prompt path untouched.
export async function resolveVideoPromptInputs(
  nodeId: string,
  slicesInput: unknown,
): Promise<ResolvedPromptInputs | null> {
  const kbCtx = await getNodeActiveKB(nodeId);
  if (!kbCtx) return null;

  const slices = normalizeSlices(slicesInput);
  const clientContext = kbCtx.kb ? buildParseContext(kbCtx.kb, slices) : "";

  const ups = await getUpstreamOutputs(nodeId);
  const upstream = ups.map((u) =>
    mapUpstreamForVideo({
      nodeId: u.nodeId,
      versionId: u.versionId,
      type: u.type,
      data: u.data,
      activeOutput: u.activeOutput,
    }),
  );

  return { clientContext, kbVersionId: kbCtx.kbVersionId, slices, upstream };
}
