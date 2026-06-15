import { Skeleton } from "@/components/ui/skeleton";

/**
 * ListSkeleton — shared placeholder for the toolbar + bordered table used by both
 * the clients list (`/`) and canvases list (`/clients/[id]`). Mirrors ListToolbar
 * (search + sort) and the 3/2/1-weighted table chrome so the swap to real content
 * produces no layout shift. `withAvatar` adds the size-9 logo tile the clients
 * table shows in its first column.
 */
export function ListSkeleton({ withAvatar = false }: { withAvatar?: boolean }) {
  return (
    <div>
      {/* Toolbar: search input (flex-1) + sort select — mirrors ListToolbar */}
      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="h-11 flex-1 rounded-xl" />
        <Skeleton className="h-11 w-28 rounded-xl" />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {/* Column header row */}
        <div className="flex items-center gap-4 border-b bg-muted/40 px-5 py-3">
          <span className="flex-[3]">
            <Skeleton className="h-3 w-16" />
          </span>
          <span className="flex-[2]">
            <Skeleton className="h-3 w-20" />
          </span>
          <span className="flex flex-1 justify-end">
            <Skeleton className="h-3 w-14" />
          </span>
        </div>

        {/* Rows */}
        <ul>
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="border-b last:border-b-0">
              <div className="flex items-center gap-4 px-5 py-3.5">
                <span className="flex flex-[3] items-center gap-3">
                  {withAvatar && (
                    <Skeleton className="size-9 shrink-0 rounded-md" />
                  )}
                  <Skeleton className="h-4 w-36" />
                </span>
                <span className="flex-[2]">
                  <Skeleton className="h-4 w-24" />
                </span>
                <span className="flex flex-1 items-center justify-end">
                  <Skeleton className="h-4 w-16" />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
