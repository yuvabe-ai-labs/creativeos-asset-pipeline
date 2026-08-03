// Pure node types + mappers. Uses ONLY `import type` from React Flow, so this
// file is safe to import from Server Components (no React Flow runtime pulled in).
import type { Node } from "@xyflow/react";
import type { NodeRow } from "@/lib/db/types";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import type { ReelScript } from "@/lib/nodes/reel-script";
import type { VideoControls } from "@/lib/nodes/video-controls";
import type { VideoProvider } from "@/prompts/video-prompt-generate";
import type { EditIntent } from "@/lib/image-gen/edit-prompt";
import type { PostFormat, PostLayer } from "@/lib/post/types";

export type ScriptNodeData = {
  title?: string;
  source?: string; // raw script text (pasted or uploaded .md/.txt)
  parsed?: unknown; // active parsed output — DISPLAY ONLY, hydrated from the active version (D19); never persisted
  kbSlices?: KBSliceKey[]; // KB slices injected into parse context; undefined = DEFAULT_PARSE_SLICES
};

export type KBNodeData = {
  clientId: string;
  clientSlug: string;
  kbVersionId: string | null;
  brandName: string | null;
  fillRate: number | null;
  extractedAt: string | null;
};

export type FileNodeData = {
  title?: string;
  filename?: string;             // original filename shown in the focus view
  fileExt?: string;              // "txt" | "png" | "jpg" | "jpeg" | "webp" | "pdf" | "docx"
  fileKind?: "text" | "image" | "document";
  fileUrl?: string;              // public Supabase Storage URL (images + documents)
  rawText?: string;              // file content stored inline (text files only)
  useLlm?: boolean;
  llmPrompt?: string;
  processedOutput?: string;
  fileSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
  // Drive provenance — set when file originated from Google Drive
  driveFileId?: string;
  driveFileName?: string;
  driveMimeType?: string;
  // Transient upload state — true while a Drive import is streaming to GCS.
  uploading?: boolean;
  uploadError?: string;
};

export type TextNodeData = {
  text?: string; // free-text context; this node's "output" (no version log, D19)
};

export type DrawNodeData = {
  title?: string;
  fileUrl?: string; // flattened sketch PNG — the image handed downstream (reuses File field)
  fileKind?: "image"; // always "image" when present
  filename?: string; // e.g. "sketch-1718539200000.png"
  instructions?: string; // composition instructions — the text handed downstream (D19, like Text)
  fileSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
};

export type PromptNodeData = {
  title?: string;
  instruction?: string; // operator instruction
  parsed?: unknown; // active output (generated prompt text) — DISPLAY ONLY, hydrated from the active version (D19)
  kbSlices?: KBSliceKey[]; // ambient KB slices injected into the compiled prompt
};

export type ImageGenNodeData = {
  title?: string;
  modelId?: string;                   // e.g. "openai:gpt-image-2" — saved on node
  params?: Record<string, unknown>;   // last-used param values for selected model
  parsed?: unknown;                   // D19: active version output (image URL, display only — never persisted)
  editInstruction?: string;           // current edit instruction (the delta), persisted; snapshotted per attempt
  editIntent?: EditIntent;            // selected edit action (remove/replace/add/modify/freeform)
  editReferenceNodeIds?: string[];    // D37: connected node ids marked as references for the edit
  baseReferenceNodeId?: string;       // D39: connected image node pinned as the edit base (else first-connected)
};

export type VideoPromptNodeData = {
  title?: string;
  instruction?: string;         // operator steer ("emphasize the pour; let steam rise")
  controls?: VideoControls;     // camera move + motion speed (D24)
  kbSlices?: KBSliceKey[];      // ambient brand tone, like the Prompt node
  targetProvider?: VideoProvider; // D77: text-camera (veo/sora) vs external-camera (kling)
  parsed?: unknown;             // D19: active version output (motion prompt text) — display only
};

export type VideoGenNodeData = {
  title?: string;
  modelId?: string;
  params?: Record<string, unknown>;
  imageRoles?: Record<string, "start_frame" | "end_frame" | "reference">;
  parsed?: unknown; // D19: active version output (video URL, display only — never persisted)
};

export type ShotNodeData = {
  // The parent reel script narrowed to a SINGLE shot — "a Script node with one shot"
  // (D21). Carries the full metadata (objective, on-screen text, voiceover, caption…)
  // so downstream prompts keep the whole creative context, not just the shot line.
  // Editable; this node's output (D19/D20) — rendered via renderScriptAsText.
  script?: ReelScript;
  order?: number; // 1-based position in the script (display + Stage 5 assembly)
  shot_type?: string; // e.g. "Wide Shot", "Close-Up" — user-selected or keyword-derived
  seededFrom?: {
    scriptNodeId: string;
    shotIndex: number; // 0-based index in visual_script.shots at fork time
    scriptTitle?: string; // for the provenance label without a lookup
  };
};

