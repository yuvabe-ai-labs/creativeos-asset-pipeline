"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCutTimecode } from "@/lib/client-review/utils";
import { COMMENT_BODY_MAX } from "@/lib/client-review/constants";
import type { ReviewComment } from "@/lib/client-review/wire";

export function CommentItem({
  comment,
  onSeek,
  onEdit,
}: {
  comment: ReviewComment;
  onSeek: (ms: number) => void;
  onEdit?: (id: string, body: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!onEdit || !draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onEdit(comment.id, draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the edit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-sm">
        <Button
          variant="link"
          onClick={() => onSeek(comment.timecodeMs)}
          className="h-auto p-0 font-medium tabular-nums"
        >
          {formatCutTimecode(comment.timecodeMs)}
        </Button>
        <span className="font-medium">{comment.authorName}</span>
        {onEdit && !editing && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => { setDraft(comment.body); setEditing(true); }}
            className="ml-auto text-muted-foreground"
          >
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={COMMENT_BODY_MAX}
            autoFocus
            className="min-h-20 text-base md:text-base"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !draft.trim()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
      )}
      {comment.editedByName && !editing && (
        <p className="text-xs text-muted-foreground">edited by {comment.editedByName}</p>
      )}
    </li>
  );
}
