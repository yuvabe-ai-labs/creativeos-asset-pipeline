"use client";

import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanvasClientFeedback } from "@/hooks/queries/client-reviews";
import { nodeHandle } from "@/lib/nodes/describe-node";
import { cn } from "@/lib/utils";
import { useClientFeedback } from "./client-feedback-context";

function countLabel(n: number): string {
  return `${n} ${n === 1 ? "comment" : "comments"}`;
}

// D309/D310 + D500: the header's way into client feedback — the twin of the Review chip. The
// count is the TOTAL of client comments on this canvas (operator decision; there is no
// seen-state). It opens a list of versions, newest first, each with its own comment count; a
// row opens the review's focus view on that version. Older canvases with several review nodes
// (D499) list each node's versions under its name.
export function ClientFeedbackTrigger({ canvasId }: { canvasId: string }) {
  const { data } = useCanvasClientFeedback(canvasId);
  const { openFeedback } = useClientFeedback();
  const nodes = data?.nodes ?? [];
  if (nodes.length === 0) return null; // no Client review node on this canvas — no chip
  const grouped = nodes.length > 1;

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs shadow-sm" />}
      >
        <MessageSquareText className="size-3.5 text-client-text" strokeWidth={1.5} />
        Client feedback
        {data && data.total > 0 && (
          <span
            title={`${countLabel(data.total)} on this canvas`}
            className="ml-0.5 rounded-full bg-client/25 px-1.5 text-[11px] font-medium tabular-nums text-client-text"
          >
            {data.total}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[60vh] w-80 overflow-y-auto p-1">
        {nodes.map((n, i) => (
          <div key={n.nodeId} className={cn(grouped && i > 0 && "mt-1 border-t pt-1")}>
            {grouped && (
              // The node's handle, as on its card (REV-BE8D): short, and never collides.
              <p className="px-2.5 pb-1 pt-1.5 text-eyebrow text-muted-foreground">
                {nodeHandle({ id: n.nodeId, type: "client-review" })}
              </p>
            )}
            {n.versions.length === 0 ? (
              <Button
                variant="ghost"
                className="h-auto w-full justify-between gap-3 px-2.5 py-2 text-sm font-normal"
                onClick={() => openFeedback(n.nodeId, { fly: true })}
              >
                <span className="text-muted-foreground">No cut yet</span>
                <span className="text-xs font-medium text-primary">Upload first version</span>
              </Button>
            ) : (
              n.versions.map((v) => (
                <Button
                  key={v.versionNo}
                  variant="ghost"
                  className="h-auto w-full justify-start gap-2.5 px-2.5 py-2 text-sm font-normal"
                  onClick={() => openFeedback(n.nodeId, { fly: true, versionNo: v.versionNo })}
                >
                  <span className="w-7 shrink-0 text-left font-medium tabular-nums">{`v${v.versionNo}`}</span>
                  <span className="min-w-0 flex-1 truncate text-left" title={v.title || n.title || undefined}>
                    {v.title || n.title || "Untitled cut"}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      v.count > 0 ? "font-medium text-client-text" : "text-muted-foreground",
                    )}
                  >
                    {countLabel(v.count)}
                  </span>
                </Button>
              ))
            )}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
