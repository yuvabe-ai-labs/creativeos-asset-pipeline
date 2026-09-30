import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Route-level placeholder for /clients/[id]/avatars/new and /avatars/[avatarId] — same shell
 *  as the live Studio (header row, left step card, right avatar card) so nothing jumps when it
 *  resolves. Shared by both routes since the Studio's shape does not depend on which one it is. */
export function AvatarStudioSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-40" />
        </div>
        <Skeleton className="ml-auto h-9 w-48 rounded-lg" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="flex flex-col gap-4 p-5 shadow-card">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="aspect-[3/4] w-full max-w-xs rounded-xl" />
        </Card>

        <Card className="flex flex-col gap-3 p-4 shadow-card">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </Card>
      </div>
    </main>
  );
}
