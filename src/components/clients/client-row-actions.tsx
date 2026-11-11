"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCan } from "@/components/permissions/use-can";
import { useClientSections } from "@/components/clients/use-client-sections";

const itemClass = "h-auto w-full justify-start gap-2 rounded-md px-2.5 py-2 font-normal";

export function ClientRowActions({
  clientId,
  slug,
  archived,
}: {
  clientId: string;
  slug: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // D493: sections the person can't view, and Archive without clients.delete, are not shown. The
  // sections are hidden for archived clients: shortcuts into a recovery view would invite work
  // on a client nobody is meant to be working on.
  const unpinned = useClientSections(clientId).filter((s) => !s.pinned);
  const canArchive = useCan("clients.delete");
  const showSections = !archived && unpinned.length > 0;

  async function toggle() {
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setOpen(false);
    startTransition(() => router.refresh());
  }

  if (!showSections && !canArchive) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Client actions"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="size-4" strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 gap-0 p-1">
        {showSections && (
          <>
            {unpinned.map((section) => (
              <Button
                key={section.label}
                variant="ghost"
                nativeButton={false}
                className={itemClass}
                render={<Link href={section.href(slug)} />}
              >
                <section.icon className="size-4" strokeWidth={1.5} />
                {section.label}
              </Button>
            ))}
            {canArchive && <div className="-mx-1 my-1 border-t" aria-hidden />}
          </>
        )}
        {canArchive && (
          <Button
            type="button"
            variant="ghost"
            onClick={toggle}
            disabled={pending}
            className={itemClass}
          >
            {archived ? (
              <ArchiveRestore className="size-4" strokeWidth={1.5} />
            ) : (
              <Archive className="size-4" strokeWidth={1.5} />
            )}
            {archived ? "Unarchive" : "Archive"}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
