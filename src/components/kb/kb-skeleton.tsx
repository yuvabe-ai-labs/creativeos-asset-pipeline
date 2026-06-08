"use client";

// Loading placeholder shaped like the KB review screen — a faux tab strip, the
// module header, and editorial gutter sections (160px label column + content)
// matching KBFieldRow. Mirrors ScriptSkeleton: the shimmer collapses into the
// real content with no layout shift once the extraction lands.

const bar = "animate-pulse rounded bg-muted";

// One section row matching KBFieldRow's gutter: purple kicker + label/confidence
// in the left column, value bars on the right.
function SkeletonSection({ lines = 1 }: { lines?: number }) {
  return (
    <section className="grid gap-x-10 gap-y-2.5 sm:grid-cols-[160px_1fr]">
      <div className="self-start">
        <div className="mb-2 h-0.5 w-6 rounded-full bg-primary/40" aria-hidden />
        <div className={`h-3 w-20 ${bar} bg-muted/70`} />
        <div className={`mt-1.5 h-4 w-10 rounded-full ${bar} bg-muted/70`} />
      </div>
      <div className="grid gap-2">
        <div className={`h-4 w-full ${bar}`} />
        {lines > 1 && <div className={`h-4 w-4/5 ${bar}`} />}
      </div>
    </section>
  );
}

export function KBSkeleton({ showTabs = true }: { showTabs?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Analyzing brand sources">
      {showTabs && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`h-4 ${i === 3 ? "w-32" : "w-24"} ${bar} bg-muted/70`} />
          ))}
        </div>
      )}

      {/* Module header — title + reviewed count */}
      <div className="flex items-center justify-between pt-5">
        <div className={`h-6 w-44 ${bar}`} />
        <div className={`h-4 w-24 ${bar} bg-muted/70`} />
      </div>

      {/* Gutter sections */}
      <div className="grid gap-10 pt-6">
        <SkeletonSection lines={2} />
        <SkeletonSection />
        <SkeletonSection lines={2} />
        <SkeletonSection />
        <SkeletonSection lines={2} />
        <SkeletonSection />
      </div>
    </div>
  );
}
