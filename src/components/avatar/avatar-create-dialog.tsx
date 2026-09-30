"use client";

import Link from "next/link";
import { ArrowUp, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AvatarSilhouette } from "./avatar-silhouette";

const OPTION = "h-auto flex-col items-start gap-1.5 whitespace-normal rounded-xl px-4 py-5 text-left";

// The gallery's dashed "Create new avatar" card, opening a choice: start from a real person's
// photo (the editor) or a random AI character described in words.
export function AvatarCreateDialog({ newHref, randomHref }: { newHref: string; randomHref: string }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            className="flex aspect-[3/4] h-auto w-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-primary/40 text-center hover:bg-primary/5"
          />
        }
      >
        <span className="font-display text-lg font-medium leading-snug">
          Create new
          <br />
          avatar
        </span>
        <span className="flex size-11 items-center justify-center rounded-full border border-primary/40 text-primary">
          <ArrowUp className="size-5" strokeWidth={1.5} />
        </span>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Create new avatar</DialogTitle>
        </DialogHeader>

        <div className="mx-auto my-2 aspect-[4/3] w-60 overflow-hidden rounded-xl border border-border bg-muted/40">
          <AvatarSilhouette className="size-full px-8 pt-8" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Button variant="outline" nativeButton={false} className={OPTION} render={<Link href={newHref} />}>
            <Upload className="size-4 text-primary" strokeWidth={1.5} />
            <span className="text-sm font-medium">Use real character</span>
            <span className="text-xs font-normal text-muted-foreground">Upload a photo of a real person</span>
          </Button>
          <Button variant="outline" nativeButton={false} className={OPTION} render={<Link href={randomHref} />}>
            <Sparkles className="size-4 text-primary" strokeWidth={1.5} />
            <span className="text-sm font-medium">Create random character</span>
            <span className="text-xs font-normal text-muted-foreground">Generate a new AI character</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
