"use client";

import Link from "next/link";
import { BookOpen, Globe, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Entry point to the client's two knowledge surfaces. They are separate pages, not
 * views of one page, so they are reached from here rather than from a tab strip —
 * tabs would promise in-place switching that a route change doesn't deliver.
 */
export function ClientSettingsMenu({ slug }: { slug: string }) {
  const items = [
    {
      href: `/clients/${slug}/kb`,
      icon: BookOpen,
      label: "Brand KB",
      hint: "Positioning, products, audience",
    },
    {
      href: `/clients/${slug}/market`,
      icon: Globe,
      label: "Market",
      hint: "Direct, Adjacent and Signals",
    },
  ];

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
        {items.map((item) => (
          <Button
            key={item.href}
            variant="ghost"
            nativeButton={false}
            className="h-auto w-full justify-start gap-2.5 rounded-md px-2 py-2 font-normal"
            render={
              <Link href={item.href}>
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
