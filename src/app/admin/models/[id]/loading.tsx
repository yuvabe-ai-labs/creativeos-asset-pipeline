import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
      <Skeleton className="mb-4 h-4 w-48" />
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-8 h-3 w-64" />
      <div className="flex flex-col gap-6">
        <Card className="px-6">
          <Skeleton className="h-3 w-16" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
            <Skeleton className="h-16 w-full sm:col-span-2" />
          </div>
          <Skeleton className="mt-2 h-8 w-32" />
        </Card>
        <Card className="px-6">
          <Skeleton className="h-3 w-28" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-8 w-28" />
          </div>
          {Array.from({ length: 2 }, (_, i) => (
            <Card key={i} className="gap-3 px-6">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-40" />
            </Card>
          ))}
        </div>
        <Card className="px-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </Card>
      </div>
    </main>
  );
}
