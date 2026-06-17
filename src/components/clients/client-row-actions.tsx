"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Archive, ArchiveRestore } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function ClientRowActions({
  clientId,
  archived,
}: {
  clientId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Client actions"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="size-4" strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 gap-0 p-1">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
        >
          {archived ? (
            <ArchiveRestore className="size-4" strokeWidth={1.5} />
          ) : (
            <Archive className="size-4" strokeWidth={1.5} />
          )}
          {archived ? "Unarchive" : "Archive"}
        </button>
      </PopoverContent>
    </Popover>
  );
}
