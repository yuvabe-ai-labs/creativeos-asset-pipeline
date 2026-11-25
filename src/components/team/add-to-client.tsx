"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientMark } from "@/components/shared/client-mark";
import { useAddToClient } from "@/hooks/queries/people";
import type { ClientBrief } from "@/lib/db/types";

type AddMutation = { mutateAsync: (userIds: string[]) => Promise<unknown> };

/** The one request Add makes: this person onto the chosen client (the mutation is bound to it). */
export async function addPersonToClient(add: AddMutation, userId: string): Promise<void> {
  await add.mutateAsync([userId]);
}

// The person panel's "Add to a client": a dashed chip that opens "Choose a client" and Add, the
// same pick-then-Add the permission editor uses. One insert through the Members list's add
// mutation; the new client row copies the person's agency set, as it does there.
export function AddToClient({ orgId, userId, options }: { orgId: string; userId: string; options: readonly ClientBrief[] }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const add = useAddToClient(orgId, chosen ?? "");
  const items = options.map((c) => ({ value: c.id, label: c.name }));
  const byId = new Map(options.map((c) => [c.id, c]));

  async function submit() {
    if (!chosen) return;
    try {
      await addPersonToClient(add, userId);
      setChosen(null);
      setOpen(false);
    } catch {
      // Shown below through add.error.
    }
  }

  if (options.length === 0) return <p className="text-xs text-muted-foreground">They are on every client.</p>;
  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-fit border-dashed border-primary/40 text-primary hover:bg-primary/5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" strokeWidth={1.5} />
        Add to a client
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select items={items} value={chosen} onValueChange={(v) => setChosen((v as string | null) ?? null)} disabled={add.isPending}>
          <SelectTrigger size="sm" className="w-56" aria-label="Choose a client">
            <SelectValue placeholder="Choose a client">
              {(value: string | null) => {
                const c = value ? byId.get(value) : undefined;
                return c ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <ClientMark name={c.name} logoUrl={c.logo_url} />
                    <span className="truncate">{c.name}</span>
                  </span>
                ) : (
                  "Choose a client"
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <ClientMark name={c.name} logoUrl={c.logo_url} />
                <span className="truncate">{c.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!chosen || add.isPending} onClick={() => void submit()}>
          {add.isPending ? "Adding…" : "Add"}
        </Button>
        <Button size="sm" variant="ghost" disabled={add.isPending} onClick={() => { setOpen(false); setChosen(null); }}>
          Cancel
        </Button>
      </div>
      {add.error && <p className="text-sm text-destructive">{add.error.message}</p>}
    </div>
  );
}
