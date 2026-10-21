"use client";

import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteScript } from "@/hooks/queries/script-generate";
import { cn } from "@/lib/utils";
import type { ScriptDeleteBlock } from "@/lib/scripts/constants";
import { deleteDialogCopy } from "./delete-script-copy";

/** D384 — delete a script for good, behind a confirm. A blocked script keeps the icon, and the
 *  dialog says why instead; the server re-checks either way and its reason arrives as a toast.
 *  The library is server-rendered, so it re-reads once the script is gone. */
export function DeleteScriptButton({ clientId, scriptId, title, block = null, className }: {
  clientId: string;
  scriptId: string;
  title: string;
  block?: ScriptDeleteBlock | null;
  className?: string;
}) {
  const copy = deleteDialogCopy(block);
  const router = useRouter();
  const remove = useDeleteScript(clientId);
  const confirm = () => remove.mutate(scriptId, {
    onSuccess: () => { toast.success("Script deleted."); router.refresh(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${title}`}
            disabled={remove.isPending}
            className={cn("text-muted-foreground hover:text-destructive", className)}
          >
            {remove.isPending ? <Loader2 className="animate-spin" strokeWidth={1.5} /> : <Trash2 strokeWidth={1.5} />}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {copy.canDelete ? (
            <>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={confirm}>Delete</AlertDialogAction>
            </>
          ) : (
            <AlertDialogCancel>Got it</AlertDialogCancel>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
