import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
      <Skeleton className="mb-2 h-8 w-32" />
      <Skeleton className="mb-8 h-4 w-40" />
      <Skeleton className="mb-5 h-11 w-full rounded-xl" />
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0">
            <Skeleton className="h-5 flex-[3]" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 flex-[2]" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </main>
  );
}
