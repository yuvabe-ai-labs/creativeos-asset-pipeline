"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  enterElevatedModeAction,
  exitImpersonationAction,
} from "@/lib/actions/impersonation";

// Takes showEnableEditing rather than `elevated`: the banner has already made that
// decision in bannerPresentation(), and passing both would be two sources of truth for
// one piece of state.
export function ImpersonationBannerActions({
  orgId,
  orgName,
  showEnableEditing,
}: {
  orgId: string;
  orgName: string;
  showEnableEditing: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function enableEditing() {
    startTransition(async () => {
      try {
        await enterElevatedModeAction();
        toast.warning(`Editing enabled for ${orgName}`, {
          description: "Changes you make now are written to their real data.",
        });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't enable editing.");
      }
    });
  }

  function exit() {
    startTransition(async () => {
      try {
        await exitImpersonationAction();
        toast.success("Exited — back in your own account");
        router.push(`/admin/orgs/${orgId}`);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Couldn't exit impersonation.",
        );
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {showEnableEditing && (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button type="button" size="xs" variant="outline" disabled={isPending}>
                Enable editing
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Enable editing for {orgName}?</AlertDialogTitle>
              <AlertDialogDescription>
                You&rsquo;ll be able to create, edit and delete {orgName}&rsquo;s real
                data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={enableEditing}>
                Enable editing
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={isPending}
        onClick={exit}
      >
        Exit
      </Button>
    </div>
  );
}
