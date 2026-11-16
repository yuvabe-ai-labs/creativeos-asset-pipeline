"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ClientBrief } from "@/lib/db/types";
import { ClientMark } from "./client-mark";

/** How many marks show before the rest fold into "+n". */
export const CLIENT_STACK_MAX = 3;

// The clients someone is on, as overlapping logos: up to three, then "+n". Hover or click lists
// each one (mark and name), linking to where its people are managed.
export function ClientStack({
  clients,
  href,
  everyClient = false,
}: {
  clients: readonly ClientBrief[];
  href: (client: ClientBrief) => string;
  /** The owner: on every client, so no list. */
  everyClient?: boolean;
}) {
  if (everyClient) return <span className="text-sm text-muted-foreground">Every client</span>;
  if (clients.length === 0) return <span className="text-sm text-muted-foreground">No clients</span>;
  const shown = clients.slice(0, CLIENT_STACK_MAX);
  const more = clients.length - shown.length;
  const names = clients.map((c) => c.name).join(", ");

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={200}
        render={<Button variant="ghost" size="sm" className="-ml-1 h-auto gap-0 px-1 py-1" aria-label={`Clients: ${names}`} />}
      >
        <span className="flex items-center -space-x-1.5">
          {shown.map((c) => (
            <ClientMark key={c.id} name={c.name} logoUrl={c.logo_url} className="ring-2 ring-card" />
          ))}
        </span>
        {more > 0 && <span className="ml-1.5 text-xs font-medium text-muted-foreground">+{more}</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0.5 p-1.5">
        <p className="text-eyebrow px-2 pt-1 pb-1.5 text-[0.65rem] text-muted-foreground">Clients</p>
        {clients.map((c) => (
          <Link
            key={c.id}
            href={href(c)}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
          >
            <ClientMark name={c.name} logoUrl={c.logo_url} />
            <span className="truncate">{c.name}</span>
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
