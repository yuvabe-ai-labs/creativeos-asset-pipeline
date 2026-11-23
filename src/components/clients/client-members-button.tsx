"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/permissions/use-can";

// Spec §6.2: the Members button sits beside Brand Workspace, for the owner and anyone with Invite
// on this client (the same people the page lets in).
export function ClientMembersButton({ slug, clientId }: { slug: string; clientId: string }) {
  if (!useCan("invite", clientId)) return null;
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={`/clients/${slug}/members`} />}>
      <Users className="size-4" strokeWidth={1.5} />
      Members
    </Button>
  );
}
