"use client";

import { useMemo, useState } from "react";
import { MapPin, Package } from "lucide-react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { shotAssetEntries, type ShotAssetEntry } from "@/lib/scripts/asset-canvas";
import { RailItem } from "./focus-rail-item";
import { useRailDisconnect } from "./use-rail-disconnect";

/**
 * D450 — "From the shot": the script's products and locations wired into this clip's Shot or
 * Multishot. They are not wired to this node, so they are not in its Connected list, but they ARE
 * among its pictures (the writer reads them, the video is sent them). Click to see the picture;
 * ✕ unwires it from the clip's shot, the wire that brings it here.
 */
export function ShotAssetsRail({ nodeId, editable }: { nodeId: string; editable: boolean }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const entries = useMemo(() => shotAssetEntries(nodeId, nodes, edges), [nodeId, nodes, edges]);
  const { removeFor } = useRailDisconnect(nodeId);
  const [zoom, setZoom] = useState<ShotAssetEntry | null>(null);
  if (entries.length === 0) return null;

  return (
    <>
      <div className="px-2.5 pb-1 pt-3">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground/70">
          From the shot · {entries.length}
        </span>
      </div>
      {entries.map((e) => {
        const remove = editable ? removeFor(e.nodeId, e.name) : null;
        const Icon = e.kind === "product" ? Package : MapPin;
        return (
          <RailItem
            key={e.nodeId}
            icon={<Icon className="size-4 text-primary" strokeWidth={1.5} />}
            label={e.pictures > 1 ? `${e.name} · ${e.pictures}` : e.name}
            active={false}
            onClick={() => e.url && setZoom(e)}
            onRemove={remove?.onClick}
            removeLabel={remove?.label}
            removeKind={remove?.kind}
          />
        );
      })}
      {zoom?.url && <FullScreenImageZoom imageUrl={zoom.url} title={zoom.name} onClose={() => setZoom(null)} />}
    </>
  );
}
