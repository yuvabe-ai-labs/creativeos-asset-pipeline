"use client";

import type { SignalWithItems } from "@/lib/db/signals";

const MAX_THUMBS = 5;

export function SignalCard({ signal, onOpen }: { signal: SignalWithItems; onOpen: () => void }) {
  const shown = signal.items.slice(0, MAX_THUMBS);
  const overflow = signal.items.length - shown.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5"
    >
      <div className="flex flex-col gap-1.5">
        <h3 className="font-medium text-foreground">{signal.name}</h3>
        {signal.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {signal.tags.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
        {signal.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{signal.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {shown.map((it) => {
          const visual =
            it.thumbnail_url ?? (it.kind === "image" || it.kind === "gif" ? it.image_url : null);
          return visual ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={it.id} src={visual} alt="" className="size-14 rounded-md object-cover" />
          ) : (
            <span
              key={it.id}
              className="flex size-14 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground"
            >
              link
            </span>
          );
        })}
        {overflow > 0 && (
          <span className="flex size-14 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
            +{overflow}
          </span>
        )}
        {signal.items.length === 0 && (
          <span className="text-xs text-muted-foreground">No references linked</span>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        {new Date(signal.created_at).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </p>
    </div>
  );
}
