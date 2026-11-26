import { Skeleton } from "@/components/ui/skeleton";
import { adminPageClass } from "@/components/admin/admin-page";

// The model page's shape: header strip, the price sheet, and the side column.
export default function Loading() {
  return (
    <main className={adminPageClass("wide")}>
      <Skeleton className="mb-3 h-4 w-28" />
      <div className="mb-5 flex items-center gap-4">
        <Skeleton className="h-8 w-64 flex-1 sm:flex-none" />
        <Skeleton className="ml-auto h-10 w-36" />
      </div>
      <Skeleton className="-mt-2 mb-6 h-4 w-80 max-w-full" />
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card">
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="mt-4 h-5 w-28" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </main>
  );
}
