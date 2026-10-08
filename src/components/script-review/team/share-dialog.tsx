// src/components/script-review/team/share-dialog.tsx
"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useShareScript } from "@/hooks/queries/script-review";
import { errorMessage } from "@/lib/avatars/utils";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import type { ShareScope } from "@/lib/script-review/constants";
import { scriptSharePathFor } from "@/lib/script-review/paths";
import type { Script } from "@/lib/scripts/schema";
import { ScopeOptions } from "./scope-options";
import { ShareLinkField } from "./share-link-field";

/** Spec 4 §3 steps 2–4: choose what the share includes, share it as the next version, get the link. */
export function ShareDialog({ clientId, script, latest }: { clientId: string; script: Script; latest: TeamScriptReview["latest"] }) {
  const share = useShareScript(clientId, script.id);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ShareScope>(latest?.scope ?? "script");
  const [done, setDone] = useState<{ number: number; path: string } | null>(null);
  const next = (latest?.number ?? 0) + 1;

  async function submit() {
    try {
      const out = await share.mutateAsync(scope);
      setDone({ number: out.version.number, path: scriptSharePathFor(out.shareToken, script.doc.header.title) });
    } catch (e) {
      toast.error(errorMessage(e, "Could not share the script."));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setDone(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Send strokeWidth={1.5} />
        {latest ? "Share again" : "Share"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{done ? `Version ${done.number} is shared` : `Share version ${next}`}</DialogTitle>
          <DialogDescription>
            {done
              ? "The link stays the same for every version. Send it however you usually reach the client."
              : "The client sees this version, frozen, until you share again. Edits after this stay with the team until the next share."}
          </DialogDescription>
        </DialogHeader>
        {done ? <ShareLinkField path={done.path} /> : <ScopeOptions value={scope} onChange={setScope} />}
        <DialogFooter>
          {done ? (
            <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
          ) : (
            <Button onClick={submit} disabled={share.isPending}>
              {share.isPending ? "Sharing…" : `Share version ${next}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
