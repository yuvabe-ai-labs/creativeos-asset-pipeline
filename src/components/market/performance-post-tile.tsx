"use client";

import { Heart, MessageCircle, Play } from "lucide-react";
import type { TrackedPostRow } from "@/lib/db/performance";
import { postMultiplier } from "@/lib/market/performance";

const TYPE_LABEL: Record<TrackedPostRow["post_type"], string> = {
  image: "Image",
  video: "Reel",
  carousel: "Carousel",
};

function MultiplierPill({ likes, medianLikes }: { likes: number | null; medianLikes: number | null }) {
  if (likes === null) {
    return (
      <span className="rounded-full border border-dashed border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        likes hidden
      </span>
    );
  }
  const m = postMultiplier(likes, medianLikes);
  if (m === null) return null;
  if (m < 1) {
    return (
      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        below median
      </span>
    );
  }
  if (m < 2) return null; // near-median posts stay unmarked — the grid must not shout
  return (
    <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
      {Number.isInteger(m) ? m : m.toFixed(1)}× median
    </span>
  );
}

export function PerformancePostTile({
  post,
  medianLikes,
}: {
  post: TrackedPostRow;
  medianLikes: number | null;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5">
      <a
        href={post.post_url}
        target="_blank"
        rel="noreferrer"
        className="relative block aspect-[4/3] bg-muted"
      >
        {post.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <Play strokeWidth={1.5} className="size-6" />
          </span>
        )}
        <span className="absolute right-2 top-2 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
          {TYPE_LABEL[post.post_type]}
        </span>
      </a>
      <div className="space-y-1 p-3">
        <div className="flex flex-wrap items-center gap-2.5 text-sm tabular-nums">
          <span className="inline-flex items-center gap-1 text-foreground/80">
            <Heart strokeWidth={1.5} className="size-3.5 text-muted-foreground" />
            {post.likes_count ?? "—"}
          </span>
          <span className="inline-flex items-center gap-1 text-foreground/80">
            <MessageCircle strokeWidth={1.5} className="size-3.5 text-muted-foreground" />
            {post.comments_count}
          </span>
          {post.video_view_count !== null && (
            <span className="inline-flex items-center gap-1 text-foreground/80">
              <Play strokeWidth={1.5} className="size-3.5 text-muted-foreground" />
              {post.video_view_count}
            </span>
          )}
          <MultiplierPill likes={post.likes_count} medianLikes={medianLikes} />
        </div>
        {post.caption && <p className="truncate text-xs text-muted-foreground">{post.caption}</p>}
        <p className="text-[11px] text-muted-foreground/70">
          {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
            new Date(post.posted_at),
          )}
        </p>
      </div>
    </article>
  );
}
