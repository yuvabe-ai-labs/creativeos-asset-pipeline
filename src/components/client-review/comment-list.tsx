"use client";

import type { ReviewComment } from "@/lib/client-review/wire";
import { CommentItem } from "./comment-item";

// Shared by the public page (editable) and the canvas focus view (read-only).
export function CommentList({
  comments,
  onSeek,
  onEdit,
}: {
  comments: ReviewComment[];
  onSeek: (ms: number) => void;
  onEdit?: (id: string, body: string) => Promise<void>;
}) {
  if (comments.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">No comments yet.</p>;
  }
  return (
    <ul className="flex flex-col">
      {comments.map((c) => (
        <CommentItem key={c.id} comment={c} onSeek={onSeek} onEdit={onEdit} />
      ))}
    </ul>
  );
}
