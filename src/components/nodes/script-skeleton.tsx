"use client";

// Loading placeholder shaped like the parsed document — shown while a parse is
// in flight. Neutral shimmer, no spinner.
export function ScriptSkeleton() {
  return (
    <div
      className="mx-auto grid max-w-2xl gap-6 px-6 py-10"
      aria-busy="true"
      aria-label="Extracting script"
    >
      <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid gap-2">
          <div className="h-3 w-28 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
