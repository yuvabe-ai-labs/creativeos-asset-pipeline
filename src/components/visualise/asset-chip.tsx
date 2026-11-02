"use client";

import { useState, type ReactNode } from "react";
import { MapPin, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// D465 — a location or a product as a chip on the summary card. Its popup holds the card the
// board used to show inline, so every action on it stays one click away.
export function AssetChip({ kind, name, thumbUrl, usedIn, needsPicture, children }: {
  kind: "product" | "location";
  name: string;
  thumbUrl: string | null;
  /** "S3, S4": the shots it is in; "" when none. */
  usedIn: string;
  needsPicture?: boolean;
  /** The existing product or location card (an `<li>`). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const Icon = kind === "product" ? Package : MapPin;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="h-auto gap-2.5 rounded-xl py-1 pl-1 pr-3">
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" className="size-full object-cover" />
          ) : (
            <Icon className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          )}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="font-medium">{name}</span>
          {needsPicture && <span className="text-xs font-normal text-muted-foreground">Needs a picture</span>}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>{usedIn ? `In ${usedIn}` : "Not in any shot yet."}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col">{children}</ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
