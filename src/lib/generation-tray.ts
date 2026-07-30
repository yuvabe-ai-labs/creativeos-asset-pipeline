// Pure Generation Tray logic. Uses ONLY `import type`, so it is safe to import
// anywhere (no React Flow / Supabase runtime pulled in). Everything the tray shows
// is derived on read (D9) from the node graph + the `generations` job rows.
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { GenerationRow } from "@/lib/db/types";
import { findAncestorOfType } from "@/lib/canvas/graph";

/** Walk edges upstream from `nodeId` to the nearest `shot` node. */
export function findShotAncestor(
  nodeId: string,
  nodes: AppNode[],
  edges: Edge[],
  maxDepth = 4,
): AppNode | null {
  return findAncestorOfType(nodeId, nodes, edges, "shot", maxDepth);
}

/** Human label for a generation node: "Shot N" from its shot ancestor, else the node's title. */
export function resolveShotLabel(
  nodeId: string,
  nodes: AppNode[],
  edges: Edge[],
): string {
  const shot = findShotAncestor(nodeId, nodes, edges);
  if (shot) {
    const order = (shot.data as { order?: number }).order;
    return typeof order === "number" ? `Shot ${order}` : "Shot";
  }
  const self = nodes.find((n) => n.id === nodeId);
  const title = (self?.data as { title?: string } | undefined)?.title?.trim();
  return title ? title : "Untitled";
}

/** A running IMAGE job older than this (no completion) is derived Failed (D9). */
export const STALE_RUNNING_MS = 300_000;

export type TrayStatus = "running" | "ready" | "failed";

export type TrayItem = {
  nodeId: string;
  assetType: "image" | "video" | "prompt";
  status: TrayStatus;
  shotLabel: string;
  order: number;
  generationId: string;
  versionId: string | null;
};

const STATUS_RANK: Record<TrayStatus, number> = {
  running: 0,
  failed: 1,
  ready: 2,
};

/** Reduce all rows to the single newest row per node_id (by created_at). */
export function latestJobPerNode(jobs: GenerationRow[]): GenerationRow[] {
  const latest = new Map<string, GenerationRow>();
  for (const jobRow of jobs) {
    const cur = latest.get(jobRow.node_id);
    if (!cur || Date.parse(jobRow.created_at) > Date.parse(cur.created_at)) {
      latest.set(jobRow.node_id, jobRow);
    }
  }
  return [...latest.values()];
}

/** Shape the flat tray list: navigation-only items for image/video generation nodes. */
export function deriveTrayItems(
  nodes: AppNode[],
  edges: Edge[],
  jobs: GenerationRow[],
  nowMs: number,
): TrayItem[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const items: TrayItem[] = [];

  for (const jobRow of latestJobPerNode(jobs)) {
    const node = byId.get(jobRow.node_id);
    if (!node) continue; // node deleted → orphan row
    const assetType: TrayItem["assetType"] =
      jobRow.type === "video"
        ? "video"
        : jobRow.type === "prompt"
          ? "prompt"
          : "image";

    let status: TrayStatus =
      jobRow.status === "running"
        ? "running"
        : jobRow.status === "succeeded"
          ? "ready"
          : "failed";

    // Stale running IMAGE (client disconnected mid-request) → Failed. Video is owned
    // by the async pipeline's own reconciliation, so it is not stale-timed here.
    if (status === "running" && assetType === "image") {
      if (nowMs - Date.parse(jobRow.created_at) > STALE_RUNNING_MS)
        status = "failed";
    }

    // Ready persists until the active version is approved (retention = "until approved").
    if (status === "ready") {
      const approval = (node.data as { approvalStatus?: string })
        .approvalStatus;
      if (approval === "approved") continue;
    }

    const shot = findShotAncestor(jobRow.node_id, nodes, edges);
    const order =
      shot && typeof (shot.data as { order?: number }).order === "number"
        ? (shot.data as { order: number }).order
        : Number.POSITIVE_INFINITY;

    items.push({
      nodeId: jobRow.node_id,
      assetType,
      status,
      shotLabel: resolveShotLabel(jobRow.node_id, nodes, edges),
      order,
      generationId: jobRow.id,
      versionId: jobRow.version_id,
    });
  }

  items.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.order - b.order,
  );
  return items;
}
