"use client";

import type { ReactNode } from "react";

// Body-only loading placeholder shaped like the parsed document. Mirrors
// ScriptDocument's layout — the title/meta block plus the editorial gutter
// (160px label column + content) — so the shimmer collapses into the real
// content with no layout shift when the parse lands.

const bar = "animate-pulse rounded bg-muted";

// One section row, matching ScriptDocument's <Section>: a left gutter holding the
// purple kicker rule + a label-width bar, and a right content column.
function SkeletonSection({ children }: { children: ReactNode }) {
  return (
    <section className="grid gap-2.5 sm:grid-cols-[160px_1fr] sm:gap-x-10">
      <div className="self-start sm:sticky sm:top-2">
        <div className="mb-2 h-0.5 w-6 rounded-full bg-primary/40" aria-hidden />
        <div className={`h-3 w-20 ${bar} bg-muted/70`} />
      </div>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

export function ScriptSkeleton() {
  return (
    <div className="grid gap-12 text-sm" aria-busy="true" aria-label="Extracting script">
      {/* Title + meta eyebrow */}
      <div className="grid gap-3">
        <div className={`h-7 w-64 ${bar}`} />
        <div className={`h-3 w-40 ${bar} bg-muted/70`} />
      </div>

      {/* Schedule — 2-col grid of fields */}
      <SkeletonSection>
        <div className="grid grid-cols-2 gap-2">
          <div className={`h-4 w-full ${bar}`} />
          <div className={`h-4 w-full ${bar}`} />
          <div className={`h-4 w-full ${bar}`} />
          <div className={`h-4 w-full ${bar}`} />
        </div>
      </SkeletonSection>

      {/* Objective — multiline paragraph */}
      <SkeletonSection>
        <div className={`h-4 w-full ${bar}`} />
        <div className={`h-4 w-5/6 ${bar}`} />
      </SkeletonSection>

      {/* Visual script — numbered shots */}
      <SkeletonSection>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className={`mt-0.5 size-3 shrink-0 ${bar} bg-muted/70`} />
            <div className="grid flex-1 gap-1.5">
              <div className={`h-4 w-full ${bar}`} />
              <div className={`h-3 w-16 ${bar} bg-muted/70`} />
            </div>
          </div>
        ))}
      </SkeletonSection>

      {/* On-screen text — a few lines */}
      <SkeletonSection>
        <div className={`h-4 w-full ${bar}`} />
        <div className={`h-4 w-11/12 ${bar}`} />
        <div className={`h-4 w-4/5 ${bar}`} />
      </SkeletonSection>

      {/* Voiceover — multiline paragraph */}
      <SkeletonSection>
        <div className={`h-4 w-full ${bar}`} />
        <div className={`h-4 w-3/4 ${bar}`} />
      </SkeletonSection>

      {/* Caption — single line */}
      <SkeletonSection>
        <div className={`h-4 w-2/3 ${bar}`} />
      </SkeletonSection>
    </div>
  );
}
