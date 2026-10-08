// src/components/script-review/part-comments.tsx
"use client";

import { useState } from "react";
import { MessageSquarePlus, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { partKey } from "@/lib/script-review/parts";
import type { Part } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";
import { CommentThread } from "./comment-thread";
import { PartComposer } from "./part-composer";

/** Spec 4 §4–§6: one part's comment action, its marker (the count), and its threads beside it.
 *  The marker is D310's client-feedback amber, and `data-part-commented` lets the part's own card
 *  pick up a faint amber edge (design canvas, 8 Oct). `compact` is for an avatar view: its caption
 *  and an icon-only action on one row, so four views never show four full buttons.
 *  Renders nothing (or only the compact caption) for a part with no threads that cannot take a
 *  comment now. */
export function PartComments({
  part,
  label,
  compact,
}: {
  part: Part;
  label?: string;
  compact?: { caption: string; actionLabel: string };
}) {
  const { placed, commentable, onPost } = useReviewSurface();
  const [writing, setWriting] = useState(false);
  const key = partKey(part);
  const threads = placed.byPart.get(key) ?? [];
  const canComment = Boolean(onPost) && commentable.has(key);
  const caption = compact ? <span className="text-xs text-muted-foreground">{compact.caption}</span> : null;
  if (threads.length === 0 && !canComment) return caption;

  return (
    <div className="flex flex-col gap-2" data-part-commented={threads.length > 0 ? "" : undefined}>
      <div className="flex items-center gap-2">
        {caption}
        {label && <span className="text-eyebrow">{label}</span>}
        {threads.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-client/15 px-2 py-0.5 text-xs font-medium tabular-nums text-client-text">
            <MessageSquareText className="size-3" strokeWidth={1.5} aria-hidden />
            {compact ? threads.length : `${threads.length} ${threads.length === 1 ? "comment" : "comments"}`}
          </span>
        )}
        {canComment && !writing && compact && (
          <Button
            variant="outline"
            size="icon-xs"
            className="ml-auto text-muted-foreground"
            aria-label={compact.actionLabel}
            onClick={() => setWriting(true)}
          >
            <MessageSquarePlus strokeWidth={1.5} />
          </Button>
        )}
        {canComment && !writing && !compact && (
          <Button
            variant="outline"
            size="xs"
            className="ml-auto border-dashed border-primary/40 text-primary hover:bg-primary/5"
            onClick={() => setWriting(true)}
          >
            <MessageSquarePlus strokeWidth={1.5} />
            Comment
          </Button>
        )}
      </div>
      {threads.length > 0 && (
        <ul className="flex flex-col gap-2">
          {threads.map((t) => (
            <CommentThread key={t.root.id} thread={t} />
          ))}
        </ul>
      )}
      {writing && onPost && (
        <PartComposer
          placeholder="Your comment"
          submitLabel="Post"
          onSubmit={async (body) => {
            await onPost(part, body);
            setWriting(false);
          }}
          onCancel={() => setWriting(false)}
        />
      )}
    </div>
  );
}