export type PostNodeData = {
  title?: string;
  format?: PostFormat;
  templateId?: string;         // which starter template seeded this scene, for "Change template"
  layers?: PostLayer[];        // ordered back -> front — authored content, no version log (D19-style)
  fileUrl?: string;            // flattened PNG — this node's output
  filename?: string;
  imageWidth?: number;
  imageHeight?: number;
  fileSizeBytes?: number;
  renderedAt?: string;         // drives the "unrendered changes" badge (Task 24 staleness check)
};

export type AppNode =
  | Node<ScriptNodeData, "script">
  | Node<KBNodeData, "kb">
  | Node<FileNodeData, "file">
  | Node<TextNodeData, "text">
  | Node<PromptNodeData, "prompt">
  | Node<ShotNodeData, "shot">
  | Node<DrawNodeData, "draw">
  | Node<ImageGenNodeData, "image-gen">
  | Node<VideoPromptNodeData, "video-prompt">
  | Node<VideoGenNodeData, "video-gen">
  | Node<PostNodeData, "post">;

// PRD §10 — which source node types may connect to which target node types.
// The Video Prompt node (D24) sits between Image Gen and Video Gen: the still feeds it as a
// vision reference (image-gen → video-prompt), and it outputs a motion prompt
// (video-prompt → video-gen). prompt → video-gen is retained as the inline fallback path.
export const VALID_CONNECTIONS: Record<string, readonly string[]> = {
  kb:             ["script"],
  script:         ["prompt"],
  shot:           ["prompt", "video-prompt"],
  file:           ["prompt", "image-gen", "video-prompt", "video-gen", "shot", "post"],
  draw:           ["prompt", "image-gen", "video-prompt", "video-gen", "shot", "post"],
  text:           ["prompt", "video-prompt"],
  prompt:         ["prompt", "image-gen", "video-gen"],
  "image-gen":    ["prompt", "video-gen", "video-prompt", "shot", "post"],
  "video-prompt": ["video-gen"],
  "video-gen":    [],
  "post":         [],
} as const;

// The single ordered connection check: may a `sourceType` node feed a `targetType` node?
// One helper, several call sites (manual drag, drag affordance, copilot connect, focus-view +).
// Ordered on purpose — connection direction is meaningful; there is no symmetric variant.
export function canConnect(sourceType: string, targetType: string): boolean {
  return (VALID_CONNECTIONS[sourceType] ?? []).includes(targetType);
}

// A node row joined with its active version's output (canvas-load shape).
// `active` is the to-one embed of node_versions via nodes.active_version_id.
export type NodeWithActive = NodeRow & {
  active: {
    output: unknown;
    // D29: the active version's approval flag, surfaced for the on-canvas badge.
    approval_status?: "pending" | "approved" | "changes_requested";
  } | null;
};

// DB row → React Flow node (used on canvas load, server-side).
// `data.parsed` is DERIVED from the active version's output (D19): it is hydrated
// here for display only and is never read from / written to the persisted row.
export function nodeRowToFlow(row: NodeWithActive): AppNode {
  // "brief" was renamed to "script" — migrate old rows on read so they render correctly.
  const type = row.type === "brief" ? "script" : row.type;
  // Strip any stale persisted `parsed`; output is the single source of truth now.
  const own = { ...((row.data ?? {}) as Record<string, unknown>) };
  delete own.parsed;
  const output = row.active?.output;
  // D29: carry the active version's approval status (display-only, like parsed).
  const approvalStatus = row.active?.approval_status;
  const data = {
    ...own,
    ...(output != null ? { parsed: output } : {}),
    ...(approvalStatus ? { approvalStatus } : {}),
  };
  return {
    id: row.id,
    type: type as AppNode["type"],
    position: row.position,
    data: data as AppNode["data"],
    // KB nodes are canvas anchors — protect them from accidental keyboard deletion.
    ...(type === "kb" && { deletable: false }),
  } as AppNode;
}

// React Flow node → the columns we persist (used on autosave, client-side).
// `parsed` and `approvalStatus` are derived from the active version (D19/D29) — the
// focus view writes approvalStatus into the store to refresh the on-canvas badge, but
// neither is ever written back to the DB row.
export function flowToPersisted(n: AppNode) {
  const data = { ...(n.data as Record<string, unknown>) };
  delete data.parsed;
  delete data.approvalStatus;
  return {
    id: n.id,
    type: n.type as string,
    position: n.position,
    data,
  };
}
