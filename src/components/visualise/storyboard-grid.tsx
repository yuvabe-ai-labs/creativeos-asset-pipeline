import type { ReactNode } from "react";

// Spec §6.1 — the Storyboard, as on the Visualise board: every shot's panel in order, scene only.
export function StoryboardGrid({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Storyboard" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-medium">Storyboard</h2>
        <span className="text-sm text-muted-foreground">Scene only. On-screen text is added in post.</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{children}</div>
    </section>
  );
}
