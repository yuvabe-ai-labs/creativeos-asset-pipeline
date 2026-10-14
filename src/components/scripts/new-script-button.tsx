"use client";

import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCreateScript } from "@/hooks/queries/script-generate";

/** Spec 2 §3 — the only way a script is made: an empty script at Generate, opened in the workspace. */
export function NewScriptButton({ clientId, clientSlug }: { clientId: string; clientSlug: string }) {
  const router = useRouter();
  const create = useCreateScript(clientId);
  return (
    <Button
      disabled={create.isPending}
      onClick={() => create.mutate(undefined, {
        onSuccess: (scriptId) => router.push(`/clients/${clientSlug}/scripts/${scriptId}`),
        onError: (e) => toast.error(e.message),
      })}
    >
      {create.isPending ? <Loader2 className="animate-spin" strokeWidth={1.5} /> : <Plus strokeWidth={1.5} />}
      New script
    </Button>
  );
}
