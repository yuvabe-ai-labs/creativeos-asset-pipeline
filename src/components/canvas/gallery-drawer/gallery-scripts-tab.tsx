"use client";

import Link from "next/link";
import type { XYPosition } from "@xyflow/react";
import { ArrowUpRight, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientSlug } from "@/components/canvas/client-id-context";
import { useApprovedScripts } from "@/hooks/queries/scripts";
import { useAddScriptNode } from "@/hooks/use-add-script-node";
import { SCRIPT_DRAG_MIME } from "@/lib/scripts/constants";
import { reelLabel, shotSummary } from "@/lib/scripts/utils";

type Props = {
  clientId: string;
  /** Where a tile's add button places the node. */
  defaultPosition: () => XYPosition;
};

// Spec 1 §5.1 — the client's APPROVED scripts. Drag one onto the canvas, or use its button.
export function GalleryScriptsTab({ clientId, defaultPosition }: Props) {
  const clientSlug = useClientSlug();
  const scripts = useApprovedScripts(clientId);
  const addScriptNode = useAddScriptNode();
  const libraryHref = `/clients/${clientSlug}/scripts`;

  if (scripts.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (scripts.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">Could not load the scripts.</p>
        <Button variant="outline" size="sm" onClick={() => void scripts.refetch()}>Try again</Button>
      </div>
    );
  }

  const list = scripts.data ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <FileText className="size-10 text-muted-foreground/40" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">No approved scripts yet. A script appears here once the client approves it.</p>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={libraryHref} target="_blank" rel="noopener" />}>
          Open Scripts
          <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Drag an approved script onto the canvas. It parses into shots, with its lead&apos;s avatar attached.</p>
      <ul className="flex flex-col gap-2">
        {list.map((s) => {
          const { header } = s.doc;
          const label = reelLabel(header.reelNumber);
          return (
            <li
              key={s.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(SCRIPT_DRAG_MIME, JSON.stringify({ scriptId: s.id }));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="flex cursor-grab items-center gap-3 rounded-lg border bg-card p-3 active:cursor-grabbing"
            >
              <FileText className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{label ? `${label} · ` : ""}{header.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.approvedAt ? `Approved ${new Date(s.approvedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ` : ""}
                  {shotSummary(s.doc)}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={`Add ${header.title} to the canvas`}
                title="Add to canvas"
                onClick={() => void addScriptNode(s.id, defaultPosition())}
              >
                <Plus className="size-3.5" strokeWidth={1.5} />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
