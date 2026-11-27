import { Skeleton } from "@/components/ui/skeleton";
import { adminPageClass } from "@/components/admin/admin-page";

// The page's shape while it loads: the title row and the one card, Now, Next and the footer (D594).
export default function Loading() {
  return (
    <main className={adminPageClass()}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <Skeleton className="mb-2 h-8 w-32" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-48 max-sm:w-full" />
      </div>
      <div className="max-w-4xl overflow-hidden rounded-xl border bg-card shadow-card">
        {[0, 1].map((i) => (
          <div key={i} className="grid grid-cols-1 items-center gap-x-5 gap-y-1.5 border-b border-border/60 px-4 py-4 md:grid-cols-[200px_minmax(0,1fr)_auto] md:px-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-full max-w-md" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-5 bg-muted/40 px-4 py-3 md:px-5">
          <Skeleton className="h-4 w-64" />
          <span className="flex-1" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </main>
  );
}
