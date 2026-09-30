"use client";

import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// D287 — deleting an avatar archives it. The dialog says what that means, because "gone from
// the library" and "still works where it is already used" are both true.
export function AvatarArchiveButton({ name, onArchive }: { name: string; onArchive: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Archive className="size-3.5" strokeWidth={1.5} />
            Archive avatar
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {name || "this avatar"}?</AlertDialogTitle>
          <AlertDialogDescription>
            It leaves the library and can no longer be picked. Anything that already uses it keeps
            working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onArchive}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
