"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CLIENT_SECTIONS } from "@/components/clients/client-sections";

/**
 * Entry point to the client's surfaces beside its canvases: its scripts, its knowledge (Brand KB,
 * Market) and its avatars. They are separate pages, not views of one page, so they are reached
 * from here rather than from a tab strip — tabs would promise in-place switching that a route
 * change doesn't deliver.
 */
export function ClientSettingsMenu({ slug }: { slug: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline">
            <Settings className="size-4" strokeWidth={1.5} />
            Settings
          </Button>
        }
      />
      <PopoverContent align="end" className="w-60 p-1">
        {CLIENT_SECTIONS.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            nativeButton={false}
            className="h-auto w-full justify-start gap-2.5 rounded-md px-2 py-2 font-normal"
            render={
              <Link href={item.href(slug)}>
                <item.icon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <span className="flex flex-col items-start gap-0.5 text-left">
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </Link>
            }
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
