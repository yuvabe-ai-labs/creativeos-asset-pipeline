"use client";

import { History, Languages } from "lucide-react";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { NodeIcon } from "./connected-inputs-card";
import { AddConnection } from "./add-connection";
import { RailItem } from "./focus-rail-item";
import { useRailDisconnect } from "./use-rail-disconnect";

/** "dubbing", "history", or the connected video's node id. */
export type DubbingRailSelection = string;

// D374 — Dubbing · Connected (one Video Gen at most: Add hides once it's wired) · History.
export function DubbingFocusRail({ nodeId, source, selected, onSelect, versionCount }: {
  nodeId: string;
  source: { id: string; label: string } | null;
  selected: DubbingRailSelection;
  onSelect: (s: DubbingRailSelection) => void;
  versionCount: number;
}) {
  const editable = useCanvasEditable();
  const { removeFor } = useRailDisconnect(nodeId, (removedId) => {
    if (selected === removedId) onSelect("dubbing");
  });
  const remove = source && editable ? removeFor(source.id, source.label) : null;
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
      <RailItem icon={<Languages className="size-4 text-primary" strokeWidth={1.5} />} label="Dubbing" active={selected === "dubbing"} onClick={() => onSelect("dubbing")} />
      <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
        <span className="text-eyebrow">Connected · {source ? 1 : 0}</span>
        {editable && <AddConnection targetId={nodeId} targetType="dubbing" connectedIds={source ? [source.id] : []} />}
      </div>
      {source ? (
        <RailItem icon={<NodeIcon type="video-gen" />} label={source.label} active={selected === source.id} onClick={() => onSelect(source.id)} onRemove={remove?.onClick} removeLabel={remove?.label} removeKind={remove?.kind} />
      ) : (
        <p className="px-2.5 text-xs text-muted-foreground">Add the video to dub.</p>
      )}
      <div className="mx-2.5 my-2 h-px bg-border" />
      <RailItem icon={<History className="size-4 text-primary" strokeWidth={1.5} />} label="History" active={selected === "history"} onClick={() => onSelect("history")} badge={versionCount ? <span className="text-xs text-muted-foreground">{versionCount}</span> : undefined} />
    </nav>
  );
}
