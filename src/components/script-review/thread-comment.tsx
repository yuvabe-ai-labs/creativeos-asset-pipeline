// src/components/script-review/thread-comment.tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDayTime } from "@/lib/script-review/utils";
import type { ScriptComment } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";
import { PartComposer } from "./part-composer";

/** One comment or reply. From the link, only client comments are editable; never deleted (D352). */
export function ThreadComment({ comment }: { comment: ScriptComment }) {
  const { mode, onEdit } = useReviewSurface();
  const [editing, setEditing] = useState(false);
  const canEdit = mode === "client" && comment.authorKind === "client" && Boolean(onEdit);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{comment.authorName}</span>
        {comment.authorKind === "team" && <Badge variant="secondary">Team</Badge>}
        <span className="text-xs text-muted-foreground">{formatDayTime(comment.createdAt)}</span>
        {canEdit && !editing && (
          <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      {editing && onEdit ? (
        <PartComposer
          initial={comment.body}
          placeholder="Your comment"
          submitLabel="Save"
          onSubmit={async (body) => {
            await onEdit(comment.id, body);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
      )}
      {comment.editedByName && !editing && <p className="text-xs text-muted-foreground">edited by {comment.editedByName}</p>}
    </div>
  );
}
