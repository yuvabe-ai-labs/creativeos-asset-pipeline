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

/** Delete for a script the copilot has not written yet, behind a confirm. The library is
 *  server-rendered, so it re-reads once the script is gone. */
export function DeleteScriptButton({ clientId, scriptId, title, className }: { clientId: string; scriptId: string; title: string; className?: string }) {
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
          <AlertDialogTitle>Delete this script?</AlertDialogTitle>
          <AlertDialogDescription>The brief and the copilot conversation go with it.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
