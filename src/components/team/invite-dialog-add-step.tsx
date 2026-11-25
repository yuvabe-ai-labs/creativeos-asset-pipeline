"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useAddToClient, usePeople } from "@/hooks/queries/people";
import { STATUS_LABELS } from "@/lib/people/constants";
import { chosenStillEligible, peopleNotOnClient } from "@/lib/people/utils";

// Step 1, "In your agency": everyone not on this client, members and people still waiting, with a
// search and checkboxes. One insert; each row copies the person's agency set, so a member sees the
// client at once and someone waiting sees it when given access.
// What counts and is sent is the chosen people still offered: someone who has since left the list
// (added by someone else, or removed) drops out; someone the search hides stays chosen.
export function InviteDialogAddStep({ orgId, client, onInviteNew, onDone }: {
  orgId: string;
  client: { id: string; name: string };
  onInviteNew: () => void;
  onDone: () => void;
}) {
  const { data } = usePeople(orgId);
  const add = useAddToClient(orgId, client.id);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const eligible = useMemo(() => peopleNotOnClient(data?.people ?? [], client.id), [data, client.id]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return eligible.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [eligible, query]);
  const toAdd = chosenStillEligible(chosen, eligible);

  function toggle(userId: string, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId); else next.delete(userId);
      return next;
    });
  }

  async function submit() {
    if (toAdd.length === 0) return;
    try {
      await add.mutateAsync(toAdd);
      onDone();
    } catch {
      // The refusal is shown below through add.error.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-eyebrow">In your agency</h3>
      <InputGroup>
        <InputGroupAddon><Search strokeWidth={1.5} /></InputGroupAddon>
        <InputGroupInput placeholder="Search people" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" />
      </InputGroup>
      <ul className="flex max-h-64 flex-col overflow-y-auto">
        {candidates.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">
            {query.trim() ? "No one matches that search." : `Everyone in your agency is on ${client.name}.`}
          </li>
        )}
        {candidates.map((p) => (
          <li key={p.userId} className="flex items-center gap-3 border-b py-2 text-sm last:border-b-0">
            <Checkbox checked={chosen.has(p.userId)} onCheckedChange={(on) => toggle(p.userId, on === true)} aria-label={`Add ${p.name}`} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{p.name}</span>
              <span className="truncate text-xs text-muted-foreground">{p.email}</span>
            </div>
            <span className="text-xs text-muted-foreground">{STATUS_LABELS[p.status]}</span>
          </li>
        ))}
      </ul>
      {add.error && <p className="text-sm text-destructive">{add.error.message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" className="border-dashed border-primary/40 text-primary hover:bg-primary/5" onClick={onInviteNew}>
          Invite someone new
        </Button>
        <Button disabled={toAdd.length === 0 || add.isPending} onClick={() => void submit()}>
          {add.isPending ? "Adding…" : `Add ${toAdd.length} ${toAdd.length === 1 ? "person" : "people"}`}
        </Button>
      </div>
    </div>
  );
}
