"use client";

import { useState } from "react";
import { Archive, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  lifecycle: "draft" | "library";
  name: string;
  spentCredits: number;
  onConfirm: () => void;
};

// D297 — the header's ⋯ menu. It exists only once there is something to act on: a draft offers
// Discard draft, an avatar in the library offers Archive. Both archive the row (the ledger's rows
// still need their avatar), and both ask first.
export function AvatarStudioMenu({ lifecycle, name, spentCredits, onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false);
  const draft = lifecycle === "draft";
  const Icon = draft ? Trash2 : Archive;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
          <MoreHorizontal className="size-4" strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuItem onClick={() => setConfirming(true)} className="items-start gap-2.5">
            <Icon
              className={draft ? "mt-0.5 size-4 text-destructive-text" : "mt-0.5 size-4"}
              strokeWidth={1.5}
            />
            <span className="flex flex-col gap-0.5">
              <span className={draft ? "font-medium text-destructive-text" : "font-medium"}>
                {draft ? "Discard draft" : "Archive avatar"}
              </span>
              <span className="text-xs text-muted-foreground">
                {draft
                  ? "Only this draft. Credits already spent stay spent."
                  : "Leaves the library. Videos that already use it keep working."}
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {draft ? "Discard this draft?" : `Archive ${name.trim() || "this avatar"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {draft
                ? `The draft and its images are removed.${spentCredits > 0
                  ? ` The ${spentCredits.toLocaleString()} credits already spent on it stay spent.`
                  : ""}`
                : "It leaves the library and can no longer be picked. Videos that already use it keep working."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={draft ? "destructive" : "default"} onClick={onConfirm}>
              {draft ? "Discard draft" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
