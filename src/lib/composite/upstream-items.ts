import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { Avatar } from "@/lib/avatars/schema";
import { isGeneratedImageType } from "@/lib/nodes/image-node-types";
import { avatarSheetId } from "@/lib/video-gen/select-references";

// D309 — the browser's view of what is wired into a composite: the focus view's rail (one row per
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
};

const TYPE_LABEL: Record<string, string> = {
  avatar: "Avatar",
  file: "File",
  draw: "Sketch",
  "image-gen": "Image",
  composite: "Composite",
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

/** The wired inputs as `@` sees them: each avatar's fresh sheet follows its front as its own entry. */
export function compositeMentionUpstream(items: CompositeUpstreamItem[]): CompositeUpstreamItem[] {
  return items.flatMap((i) =>
    i.type === "avatar" && i.sheetUrl
      ? [i, { id: avatarSheetId(i.id), type: "avatar", label: `${i.label} sheet`, fileUrl: i.sheetUrl, fileKind: "image" }]
      : [i],
  );
}

/** What `@` offers: every entry, labelled "Type: Name" as the Instruction stores it. */
export function compositeMentionables(items: CompositeUpstreamItem[]) {
  return items.map((i) => ({
    id: i.id,
    label: `${TYPE_LABEL[i.type] ?? i.type}: ${i.label}`,
    type: i.type,
    fileUrl: i.fileUrl,
    fileKind: i.fileKind,
  }));
}
