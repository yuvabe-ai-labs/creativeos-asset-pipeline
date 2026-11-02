import type { ReactNode } from "react";

// Spec §6.1 — the Storyboard, as on the Visualise board: every shot's panel in order, scene only.
export function StoryboardGrid({ action, settings, children }: {
  /** Beside the heading: Generate all, so it sits with the panels it draws. */
  action?: ReactNode;
  /** Under the heading: Advanced (the panel model). */
  settings?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label="Storyboard" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-xl font-medium">Storyboard</h2>
          <span className="text-sm text-muted-foreground">Scene only. On-screen text is added in post.</span>
        </div>
        {action}
      </div>
      {settings}
      {/* D465 — the full width of the board, as a storyboard sheet: two across on a phone, five wide. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>
    </section>
  );
}
