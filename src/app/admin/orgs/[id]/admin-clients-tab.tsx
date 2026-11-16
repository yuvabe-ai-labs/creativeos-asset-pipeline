"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClientMark } from "@/components/shared/client-mark";
import { ClientMembers } from "@/components/team/client-members";
import { InviteDialog } from "@/components/team/invite-dialog";
import type { ClientBrief } from "@/lib/db/types";
import type { AgencyPeople } from "@/lib/people/types";

// Spec §6.6 "Clients": each client opens the same Members component the owner uses, so the super
// admin invites into a client the same way. "Set permissions" goes to this page's People tab.
// ?client=<id> (a client picked in the People tab) opens that client.
export function AdminClientsTab({ orgId, clients, initial }: { orgId: string; clients: ClientBrief[]; initial: AgencyPeople }) {
  const linked = useSearchParams().get("client");
  const [openId, setOpenId] = useState<string | null>(
    clients.some((c) => c.id === linked) ? linked : (clients[0]?.id ?? null),
  );
  const open = clients.find((c) => c.id === openId) ?? null;
  if (clients.length === 0) return <p className="text-sm text-muted-foreground">This agency has no clients yet.</p>;
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-row flex-wrap gap-2 p-3 shadow-card">
        {clients.map((c) => (
          <Button key={c.id} size="sm" variant={c.id === openId ? "secondary" : "ghost"} aria-pressed={c.id === openId} onClick={() => setOpenId(c.id)}>
            <ClientMark name={c.name} logoUrl={c.logo_url} />
            {c.name}
          </Button>
        ))}
      </Card>
      {open && (
        <ClientMembers
          orgId={orgId}
          client={open}
          initial={initial}
          teamHref={(userId) => `/admin/orgs/${orgId}?tab=people&person=${userId}`}
          canManage
          // Keyed so a half-filled invite never carries over to another client; Members itself stays mounted.
          inviteSlot={<InviteDialog key={open.id} orgId={orgId} client={open} canManage />}
        />
      )}
    </div>
  );
}
