"use client";

import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanvasClientFeedback } from "@/hooks/queries/client-reviews";
import { useClientFeedback } from "./client-feedback-context";

// D309/D310: the header's way into client feedback — the twin of the Review chip. The count is
// the TOTAL of client comments on this canvas (operator decision; there is no seen-state). One
// review node: the chip opens its drawer. Several: a short list, each row flying to its node.
export function ClientFeedbackTrigger({ canvasId }: { canvasId: string }) {
  const { data } = useCanvasClientFeedback(canvasId);
  const { openFeedback } = useClientFeedback();
  const nodes = data?.nodes ?? [];
  if (nodes.length === 0) return null; // no Client review node on this canvas — no chip

  const chip = (
    <>
      <MessageSquareText className="size-3.5 text-client-text" strokeWidth={1.5} />
      Client feedback
      {data && data.total > 0 && (
        <span
          title={`${data.total} client ${data.total === 1 ? "comment" : "comments"} on this canvas`}
          className="ml-0.5 rounded-full bg-client/25 px-1.5 text-[11px] font-medium tabular-nums text-client-text"
        >
          {data.total}
        </span>
      )}
    </>
  );
  const chipClass = "h-8 gap-1.5 rounded-full px-3 text-xs shadow-sm";

  if (nodes.length === 1) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={chipClass}
        onClick={() => openFeedback(nodes[0].nodeId, { fly: true })}
      >
        {chip}
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className={chipClass} />}>
        {chip}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        {nodes.map((n) => (
          <Button
            key={n.nodeId}
            variant="ghost"
            className="h-auto w-full justify-between gap-3 px-2.5 py-2 text-sm font-normal"
            onClick={() => openFeedback(n.nodeId, { fly: true })}
          >
            <span className="truncate">{n.title || "Untitled cut"}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {n.count} {n.count === 1 ? "comment" : "comments"}
            </span>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
