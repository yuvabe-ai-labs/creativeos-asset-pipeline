import "server-only";
import { getNodeActiveKB, getNodeData, getUpstreamOutputs } from "@/lib/db/nodes";
import { buildParseContext, normalizeSlices, type KBSliceKey } from "@/lib/kb/parse-context";
import { getNodeOutput, renderShotForImage } from "@/lib/nodes/node-output";
import {
  renderShotForVideo,
  renderShotLadder,
  renderMultishotBrief,
} from "@/lib/nodes/render-shot-for-video";
import type { VideoControls } from "@/lib/nodes/video-controls";
import { SINGLE_TAKE_LINE } from "@/prompts/video-prompt-generate";
import { selectImageUpstreams } from "@/lib/nodes/shot-compose";
import type { ReelScript, ReelShot } from "@/lib/nodes/reel-script";

const TYPE_LABEL: Record<string, string> = {
  script: "Script",
  text: "Note",
  prompt: "Prompt",
  file: "File",
  shot: "Shot",
  draw: "Sketch",
  "image-gen": "Image",
  "video-prompt": "Motion Prompt",
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
  /** D201 — set when any upstream Shot is multishot. Only the video-prompt path populates it. */
  upstreamMultishot?: boolean;
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

  // No `upstreamMultishot` here on purpose — this is the IMAGE prompt path, where multishot has
  // no meaning. Only resolveVideoPromptInputs computes it.
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
export function mapUpstreamForVideo(u: RawUpstream, controls?: VideoControls): UpstreamPreview {
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
    // D195 — a multishot Shot hands down its beats as a timecode ladder; a single one hands down
    // the action line plus an explicit instruction to hold one take, because Omni cuts by default.
    //
    // A ladder needs MORE THAN ONE beat. On a single-shot node multishot means "the model may cut
    // inside this shot", which a one-line ladder ending "keep these timings exactly" would forbid
    // — and if that shot runs over the 10s cap, its ladder would outrun the request's duration and
    // come back truncated at full price.
    const script = (u.data.script ?? null) as ReelScript | null;
    const beats = script?.visual_script?.shots ?? [];
    const multishot = u.data.multishot === true;
    const action = renderShotForVideo(script);
    if (multishot && beats.length > 1) {
      // D201 — with the node's own controls, the ladder carries the LOOK contract and each beat's
      // camera. Without them (any caller that has no controls to give) it falls back to the plain
      // ladder, which is the same text this produced before those controls existed.
      return {
        ...base,
        text: controls
          ? renderMultishotBrief({ script, controls })
          : `Beats (keep these timings exactly):\n${renderShotLadder(script)}`,
      };
    }
    if (multishot) {
      return { ...base, text: `${action}\nThe model may cut within this shot.`.trim() };
    }
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
  controls?: VideoControls,
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
    }, controls),
  );

  // D201 — whether any upstream Shot is multishot. The prompt routes on this, not on the
  // provider: a multishot shot needs the ladder prompt, a single one the continuous-take spine.
  //
  // The `> 1` matches mapUpstreamForVideo above and the focus view's own check, and it has to.
  // A one-beat shot toggled to multishot gets NO ladder in its user turn, so routing it to the
  // ladder prompt would ask the model to honour timings it was never given.
  const upstreamMultishot = ups.some((u) => {
    if (u.type !== "shot") return false;
    const d = u.data as { multishot?: boolean; script?: ReelScript | null };
    return d.multishot === true && (d.script?.visual_script?.shots?.length ?? 0) > 1;
  });

  return { clientContext, kbVersionId: kbCtx.kbVersionId, slices, upstream, upstreamMultishot };
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
  /** D201 — the shot's own beats, for the multishot composer's ladder. */
  shots: ReelShot[];
  /** D201 — true only with a ladder to compose against; a one-beat node composes as a single shot. */
  multishot: boolean;
  objective: string;
} | null> {
  const kbCtx = await getNodeActiveKB(nodeId);
  if (!kbCtx) return null;

  const data = await getNodeData(nodeId);
  const script = (data?.script ?? null) as ReelScript | null;
  const seedText = renderShotForImage(script);
  const shots = script?.visual_script?.shots ?? [];
  // The same `> 1` the motion path uses: a one-beat shot toggled to multishot has no ladder to
  // compose against, so it gets the single-shot composer.
  const multishot = (data as { multishot?: boolean } | null)?.multishot === true && shots.length > 1;

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
    shots,
    multishot,
    objective: script?.strategic_objective ?? "",
  };
}
