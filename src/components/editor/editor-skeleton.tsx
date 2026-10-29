import { Skeleton } from "@/components/ui/skeleton";

/** The editor page while it loads: the mockup's frame, empty. */
export function EditorSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <div className="flex h-[60px] flex-none items-center gap-4 border-b border-border bg-card px-6">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-48" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="grid h-[min(520px,58dvh)] flex-none grid-cols-[248px_minmax(0,1fr)_340px] gap-4 px-6 pt-4">
        <Skeleton className="rounded-[14px]" />
        <Skeleton className="rounded-[14px]" />
        <Skeleton className="rounded-[14px]" />
      </div>
      <Skeleton className="mx-6 mb-5 mt-4 flex-1 rounded-[14px]" />
    </div>
  );
}
