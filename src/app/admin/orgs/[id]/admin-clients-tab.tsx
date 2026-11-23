"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClientMark } from "@/components/shared/client-mark";
import { PageCrumbs } from "@/components/shared/page-crumbs";
import { ClientMembers } from "@/components/team/client-members";
import { InviteDialog } from "@/components/team/invite-dialog";
import type { ClientBrief } from "@/lib/db/types";
import type { AgencyPeople } from "@/lib/people/types";
import { adminClientCrumbs, orgTabUrl } from "./org-tabs";

const push = (href: string) => window.history.pushState(null, "", href);

// Spec §6.6 "Clients": the agency's clients; one opens the same Members component the owner uses,
// so the super admin invites into a client the same way. "Set permissions" goes to this page's
// People tab. The open client is ?client=<id> (also the People tab's client links); opening one
// is a history entry, so Back, or All clients in its trail, returns to the list.
export function AdminClientsTab({ orgId, clients, initial }: { orgId: string; clients: ClientBrief[]; initial: AgencyPeople }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const open = clients.find((c) => c.id === searchParams.get("client")) ?? null;
  if (clients.length === 0) return <p className="text-sm text-muted-foreground">This agency has no clients yet.</p>;
  if (!open) {
    return (
      <Card className="flex flex-row flex-wrap gap-2 p-3 shadow-card">
        {clients.map((c) => (
          <Button key={c.id} size="sm" variant="ghost" onClick={() => push(orgTabUrl(pathname, searchParams, { tab: "clients", client: c.id }))}>
            <ClientMark name={c.name} logoUrl={c.logo_url} />
            {c.name}
          </Button>
        ))}
      </Card>
    );
  }
  return (
    <ClientMembers
      orgId={orgId}
      client={open}
      initial={initial}
      breadcrumb={<PageCrumbs items={adminClientCrumbs(orgId, open)} onNavigate={push} />}
      teamHref={(userId) => `/admin/orgs/${orgId}?tab=people&person=${userId}`}
      canManage
      // Keyed so a half-filled invite never carries over to another client.
      inviteSlot={<InviteDialog key={open.id} orgId={orgId} client={open} canManage />}
    />
  );
}
