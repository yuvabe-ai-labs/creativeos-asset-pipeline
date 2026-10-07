"use client";

import { Combine, History } from "lucide-react";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import type { CompositeUpstreamItem } from "@/lib/composite/upstream-items";
import { NodeIcon } from "./connected-inputs-card";
import { AddConnection } from "./add-connection";
import { RailItem } from "./focus-rail-item";
import { useRailDisconnect } from "./use-rail-disconnect";

type Props = {
  nodeId: string;
  upstream: CompositeUpstreamItem[];
  selected: "compose" | "history";
  onSelect: (next: "compose" | "history") => void;
  versionCount: number;
};

// D312 — the Composite focus view's left rail: compose, the wired inputs, History.
export function CompositeFocusRail({ nodeId, upstream, selected, onSelect, versionCount }: Props) {
  const editable = useCanvasEditable();
  const { removeFor } = useRailDisconnect(nodeId, () => {});
  return (
      <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
        <RailItem icon={<Combine className="size-4 text-primary" strokeWidth={1.5} />} label="Composite" active={selected === "compose"} onClick={() => onSelect("compose")} />
        <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
          <span className="text-eyebrow">Connected · {upstream.length}</span>
          <AddConnection targetId={nodeId} targetType="composite" connectedIds={upstream.map((u) => u.id)} />
        </div>
        {upstream.length === 0 ? (
          <p className="px-2.5 text-xs text-muted-foreground">Nothing wired — describe the whole picture.</p>
        ) : (
          upstream.map((u) => {
            const remove = editable ? removeFor(u.id, u.label) : null;
            return (
              <RailItem key={u.id} icon={<NodeIcon type={u.type} />} label={u.label} active={false} onClick={() => onSelect("compose")} onRemove={remove?.onClick} removeLabel={remove?.label} removeKind={remove?.kind} />
            );
          })
        )}
        <div className="mx-2.5 my-2 h-px bg-border" />
        <RailItem icon={<History className="size-4 text-primary" strokeWidth={1.5} />} label="History" active={selected === "history"} onClick={() => onSelect("history")} badge={versionCount ? <span className="text-xs text-muted-foreground">{versionCount}</span> : undefined} />
      </nav>
  );
}
