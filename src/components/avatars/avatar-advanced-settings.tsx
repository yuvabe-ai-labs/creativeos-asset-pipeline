"use client";

import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// The Studio's settings that have good defaults (style, image model): closed by default, so the
// step shows only what most people touch. Opens in place, like Video Gen's Advanced.
export function AvatarAdvancedSettings({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Accordion className={cn("pt-2", className)}>
      <AccordionItem value="advanced" className="border-none">
        <AccordionTrigger className="py-1 hover:no-underline">
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="size-3.5 text-primary" strokeWidth={1.5} />
            <span className="text-eyebrow">Advanced</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-2 pt-2">{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
