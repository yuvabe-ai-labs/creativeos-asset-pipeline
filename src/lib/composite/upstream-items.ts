import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { Avatar } from "@/lib/avatars/schema";
import { isGeneratedImageType } from "@/lib/nodes/image-node-types";
import { avatarSheetId } from "@/lib/video-gen/select-references";
import { compositeContextOf, contextMentionables, type CompositeContext } from "./context";

// D312 — the browser's view of what is wired into a composite: the focus view's rail (one row per
// wired node) and what `@` offers. Nothing is mandatory, but everything wired must be mentionable
// — the editor's default menu offers only file/draw/generated images, so an avatar would be wired
// but never offered. An avatar is offered as D308 offers it in a shot: its front under the node's
// id, its fresh sheet under avatarSheetId — the same ids the server's roster numbers.

export type CompositeUpstreamItem = {
  id: string;
  type: string;
  label: string;
  fileUrl?: string;
  fileKind?: string;
  /** An avatar's profile sheet, when it has one that is not out of date. */
  sheetUrl?: string;
  /** D320 — a wired Script, Shot or Multishot: its shots, read as context. */
  context?: CompositeContext;
};

const TYPE_LABEL: Record<string, string> = {
  avatar: "Avatar",
  file: "File",
  draw: "Sketch",
  "image-gen": "Image",
  composite: "Composite",
  script: "Script",
  shot: "Shot",
  multishot: "Multishot",
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function itemOf(n: AppNode, avatars: Avatar[]): CompositeUpstreamItem {
  const d = n.data as Record<string, unknown>;
  const type = n.type ?? "";
  const fallback = TYPE_LABEL[type] ?? type;
  if (type === "avatar") {
    const avatar = avatars.find((a) => a.id === d.avatarId);
    const sheetUrl = avatar?.sheet && !avatar.sheetStale ? avatar.sheet.url : undefined;
    return { id: n.id, type, label: avatar?.name ?? fallback, fileUrl: avatar?.front?.url, fileKind: "image", sheetUrl };
  }
  if (isGeneratedImageType(type)) {
    return { id: n.id, type, label: str(d.title) ?? fallback, fileUrl: str(d.parsed), fileKind: "image" };
  }
  // A Script's parse is display-hydrated onto `data.parsed` (D19), the server's activeOutput.
  const context = compositeContextOf(n.id, type, d, d.parsed);
  if (context) return { id: n.id, type, label: context.title, context };
  return {
    id: n.id,
    type,
    label: str(d.title) ?? str(d.filename) ?? fallback,
    fileUrl: str(d.fileUrl),
    fileKind: type === "draw" ? "image" : str(d.fileKind),
  };
}

/** Every node wired into `nodeId`, in edge order. */
export function compositeUpstreamItems(
  nodeId: string,
  nodes: AppNode[],
  edges: Edge[],
  avatars: Avatar[],
): CompositeUpstreamItem[] {
  return edges
    .filter((e) => e.target === nodeId)
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n): n is AppNode => Boolean(n))
    .map((n) => itemOf(n, avatars));
}

/** The wired inputs as `@` sees them: only those that carry an image (the server's roster sends
 *  nothing else — a PDF or an ungenerated still offered here would come back as "no longer
 *  connected"), and each avatar's fresh sheet after its front as its own entry. */
export function compositeMentionUpstream(items: CompositeUpstreamItem[]): CompositeUpstreamItem[] {
  return items
    .filter((i) => Boolean(i.fileUrl) && i.fileKind === "image")
    .flatMap((i) =>
      i.type === "avatar" && i.sheetUrl
        ? [i, { id: avatarSheetId(i.id), type: "avatar", label: `${i.label} sheet`, fileUrl: i.sheetUrl, fileKind: "image" }]
        : [i],
    );
}

/** A wired input as the shared read-only preview panel shows it (ConnectedDetailView): its image,
 *  or — for a script or shot — the shots and notes the composite actually reads (D320). */
export function compositePreviewOf(item: CompositeUpstreamItem) {
  const text = item.context
    ? [
        ...item.context.shots.map((s) => `${s.label}${typeof s.seconds === "number" ? ` (${s.seconds}s)` : ""}: ${s.text}`),
        ...(item.context.notes ? ["", `Production notes: ${item.context.notes}`] : []),
      ].join("\n")
    : "";
  return { nodeId: item.id, label: item.label, type: item.type, text, fileUrl: item.fileUrl, fileKind: item.fileKind };
}

/** What `@` offers: every image entry, labelled "Type: Name" as the Instruction stores it, then
 *  (D320) each wired script or shot and its shots — pass the full `items` as `all` for those. */
export function compositeMentionables(items: CompositeUpstreamItem[], all: CompositeUpstreamItem[] = []) {
  const images = items.map((i) => ({
    id: i.id,
    label: `${TYPE_LABEL[i.type] ?? i.type}: ${i.label}`,
    type: i.type,
    fileUrl: i.fileUrl,
    fileKind: i.fileKind,
  }));
  const contexts = all.flatMap((i) => (i.context ? [i.context] : []));
  return [...images, ...contextMentionables(contexts)];
}
