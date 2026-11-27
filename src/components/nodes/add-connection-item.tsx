"use client";

import { ImageIcon } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";

// One node in the Add-connection list. Kinds that carry a picture render as a large card
// (two per row) so the picture can actually be judged before it is wired in; text kinds
// (a script, a prompt) render as a plain row with the handle above the name.
export function AddConnectionItem({
  value,
  handle,
  name,
  thumb,
  fit,
  layout,
  onSelect,
}: {
  value: string;
  handle: string;
  name: string;
  thumb?: string;
  // "contain" for packshots (a product on white must not lose its edges), "top" for faces.
  fit: "cover" | "contain" | "top";
  layout: "card" | "row";
  onSelect: () => void;
}) {
  const label = (
    <span className="block min-w-0 px-0.5">
      <span className="text-eyebrow block text-[9px]! leading-3! tracking-[0.14em]! text-muted-foreground!">{handle}</span>
      <span className="mt-0.5 block truncate text-[13px] leading-snug text-foreground">{name}</span>
    </span>
  );

  if (layout === "row")
    return (
      <CommandItem value={value} onSelect={onSelect} title={`${handle} · ${name}`} className="rounded-lg px-2 py-1.5 data-selected:bg-primary/5">
        {label}
      </CommandItem>
    );

  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      title={`${handle} · ${name}`}
      // The trailing check CommandItem appends is for multi-select lists; hide it in a card.
      className="flex-col items-stretch gap-1.5 rounded-lg p-1 pb-1.5 data-selected:bg-primary/5 [&>svg]:hidden"
    >
      <span className={cn("relative block h-32 w-full overflow-hidden rounded-md border border-border", fit === "contain" ? "bg-background" : "bg-muted")}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className={cn(
              "absolute inset-0 size-full",
              fit === "contain" ? "object-contain p-2" : "object-cover",
              fit === "top" && "object-top",
            )}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
            <ImageIcon className="size-6" strokeWidth={1.5} />
          </span>
        )}
      </span>
      {label}
    </CommandItem>
  );
}
