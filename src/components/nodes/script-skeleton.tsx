"use client";

// Body-only loading placeholder shaped like the parsed document. The focus view
// renders the real title/subtitle above this, so it stays a neutral shimmer.
export function ScriptSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Extracting script">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid gap-2">
          <div className="h-3 w-28 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
