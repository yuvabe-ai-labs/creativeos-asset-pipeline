import "server-only";
import { getNodeActiveKB, getNodeData, getUpstreamOutputs } from "@/lib/db/nodes";
import { buildParseContext, normalizeSlices, type KBSliceKey } from "@/lib/kb/parse-context";
import { getNodeOutput, renderShotForImage } from "@/lib/nodes/node-output";
import { renderShotForVideo } from "@/lib/nodes/render-shot-for-video";
import { SINGLE_TAKE_LINE } from "@/prompts/video-prompt-generate";
import { selectImageUpstreams } from "@/lib/nodes/shot-compose";
import type { ReelScript } from "@/lib/nodes/reel-script";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";

const TYPE_LABEL: Record<string, string> = {
  script: "Script",
  text: "Note",
  prompt: "Prompt",
  file: "File",
  shot: "Shot",
  draw: "Sketch",
  "image-gen": "Image",
  "video-prompt": "Motion Prompt",
  multishot: "Multishot",
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
    // D208 — a Shot is always ONE continuous take now; there is no flag left to branch on. A
    // multishot GENERATION lives on its own dedicated node type instead (which does not feed this
    // path — Phase 2's renderPlan). Omni still needs telling explicitly, because it cuts by default.
    const script = (u.data.script ?? null) as ReelScript | null;
    const action = renderShotForVideo(script);
    return { ...base, text: action ? `${action}\n${SINGLE_TAKE_LINE}` : "" };
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

// resolveInputs for the Shot Composer (D28). The seed comes from the Shot's OWN data.script
// (renderShotForImage = the D23 trim) — NOT an upstream walk, so the dashed Script->Shot
// lineage edge is never followed (seed-and-fork, D21). Grounding images come only from
// image-typed upstreams. Returns null when the node is missing (lets the route 404).
export async function resolveShotComposeInputs(
  nodeId: string,
  slicesInput: unknown,
): Promise<{
  seedText: string;
  clientContext: string;
  kbVersionId: string | null;
  slices: KBSliceKey[];
  imageUpstream: UpstreamPreview[];
} | null> {
  const kbCtx = await getNodeActiveKB(nodeId);
  if (!kbCtx) return null;

  const data = await getNodeData(nodeId);
  const script = (data?.script ?? null) as ReelScript | null;
  const seedText = renderShotForImage(script);

  const slices = normalizeSlices(slicesInput);
  const clientContext = kbCtx.kb ? buildParseContext(kbCtx.kb, slices) : "";

  const ups = await getUpstreamOutputs(nodeId);
  const imageUpstream = selectImageUpstreams(
    ups.map((u) => ({
      nodeId: u.nodeId, type: u.type, data: u.data, activeOutput: u.activeOutput, versionId: u.versionId,
    })),
  );

  return {
    seedText,
    clientContext,
    kbVersionId: kbCtx.kbVersionId,
    slices,
    imageUpstream,
  };
}

export type ResolvedMultishotInputs = {
  clientContext: string;
  kbVersionId: string | null;
  slices: KBSliceKey[];
  upstream: UpstreamPreview[];
  /** The upstream Multishot node's cut list — the shots this plan must cover. */
  cuts: MultishotCut[];
};

/**
 * Inputs for the Multishot Prompt node. Sibling of `resolveVideoPromptInputs`, and separate for
 * the same reason the node types are: the cut list has no analogue on the single-take path, and
 * threading an optional one through would put a branch in every caller.
 */
export async function resolveMultishotPromptInputs(
  nodeId: string,
  slicesInput: unknown,
): Promise<ResolvedMultishotInputs | null> {
  const kbCtx = await getNodeActiveKB(nodeId);
  if (!kbCtx) return null;

  const slices = normalizeSlices(slicesInput);
  const clientContext = kbCtx.kb ? buildParseContext(kbCtx.kb, slices) : "";

  const ups = await getUpstreamOutputs(nodeId);
  const upstream = ups.map((u) => mapUpstreamForVideo(u));
  const source = ups.find((u) => u.type === "multishot");
  const cuts = ((source?.data.cuts ?? []) as MultishotCut[]).filter((c) => c && c.id);

  return { clientContext, kbVersionId: kbCtx.kbVersionId, slices, upstream, cuts };
}

/**
 * The user turn. Each cut's own steer sits WITH that cut rather than in a parallel list, so the
 * writer never has to align two orderings — which is exactly the mistake that produces a beat
 * written against the wrong shot's instruction.
 */
export function buildMultishotUserTurn(args: {
  clientContext: string;
  upstream: UpstreamPreview[];
  cuts: MultishotCut[];
  instruction: string;
  cutInstructions: Record<string, string>;
}): string {
  const blocks: string[] = [];

  if (args.clientContext.trim()) blocks.push(`Brand context:\n${args.clientContext.trim()}`);

  for (const u of args.upstream) {
    if (!u.text.trim()) continue;
    blocks.push(`${u.label}:\n${u.text.trim()}`);
  }

  if (args.instruction.trim()) {
    blocks.push(`For the sequence as a whole:\n${args.instruction.trim()}`);
  }

  const shots = args.cuts
    .map((cut, i) => {
      const lines = [
        `Shot ${i + 1} — cutId: ${cut.id} — ${cut.seconds}s`,
        `  Shot text: ${cut.text.trim() || "(none — write it from the sequence context)"}`,
      ];
      const steer = (args.cutInstructions[cut.id] ?? "").trim();
      if (steer) lines.push(`  Operator instruction for THIS shot: ${steer}`);
      return lines.join("\n");
    })
    .join("\n\n");

  blocks.push(`Shots (return exactly one beat per shot, echoing each cutId):\n${shots}`);

  return blocks.join("\n\n");
}
