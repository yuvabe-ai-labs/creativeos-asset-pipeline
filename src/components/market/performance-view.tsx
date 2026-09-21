"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrackedHandles } from "@/hooks/use-tracked-handles";
import { AddHandleDialog } from "./add-handle-dialog";
import { HandlePerformance } from "./handle-performance";

/** The Performance tab (D253): a sub-tab per tracked handle, plus an add affordance.
 *  The client's own account and a competitor's are the same kind of row, so nothing
 *  here distinguishes them — order is the order they were added. */
export function PerformanceView({ clientId }: { clientId: string }) {
  const { handles, loading, add, remove } = useTrackedHandles(clientId);
  const [selected, setSelected] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Follow the list: default to the first handle, and after a removal fall back to
  // whatever is left rather than rendering a tab that no longer exists.
  useEffect(() => {
    if (handles.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(null);
      return;
    }
    if (!selected || !handles.some((h) => h.handle === selected)) {
      setSelected(handles[0].handle);
    }
  }, [handles, selected]);

  if (loading) {
    return <p className="py-10 text-sm text-muted-foreground">Loading tracked handles…</p>;
  }

  const addChip = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setDialogOpen(true)}
      className="border-dashed border-primary/40 text-primary hover:bg-primary/5"
    >
      <Plus strokeWidth={1.5} />
      Add handle
    </Button>
  );

  return (
    <div className="space-y-5">
      {handles.length === 0 ? (
        <div className="py-10">
          <p className="mb-4 max-w-prose text-sm text-muted-foreground">
            Track an Instagram account to see its followers, engagement and recent posts.
            The client&apos;s own handle or a competitor&apos;s — both work the same way.
          </p>
          {addChip}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {handles.map((h) => {
              const active = h.handle === selected;
              return (
                <Button
                  key={h.id}
                  variant={active ? "outline" : "ghost"}
                  size="sm"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setSelected(h.handle)}
                  className={
                    active
                      ? "border-primary/50 bg-primary/5 text-primary"
                      : "text-muted-foreground"
                  }
                >
                  @{h.handle}
                </Button>
              );
            })}
            {addChip}
          </div>

          {selected && (
            <HandlePerformance
              key={selected}
              clientId={clientId}
              handle={selected}
              onRemove={() => void remove(selected)}
            />
          )}
        </>
      )}

      <AddHandleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdd={add}
        onAdded={(handle) => setSelected(handle)}
      />
    </div>
  );
}
