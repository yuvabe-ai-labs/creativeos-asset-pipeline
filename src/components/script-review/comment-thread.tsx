// src/components/script-review/comment-thread.tsx
"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/avatars/utils";
import type { Thread } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";
import { PartComposer } from "./part-composer";
import { ThreadComment } from "./thread-comment";

/** A client's comment, the team's replies under it, and the Resolved mark (spec 4 §5). */
export function CommentThread({ thread }: { thread: Thread }) {
  const { onReply, onResolve } = useReviewSurface();
  const [replying, setReplying] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleResolved() {
    if (!onResolve || busy) return;
    setBusy(true);
    try {
      await onResolve(thread.root.id, !thread.resolved);
    } catch (e) {
      toast.error(errorMessage(e, "Could not update the thread."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={cn("flex flex-col gap-3 rounded-lg border border-border bg-card p-3", thread.resolved && "bg-muted/40")}>
      <ThreadComment comment={thread.root} />
      {thread.replies.length > 0 && (
        <ul className="flex flex-col gap-3 border-l-2 border-border pl-3">
          {thread.replies.map((r) => (
            <li key={r.id}>
              <ThreadComment comment={r} />
            </li>
          ))}
        </ul>
      )}
      {(thread.resolved || onReply || onResolve) && (
        <div className="flex flex-wrap items-center gap-2">
          {thread.resolved && (
            <Badge variant="outline">
              <Check strokeWidth={1.5} />
              Resolved{thread.root.resolvedByName ? ` by ${thread.root.resolvedByName}` : ""}
            </Badge>
          )}
          {onReply && !replying && (
            <Button variant="ghost" size="xs" onClick={() => setReplying(true)}>
              Reply
            </Button>
          )}
          {onResolve && (
            <Button variant="ghost" size="xs" onClick={toggleResolved} disabled={busy}>
              {thread.resolved ? "Reopen thread" : "Resolve"}
            </Button>
          )}
        </div>
      )}
      {replying && onReply && (
        <PartComposer
          placeholder="Reply to the client"
          submitLabel="Reply"
          onSubmit={async (body) => {
            await onReply(thread.root.id, body);
            setReplying(false);
          }}
          onCancel={() => setReplying(false)}
        />
      )}
    </li>
  );
}
