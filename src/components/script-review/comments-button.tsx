// src/components/script-review/comments-button.tsx
"use client";

import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReviewSurface } from "./review-surface-context";

/** Below `xl`, the way into the Comments column (review board, 4.16). */
export function CommentsButton({ count }: { count: number }) {
  const { setColumnOpen } = useReviewSurface();
  return (
    <Button variant="outline" size="sm" className="xl:hidden" onClick={() => setColumnOpen(true)}>
      <MessageSquareText strokeWidth={1.5} />
      Comments{count > 0 ? ` · ${count}` : ""}
    </Button>
  );
}
