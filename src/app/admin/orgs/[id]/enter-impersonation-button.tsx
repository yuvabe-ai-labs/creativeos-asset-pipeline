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
import { enterImpersonationAction } from "@/lib/actions/impersonation";

export function EnterImpersonationButton({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function enter() {
    startTransition(async () => {
      try {
        await enterImpersonationAction(orgId);
        toast.success(`Now viewing as ${orgName}`, {
          description: "Read-only. Everything you see is their data.",
        });
        router.push("/");
      } catch (e) {
        // The action no longer redirects (D140), so a rejection is unambiguously a
        // real failure — no unstable_rethrow dance needed to tell the two apart.
        toast.error(
          e instanceof Error ? e.message : "Couldn't enter impersonation.",
        );
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" disabled={isPending}>
            Enter as this org
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enter as {orgName}?</AlertDialogTitle>
          <AlertDialogDescription>
            You&rsquo;ll see CreativeOS exactly as {orgName} sees it, using their
            data. You&rsquo;ll be read-only — you can look around but not change
            anything. This session is recorded in the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={enter}>Enter as {orgName}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
