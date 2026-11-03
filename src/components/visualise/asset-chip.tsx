"use client";

import { useState, type ReactNode } from "react";
import { Loader2, MapPin, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// D465 — a location or a product as a chip on the summary card. Its popup holds the card the
// board used to show inline, so every action on it stays one click away.
export function AssetChip({ kind, name, thumbUrl, usedIn, needsPicture, working, children }: {
  kind: "product" | "location";
  name: string;
  thumbUrl: string | null;
  /** "S3, S4": the shots it is in; "" when none. */
  usedIn: string;
  needsPicture?: boolean;
  /** Work in progress ("Drawing…", "Uploading…"), shown on the chip after its popup closes. */
  working?: string | null;
  /** The existing product or location card (an `<li>`). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const Icon = kind === "product" ? Package : MapPin;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="h-auto gap-3 rounded-2xl py-1.5 pl-1.5 pr-4">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" className="size-full object-cover" />
          ) : (
            <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          )}
        </span>
        <span className="flex flex-col items-start gap-0.5 leading-tight">
          <span className="text-base font-medium">{name}</span>
          {working ? (
            <span className="flex items-center gap-1 text-xs font-normal text-primary">
              <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />
              {working}
            </span>
          ) : (
            needsPicture && <span className="text-xs font-normal text-muted-foreground">Needs a picture</span>
          )}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* A location's popup takes its width from the plate (D465), so a tall plate is not boxed in grey. */}
        <DialogContent className={kind === "location" ? "max-h-[90vh] w-fit max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[calc(100vw-2rem)]" : "sm:max-w-lg"}>
          <DialogHeader className={kind === "location" ? "w-0 min-w-full pr-8" : undefined}>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>{usedIn ? `In ${usedIn}` : "Not in any shot yet."}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col">{children}</ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
