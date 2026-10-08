// src/components/script-review/comments-column.tsx
"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { columnGroups, threadCount } from "@/lib/script-review/column";
import { partKey } from "@/lib/script-review/parts";
import { useReviewSurface } from "./review-surface-context";
import { AddComment } from "./add-comment";
import { CommentThread } from "./comment-thread";
import { PartComposer } from "./part-composer";
import { PartLink } from "./part-link";

/** Spec 4 §4, §6 (review board): every thread, grouped by part in page order, then "On a removed
 *  shot". A part's marker opens its group here — scrolled to and ringed, and for a new comment
 *  with the composer open in place. */
export function CommentsColumn() {
  const { placed, doc, mode, focus, commentable, onPost, clearFocus } = useReviewSurface();
  const root = useRef<HTMLElement>(null);
  const groups = columnGroups(placed, doc, focus?.part ?? null);
  const focusKey = focus ? partKey(focus.part) : null;
  const total = threadCount(placed);

  useEffect(() => {
    if (!focusKey) return;
    root.current
      ?.querySelector(`[data-column-part="${CSS.escape(focusKey)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusKey, focus?.nonce]);

  return (
    <section ref={root} aria-label="Comments" className="flex flex-col gap-4">
      <h2 className="text-eyebrow">Comments{total > 0 ? ` · ${total}` : ""}</h2>
      {groups.length === 0 && placed.removed.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {groups.map((g) => {
        const focused = g.key === focusKey;
        const composing = focused && Boolean(focus?.compose) && Boolean(onPost) && commentable.has(g.key);
        return (
          <div
            key={g.key}
            data-column-part={g.key}
            className={cn(
              "flex flex-col gap-2 rounded-lg transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              focused && "bg-client/5 p-2 ring-1 ring-client/30",
            )}
          >
            {g.label ? (
              <PartLink part={g.part} label={g.label} />
            ) : (
              <span className="text-sm font-medium">{mode === "team" ? "No longer in the script" : "Not in this version"}</span>
            )}
            {g.threads.length > 0 && (
              <ul className="flex flex-col gap-2">
                {g.threads.map((t) => (
                  <CommentThread key={t.root.id} thread={t} />
                ))}
              </ul>
            )}
            {composing && onPost && (
              <PartComposer
                placeholder={`Comment on ${g.label ?? "this part"}`}
                submitLabel="Post"
                onSubmit={async (body) => {
                  await onPost(g.part, body);
                  clearFocus();
                }}
                onCancel={clearFocus}
              />
            )}
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
