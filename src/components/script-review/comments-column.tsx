// src/components/script-review/comments-column.tsx
"use client";

import { partLabel, partOrder } from "@/lib/script-review/parts";
import { useReviewSurface } from "./review-surface-context";
import { AddComment } from "./add-comment";
import { CommentThread } from "./comment-thread";
import { PartLink } from "./part-link";

/** Spec 4 §4, §6: every thread, labelled with its part in page order, then "On a removed shot". */
export function CommentsColumn() {
  const { placed, doc, mode } = useReviewSurface();
  const groups = [...placed.byPart.values()]
    .map((threads) => ({ part: threads[0].root.part, threads }))
    .sort((a, b) => partOrder(a.part, doc) - partOrder(b.part, doc));
  const total = groups.reduce((n, g) => n + g.threads.length, 0) + placed.removed.reduce((n, r) => n + r.threads.length, 0);

  return (
    <section aria-label="Comments" className="flex flex-col gap-4">
      <h2 className="text-eyebrow">Comments{total > 0 ? ` · ${total}` : ""}</h2>
      {total === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {groups.map((g) => {
        const label = partLabel(g.part, doc);
        return (
          <div key={g.threads[0].root.id} className="flex flex-col gap-2">
            {label ? <PartLink part={g.part} label={label} /> : <span className="text-sm font-medium">Not in this version</span>}
            <ul className="flex flex-col gap-2">
              {g.threads.map((t) => (
                <CommentThread key={t.root.id} thread={t} />
              ))}
            </ul>
          </div>
        );
      })}
      {placed.removed.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <span className="text-eyebrow">On a removed shot</span>
          {placed.removed.map((r) => (
            <div key={r.shotId} className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{r.label}</span>
                {r.text ? ` · ${r.text}` : ""}
              </p>
              <ul className="flex flex-col gap-2">
                {r.threads.map((t) => (
                  <CommentThread key={t.root.id} thread={t} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {mode === "client" && <AddComment />}
    </section>
  );
}
