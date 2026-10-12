import { Skeleton } from "@/components/ui/skeleton";
import { ScriptShotRowsSkeleton } from "@/components/scripts/script-shot-rows-skeleton";
import { DraftCastSkeleton } from "./draft-cast-skeleton";

/** The script's shape before any of the first draft has arrived (D366): the writer thinks for
 *  ~25 s before its first word, so the pane shows the script it is about to fill, laid out as
 *  ScriptView lays it out (context card, cast, shot table). */
export function DraftSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-8">
      <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="flex max-w-[68ch] flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </div>
        ))}
      </section>
      <DraftCastSkeleton />
      <section className="flex flex-col gap-3">
        <h2 className="text-eyebrow">Shots</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ScriptShotRowsSkeleton count={5} />
        </div>
      </section>
    </div>
  );
}
