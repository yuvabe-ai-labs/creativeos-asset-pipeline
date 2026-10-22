// The Editor's sources: the Video Gen and Dubbing nodes connected to it, at their current
// version (spec §4). Drafts name the files each source offers; attachFacts adds what the server
// measured in them (D392).
import type { Edge } from "@xyflow/react";
import { readDubbingOutput } from "@/lib/dubbing/types";
import { describeNode, nodeHandle } from "@/lib/nodes/describe-node";
import { shotOrderOf, type EditorGraphNode } from "./shot-order";
import type { EditorNotice, MediaFacts, SourceView } from "./types";

export type IncomingEdge = { id: string; sourceNodeId: string; createdAt: string };

export type SourceDraft = Omit<SourceView, "files"> & {
  urls: { original: string; lipSynced: string | null; dubAudio: string | null };
};

type DraftArgs = {
  incoming: IncomingEdge[];
  nodes: EditorGraphNode[];
  edges: Edge[];
  activeVersionOf: (nodeId: string) => string | null;
};

export function sourceDrafts({ incoming, nodes, edges, activeVersionOf }: DraftArgs): { drafts: SourceDraft[]; notices: EditorNotice[] } {
  const drafts: SourceDraft[] = [];
  const notices: EditorNotice[] = [];
  const byTime = [...incoming].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const e of byTime) {
    const node = nodes.find((n) => n.id === e.sourceNodeId);
    if (!node || (node.type !== "video-gen" && node.type !== "dubbing")) continue;
    const handle = nodeHandle({ id: node.id, type: node.type });
    const versionId = activeVersionOf(node.id);
    const urls = versionId ? takeUrls(node) : null;
    if (!versionId || !urls) {
      notices.push({ kind: "no-take", sourceNodeId: node.id, message: `${handle} has no finished take yet, so it isn't on the timeline.` });
      continue;
    }
    const shot = shotOrderOf(node.id, nodes, edges);
    drafts.push({
      nodeId: node.id,
      edgeId: e.id,
      kind: node.type,
      handle,
      title: describeNode(node),
      versionId,
      shotOrder: shot.order,
      shotLabel: shot.label,
      language: node.type === "dubbing" ? (readDubbingOutput(node.data.parsed)?.language ?? null) : null,
      urls,
    });
  }
  return { drafts, notices };
}

function takeUrls(node: EditorGraphNode): SourceDraft["urls"] | null {
  if (node.type === "video-gen") {
    return typeof node.data.parsed === "string" ? { original: node.data.parsed, lipSynced: null, dubAudio: null } : null;
  }
  const dub = readDubbingOutput(node.data.parsed);
  return dub ? { original: dub.original, lipSynced: dub.lipSynced, dubAudio: dub.dubbedAudio } : null;
}

export function attachFacts(drafts: SourceDraft[], facts: Map<string, MediaFacts | null>): SourceView[] {
  const fileOf = (url: string | null) => (url === null ? null : { url, facts: facts.get(url) ?? null });
  return drafts.map(({ urls, ...rest }) => ({
    ...rest,
    files: { original: fileOf(urls.original)!, lipSynced: fileOf(urls.lipSynced), dubAudio: fileOf(urls.dubAudio) },
  }));
}
