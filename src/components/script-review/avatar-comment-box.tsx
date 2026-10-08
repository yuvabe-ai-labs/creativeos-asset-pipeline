// src/components/script-review/avatar-comment-box.tsx
"use client";

import { partKey } from "@/lib/script-review/parts";
import type { Part } from "@/lib/script-review/types";
import { PartComposer } from "./part-composer";
import { useReviewSurface } from "./review-surface-context";

/** D359: one box on the cast card for a comment on the whole avatar, in place of a comment per view.
 *  It posts on the cast member, so the thread is theirs in the Comments column. Shown only while the
 *  client can comment; never focused on load. */
export function AvatarCommentBox({ castId, name }: { castId: string; name: string }) {
  const { commentable, onPost } = useReviewSurface();
  const part: Part = { kind: "cast", castId };
  if (!onPost || !commentable.has(partKey(part))) return null;
  return (
    <PartComposer
      placeholder={`Comment on ${name}'s avatar`}
      submitLabel="Post"
      autoFocus={false}
      onSubmit={(body) => onPost(part, body)}
    />
  );
}
