"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgencyFix } from "@/lib/admin/agencies-list";
import { ResendOwnerInviteButton } from "../resend-owner-invite-button";
import { InviteOwnerDialog } from "../invite-owner-dialog";
import { CopyOwnerInviteButton } from "./copy-owner-invite-button";

/** The row's one fix for its issue, always shown in a quiet style. */
export function AgencyFixButton({ fix, orgId, orgName }: { fix: AgencyFix; orgId: string; orgName: string }) {
  switch (fix.kind) {
    case "billing":
      return (
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={fix.href} />}>
          <Coins strokeWidth={1.5} />
          {fix.label}
        </Button>
      );
    case "copy_invite":
      return <CopyOwnerInviteButton link={fix.link} email={fix.email} />;
    case "resend_invite":
      return <ResendOwnerInviteButton orgId={orgId} />;
    case "invite_owner":
      return <InviteOwnerDialog orgId={orgId} orgName={orgName} />;
  }
}
