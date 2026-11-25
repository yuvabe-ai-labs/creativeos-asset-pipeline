import { TriangleAlert } from "lucide-react";

/** D570: why the catalog drops this row, and where each kind of problem is fixed. Shown in place of the price sheet. */
export function ModelProblems({ problems }: { problems: string[] }) {
  return (
    <section aria-labelledby="problems-title" className="rounded-2xl border border-destructive/30 bg-card px-5 py-5 shadow-card md:px-[22px]">
      <h2 id="problems-title" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        <TriangleAlert aria-hidden strokeWidth={1.5} className="size-5 text-destructive-text" />
        This row fails its check
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">The app leaves this model out until it is fixed.</p>
      <ul className="mt-3 list-disc pl-5 text-sm text-destructive-text">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Labels, status and order can still be changed here. Settings, rules and limits are fixed by a migration.
      </p>
    </section>
  );
}
