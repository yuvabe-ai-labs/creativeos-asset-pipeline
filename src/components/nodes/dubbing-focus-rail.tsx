"use client";

import { History, Languages } from "lucide-react";
import { NodeIcon } from "./connected-inputs-card";
import { RailItem } from "./focus-rail-item";

/** "dubbing", "history", or the connected video's node id. */
export type DubbingRailSelection = string;

// D374 — Dubbing · Connected (the one video, no add) · History.
export function DubbingFocusRail({ source, selected, onSelect, versionCount }: {
  source: { id: string; label: string } | null;
  selected: DubbingRailSelection;
  onSelect: (s: DubbingRailSelection) => void;
  versionCount: number;
}) {
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
      <RailItem icon={<Languages className="size-4 text-primary" strokeWidth={1.5} />} label="Dubbing" active={selected === "dubbing"} onClick={() => onSelect("dubbing")} />
      <div className="px-2.5 pb-1 pt-3"><span className="text-eyebrow">Connected</span></div>
      {source ? (
        <RailItem icon={<NodeIcon type="video-gen" />} label={source.label} active={selected === source.id} onClick={() => onSelect(source.id)} />
      ) : (
        <p className="px-2.5 text-xs text-muted-foreground">Wire a Video Gen node into this one.</p>
      )}
      <div className="mx-2.5 my-2 h-px bg-border" />
      <RailItem icon={<History className="size-4 text-primary" strokeWidth={1.5} />} label="History" active={selected === "history"} onClick={() => onSelect("history")} badge={versionCount ? <span className="text-xs text-muted-foreground">{versionCount}</span> : undefined} />
    </nav>
  );
}
