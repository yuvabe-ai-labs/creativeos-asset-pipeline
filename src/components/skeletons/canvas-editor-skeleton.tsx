import { Skeleton } from "@/components/ui/skeleton";

export function CanvasEditorSkeleton() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center border-b border-border/70 bg-background/60 px-6 py-3 backdrop-blur">
        <Skeleton className="h-4 w-72" />
      </header>

      <div className="canvas-surface relative flex-1 overflow-hidden">
        <div className="absolute left-[12%] top-[22%]">
          <Skeleton className="h-40 w-64 rounded-xl" />
        </div>
        <div className="absolute left-[46%] top-[40%]">
          <Skeleton className="h-48 w-72 rounded-xl" />
        </div>
        <div className="absolute left-[20%] top-[64%]">
          <Skeleton className="h-32 w-56 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
