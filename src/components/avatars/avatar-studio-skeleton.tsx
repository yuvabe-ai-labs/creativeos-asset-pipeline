import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Route-level placeholder for /clients/[id]/avatars/new and /avatars/[avatarId] — the same
 *  three columns as the live Studio (D297: stepper, panel, summary) under the same header, so
 *  nothing jumps when it resolves. Shared by both routes since the shape does not depend on which
 *  one it is. */
export function AvatarStudioSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      {/* mt-4 mirrors the live section's own top margin (avatar-studio.tsx's
       *  `<section className="animate-rise mt-4">`) so nothing shifts down when it resolves. */}
      <div className="mt-4">
        <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Skeleton className="h-8 w-24" />
          <div className="flex-1 basis-72 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-8 w-56" />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)_16rem]">
          {/* The five steps: a circle, a title and a status line each. */}
          <div className="flex gap-2 lg:flex-col lg:gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-start gap-2.5 px-2.5 py-2">
                <Skeleton className="size-6 shrink-0 rounded-full" />
                <div className="hidden flex-1 space-y-1.5 lg:block">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>

          {/* The panel: its header, the step's content, and the pinned footer. */}
          <Card className="min-h-[34rem] gap-0 py-0 shadow-card">
            <div className="space-y-2 px-6 pt-5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <div className="flex flex-1 flex-col gap-4 px-6 pb-6 pt-4">
              <Skeleton className="h-9 w-56 rounded-lg" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
            <div className="flex justify-end border-t px-4 py-3">
              <Skeleton className="h-9 w-44 rounded-lg" />
            </div>
          </Card>

          {/* The summary: the face, four rows, and the model names. */}
          <Card className="flex flex-col gap-3 self-start p-4 shadow-card">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-6 w-32" />
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
            <div className="space-y-2 border-t pt-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-full rounded-lg" />
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
