"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The add affordance lives IN the grid, as the first cell — a dashed primary chip
 *  per the house rule that "Add" actions must not be missable text links. */
export function AddReferenceTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="flex h-auto min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 p-4 text-primary hover:bg-primary/5"
    >
      <Plus className="size-5" strokeWidth={1.5} />
      <span className="text-sm font-medium">{label}</span>
    </Button>
  );
}
