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
import { CLIENT_SECTIONS } from "@/components/clients/client-sections";

// The sections a tile doesn't pin as actions. Hidden for archived clients: shortcuts
// into a recovery view would invite work on a client nobody is meant to be working on.
const UNPINNED = CLIENT_SECTIONS.filter((s) => !s.pinned);

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
      <PopoverContent align="end" className="w-48 gap-0 p-1">
        {!archived && (
          <>
            {UNPINNED.map((section) => (
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
            <div className="-mx-1 my-1 border-t" aria-hidden />
          </>
        )}
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
      </PopoverContent>
    </Popover>
  );
}
